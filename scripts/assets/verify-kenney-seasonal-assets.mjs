#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import { GLTF_TRANSFORM_VERSION, KENNEY_SEASONAL_PACKS } from "./kenney-seasonal-manifest.mjs";

const root = resolve(process.argv[2] || "public/assets/world/kenney");
const maximumBundleBytes = 256 * 1024;
const maximumTriangles = 5_000;
const findings = [];

function readGlbJson(buffer, file) {
  if (buffer.toString("ascii", 0, 4) !== "glTF" || buffer.readUInt32LE(4) !== 2) {
    throw new Error(`${file}: not a glTF 2.0 binary`);
  }
  let offset = 12;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === "JSON") {
      return JSON.parse(
        buffer.toString("utf8", offset + 8, offset + 8 + length).replace(/[\0 ]+$/u, ""),
      );
    }
    offset += 8 + length;
  }
  throw new Error(`${file}: missing JSON chunk`);
}

function decodeNormalized(value, componentType, normalized) {
  if (!normalized) return value;
  if (componentType === 5120) return Math.max(value / 127, -1);
  if (componentType === 5121) return value / 255;
  if (componentType === 5122) return Math.max(value / 32_767, -1);
  if (componentType === 5123) return value / 65_535;
  throw new Error(`unsupported normalized component type ${componentType}`);
}

function sceneBounds(gltf, file) {
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  if (gltf.scenes?.length !== 1 || scene?.nodes?.length !== 1 || gltf.nodes?.length !== 1) {
    findings.push(`${file}: expected one flattened scene root`);
    return null;
  }
  const node = gltf.nodes[scene.nodes[0]];
  if (node.matrix || node.rotation || node.children?.length || node.mesh === undefined) {
    findings.push(`${file}: unexpected scene transform hierarchy`);
    return null;
  }
  const scale = node.scale ?? [1, 1, 1];
  const translation = node.translation ?? [0, 0, 0];
  if (scale.some((value) => !Number.isFinite(value) || value <= 0)) {
    findings.push(`${file}: root scale must be finite and positive`);
    return null;
  }

  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const primitive of gltf.meshes?.[node.mesh]?.primitives ?? []) {
    const accessor = gltf.accessors?.[primitive.attributes?.POSITION];
    if (!accessor?.min || !accessor?.max) {
      findings.push(`${file}: POSITION accessor is missing bounds`);
      continue;
    }
    for (let axis = 0; axis < 3; axis += 1) {
      const localMinimum = decodeNormalized(
        accessor.min[axis],
        accessor.componentType,
        accessor.normalized,
      );
      const localMaximum = decodeNormalized(
        accessor.max[axis],
        accessor.componentType,
        accessor.normalized,
      );
      minimum[axis] = Math.min(minimum[axis], localMinimum * scale[axis] + translation[axis]);
      maximum[axis] = Math.max(maximum[axis], localMaximum * scale[axis] + translation[axis]);
    }
  }
  return { minimum, maximum };
}

async function directoryEntries(directory) {
  return (await readdir(directory)).filter((entry) => entry !== ".DS_Store").sort();
}

let totalBytes = 0;
let totalTriangles = 0;
let totalPrimitives = 0;

const rootEntries = await directoryEntries(root);
const expectedRootEntries = [...Object.keys(KENNEY_SEASONAL_PACKS), "licenses"].sort();
if (JSON.stringify(rootEntries) !== JSON.stringify(expectedRootEntries)) {
  findings.push(`bundle root entries differ: expected ${expectedRootEntries.join(", ")}`);
}

