import { resolve as resolvePath, relative as relativize, join } from "path";
import { parse, stringify } from "yaml";
import { writeFile, readFile } from "fs/promises";
import readFiles from "../util/readFiles.js";
import batchOperation from "../util/batchOperation.js";
import { CURRENT_SCHEMA } from "../util/miscellaneousConsts.js";

const command = {
  command: "upgrade <project>",
  aliases: ["u", "migrate"],
  describe:
    "Attempts to automatically upgrade a XenoYAML project to the latest XenoYAML schema. Unlike other XenoYAML operations, this does not currently care about content pack structure and will simply iterate across all .yml files in the target folder (if applicable).",
  builder: {
    dryRun: {
      alias: ["d", "test", "t", "c", "check"],
      type: "boolean",
      description: "If set, XenoYAML will not commit any changes to disk.",
    },
  },
  handler,
};

async function handler(options) {
  const { project, dryRun } = options;
  let projectRoot = resolvePath(project);
  let projectFiles;

  projectFiles = await readFiles([projectRoot], {
    extension: ".yml",
    loader: async (filePath, _filename) => {
      const relativePath = relativize(projectRoot, filePath);
      const parsedFile = parse(await readFile(filePath, "utf-8"), {
        merge: true,
      });
      return {
        // A relative path from the project root will omit the root.
        // However, the project root is an absolute path, which is
        // inconvenient for logging. Instead, we'll log the
        // original (almost certainly relative) path provided by the user.
        path: join(project, relativePath),
        absolutePath: filePath,
        parsedFile,
      };
    },
  });

  projectFiles.forEach((file) => {
    const { parsedFile, path } = file;
    if (parsedFile.$schemaVersion === CURRENT_SCHEMA) return;

    // Migration from 0.2.0 and older.
    if (parsedFile.path) {
      parsedFile.$path = parsedFile.path;
      delete parsedFile.path;
    } // Migration from 0.4.0-0.10.0.
    else if (parsedFile.$schema === "0.4.0") delete parsedFile.$schema;
    // Fallback: We don't think this is a XenoYAML file?
    else if (!parsedFile.$schemaVersion) return;

    // A little bit of hacking to ensure the schema version is always
    // at the top of the file.
    delete parsedFile.$schemaVersion;
    file.parsedFile = { $schemaVersion: CURRENT_SCHEMA, ...parsedFile };
    file.upgraded = true;
    console.log(`Upgraded ${path}`);
  });

  projectFiles = projectFiles.filter(({ upgraded }) => !!upgraded);
  if (!projectFiles.length)
    console.log(`All files already use the latest schema, ${CURRENT_SCHEMA}!`);
  else if (!dryRun) {
    await batchOperation(
      projectFiles,
      async ({ parsedFile, path, absolutePath }) => {
        await writeFile(
          absolutePath,
          stringify(parsedFile, { defaultKeyType: "PLAIN" }),
        );
        console.log(`Wrote ${path}`);
      },
    );
  }
}

const userManual = `Attempts to migrate a XenoYAML project to the latest schema version.

Unlike other XenoYAML tools, the migration tool doesn't care about the project's root folder (at this time), and will simply convert all XenoYAML files at the specified location.

USER BEWARE: The YAML library XenoYAML uses to parse YAML does not preserve aliases or file formatting. Do not use this tool if you want to keep your aliases and formatting intact! Instead, review the XenoYAML changelog or ask the developer for help with the migration.

Arguments:
  <project> - The XenoYAML file or folder to upgrade.

Options:
  -d, -t, -c, --dryRun, --test, --check:
    Instructs XenoYAML to check whether any files in the project use outdated schemas, but without committing any changes to the filesystem.`;

export default { ...command, userManual };
