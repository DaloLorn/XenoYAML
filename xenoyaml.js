import { isString } from "lodash-es";
import { getopt } from "stdio";
import importFromArtitas from "./function/import.js";

const options = getopt({
    import: {
        key: "i", description: "Tells XenoYAML to import data from Artitas instead of exporting from YAML.",
    },
    outputFolder: {
        key: "o", description: "Specifies an output folder. Defaults to '{currentFolder}/xenoyaml' in import mode, or '{currentFolder}/template' in export mode.", args: 1
    },
    // TODO: Implement this at some point.
    /*mergeScreens: {
        key: "m", description: "Merges templates with the same path and different screens into the same file. For instance, strategy/item/ammo/ballistic_rifle.json and groundcombat/item/ammo/ballistic_rifle.json are written into merged/item/ammo/ballistic_rifle.yml."
    },*/
    _meta_: { args: 1 },
});

let abort = false;

function exit(explanation) {
    console.error(explanation);
    abort = true;
}

if(!options.import) exit("Sorry, exporting isn't implemented yet! (Maybe tomorrow!)");

if(!abort) {
    if(options.import) {
        await importFromArtitas(options);
    }
    else {
        await exportToArtitas(options);
    }
}