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
  process.argv[2] || resolve(repositoryRoot, "public/assets/world/architecture/polyhaven"),
);
const manifestPath = resolve(assetDirectory, "architecture-detail-atlas.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const findings = [];
const maximumBundleBytes = 5 * 1024 * 1024;

const rootRequire = createRequire(import.meta.url);
const nextRequire = createRequire(rootRequire.resolve("next/package.json"));
let sharp;
try {
  sharp = nextRequire("sharp");
} catch {
  throw new Error(
    "Next.js optional dependency sharp is required to verify the architecture atlases",
  );
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

async function readGlbJson(path) {
  const buffer = await readFile(path);
  if (
    buffer.length < 20 ||
    buffer.readUInt32LE(0) !== 0x46546c67 ||
    buffer.readUInt32LE(4) !== 2 ||
    buffer.readUInt32LE(16) !== 0x4e4f534a
  ) {
    throw new Error(`${basename(path)} is not a GLB 2.0 file with a leading JSON chunk`);
  }
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength).replace(/[\u0000\s]+$/u, ""));
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

const expectedRoles = ["plaster", "brick", "wood", "roof-tile"];
expect(
  JSON.stringify(manifest.atlas?.slotOrder) === JSON.stringify(expectedRoles),
  `atlas slot order must be ${expectedRoles.join(", ")}`,
);
expect(manifest.atlas?.textureWrap === "ClampToEdgeWrapping", "outer atlas must clamp");
expect(
  manifest.atlas?.tileWrap === "manual-fract-with-explicit-gradients",
  "tile repetition must use manual fract coordinates and explicit gradients",
);

const expectedTiers = {
  high: {
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
}

const expectedMaterialNames = {
  MI_Plaster: "plaster",
  MI_UnevenBrick: "brick",
  MI_WoodTrim: "wood",
  MI_RoundTiles: "roof-tile",
};
expect(
  JSON.stringify(manifest.authoredMaterialIntegration?.exactMaterialNames) ===
    JSON.stringify(expectedMaterialNames),
  "authored material mapping must remain exact and auditable",
);
expect(
  manifest.authoredMaterialIntegration?.requiredUvSet === "TEXCOORD_0",
  "integration must require TEXCOORD_0",
);
expect(
  manifest.authoredMaterialIntegration?.baseColorPolicy?.startsWith(
    "Preserve the authored base color",
  ),
  "integration must preserve authored base color data",
);
expect(
  manifest.authoredMaterialIntegration?.visualTuningRequired === true,
  "integration must retain a visual tuning gate",
);
const expectedDefaultTuning = {
  plaster: { repeat: [3, 3], normalStrength: 0.2, roughnessStrength: 0.08 },
  brick: { repeat: [1, 1], normalStrength: 0.1, roughnessStrength: 0.05 },
  wood: { repeat: [3, 3], normalStrength: 0.16, roughnessStrength: 0.08 },
  "roof-tile": { repeat: [1, 1], normalStrength: 0.09, roughnessStrength: 0.05 },
};
expect(
  JSON.stringify(manifest.authoredMaterialIntegration?.conservativeDefaultTuning) ===
    JSON.stringify(expectedDefaultTuning),
  "conservative per-family tuning defaults must remain audited and deterministic",
);
expect(
  manifest.authoredMaterialIntegration?.windowEmissive?.exactMaterialName === "MI_WindowGlass",
  "window emission must target only the dedicated MI_WindowGlass material",
);
expect(
  manifest.authoredMaterialIntegration?.windowEmissive?.sourceAsset ===
    "/assets/world/quaternius/medieval/Window_Wide_Round1.glb",
  "window emission must record the audited source asset",
);
for (const budget of ["addedDrawCalls", "addedSamplers", "addedFragmentTextureReads"]) {
  expect(
    manifest.authoredMaterialIntegration?.windowEmissive?.[budget] === 0,
    `window emission ${budget} must stay zero`,
  );
}
expect(
  manifest.authoredMaterialIntegration?.windowEmissive?.wholeWallTreatmentAllowed === false,
  "window emission must never target whole wall modules",
);

const modularAssetDirectory = resolve(repositoryRoot, "public/assets/world/quaternius/medieval");
const auditedSurfaceAssets = [
  {
    fileName: "Wall_Plaster_Straight.glb",
    materialNames: ["MI_Plaster", "MI_WoodTrim"],
  },
  {
    fileName: "Wall_Plaster_Door_Round.glb",
    materialNames: ["MI_Plaster", "MI_WoodTrim"],
  },
  {
    fileName: "Wall_Plaster_Window_Wide_Round.glb",
    materialNames: ["MI_Plaster", "MI_WoodTrim"],
  },
  {
    fileName: "Wall_UnevenBrick_Straight.glb",
    materialNames: ["MI_UnevenBrick", "MI_WoodTrim"],
  },
  {
    fileName: "Wall_UnevenBrick_Door_Round.glb",
    materialNames: ["MI_UnevenBrick", "MI_WoodTrim"],
  },
  {
    fileName: "Wall_UnevenBrick_Window_Wide_Round.glb",
    materialNames: ["MI_UnevenBrick", "MI_WoodTrim"],
  },
  {
    fileName: "Roof_RoundTiles_4x4.glb",
    materialNames: ["MI_RoundTiles", "MI_WoodTrim"],
  },
  {
    fileName: "Roof_RoundTiles_6x8.glb",
    materialNames: ["MI_RoundTiles", "MI_WoodTrim"],
  },
  {
    fileName: "Roof_RoundTiles_8x8.glb",
    materialNames: ["MI_RoundTiles", "MI_WoodTrim"],
  },
];

for (const asset of auditedSurfaceAssets) {
  try {
    const gltf = await readGlbJson(resolve(modularAssetDirectory, asset.fileName));
    const materials = gltf.materials || [];
    const primitives = (gltf.meshes || []).flatMap((mesh) => mesh.primitives || []);
    expect(
      !materials.some((material) => material.name === "MI_WindowGlass"),
      `${asset.fileName}: whole wall/roof assets must not be classified as window glass`,
    );
    for (const materialName of asset.materialNames) {
      const materialIndex = materials.findIndex((material) => material.name === materialName);
      expect(materialIndex >= 0, `${asset.fileName}: missing ${materialName}`);
      if (materialIndex < 0) continue;
      const material = materials[materialIndex];
      const textureInfos = [
        material.pbrMetallicRoughness?.baseColorTexture,
        material.normalTexture,
        material.pbrMetallicRoughness?.metallicRoughnessTexture,
      ];
      expect(
        textureInfos.every((textureInfo) => Number.isInteger(textureInfo?.index)),
        `${asset.fileName}/${materialName}: authored base, normal, and roughness maps are required`,
      );
      expect(
        textureInfos.every((textureInfo) => (textureInfo?.texCoord ?? 0) === 0),
        `${asset.fileName}/${materialName}: authored maps must all use TEXCOORD_0`,
      );
      const transforms = textureInfos.map((textureInfo) =>
        JSON.stringify(textureInfo?.extensions?.KHR_texture_transform || null),
      );
      expect(
        new Set(transforms).size === 1,
        `${asset.fileName}/${materialName}: authored map UV transforms must agree`,
      );
      const materialPrimitives = primitives.filter(
        (primitive) => primitive.material === materialIndex,
      );
      expect(
        materialPrimitives.length > 0,
        `${asset.fileName}/${materialName}: material must be used by a primitive`,
      );
      expect(
        materialPrimitives.every((primitive) => Number.isInteger(primitive.attributes?.TEXCOORD_0)),
        `${asset.fileName}/${materialName}: every target primitive must expose TEXCOORD_0`,
      );
    }
  } catch (error) {
    findings.push(`${asset.fileName}: ${error.message}`);
  }
}

try {
  const windowGltf = await readGlbJson(resolve(modularAssetDirectory, "Window_Wide_Round1.glb"));
  const windowMaterials = windowGltf.materials || [];
  const glassIndex = windowMaterials.findIndex((material) => material.name === "MI_WindowGlass");
  expect(glassIndex >= 0, "Window_Wide_Round1.glb: missing MI_WindowGlass");
  if (glassIndex >= 0) {
    const glass = windowMaterials[glassIndex];
    expect(glass.alphaMode === "BLEND", "MI_WindowGlass must remain transparent BLEND");
    expect(glass.doubleSided === true, "MI_WindowGlass must remain double-sided");
    const glassPrimitives = (windowGltf.meshes || [])
      .flatMap((mesh) => mesh.primitives || [])
      .filter((primitive) => primitive.material === glassIndex);
    expect(glassPrimitives.length > 0, "MI_WindowGlass must be used by a dedicated primitive");
  }
} catch (error) {
  findings.push(`Window_Wide_Round1.glb: ${error.message}`);
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
  for (const author of material.authors || []) {
    expect(
      typeof author.name === "string" && author.name.length > 0,
      `${material.role}: author name`,
    );
    expect(
      typeof author.role === "string" && author.role.length > 0,
      `${material.role}: author role`,
    );
  }
  expect(
    material.dimensionsMeters?.length === 2 &&
      material.dimensionsMeters.every((value) => Number.isFinite(value) && value > 0),
    `${material.role}: physical dimensions are required`,
  );
  const roughnessStats = material.roughnessSourceStats;
  expect(
    [
      roughnessStats?.mean,
      roughnessStats?.standardDeviation,
      roughnessStats?.minimum,
      roughnessStats?.maximum,
    ].every((value) => Number.isFinite(value) && value >= 0 && value <= 1),
    `${material.role}: roughness source statistics must be normalized`,
  );
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
const expectedFiles = new Set(["architecture-detail-atlas.json"]);
let totalBytes = 0;

for (const [tierName, tier] of Object.entries(expectedTiers)) {
  for (const channel of expectedChannels) {
    const output = manifest.outputs?.[tierName]?.[channel];
    const fileName = basename(output?.url || "");
    expectedFiles.add(fileName);
    expect(
      output?.url === `/assets/world/architecture/polyhaven/${fileName}`,
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

      const metadata = await sharp(buffer, { failOn: "error" }).metadata();
      expect(metadata.format === "webp", `${tierName}/${channel}: expected WebP`);
      expect(metadata.width === tier.width, `${tierName}/${channel}: incorrect width`);
      expect(metadata.height === tier.height, `${tierName}/${channel}: incorrect height`);
      expect(metadata.channels === 3, `${tierName}/${channel}: expected opaque RGB`);
      expect(metadata.hasAlpha === false, `${tierName}/${channel}: alpha is not allowed`);

      if (channel === "roughness") {
        const decoded = await sharp(buffer, { failOn: "error" })
          .raw()
          .toBuffer({ resolveWithObject: true });
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

        for (const material of manifest.materials) {
          let channelTotal = 0;
          let texelCount = 0;
          for (let y = tier.gutter; y < tier.gutter + tier.usableTileSize; y += 1) {
            const firstX = material.slot * tier.cellSize + tier.gutter;
            const lastX = firstX + tier.usableTileSize;
            for (let x = firstX; x < lastX; x += 1) {
              channelTotal += decoded.data[(y * decoded.info.width + x) * decoded.info.channels];
              texelCount += 1;
            }
          }
          const actualMean = channelTotal / texelCount / 255;
          expect(
            Math.abs(actualMean - material.roughnessSourceStats.mean) <= 0.015,
            `${tierName}/${material.role}: roughness mean drifted from the audited source`,
          );
        }
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
  "architecture asset directory contains missing or unexpected files",
);
expect(
  totalBytes <= maximumBundleBytes,
  `architecture atlas bundle is ${(totalBytes / 1024 / 1024).toFixed(2)} MiB; budget is 5 MiB`,
);

if (findings.length > 0) {
  console.error("Architecture detail asset verification failed:\n");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

function decodedRgbaMiB(width, height, includeMipmaps, channelCount = expectedChannels.length) {
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
  return (texels * 4 * channelCount) / 1024 / 1024;
}

const highDecodedMiB = decodedRgbaMiB(4096, 1024, false);
const highDecodedWithMipsMiB = decodedRgbaMiB(4096, 1024, true);
const lowDecodedMiB = decodedRgbaMiB(2048, 512, false);
const lowDecodedWithMipsMiB = decodedRgbaMiB(2048, 512, true);
const highRuntimeWithMipsMiB = decodedRgbaMiB(4096, 1024, true, 2);
const lowRuntimeWithMipsMiB = decodedRgbaMiB(2048, 512, true, 2);
console.log(
  `Architecture detail atlases valid: ${expectedFiles.size - 1} WebPs, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB shipped; all channels high ${highDecodedMiB.toFixed(0)} MiB base/${highDecodedWithMipsMiB.toFixed(0)} MiB with mips, low ${lowDecodedMiB.toFixed(0)} MiB base/${lowDecodedWithMipsMiB.toFixed(0)} MiB with mips; sampled normal+roughness high ${highRuntimeWithMipsMiB.toFixed(2)} MiB, staged low ${lowRuntimeWithMipsMiB.toFixed(2)} MiB.`,
);
