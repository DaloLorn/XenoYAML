import { resolve as resolvePath, dirname, sep } from "path";
import { parse } from "yaml";
import { readFile, writeFile, mkdir } from "fs/promises";
import { map, pickBy, isUndefined, identity } from "lodash-es";
import readFiles from "../util/readFiles.js";
import { stringifyTemplate } from "../util/transformComponents.js";
import batchOperation from "../util/batchOperation.js";
import { importBuilders } from "../util/buildComponents.js";
import { fixPath } from "../util/templateReferenceUtils.js";

const METADATA = ["$aliases", "$schema", "$builders", "$schemaVersion"];

const command = {
  command: "* <project>",
  aliases: ["export", "e", "pack", "build", "compile"],
  describe: "Exports the selected XenoYAML file or folder to Artitas.",
  builder: {
    pretty: {
      alias: ["p", "format", "prettify"],
      type: "boolean",
      default: false,
      description:
        "If set, formats the exported JSON with 2-space indentation.",
    },
    outputFolder: {
      alias: "o",
      requiresArg: true,
      type: "string",
      defaultDescription:
        "Falls back to '{projectRoot}/template', where projectRoot is the parent of the nearest 'xenoyaml' folder in the path to the project, *or* the project folder itself.",
      description:
        "Path to the folder XenoYAML should write the exported files.",
    },
  },
  handler,
};

async function handler(options) {
  const { outputFolder: customOutputFolder, pretty, project } = options;
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
      "Could not find content pack XenoYAML folder! Paths in the resulting templates will be relative to the project root, instead.\n",
    );
    xenoyamlRoot = dirname(projectRoot);
  }

  console.log("Reading project files...");
  projectFiles = await readFiles([projectRoot], {
    extension: ".yml",
    loader: async (filePath, _filename) => {
      const parsedFile = parse(await readFile(filePath, "utf-8"), {
        merge: true,
      });
      return parsedFile;
    },
    // TODO: Add this, maybe, I guess.
    // postFilter: isXenoYAML,
  });

  console.log("\nReading builders...\n");
  const builders = {};
  let buildersSafe = true;
  projectFiles.forEach(({ $builders }) => {
    buildersSafe &&= importBuilders($builders, builders);
  });
  if (!buildersSafe) {
    console.error(
      "Encountered errors while reading builders from the project! Please fix them and try again!",
    );
    return;
  }

  const errors = [];
  // Helper to unpack merged (or otherwise nested) templates from the YML.
  function parseTemplate(outerPrefix) {
    return (xenoYAML, prefix) => {
      // Don't bother unpacking the XenoYAML metadata!
      if (METADATA.includes(prefix)) return;

      if (typeof prefix !== "number")
        prefix = `${outerPrefix ? `${outerPrefix}${sep}` : ""}${prefix}`;
      else prefix = undefined;
      if (isUndefined(xenoYAML.$path))
        return map(xenoYAML, parseTemplate(prefix));

      const { $path } = xenoYAML;
      // Clean up inappropriate POSIX separators for neater output.
      // Also, merge the prefix into the path for correct generation
      // of parent refs and output paths.
      const path =
        $path === ""
          ? prefix.replaceAll("/", sep)
          : `${prefix ? `${prefix}${sep}` : ""}${$path}`.replaceAll("/", sep);

      try {
        const template = {
          version: "0.1.0",
          asset: pickBy({
            ...stringifyTemplate(xenoYAML, path, builders),
            $t: "4",
          }),
          $t: "15",
        };

        console.log(
          prefix
            ? `Parsed ${prefix.replaceAll("/", sep)} entry from ${$path}.yml`
            : `Parsed ${$path}.yml`,
        );
        // We'll need the path to actually write the file into the right location.
        return {
          template,
          path: fixPath(path),
        };
      } catch (e) {
        if (e instanceof SyntaxError) {
          errors.push(
            prefix
              ? `Error parsing ${prefix.replaceAll("/", sep)} entry from ${$path}.yml: ${e.message}`
              : `Error parsing ${$path}.yml: ${e.message}`,
          );
          return;
        }
      }
    };
  }

  projectFiles = projectFiles
    .map(parseTemplate())
    .flat(Infinity)
    .filter(identity);
  console.log();

  const outputFolder =
    customOutputFolder || resolvePath(xenoyamlRoot, "..", "template");
  const writtenFolders = [outputFolder];
  await mkdir(outputFolder, { recursive: true });
  await batchOperation(projectFiles, async (packedFile) => {
    // Can't serialize the XenoYAML metadata!
    if (!packedFile) return;

    if (!packedFile.path.toLowerCase().endsWith(".json"))
      packedFile.path += ".json";

    const path = `${outputFolder}${sep}${packedFile.path}`;
    const folder = dirname(path);
    if (!writtenFolders.includes(folder)) {
      await mkdir(folder, { recursive: true });
      writtenFolders.push(folder);
    }

    await writeFile(
      path,
      JSON.stringify(
        packedFile.template,
        undefined,
        pretty ? 2 : undefined,
      ).replaceAll(/([^\\]":\s*)"(-?Infinity)"/gi, "$1$2"),
    );
    console.log(`Exported ${packedFile.path}`);
    exported = true;
  });
  if (!exported)
    console.error(
      "No importable files were found. Please make sure the provided path contains valid XenoYAML files.",
    );
  if (errors.length) {
    console.error(
      `Encountered errors during export:\n\n- ${errors.join("\n- ")}\n\nPlease correct these and run the exporter again.`,
    );
  }
}

const userManual = `Attempts to export a XenoYAML file or folder to Artitas JSON files. As the most important XenoYAML tool, this is also the default command.

The export tool ideally wants to be targeted at a "xenoyaml" folder or one of its descendants, in order to properly identify the project's root folder (and potentially discover other data, like where it needs to be exported to). If this is not possible, then the target folder will be used as a fallback.

Arguments:
  <project> - The XenoYAML file or folder to export. If it's a folder, it is also used as a fallback value for {projectRoot}. If it's a file, its parent folder is used as a fallback instead.

Options:
  -p, --pretty, --format, --prettify: 
    Instructs the Artitas exporter to format templates with 2-space indentation to be more easily read by human beings.
    
    This is not recommended for general use, as the game needs more time to parse the larger files. Instead, you should prefer to use XenoYAML files as the authoritative source for editing or version control, and treat exported Artitas templates as read-only build artifacts. (Or intermediary files, if you're packing them into an asset bundle. The author of this documentation feels a sudden compulsion to point out that placing XenoYAML files in an asset bundle serves no purpose whatsoever except to needlessly increase the bundle's size, so don't do *that* either.)

  -o, --outputFolder:
    Specifies the folder the exported project should be written into.

    Defaults to "{projectRoot}/template".`;

export default { ...command, userManual };
