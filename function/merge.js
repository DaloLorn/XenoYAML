import { resolve as resolvePath, dirname } from "path";
import { parse, stringify } from "yaml";
import { readFile, writeFile, mkdir, unlink } from "fs/promises";
import { merge, keys, isEqual } from "lodash-es";
import findKeyPaths from "../util/findKeyPaths.js";

const command = {
  command: "merge <source> <target> [output]",
  aliases: ["m", "associate", "combine"],
  describe:
    "Recursively merges the source and target XenoYAML files into the output file (or target, if no output was provided), deleting the source files afterwards.",
  builder: {
    unsafe: {
      alias: "u",
      type: "boolean",
      description:
        "If set, XenoYAML will not abort the merge if both files contain overlapping template objects. (It will still abort on mismatched schema versions or overlapping aliases, though.)",
    },
    forceDelete: {
      alias: "f",
      type: "boolean",
      implies: "unsafe",
      description:
        "If set, XenoYAML will always delete the source files after merging, even if they contain overlapping templates. (This automatically enables the --unsafe flag.)",
    },
    dryRun: {
      alias: ["d", "test", "t", "c", "check"],
      type: "boolean",
      conflicts: "forceDelete",
      description:
        "If set, XenoYAML will not commit any changes to disk. (This is incompatible with --forceDelete.)",
    },
  },
  handler,
};

async function handler(options) {
  const { source, target, output, unsafe, forceDelete, dryRun } = options;
  if (!source.endsWith(".yml")) {
    console.error("Source must be a XenoYAML file! Aborting!");
    return;
  }
  if (!target.endsWith(".yml")) {
    console.error("Target must be a XenoYAML file! Aborting!");
    return;
  }

  const hasOutput = !!output;
  if (hasOutput && !output.endsWith(".yml")) {
    console.error("Output must be a XenoYAML file! Aborting!");
    return;
  }

  const sourcePath = resolvePath(source);
  const targetPath = resolvePath(target);
  const outputPath = hasOutput ? resolvePath(output) : targetPath;

  const parsedSource = parse(await readFile(sourcePath, "utf-8"), {
    merge: true,
  });
  const parsedTarget = parse(await readFile(targetPath, "utf-8"), {
    merge: true,
  });

  if (parsedSource.$schema !== parsedTarget.$schema) {
    console.error(
      "Cannot merge files with different schema versions! Aborting!",
    );
    return;
  }

  // ... These are paths to $path properties, whereas the above were
  // the contents of the $path properties. Either one would be dangerous
  // on a conflict.
  const parsedSourcePaths = findKeyPaths(parsedSource, "$path");
  const parsedTargetPaths = findKeyPaths(parsedTarget, "$path");
  const conflictingPaths = parsedTargetPaths.filter((path) =>
    parsedSourcePaths.includes(path),
  );

  if (conflictingPaths.length) {
    if (!unsafe) {
      console.error(
        "Cannot merge files with overlapping template subtrees! Aborting!",
        conflictingPaths,
      );
      return;
    } else {
      console.warn("Detected overlapping template subtrees!", conflictingPaths);
    }
  }

  const parsedSourceAliases = keys(parsedSource.$aliases);
  const parsedTargetAliases = keys(parsedTarget.$aliases);
  const conflictingAliases = parsedTargetAliases.filter(
    (alias) =>
      parsedSourceAliases.includes(alias) &&
      !isEqual(parsedSource.$aliases[alias], parsedTarget.$aliases[alias]),
  );

  if (conflictingAliases.length) {
    console.error(
      "Cannot merge files with overlapping aliases! Aborting!",
      conflictingAliases,
    );
    return;
  }

  if (!dryRun) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      stringify(merge(parsedSource, parsedTarget), { defaultKeyType: "PLAIN" }),
    );
    if (forceDelete || (!conflictingPaths.length && !conflictingPaths.length))
      await Promise.all([
        unlink(sourcePath),
        ...(hasOutput ? [unlink(targetPath)] : []),
      ]);
    console.log(`Merged to ${outputPath}`);
  }
}

const userManual = `Attempts to recursively merge two XenoYAML template trees, 

The export tool ideally wants to be targeted at a "xenoyaml" folder or one of its descendants, in order to properly identify the project's root folder (and potentially discover other data, like where it needs to be exported to). If this is not possible, then the target folder will be used as a fallback.

Arguments: 
  <source> - The source file to merge from. Always deleted on a safe merge. (See --unsafe and --forceDelete for more details.)
  <target> - The target file to merge to. Deleted if [output] was provided.
  [output] - Optional output file for the merged template tree. If absent, defaults to <target>.

Options:
  -u, --unsafe: 
    Instructs the merger to merge overlapping template objects instead of aborting the merge. Overlapping templates are detected by finding all the paths to $path fields throughout the file.

    XenoYAML will still abort merges where the source and target schemas (root-level $schema field) are not the same, or where the source and target both define the same alias with a different set of values. 

    By default, XenoYAML will not delete the source files after an unsafe merge.

  -f, --forceDelete:
    Instructs XenoYAML to delete the original files after any successful merge, unsafe or otherwise. (This automatically enables --unsafe at this time.)
    
  -d, -t, -c, --dryRun, --test, --check:
    Instructs XenoYAML to check whether the files can be safely merged, but without committing any changes to the filesystem. (This is incompatible with --forceDelete.)`;

export default { ...command, userManual };
