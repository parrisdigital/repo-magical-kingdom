#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const assetDirectory = resolve(
  process.argv[2] || resolve(repositoryRoot, "public/assets/world/terrain/polyhaven"),
);
const manifestPath = resolve(assetDirectory, "terrain-atlas.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const findings = [];
const maximumBundleBytes = 4 * 1024 * 1024;

const rootRequire = createRequire(import.meta.url);
const nextRequire = createRequire(rootRequire.resolve("next/package.json"));
let sharp;
try {
  sharp = nextRequire("sharp");
} catch {
  throw new Error("Next.js optional dependency sharp is required to verify the terrain atlases");
}

function expect(condition, message) {
  if (!condition) findings.push(message);
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function isMd5(value) {
  return typeof value === "string" && /^[0-9a-f]{32}$/u.test(value);
}

expect(manifest.schemaVersion === 1, "manifest schemaVersion must be 1");
expect(manifest.license?.spdx === "CC0-1.0", "manifest license must be CC0-1.0");
expect(
  manifest.license?.sourceDeclaration === "https://polyhaven.com/license",
  "manifest must link Poly Haven's official license declaration",
);
expect(
  manifest.license?.legalCode === "https://creativecommons.org/publicdomain/zero/1.0/legalcode",
  "manifest must link the canonical CC0 1.0 legal code",
);

const expectedRoles = ["grass", "soil", "rock", "shore"];
expect(
  JSON.stringify(manifest.atlas?.slotOrder) === JSON.stringify(expectedRoles),
  `atlas slot order must be ${expectedRoles.join(", ")}`,
);
expect(manifest.atlas?.textureWrap === "ClampToEdgeWrapping", "outer atlas must clamp");
expect(manifest.atlas?.tileWrap === "manual-fract", "tile repetition must be manual");

const expectedTiers = {
  desktop: {
    width: 4096,
    height: 1024,
    cellSize: 1024,
    gutter: 64,
    usableTileSize: 896,
    bilinearSafeThroughMipLevel: 7,
  },
  low: {
    width: 2048,
    height: 512,
    cellSize: 512,
    gutter: 32,
    usableTileSize: 448,
    bilinearSafeThroughMipLevel: 6,
  },
};

for (const [tierName, expected] of Object.entries(expectedTiers)) {
  const tier = manifest.atlas?.tiers?.[tierName];
  for (const [property, value] of Object.entries(expected)) {
    expect(tier?.[property] === value, `${tierName} atlas ${property} must be ${value}`);
  }
  expect(
    tier?.cellSize * expectedRoles.length === tier?.width,
    `${tierName} cells must fill width`,
  );
  expect(tier?.cellSize === tier?.height, `${tierName} cells must be square`);
  expect(
    tier?.usableTileSize + tier?.gutter * 2 === tier?.cellSize,
    `${tierName} gutters must fill each cell exactly`,
  );
  expect(
    tier?.gutter / 2 ** tier?.bilinearSafeThroughMipLevel >= 0.5,
    `${tierName} gutter must remain at least half a texel at its protected mip`,
  );
  expect(
    tier?.gutter / 2 ** (tier?.bilinearSafeThroughMipLevel + 1) < 0.5,
    `${tierName} protected mip must be the exact bilinear-safe limit`,
  );
  expect(
    tier?.bilinearSafeThroughMipLevel >= 6,
    `${tierName} gutter must protect bilinear sampling through at least mip 6`,
  );
}

expect(manifest.materials?.length === expectedRoles.length, "manifest must contain four materials");
for (const [slot, material] of (manifest.materials || []).entries()) {
  expect(material.slot === slot, `material ${slot} has an incorrect slot`);
  expect(material.role === expectedRoles[slot], `material ${slot} has an incorrect role`);
  expect(
    material.canonicalUrl === `https://polyhaven.com/a/${material.polyHavenId}`,
    `${material.role}: canonical URL must be its official Poly Haven asset page`,
  );
  expect(material.authors?.length > 0, `${material.role}: authors are required`);
  for (const channel of ["albedo", "normal", "roughness"]) {
    const source = material.sources?.[channel];
    expect(
      source?.url?.startsWith(
        `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${material.polyHavenId}/`,
      ),
      `${material.role}/${channel}: source must be an official Poly Haven 1K JPEG`,
    );
    expect(
      basename(source?.fileName || "") === source?.fileName,
      `${material.role}/${channel}: unsafe filename`,
    );
    expect(
      Number.isInteger(source?.bytes) && source.bytes > 0,
      `${material.role}/${channel}: invalid byte count`,
    );
    expect(isMd5(source?.upstreamMd5), `${material.role}/${channel}: invalid upstream MD5`);
    expect(isSha256(source?.sha256), `${material.role}/${channel}: invalid source SHA-256`);
  }
}

const expectedChannels = ["albedo", "normal", "roughness"];
const expectedFiles = new Set(["terrain-atlas.json"]);
let totalBytes = 0;

for (const [tierName, tier] of Object.entries(expectedTiers)) {
  for (const channel of expectedChannels) {
    const output = manifest.outputs?.[tierName]?.[channel];
    const fileName = basename(output?.url || "");
    expectedFiles.add(fileName);
    expect(
      output?.url === `/assets/world/terrain/polyhaven/${fileName}`,
      `${tierName}/${channel}: invalid URL`,
    );
    expect(isSha256(output?.sha256), `${tierName}/${channel}: invalid output SHA-256`);
    if (channel === "albedo") {
      expect(output?.colorSpace === "SRGBColorSpace", `${tierName}/albedo must use sRGB`);
    } else {
      expect(output?.colorSpace === "NoColorSpace", `${tierName}/${channel} must be linear data`);
    }

    try {
      const path = resolve(assetDirectory, fileName);
      const buffer = await readFile(path);
      const actualHash = createHash("sha256").update(buffer).digest("hex");
      expect(actualHash === output?.sha256, `${tierName}/${channel}: output hash mismatch`);
      totalBytes += (await stat(path)).size;

      const metadata = await sharp(buffer).metadata();
      expect(metadata.format === "webp", `${tierName}/${channel}: expected WebP`);
      expect(metadata.width === tier.width, `${tierName}/${channel}: incorrect width`);
      expect(metadata.height === tier.height, `${tierName}/${channel}: incorrect height`);
      expect(metadata.channels === 3, `${tierName}/${channel}: expected opaque RGB`);
      expect(metadata.hasAlpha === false, `${tierName}/${channel}: alpha is not allowed`);

      if (channel === "roughness") {
        const decoded = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
        let maximumChannelDelta = 0;
        for (let index = 0; index < decoded.data.length; index += decoded.info.channels) {
          maximumChannelDelta = Math.max(
            maximumChannelDelta,
            Math.abs(decoded.data[index] - decoded.data[index + 1]),
            Math.abs(decoded.data[index] - decoded.data[index + 2]),
          );
        }
        expect(
          maximumChannelDelta <= 1,
          `${tierName}/roughness: RGB channels diverge by ${maximumChannelDelta}`,
        );
      }
    } catch (error) {
      findings.push(`${tierName}/${channel}: ${error.message}`);
    }
  }
}

const directoryFiles = new Set(
  (await readdir(assetDirectory)).filter((entry) => entry !== ".DS_Store"),
);
expect(
  JSON.stringify([...directoryFiles].sort()) === JSON.stringify([...expectedFiles].sort()),
  "terrain asset directory contains missing or unexpected files",
);
expect(
  totalBytes <= maximumBundleBytes,
  `terrain atlas bundle is ${(totalBytes / 1024 / 1024).toFixed(2)} MiB; budget is 4 MiB`,
);

if (findings.length > 0) {
  console.error("Terrain PBR asset verification failed:\n");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

function decodedRgbaMiB(width, height, includeMipmaps) {
  let currentWidth = width;
  let currentHeight = height;
  let texels = 0;
  do {
    texels += currentWidth * currentHeight;
    if (!includeMipmaps) break;
    currentWidth = Math.max(1, Math.floor(currentWidth / 2));
    currentHeight = Math.max(1, Math.floor(currentHeight / 2));
  } while (currentWidth > 1 || currentHeight > 1);
  if (includeMipmaps) texels += 1;
  return (texels * 4 * expectedChannels.length) / 1024 / 1024;
}

const desktopDecodedMiB = decodedRgbaMiB(4096, 1024, false);
const desktopDecodedWithMipsMiB = decodedRgbaMiB(4096, 1024, true);
const lowDecodedMiB = decodedRgbaMiB(2048, 512, false);
const lowDecodedWithMipsMiB = decodedRgbaMiB(2048, 512, true);
console.log(
  `Terrain PBR atlases valid: ${expectedFiles.size - 1} WebPs, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB shipped; desktop ${desktopDecodedMiB.toFixed(0)} MiB base/${desktopDecodedWithMipsMiB.toFixed(0)} MiB with mips, low ${lowDecodedMiB.toFixed(0)} MiB base/${lowDecodedWithMipsMiB.toFixed(0)} MiB with mips.`,
);
