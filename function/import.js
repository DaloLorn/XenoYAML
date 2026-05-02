import { resolve as resolvePath, dirname, sep, relative as relativize } from "path";
import { stringify } from 'yaml';
import { writeFile, readFile, mkdir } from "fs/promises";
import { pickBy } from "lodash-es";
import readFiles from '../util/readFiles.js';
import isArtitasTemplate from '../util/isArtitasTemplate.js';
import { parseComponents } from '../util/transformComponents.js';
import { parseTemplateReference } from "../util/templateReferenceUtils.js";
import batchOperation from '../util/batchOperation.js';

export default async function importFromArtitas(options) {
    const { outputFolder: customOutputFolder, args } = options;
    const project = args[0];
    let projectRoot = resolvePath(project);
    let projectFiles;
    let imported = false;

    // A bit of context: When extracting all_templates.zip, I renamed its root folder to 
    // "templates" to prevent the game from picking it up. So I test for that too.
    const templateRegex = new RegExp("(.*\\" + sep + "templates?\\" + sep +"?)?", "i")

    let templateRoot = projectRoot.match(templateRegex)[0];
    if(!templateRoot) {
        console.warn("Could not find content pack template folder! Paths in the resulting XenoYAML will be relative to the project root, instead.");
        templateRoot = dirname(projectRoot);
    }

    projectFiles = await readFiles([projectRoot], {
        extension: '.json',
        loader: async (filePath, _filename) => {
            const relativePath = relativize(templateRoot, filePath);
            const parsedFile = JSON.parse(((await readFile(filePath, 'utf-8')).replaceAll(/([^\\])":\s*(-?)Infinity/g, "$1\": \"$2Infinity\"")).trim());
            return {
                ...parsedFile,
                path: relativePath.slice(0, -5)
            }
        },
        postFilter: isArtitasTemplate,
    })

    /*// TODO: Figure out how to safely detect
    // and enforce mustHaveType on inner objects/arrays.
    function parseComponent(components, mustHaveType) {
        return (component) => {
            let type;
            let parsedComponent = isArrayLike(component) ? [] : {};
            forEach(component, (value, key) => {
                if(key == "$t" || key == "$type") {
                    type = value;
                }
                else switch(typeof value) {
                    case "object":
                        parseComponent(parsedComponent, false)
                    default:
                        parsedComponent[key] = value;
                }
            })
            if(mustHaveType && !type)
                throw new TypeError("Artitas components must always have a type!");

            components[type] = has(component, "$content") 
                ? component.$content
                : isArrayLike(component)
                    ? [ ...values(parsedComponent) ] 
                    : { ...parsedComponent };
        }
    }*/

    projectFiles = projectFiles.map(parsedJson => {
        const { Parent, Name, _components, _excluded } = parsedJson.asset;
        const components = parseComponents(_components);
        const excluded = parseComponents(_excluded);
        //_components.forEach(parseComponent(components, true))

        const result = pickBy({
            parent: parseTemplateReference(Parent),
            name: Name,
            components,
            excluded,
            path: parsedJson.path,
        });
        console.log(`Parsed ${result.path}.json`);
        return result;
    })

    const outputFolder = customOutputFolder || resolvePath(templateRoot, "..", "xenoyaml");
    const writtenFolders = [outputFolder]
    await mkdir(outputFolder, { recursive: true });
    await batchOperation(
        projectFiles, 
        async (parsedFile) => {
            const path = `${outputFolder}${sep}${parsedFile.path}.yml`;
            const folder = dirname(path);
            if(!writtenFolders.includes(folder)) {
                await mkdir(folder, { recursive: true });
                writtenFolders.push(folder);
            }

            await writeFile(path, stringify(parsedFile, { defaultKeyType: 'PLAIN'} ));
            console.log(`Imported ${parsedFile.path}.yml`);
            imported = true;
        }
    );
    if(!imported)
        console.error("No importable files were found. Please make sure the provided path contains well-formed Artitas templates in JSON format.");
}