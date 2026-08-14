#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const manifestPath = resolve(
  repositoryRoot,
  "public/assets/world/terrain/polyhaven/terrain-atlas.json",
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

const argumentsMap = parseArguments(process.argv.slice(2));
const sourceDirectory = argumentsMap.get("source");
if (!sourceDirectory) {
  throw new Error(
    "missing --source directory containing the twelve reviewed Poly Haven 1K JPEG maps",
  );
}

const outputDirectory = resolve(
  argumentsMap.get("output") || resolve(repositoryRoot, "public/assets/world/terrain/polyhaven"),
);
await mkdir(outputDirectory, { recursive: true });
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const rootRequire = createRequire(import.meta.url);
const nextRequire = createRequire(rootRequire.resolve("next/package.json"));
let sharp;
try {
  sharp = nextRequire("sharp");
} catch {
  throw new Error("Next.js optional dependency sharp is required to rebuild the terrain atlases");
}

const channelDefinitions = {
  albedo: {
    encode: { effort: 6, quality: 84, smartSubsample: true },
  },
  normal: {
    encode: { effort: 6, quality: 88, smartSubsample: true },
  },
  roughness: {
    encode: { effort: 6, quality: 86, smartSubsample: true },
  },
};

const sourceBufferCache = new Map();

function verifyTierContract(tierName, tier) {
  const expectedProtectedMipLevel = Math.floor(Math.log2(tier.gutter * 2));
  if (
    tier.cellSize * manifest.atlas.slotOrder.length !== tier.width ||
    tier.cellSize !== tier.height ||
    tier.usableTileSize + tier.gutter * 2 !== tier.cellSize
  ) {
    throw new Error(`${tierName} atlas dimensions and gutters do not form square cells`);
  }
  if (tier.bilinearSafeThroughMipLevel !== expectedProtectedMipLevel) {
    throw new Error(
      `${tierName} bilinear-safe mip must be ${expectedProtectedMipLevel} for a ${tier.gutter}px gutter`,
    );
  }
  if (tier.bilinearSafeThroughMipLevel < 6) {
    throw new Error(`${tierName} atlas must protect bilinear sampling through at least mip 6`);
  }
}

async function verifiedSource(source) {
  if (sourceBufferCache.has(source.fileName)) return sourceBufferCache.get(source.fileName);
  const path = resolve(sourceDirectory, source.fileName);
  const buffer = await readFile(path);
  const md5 = createHash("md5").update(buffer).digest("hex");
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  if (md5 !== source.upstreamMd5 || sha256 !== source.sha256) {
    throw new Error(`${basename(path)} does not match the reviewed Poly Haven source`);
  }
  const metadata = await sharp(buffer).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.format !== "jpeg") {
    throw new Error(`${basename(path)} must be the reviewed square 1K JPEG`);
  }
  sourceBufferCache.set(source.fileName, buffer);
  return buffer;
}

for (const [tierName, tier] of Object.entries(manifest.atlas.tiers)) {
  verifyTierContract(tierName, tier);
  for (const [channel, definition] of Object.entries(channelDefinitions)) {
    const tiles = await Promise.all(
      manifest.materials.map(async (material) => {
        const source = await verifiedSource(material.sources[channel]);
        let pipeline = sharp(source);
        if (channel === "roughness") pipeline = pipeline.grayscale();
        return pipeline
          .resize(tier.usableTileSize, tier.usableTileSize, {
            fit: "fill",
            kernel: sharp.kernel.lanczos3,
          })
          .extend({
            top: tier.gutter,
            bottom: tier.gutter,
            left: tier.gutter,
            right: tier.gutter,
            extendWith: "copy",
          })
          .removeAlpha()
          .toBuffer();
      }),
    );

    await sharp({
      create: {
        width: tier.width,
        height: tier.height,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .composite(
        tiles.map((input, slot) => ({
          input,
          left: slot * tier.cellSize,
          top: 0,
        })),
      )
      .webp(definition.encode)
      .toFile(resolve(outputDirectory, basename(manifest.outputs[tierName][channel].url)));
  }
}

console.log(
  `Built ${Object.keys(channelDefinitions).length * Object.keys(manifest.atlas.tiers).length} guarded terrain atlases.`,
);
