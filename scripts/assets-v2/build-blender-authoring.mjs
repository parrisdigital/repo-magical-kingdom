#!/usr/bin/env node

import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const defaultRecipe = resolve(repositoryRoot, "art/world-v2/batch-1-original-assets.recipe.json");
const authoringScript = resolve(repositoryRoot, "art/world-v2/blender/archive_spire_authoring.py");

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag.startsWith("--") || !argv[index + 1]) {
      throw new Error(`expected --name value arguments; received ${flag}`);
    }
    values.set(flag.slice(2), argv[index + 1]);
    index += 1;
  }
  return values;
}

function run(binary, argumentsList) {
  const result = spawnSync(binary, argumentsList, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      ALL_PROXY: "",
      http_proxy: "",
      https_proxy: "",
      all_proxy: "",
      NO_PROXY: "*",
      no_proxy: "*",
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      [`Blender authoring failed with exit ${result.status}.`, result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

async function parseGlb(path) {
  const buffer = await readFile(path);
  if (buffer.toString("ascii", 0, 4) !== "glTF") throw new Error("Blender output is not a GLB");
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const gltf = await new Promise((accept, reject) => {
    new GLTFLoader().parse(arrayBuffer, "", accept, reject);
  });
  return { buffer, gltf };
}

const argumentsMap = parseArguments(process.argv.slice(2));
const outputArgument = argumentsMap.get("output");
if (!outputArgument) throw new Error("--output is required for offline Blender authoring");
const output = resolve(outputArgument);
const blendOutputArgument = argumentsMap.get("blend-output");
const blendOutput = blendOutputArgument ? resolve(blendOutputArgument) : null;
const recipe = resolve(argumentsMap.get("recipe") || defaultRecipe);
const family = argumentsMap.get("family") || "archive-spire";
const blender = process.env.WORLD_ASSETS_V2_BLENDER_BIN || "blender";
const expectedVersion = "5.1.2";

const versionOutput = run(blender, ["--version"]);
if (!versionOutput.includes(`Blender ${expectedVersion}`)) {
  throw new Error(`Expected Blender ${expectedVersion}; received ${versionOutput.trim()}`);
}

await mkdir(dirname(output), { recursive: true });
if (blendOutput) await mkdir(dirname(blendOutput), { recursive: true });
const authoringArguments = [
  "--background",
  "--factory-startup",
  "--python-exit-code",
  "1",
  "--python",
  authoringScript,
  "--",
  "--recipe",
  recipe,
  "--family",
  family,
  "--output",
  output,
];
if (blendOutput) authoringArguments.push("--blend-output", blendOutput);
run(blender, authoringArguments);

const { buffer, gltf } = await parseGlb(output);
gltf.scene.updateMatrixWorld(true);
const bounds = new THREE.Box3().setFromObject(gltf.scene);
if (Math.abs(bounds.min.y) > 0.000001 || !bounds.min.toArray().every(Number.isFinite)) {
  throw new Error(`Blender proof is not grounded or finite: min=${bounds.min.toArray().join(",")}`);
}
if (!gltf.scene.getObjectByName("COLLIDER_archive_spire_core")) {
  throw new Error("Blender proof is missing its collision proxy");
}
const animation = gltf.animations.find((clip) => clip.name === "BeaconPulse");
if (
  !animation ||
  !animation.tracks.some((track) => track.name.includes("ANIM_archive_spire_beacon"))
) {
  throw new Error("Blender proof is missing its named BeaconPulse animation channel");
}

console.log(
  `Verified offline Blender ${expectedVersion} authoring: ${family}, ${buffer.byteLength} bytes, Y=${bounds.min.y.toFixed(6)}..${bounds.max.y.toFixed(3)}.`,
);
