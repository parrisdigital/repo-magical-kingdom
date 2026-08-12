#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

function printHelp() {
  console.log(`Rebuild every bundled 3D asset collection from reviewed local sources.

Usage:
  pnpm assets:build -- [options]

Required source options:
  --medieval-source <dir>         Quaternius Medieval Village glTF directory
  --nature-source <dir>           Quaternius Stylized Nature glTF directory
  --animals-source <dir>          Quaternius Deer/Fox/Stag glTF directory
  --kenney-nature-archive <file>  Kenney Nature Kit 2.1 ZIP
  --kenney-holiday-archive <file> Kenney Holiday Kit 2.0 ZIP

Optional output roots:
  --quaternius-output <dir>       Default: public/assets/world/quaternius
  --kenney-output <dir>           Default: public/assets/world/kenney

Use assets:quaternius:build or assets:seasonal:build when intentionally
rebuilding only one independently licensed collection.`);
}

function parseArguments(argv) {
  const options = {
    quaterniusOutput: resolve("public/assets/world/quaternius"),
    kenneyOutput: resolve("public/assets/world/kenney"),
  };
  const keys = {
    "--medieval-source": "medievalSource",
    "--nature-source": "natureSource",
    "--animals-source": "animalsSource",
    "--kenney-nature-archive": "kenneyNatureArchive",
    "--kenney-holiday-archive": "kenneyHolidayArchive",
    "--quaternius-output": "quaterniusOutput",
    "--kenney-output": "kenneyOutput",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--help") {
      printHelp();
      process.exit(0);
    }
    const key = keys[argument];
    if (!key) throw new Error(`Unknown option: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
    options[key] = resolve(value);
    index += 1;
  }

  for (const [flag, key] of Object.entries(keys).slice(0, 5)) {
    if (!options[key]) throw new Error(`${flag} is required`);
  }
  return options;
}

function run(script, argumentsList) {
  const result = spawnSync(process.execPath, [resolve(script), ...argumentsList], {
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`${script} failed`);
}

const options = parseArguments(process.argv.slice(2));

run("scripts/assets/build-quaternius-assets.mjs", [
  "--medieval-source",
  options.medievalSource,
  "--nature-source",
  options.natureSource,
  "--animals-source",
  options.animalsSource,
  "--output",
  options.quaterniusOutput,
]);

run("scripts/assets/build-kenney-seasonal-assets.mjs", [
  "--nature-archive",
  options.kenneyNatureArchive,
  "--holiday-archive",
  options.kenneyHolidayArchive,
  "--output",
  options.kenneyOutput,
]);
