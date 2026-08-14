#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const assetDirectory = resolve(
  process.argv[2] || resolve(repositoryRoot, "public/assets/world/environment/polyhaven"),
);
const manifestPath = resolve(assetDirectory, "environment-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const findings = [];
const maximumPayloadBytes = Math.floor(1.25 * 1024 * 1024);

function expect(condition, message) {
  if (!condition) findings.push(message);
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

expect(manifest.schemaVersion === 1, "manifest schemaVersion must be 1");
expect(manifest.license?.spdx === "CC0-1.0", "environment license must be CC0-1.0");
expect(
  manifest.license?.sourceDeclaration === "https://polyhaven.com/license",
  "manifest must link Poly Haven's official license declaration",
);
expect(
  manifest.source?.canonicalUrl === "https://polyhaven.com/a/kloofendal_overcast_puresky",
  "manifest must link the exact official HDRI page",
);
expect(
  manifest.source?.url ===
    "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_overcast_puresky_1k.hdr",
  "manifest must use the official Poly Haven 1K HDR download",
);
expect(manifest.source?.author === "Greg Zaal", "manifest must preserve the named author");
expect(manifest.source?.bytes === 1174053, "source byte count must match Poly Haven's API");
expect(
  manifest.source?.upstreamMd5 === "d5c53f6432193893e7dc17eb65e67409",
  "source MD5 must match Poly Haven's API",
);
expect(manifest.runtime?.usage === "reflection-and-ibl-only", "HDRI use must be IBL-only");
expect(manifest.runtime?.backgroundAllowed === false, "HDRI must not be used as a background");
expect(manifest.runtime?.loader === "HDRLoader", "Three HDRLoader is the runtime contract");
expect(
  manifest.runtime?.loaderDataType === "HalfFloatType" &&
    manifest.runtime?.colorSpace === "LinearSRGBColorSpace",
  "HDRI must decode as linear half-float data",
);
expect(
  manifest.runtime?.decodedHalfFloatRgbaBytes === 1024 * 512 * 4 * 2,
  "decoded source budget must be 4 MiB RGBA16F",
);
expect(
  manifest.runtime?.pmrem?.retainedHalfFloatRgbaBytes === 768 * 1024 * 4 * 2,
  "retained PMREM budget must be 6 MiB RGBA16F",
);
expect(
  manifest.runtime?.pmrem?.estimatedPeakGpuBytes === 16 * 1024 * 1024,
  "estimated PMREM generation peak must remain 16 MiB",
);

const fileName = basename(manifest.runtime?.url || "");
const expectedFiles = ["environment-manifest.json", fileName].sort();

try {
  const buffer = await readFile(resolve(assetDirectory, fileName));
  const header = parseRadianceHeader(buffer);
  expect(buffer.length === manifest.source?.bytes, "HDRI byte count mismatch");
  expect(buffer.length <= maximumPayloadBytes, "HDRI payload exceeds the 1.25 MiB budget");
  expect(
    createHash("md5").update(buffer).digest("hex") === manifest.source?.upstreamMd5,
    "HDRI MD5 mismatch",
  );
  expect(
    createHash("sha256").update(buffer).digest("hex") === manifest.source?.sha256,
    "HDRI SHA-256 mismatch",
  );
  expect(header.radiance && header.rleRgbe, "environment file must be RLE Radiance HDR");
  expect(
    header.width === manifest.runtime?.width && header.height === manifest.runtime?.height,
    "environment HDRI dimensions mismatch",
  );
} catch (error) {
  findings.push(`environment HDRI: ${error.message}`);
}

const directoryFiles = (await readdir(assetDirectory))
  .filter((entry) => entry !== ".DS_Store")
  .sort();
expect(
  JSON.stringify(directoryFiles) === JSON.stringify(expectedFiles),
  "environment asset directory contains missing or unexpected files",
);

if (findings.length > 0) {
  console.error("Environment HDRI verification failed:\n");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(
  `Environment HDRI valid: ${(manifest.source.bytes / 1024 / 1024).toFixed(2)} MiB shipped, 4 MiB decoded RGBA16F, 6 MiB retained PMREM, 16 MiB estimated peak GPU during PMREM generation.`,
);
