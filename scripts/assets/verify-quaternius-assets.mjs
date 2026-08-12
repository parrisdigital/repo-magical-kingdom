#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(process.argv[2] || "public/assets/world/quaternius");
const expectedCounts = { animals: 3, medieval: 22, nature: 18 };
const requiredExtensions = new Set(["EXT_meshopt_compression", "KHR_mesh_quantization"]);
const animalClips = new Set(["Eating", "Gallop", "Idle", "Walk"]);
const maximumBundleBytes = 12 * 1024 * 1024;

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

let totalBytes = 0;
let totalDrawCalls = 0;
let totalTriangles = 0;
const findings = [];

for (const [collection, expectedCount] of Object.entries(expectedCounts)) {
  const directory = resolve(root, collection);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".glb")).sort();
  if (files.length !== expectedCount) {
    findings.push(`${collection}: expected ${expectedCount} GLBs, found ${files.length}`);
  }

  for (const file of files) {
    const path = resolve(directory, file);
    const buffer = await readFile(path);
    const gltf = readGlbJson(buffer, `${collection}/${file}`);
    totalBytes += (await stat(path)).size;

    for (const extension of requiredExtensions) {
      if (!gltf.extensionsRequired?.includes(extension)) {
        findings.push(`${collection}/${file}: missing required ${extension}`);
      }
    }

    const primitives = (gltf.meshes || []).flatMap((mesh) => mesh.primitives || []);
    for (const primitive of primitives) {
      if ((primitive.mode ?? 4) !== 4) {
        findings.push(`${collection}/${file}: non-triangle primitive mode ${primitive.mode}`);
      }
    }
    totalDrawCalls += primitives.length;
    totalTriangles += primitives.reduce((sum, primitive) => {
      const indexCount =
        primitive.indices === undefined ? null : gltf.accessors[primitive.indices].count;
      const vertexCount = gltf.accessors[primitive.attributes.POSITION].count;
      return sum + Math.floor((indexCount ?? vertexCount) / 3);
    }, 0);

    if (collection === "animals") {
      const clips = new Set((gltf.animations || []).map((animation) => animation.name));
      for (const clip of animalClips) {
        if (!clips.has(clip)) findings.push(`${collection}/${file}: missing ${clip} animation`);
      }
      if (clips.size < 12) findings.push(`${collection}/${file}: expected at least 12 animations`);
    } else if ((gltf.animations || []).length > 0) {
      findings.push(`${collection}/${file}: unexpected animation data`);
    }
  }
}

if (totalBytes > maximumBundleBytes) {
  findings.push(
    `bundle is ${(totalBytes / 1024 / 1024).toFixed(2)} MiB; budget is ${maximumBundleBytes / 1024 / 1024} MiB`,
  );
}

if (findings.length > 0) {
  console.error("Quaternius asset verification failed:\n");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(
  `Quaternius assets valid: ${Object.values(expectedCounts).reduce((sum, count) => sum + count, 0)} GLBs, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB, ${totalTriangles.toLocaleString()} triangles, ${totalDrawCalls} source primitives.`,
);
