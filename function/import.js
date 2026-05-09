import {
  resolve as resolvePath,
  dirname,
  sep,
  relative as relativize,
} from "path";
import { stringify } from "yaml";
import { writeFile, readFile, mkdir } from "fs/promises";
import { map, keyBy, groupBy, pickBy, values, forEach } from "lodash-es";
import readFiles from "../util/readFiles.js";
import isArtitasTemplate from "../util/isArtitasTemplate.js";
import { parseComponents } from "../util/transformComponents.js";
import { parseTemplateReference } from "../util/templateReferenceUtils.js";
import batchOperation from "../util/batchOperation.js";

const command = {
  command: "import <project>",
  aliases: ["i", "load", "extract", "unpack"],
  describe: "Imports Artitas template data from the specified file or folder.",
  builder: {
    mergeScreens: {
      alias: "m",
      type: "boolean",
      default: false,
      description:
        "If set, merges templates with the same path into the same file across screen boundaries. For instance, 'strategy/item/ammo/ballistic_rifle.json' and 'groundcombat/item/ammo/ballistic_rifle.json' would be written into 'item/ammo/ballistic_rifle.yml'.",
    },
    outputFolder: {
      alias: "o",
      requiresArg: true,
      type: "string",
      default: null,
      defaultDescription:
        "Falls back to '{projectRoot}/xenoyaml', where projectRoot is the parent of the nearest 'template' or 'templates' folder in the path to the project, *or* the project folder itself. Note that XenoYAML will disable --mergeScreens if the project is located outside a template folder.",
      description:
        "Path to the folder XenoYAML should write the imported files.",
    },
  },
  handler,
};

async function handler(options) {
  const { outputFolder: customOutputFolder, project } = options;
  let { mergeScreens } = options;
  let projectRoot = resolvePath(project);
  let projectFiles;
  let imported = false;

  // A bit of context: When extracting all_templates.zip, I renamed its root folder to
  // "templates" to prevent the game from picking it up. So I test for that too.
  const templateRegex = new RegExp(
    "(.*\\" + sep + "templates?\\" + sep + "?)?",
    "i",
  );

  let templateRoot = projectRoot.match(templateRegex)[0];
  if (!templateRoot) {
    console.warn(
      "Could not find content pack template folder! Paths in the resulting XenoYAML will be relative to the project root, instead. Note that this disables the --mergeScreens option, as it is no longer safe to use.",
    );
    mergeScreens = false;
    templateRoot = dirname(projectRoot);
  }

  console.log("Reading project files...");
  projectFiles = await readFiles([projectRoot], {
    extension: ".json",
    loader: async (filePath, _filename) => {
      const relativePath = relativize(templateRoot, filePath);
      const parsedFile = JSON.parse(
        (await readFile(filePath, "utf-8"))
          .replaceAll(/([^\\])":\s*(-?)Infinity/g, '$1": "$2Infinity"')
          .trim(),
      );
      return {
        ...parsedFile,
        path: relativePath.slice(0, -5),
      };
    },
    postFilter: isArtitasTemplate,
  });

  projectFiles = projectFiles.map((parsedJson) => {
    const { Parent, Name, _components, _excluded } = parsedJson.asset;
    const components = parseComponents(_components);
    const excluded = parseComponents(_excluded);

    const result = pickBy({
      parent: parseTemplateReference(Parent),
      name: Name,
      // Portability: Windows understands POSIX path separators,
      // but most other OSes do not understand Windows separators, so
      // let's only use POSIX separators in serialized data.
      $path: parsedJson.path.replaceAll(sep, "/"),
      components,
      excluded,
    });
    console.log(`Parsed ${result.$path}.json`);
    return result;
  });

  const screenlessPathRegex = /.*?\//i;
  if (mergeScreens) {
    projectFiles = map(
      groupBy(projectFiles, (file) =>
        file.$path.replace(screenlessPathRegex, ""),
      ),
      (group) => keyBy(group, (file) => file.$path.split("/")[0]),
    );
    projectFiles.map((group) =>
      forEach(group, (file) => {
        file.$path = file.$path.replace(screenlessPathRegex, "");
      }),
    );
  }

  const outputFolder =
    customOutputFolder || resolvePath(templateRoot, "..", "xenoyaml");
  const writtenFolders = [outputFolder];
  await mkdir(outputFolder, { recursive: true });
  await batchOperation(projectFiles, async (parsedFile) => {
    const pathToFile = mergeScreens
      ? values(parsedFile)[0].$path
      : parsedFile.$path;

    // ... We don't need to convert separators back to Windows,
    // but it looks nicer this way.
    const path = `${outputFolder}${sep}${pathToFile.replaceAll("/", sep)}.yml`;
    const folder = dirname(path);
    if (!writtenFolders.includes(folder)) {
      await mkdir(folder, { recursive: true });
      writtenFolders.push(folder);
    }

    await writeFile(
      path,
      stringify(
        { $schema: "0.4.0", ...parsedFile },
        { defaultKeyType: "PLAIN" },
      ),
    );
    console.log(`Imported ${pathToFile}.yml`);
    imported = true;
  });
  if (!imported)
    console.error(
      "No importable files were found. Please make sure the provided path contains well-formed Artitas templates in JSON format.",
    );
}

const userManual = `Attempts to import one or more Artitas templates into XenoYAML. This is useful to transfer an Artitas project into XenoYAML for the first time, or to update a XenoYAML mirror of an external project (such as the vanilla "xenonauts" content pack, or a mod developed in Artitas by another modder.)

The import tool ideally wants to be targeted at a "template(s)" folder or one of its descendants, in order to properly identify the project's root folder. This gives it access to detailed information about the project's file structure, enabling easier export back to Artitas, and potentially allowing it to emit other useful metadata into the imported files.

However, if this is not possible, then the target folder will be used as a fallback, and the tool will go into unsafe mode. Unsafe mode disables certain features due to potentially unwanted behaviors; the exact features may change in a future release.

Arguments:
  <project> - The Artitas file or folder to import. If it's a folder, it is also used as a fallback value for {projectRoot}. If it's a file, its parent folder is used as a fallback instead.

Options:
  -m, --mergeScreens: 
    Instructs the Artitas importer to merge templates across screen boundaries. If any of the imported templates have the same path in different screens (e.g. "strategy/item/ammo/ballistic_rifle" and "groundcombat/item/ammo/ballistic_rifle"), they will be imported into the same XenoYAML file.

    This option cannot currently be used in unsafe mode. Additionally, it has a number of side effects:
    
      - Screen hierarchy is not emitted to the filesystem. (As an example, the above ammo templates would be imported into "item/ammo/ballistic_rifle.yml".)

      - Instead of a root-level YAML object, each template is imported into a YAML dictionary (even if there is only one template in the resulting file), keyed by the screen it belongs to.

      - The screen name is not included in the template's "$path" property. (In a future version of XenoYAML, this may become the default behavior for all imports, for consistency's sake.)

    It is worth noting that while XenoYAML does not currently have any way of writing nested dictionaries into YAML, it is fully capable of exporting them back into Artitas, as long as the above rules are followed. See https://github.com/DaloLorn/Xeno2-PlayableServitors for an example of a project that aggressively uses this feature (and many more) to organize its files.

  -o, --outputFolder:
    Specifies the folder the imported project should be written into.

    Defaults to "{projectRoot}/xenoyaml".`;

export default { ...command, userManual };
