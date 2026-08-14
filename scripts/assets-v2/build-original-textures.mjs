#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const outputDirectory = resolve(repositoryRoot, "public/assets/world-v2/archive-spire/textures");
const basisOutputDirectory = resolve(repositoryRoot, "public/assets/world-v2/basis");
const basisSourceDirectory = resolve(repositoryRoot, "node_modules/three/examples/jsm/libs/basis");
const textureSize = 512;
const expectedToktxVersion = "4.4.2";
const toktx = process.env.WORLD_ASSETS_V2_TOKTX_BIN || "toktx";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function run(binary, argumentsList) {
  const result = spawnSync(binary, argumentsList, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, TOKTX_OPTIONS: "" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      [
        `toktx failed with exit ${result.status}: ${argumentsList.join(" ")}`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function hash2(x, y, seed) {
  let value = Math.imul(x + 0x9e37, 0x85ebca6b) ^ Math.imul(y + 0x7f4a, 0xc2b2ae35) ^ seed;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return (value >>> 0) / 0xffffffff;
}

function stoneHeight(x, y) {
  const row = Math.floor(y / 48);
  const shiftedX = (x + (row % 2) * 32) % 64;
  const mortar = y % 48 < 4 || shiftedX < 4;
  return mortar ? 0.12 : 0.7 + hash2(x, y, 271828) * 0.18;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function createTexturePixels(channel) {
  const pixels = Buffer.alloc(textureSize * textureSize * 3);
  for (let y = 0; y < textureSize; y += 1) {
    for (let x = 0; x < textureSize; x += 1) {
      const offset = (y * textureSize + x) * 3;
      const height = stoneHeight(x, y);
      const noise = hash2(x, y, 314159) - 0.5;
      if (channel === "baseColor") {
        const mortar = height < 0.2;
        const base = mortar ? [67, 75, 80] : [112, 126, 137];
        pixels[offset] = clampByte(base[0] + noise * 20);
        pixels[offset + 1] = clampByte(base[1] + noise * 18);
        pixels[offset + 2] = clampByte(base[2] + noise * 17);
      } else if (channel === "normal") {
        const left = stoneHeight((x - 1 + textureSize) % textureSize, y);
        const right = stoneHeight((x + 1) % textureSize, y);
        const down = stoneHeight(x, (y - 1 + textureSize) % textureSize);
        const up = stoneHeight(x, (y + 1) % textureSize);
        let normalX = -(right - left) * 2.4;
        let normalY = -(up - down) * 2.4;
        let normalZ = 1;
        const length = Math.hypot(normalX, normalY, normalZ);
        normalX /= length;
        normalY /= length;
        normalZ /= length;
        pixels[offset] = clampByte((normalX * 0.5 + 0.5) * 255);
        pixels[offset + 1] = clampByte((normalY * 0.5 + 0.5) * 255);
        pixels[offset + 2] = clampByte((normalZ * 0.5 + 0.5) * 255);
      } else if (channel === "orm") {
        const mortar = height < 0.2;
        pixels[offset] = mortar ? 176 : 242;
        pixels[offset + 1] = clampByte((mortar ? 0.94 : 0.76 + noise * 0.08) * 255);
        pixels[offset + 2] = 5;
      } else {
        throw new Error(`unsupported texture channel ${channel}`);
      }
    }
  }
  return pixels;
}

async function writePpm(path, channel) {
  const header = Buffer.from(`P6\n${textureSize} ${textureSize}\n255\n`, "ascii");
  await writeFile(path, Buffer.concat([header, createTexturePixels(channel)]));
}

const versionOutput = run(toktx, ["--version"]);
if (!versionOutput.includes(`v${expectedToktxVersion}`)) {
  throw new Error(`Expected toktx ${expectedToktxVersion}; received ${versionOutput.trim()}`);
}

await mkdir(outputDirectory, { recursive: true });
const temporaryDirectory = await mkdtemp(resolve(tmpdir(), "world-assets-v2-textures-"));
const outputs = [];
try {
  for (const channel of ["baseColor", "normal", "orm"]) {
    const input = resolve(temporaryDirectory, `${channel}.ppm`);
    const outputName =
      channel === "baseColor"
        ? "archive-spire-stone-base-color.ktx2"
        : `archive-spire-stone-${channel}.ktx2`;
    const output = resolve(outputDirectory, outputName);
    await writePpm(input, channel);
    const colorArguments =
      channel === "baseColor"
        ? ["--assign_oetf", "srgb", "--assign_primaries", "srgb"]
        : ["--assign_oetf", "linear", "--assign_primaries", "none"];
    const normalArguments =
      channel === "normal" ? ["--normal_mode", "--normalize", "--input_swizzle", "rgb1"] : [];
    run(toktx, [
      "--t2",
      "--encode",
      "uastc",
      "--uastc_quality",
      "2",
      "--zcmp",
      "10",
      "--genmipmap",
      "--filter",
      "mitchell",
      "--threads",
      "1",
      ...colorArguments,
      ...normalArguments,
      "--",
      output,
      input,
    ]);
    const buffer = await readFile(output);
    outputs.push({ name: outputName, bytes: buffer.byteLength, sha256: sha256(buffer) });
  }

  await mkdir(basisOutputDirectory, { recursive: true });
  const runtimeFiles = [];
  const runtimeDefinitions = [
    {
      outputName: "basis_transcoder.js",
      source: resolve(basisSourceDirectory, "basis_transcoder.js"),
      sourcePath: "node_modules/three/examples/jsm/libs/basis/basis_transcoder.js",
    },
    {
      outputName: "basis_transcoder.wasm",
      source: resolve(basisSourceDirectory, "basis_transcoder.wasm"),
      sourcePath: "node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm",
    },
    {
      outputName: "THREE-LICENSE.txt",
      source: resolve(repositoryRoot, "node_modules/three/LICENSE"),
      sourcePath: "node_modules/three/LICENSE",
    },
  ];
  for (const definition of runtimeDefinitions) {
    const source = definition.source;
    const output = resolve(basisOutputDirectory, definition.outputName);
    await copyFile(source, output);
    const buffer = await readFile(output);
    runtimeFiles.push({
      path: `public/assets/world-v2/basis/${definition.outputName}`,
      source: definition.sourcePath,
      sha256: sha256(buffer),
      bytes: buffer.byteLength,
    });
  }
  await writeFile(
    resolve(basisOutputDirectory, "runtime-dependencies.json"),
    `${JSON.stringify(
      {
        schema: "repository-worlds-v2/runtime-dependencies-v1",
        generatedAt: "2026-08-14T00:00:00.000Z",
        art: false,
        dependency: "three",
        version: "0.185.1",
        license: "MIT",
        purpose: "Local Basis Universal transcoder for project-authored KTX2 textures",
        source: "node_modules/three/examples/jsm/libs/basis",
        files: runtimeFiles,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

console.log(
  `Built original 512px Archive Spire KTX2 set with toktx ${expectedToktxVersion}: ${outputs.map((output) => `${output.name} ${output.bytes} bytes`).join(", ")}.`,
);
