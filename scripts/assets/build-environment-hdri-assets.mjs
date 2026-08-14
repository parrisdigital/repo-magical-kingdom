#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const manifestPath = resolve(
  repositoryRoot,
  "public/assets/world/environment/polyhaven/environment-manifest.json",
);

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    if (!flag.startsWith("--") || !argv[index + 1]) {
      throw new Error(`expected --name value arguments; received ${flag}`);
    }
    values.set(flag.slice(2), argv[index + 1]);
    index += 1;
  }
  return values;
}

function parseRadianceHeader(buffer) {
  const header = buffer.subarray(0, Math.min(buffer.length, 4096)).toString("ascii");
  const dimensions = header.match(/(?:^|\n)-Y (\d+) \+X (\d+)(?:\n|$)/u);
  return {
    radiance: header.startsWith("#?RADIANCE\n"),
    rleRgbe: /(?:^|\n)FORMAT=32-bit_rle_rgbe(?:\n|$)/u.test(header),
    width: dimensions ? Number(dimensions[2]) : 0,
    height: dimensions ? Number(dimensions[1]) : 0,
  };
}

const argumentsMap = parseArguments(process.argv.slice(2));
const sourcePathArgument = argumentsMap.get("source");
if (!sourcePathArgument) {
  throw new Error("missing --source path to the reviewed official Poly Haven 1K HDR");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const sourcePath = resolve(sourcePathArgument);
const source = await readFile(sourcePath);
const md5 = createHash("md5").update(source).digest("hex");
const sha256 = createHash("sha256").update(source).digest("hex");
const header = parseRadianceHeader(source);

if (
  basename(sourcePath) !== manifest.source.fileName ||
  source.length !== manifest.source.bytes ||
  md5 !== manifest.source.upstreamMd5 ||
  sha256 !== manifest.source.sha256
) {
  throw new Error("source does not match the reviewed Poly Haven 1K HDR");
}
if (
  !header.radiance ||
  !header.rleRgbe ||
  header.width !== manifest.runtime.width ||
  header.height !== manifest.runtime.height
) {
  throw new Error("source is not the reviewed 1024 x 512 RLE Radiance HDR");
}

const outputDirectory = resolve(
  argumentsMap.get("output") ||
    resolve(repositoryRoot, "public/assets/world/environment/polyhaven"),
);
await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, basename(manifest.runtime.url)), source);
console.log(`Built 1 verified environment HDRI (${(source.length / 1024 / 1024).toFixed(2)} MiB).`);
