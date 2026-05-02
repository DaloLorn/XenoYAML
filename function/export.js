import { resolve as resolvePath, dirname, sep } from "path";
import { parse } from "yaml";
import { readFile, writeFile, mkdir } from "fs/promises";
import { pickBy } from "lodash-es";
import readFiles from "../util/readFiles.js";
import { stringifyComponents } from "../util/transformComponents.js";
import { stringifyTemplateReference } from "../util/templateReferenceUtils.js";
import batchOperation from "../util/batchOperation.js";

export default async function exportToArtitas(options) {
  const { outputFolder: customOutputFolder, args } = options;
  const project = args[0];
  let projectRoot = resolvePath(project);
  let projectFiles;
  let exported = false;

  const xenoyamlRegex = new RegExp(
    "(.*\\" + sep + "xenoyaml\\" + sep + "?)?",
    "i",
  );

  let xenoyamlRoot = projectRoot.match(xenoyamlRegex)[0];
  if (!xenoyamlRoot) {
    console.warn(
      "Could not find content pack XenoYAML folder! Paths in the resulting templates will be relative to the project root, instead.",
    );
    xenoyamlRoot = dirname(projectRoot);
  }

  projectFiles = await readFiles([projectRoot], {
    extension: ".yml",
    loader: async (filePath, _filename) => {
      const parsedFile = parse(await readFile(filePath, "utf-8"));
      return parsedFile;
    },
    // TODO: Add this, maybe, I guess.
    // postFilter: isXenoYAML,
  });

  projectFiles = projectFiles.map((parsedYaml) => {
    const { parent, name, components, excluded, path } = parsedYaml;
    const template = {
      version: "0.1.0",
      asset: pickBy({
        Parent: stringifyTemplateReference(parent, path),
        Name: name,
        _components: stringifyComponents(components),
        _excluded: stringifyComponents(excluded),
        $t: "4",
      }),
      $t: "15",
    };

    console.log(`Parsed ${path}.yml`);
    return {
      // We'll need the path to actually write the file into the right location.
      template,
      path,
    };
  });

  const outputFolder =
    customOutputFolder || resolvePath(xenoyamlRoot, "..", "template");
  const writtenFolders = [outputFolder];
  await mkdir(outputFolder, { recursive: true });
  await batchOperation(projectFiles, async (packedFile) => {
    const path = `${outputFolder}${sep}${packedFile.path}.json`;
    const folder = dirname(path);
    if (!writtenFolders.includes(folder)) {
      await mkdir(folder, { recursive: true });
      writtenFolders.push(folder);
    }

    await writeFile(
      path,
      JSON.stringify(packedFile.template).replaceAll(
        /([^\\]":\s*)"(-?Infinity)"/gi,
        "$1$2",
      ),
    );
    console.log(`Exported ${packedFile.path}.json`);
    exported = true;
  });
  if (!exported)
    console.error(
      "No importable files were found. Please make sure the provided path contains valid XenoYAML files.",
    );
}
