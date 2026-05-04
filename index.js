#!/usr/bin/env node
import _yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { argv } from "process";
import importFromArtitas from "./function/import.js";
import exportToArtitas from "./function/export.js";
import mergeXenoyaml from "./function/merge.js";
import userManual from "./function/help.js";

const yargs = _yargs();
await yargs
  .command([exportToArtitas, importFromArtitas, mergeXenoyaml, userManual])
  .demandCommand()
  .wrap(Math.min(160, yargs.terminalWidth()))
  .help()
  .parse(hideBin(argv));
