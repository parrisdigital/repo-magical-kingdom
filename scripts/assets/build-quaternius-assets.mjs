#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import process from "node:process";

const GLTF_TRANSFORM_VERSION = "4.4.2";

const selections = {
  medieval: [
    "Balcony_Cross_Straight",
    "Corner_Exterior_Brick",
    "Corner_Exterior_Wood",
    "DoorFrame_Round_Brick",
    "Door_1_Round",
    "Prop_Chimney",
    "Prop_Vine1",
    "Prop_Wagon",
    "Prop_WoodenFence_Single",
    "Roof_RoundTiles_4x4",
    "Roof_RoundTiles_6x8",
    "Roof_RoundTiles_8x8",
    "Roof_Tower_RoundTiles",
    "Stairs_Exterior_Straight",
    "Wall_Plaster_Door_Round",
    "Wall_Plaster_Straight",
    "Wall_Plaster_Window_Wide_Round",
    "Wall_UnevenBrick_Door_Round",
    "Wall_UnevenBrick_Straight",
    "Wall_UnevenBrick_Window_Wide_Round",
    "WindowShutters_Wide_Round_Open",
    "Window_Wide_Round1",
  ],
  nature: [
    "Bush_Common",
    "Bush_Common_Flowers",
    "CommonTree_1",
    "CommonTree_2",
    "CommonTree_3",
    "DeadTree_1",
    "Fern_1",
    "Flower_3_Group",
    "Flower_4_Group",
    "Grass_Common_Short",
    "Mushroom_Common",
    "Pine_1",
    "Pine_2",
    "RockPath_Round_Small_1",
    "Rock_Medium_1",
    "Rock_Medium_2",
    "TwistedTree_1",
    "TwistedTree_2",
  ],
  animals: ["Deer", "Fox", "Stag"],
};

function printHelp() {
  console.log(`Build the curated Quaternius browser asset bundle.

Usage:
  node scripts/assets/build-quaternius-assets.mjs [options]

Options:
  --medieval-source <dir>  Standard Medieval Village MegaKit glTF directory
  --nature-source <dir>    Standard Stylized Nature MegaKit glTF directory
  --animals-source <dir>   Directory containing Deer.gltf, Fox.gltf, Stag.gltf
  --collections <list>     Comma-separated subset: medieval,nature,animals
  --output <dir>           Output root (default: public/assets/world/quaternius)
  --help                   Show this help

The source downloads are intentionally not fetched by this script. Review their
CC0 declarations and hashes before providing local source directories.`);
}

function parseArguments(argv) {
  const values = {
    output: resolve("public/assets/world/quaternius"),
    collections: new Set(Object.keys(selections)),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--help") {
      printHelp();
      process.exit(0);
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }

    if (argument === "--medieval-source") values.medievalSource = resolve(value);
    else if (argument === "--nature-source") values.natureSource = resolve(value);
    else if (argument === "--animals-source") values.animalsSource = resolve(value);
    else if (argument === "--output") values.output = resolve(value);
    else if (argument === "--collections") {
      values.collections = new Set(value.split(",").map((item) => item.trim()));
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
    index += 1;
  }

  for (const collection of values.collections) {
    if (!Object.hasOwn(selections, collection)) {
      throw new Error(`Unknown collection: ${collection}`);
    }
    const sourceKey = `${collection}Source`;
    if (!values[sourceKey]) {
      throw new Error(`--${collection}-source is required for ${collection}`);
    }
  }

  return values;
}

function runGltfTransform(command, input, output, extraArguments = []) {
  const result = spawnSync(
    "pnpm",
    [
      "dlx",
      `@gltf-transform/cli@${GLTF_TRANSFORM_VERSION}`,
      command,
      input,
      output,
      ...extraArguments,
    ],
    { stdio: "inherit" },
  );

  if (result.status !== 0) {
    throw new Error(`glTF Transform ${command} failed for ${basename(input)}`);
  }
}

function optimize(input, output, options = {}) {
  const argumentsList = ["--compress", "meshopt"];
  if (options.textures !== false) {
    argumentsList.push("--texture-compress", "webp", "--texture-size", "1024");
  }
  if (options.preserveAssembly) {
    argumentsList.push("--simplify", "false", "--join", "false", "--palette", "false");
  }
  runGltfTransform("optimize", input, output, argumentsList);
}

async function optimizeGltfCollection(sourceDirectory, outputDirectory, names) {
  await mkdir(outputDirectory, { recursive: true });
  for (const name of names) {
    const source = resolve(sourceDirectory, `${name}.gltf`);
    const destination = resolve(outputDirectory, `${name}.glb`);
    optimize(source, destination, { preserveAssembly: true });
  }
}

async function convertAnimals(sourceDirectory, outputDirectory, temporaryDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  for (const name of selections.animals) {
    const intermediate = resolve(temporaryDirectory, `${name}.glb`);
    runGltfTransform("copy", resolve(sourceDirectory, `${name}.gltf`), intermediate);
    optimize(intermediate, resolve(outputDirectory, `${name}.glb`));
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const temporaryDirectory = await mkdtemp(resolve(tmpdir(), "repo-magical-kingdom-assets-"));

  try {
    if (options.collections.has("medieval")) {
      await optimizeGltfCollection(
        options.medievalSource,
        resolve(options.output, "medieval"),
        selections.medieval,
      );
    }
    if (options.collections.has("nature")) {
      await optimizeGltfCollection(
        options.natureSource,
        resolve(options.output, "nature"),
        selections.nature,
      );
    }
    if (options.collections.has("animals")) {
      await convertAnimals(
        options.animalsSource,
        resolve(options.output, "animals"),
        temporaryDirectory,
      );
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