for (const [collection, pack] of Object.entries(KENNEY_SEASONAL_PACKS)) {
  const directory = resolve(root, collection);
  const files = await directoryEntries(directory);
  const expectedFiles = pack.assets.map((asset) => `${asset}.glb`).sort();
  if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) {
    findings.push(`${collection}: expected exactly ${expectedFiles.join(", ")}`);
  }

  for (const file of expectedFiles) {
    const path = resolve(directory, file);
    const buffer = await readFile(path);
    const gltf = readGlbJson(buffer, `${collection}/${file}`);
    totalBytes += (await stat(path)).size;

    const requiredExtensions = new Set(gltf.extensionsRequired ?? []);
    for (const extension of ["EXT_meshopt_compression", "KHR_mesh_quantization"]) {
      if (!requiredExtensions.has(extension)) {
        findings.push(`${collection}/${file}: missing required ${extension}`);
      }
    }
    if (collection === "holiday" && !requiredExtensions.has("EXT_texture_webp")) {
      findings.push(`${collection}/${file}: missing embedded WebP texture`);
    }
    if (gltf.asset?.generator !== `glTF-Transform v${GLTF_TRANSFORM_VERSION}`) {
      findings.push(`${collection}/${file}: unexpected generator ${gltf.asset?.generator}`);
    }
    if ((gltf.animations ?? []).length > 0) {
      findings.push(`${collection}/${file}: unexpected animation data`);
    }
    if ((gltf.buffers ?? []).some((bufferDefinition) => bufferDefinition.uri)) {
      findings.push(`${collection}/${file}: external buffer dependency`);
    }
    if ((gltf.images ?? []).some((image) => image.uri)) {
      findings.push(`${collection}/${file}: external image dependency`);
    }
    if (collection === "holiday") {
      if (
        gltf.images?.length !== 1 ||
        gltf.images[0]?.mimeType !== "image/webp" ||
        gltf.images[0]?.bufferView === undefined
      ) {
        findings.push(`${collection}/${file}: expected one embedded WebP palette`);
      }
    } else if ((gltf.images ?? []).length > 0) {
      findings.push(`${collection}/${file}: unexpected texture data`);
    }

    const primitives = (gltf.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
    totalPrimitives += primitives.length;
    for (const primitive of primitives) {
      if ((primitive.mode ?? 4) !== 4) {
        findings.push(`${collection}/${file}: non-triangle primitive mode ${primitive.mode}`);
      }
      const indexCount =
        primitive.indices === undefined
          ? gltf.accessors[primitive.attributes.POSITION].count
          : gltf.accessors[primitive.indices].count;
      totalTriangles += Math.floor(indexCount / 3);
    }

    const bounds = sceneBounds(gltf, `${collection}/${file}`);
    if (bounds) {
      const [minimumY, maximumY] = [bounds.minimum[1], bounds.maximum[1]];
      if (minimumY < -0.061 || minimumY > 0.011) {
        findings.push(
          `${collection}/${file}: ground contact is ${minimumY.toFixed(4)}, expected near y=0`,
        );
      }
      if (maximumY <= 0.05 || maximumY > 4) {
        findings.push(`${collection}/${file}: implausible height ${maximumY.toFixed(4)}`);
      }
    }
  }
}

const licenseEntries = await directoryEntries(resolve(root, "licenses"));
const expectedLicenseEntries = Object.values(KENNEY_SEASONAL_PACKS)
  .map((pack) => pack.licenseFileName)
  .sort();
if (JSON.stringify(licenseEntries) !== JSON.stringify(expectedLicenseEntries)) {
  findings.push(`licenses: expected exactly ${expectedLicenseEntries.join(", ")}`);
}
for (const pack of Object.values(KENNEY_SEASONAL_PACKS)) {
  const license = await readFile(resolve(root, "licenses", pack.licenseFileName));
  const actualHash = createHash("sha256").update(license).digest("hex");
  if (actualHash !== pack.licenseSha256) findings.push(`${pack.title}: license hash mismatch`);
}

if (totalBytes > maximumBundleBytes) {
  findings.push(`bundle is ${totalBytes} bytes; budget is ${maximumBundleBytes} bytes`);
}
if (totalTriangles > maximumTriangles) {
  findings.push(`bundle contains ${totalTriangles} triangles; budget is ${maximumTriangles}`);
}

if (findings.length > 0) {
  console.error("Kenney seasonal asset verification failed:\n");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(
  `Kenney seasonal assets valid: ${Object.values(KENNEY_SEASONAL_PACKS).reduce((sum, pack) => sum + pack.assets.length, 0)} GLBs, ${(totalBytes / 1024).toFixed(2)} KiB, ${totalTriangles.toLocaleString()} triangles, ${totalPrimitives} source primitives.`,
);
