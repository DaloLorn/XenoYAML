#!/usr/bin/env node
import { getopt } from "stdio";
import importFromArtitas from "./function/import.js";
import exportToArtitas from "./function/export.js";

const options = getopt({
  import: {
    key: "i",
    description:
      "Tells XenoYAML to import data from Artitas instead of exporting from YAML.",
  },
  outputFolder: {
    key: "o",
    description:
      "Specifies an output folder. Defaults to '{projectRoot}/xenoyaml' in import mode, or '{projectRoot}/template' in export mode. (For some clarification on how projectRoot is set: For the input path you provide, XenoYAML will try to find the nearest ancestor called 'template' or 'templates' in import mode, or 'xenoyaml' in output mode. If none exists, it will fall back to the folder specified by your input path.)",
    args: 1,
  },
  mergeScreens: {
        key: "m", description: "Import-only: Merges templates with the same path and different screens into the same file. For instance, strategy/item/ammo/ballistic_rifle.json and groundcombat/item/ammo/ballistic_rifle.json are written into item/ammo/ballistic_rifle.yml."
    },
    pretty: {
        key: "p", description: "Export-only: Formats the exported JSON with 2-space indentation for readability. This is not recommended for general use"
    },
  _meta_: { args: 1 },
});

let abort = false;

// eslint-disable-next-line no-unused-vars
function exit(explanation) {
  console.error(explanation);
  abort = true;
}

if (!abort) {
  if (options.import) {
    await importFromArtitas(options);
  } else {
    await exportToArtitas(options);
  }
}
