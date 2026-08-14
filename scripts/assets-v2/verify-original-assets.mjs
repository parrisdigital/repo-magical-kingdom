#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const publicRoot = resolve(repositoryRoot, "public/assets/world-v2");
const catalogPath = resolve(publicRoot, "catalog-v1.json");
const manifestPath = resolve(publicRoot, "original-asset-manifest.json");
const runtimeManifestPath = resolve(publicRoot, "basis/runtime-dependencies.json");
const packageManifestPath = resolve(repositoryRoot, "package.json");
const blenderScriptPath = resolve(
  repositoryRoot,
  "art/world-v2/blender/archive_spire_authoring.py",
);
const EXPECTED_LOD_SILHOUETTE_CONTRACT = Object.freeze({
  referenceSlot: "lod0",
  maxEnvelopeDeltaRatio: 0.1,
  maxExtentDeltaRatio: 0.1,
  maxCenterDriftRatio: 0.1,
  materialExtentEpsilonMeters: 0.01,
  inspectionMode: "manual-and-crossfade",
});
const ASSET_BIOMES = new Set([
  "settlement",
  "settlement-edge",
  "roadside",
  "work-yard",
  "garden",
  "meadow",
  "forest",
  "wetland",
  "shore",
  "alpine",
]);
const PINNED_TOOL_VERSIONS = Object.freeze({
  blender: "5.1.2",
  toktx: "4.4.2",
  ktx: "4.4.2",
  gltfTransform: "4.4.2",
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizedPath(path) {
  return relative(repositoryRoot, path).split("\\").join("/");
}

function roundedVector(vector) {
  return vector.toArray().map((value) => Number(value.toFixed(6)));
}

function sameJson(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function measureLodSilhouette(referenceBounds, candidateBounds) {
  const envelopeDeltaRatio = [];
  const extentDeltaRatio = [];
  const centerDriftRatio = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const referenceExtent = referenceBounds.max[axis] - referenceBounds.min[axis];
    if (referenceExtent < EXPECTED_LOD_SILHOUETTE_CONTRACT.materialExtentEpsilonMeters) {
      envelopeDeltaRatio.push(0);
      extentDeltaRatio.push(0);
      centerDriftRatio.push(0);
      continue;
    }
    const candidateExtent = candidateBounds.max[axis] - candidateBounds.min[axis];
    const referenceCenter = (referenceBounds.min[axis] + referenceBounds.max[axis]) * 0.5;
    const candidateCenter = (candidateBounds.min[axis] + candidateBounds.max[axis]) * 0.5;
    envelopeDeltaRatio.push(
      Number(
        (
          Math.max(
            Math.abs(candidateBounds.min[axis] - referenceBounds.min[axis]),
            Math.abs(candidateBounds.max[axis] - referenceBounds.max[axis]),
          ) / referenceExtent
        ).toFixed(6),
      ),
    );
    extentDeltaRatio.push(
      Number((Math.abs(candidateExtent - referenceExtent) / referenceExtent).toFixed(6)),
    );
    centerDriftRatio.push(
      Number((Math.abs(candidateCenter - referenceCenter) / referenceExtent).toFixed(6)),
    );
  }
  return { envelopeDeltaRatio, extentDeltaRatio, centerDriftRatio };
}

function run(binary, argumentsList) {
  const result = spawnSync(binary, argumentsList, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, TOKTX_OPTIONS: "" },
  });
  if (result.error) throw result.error;
  invariant(
    result.status === 0,
    `${binary} ${argumentsList.join(" ")} failed (${result.status}): ${result.stderr || result.stdout}`,
  );
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

async function walkFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await walkFiles(path)));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}

async function parseGlb(buffer) {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Promise((accept, reject) => {
    new GLTFLoader().parse(arrayBuffer, "", accept, reject);
  });
}

function measureGltf(scene) {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const geometries = new Set();
  const materialNames = new Set();
  let meshes = 0;
  let vertices = 0;
  let triangles = 0;
  let geometryBytes = 0;
  scene.traverse((node) => {
    if (!node.isMesh) return;
    meshes += 1;
    const geometry = node.geometry;
    if (!geometries.has(geometry.uuid)) {
      geometries.add(geometry.uuid);
      const position = geometry.getAttribute("position");
      vertices += position.count;
      triangles += geometry.index ? geometry.index.count / 3 : position.count / 3;
      for (const attribute of Object.values(geometry.attributes)) {
        geometryBytes += attribute.array.byteLength;
      }
      if (geometry.index) geometryBytes += geometry.index.array.byteLength;
    }
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) materialNames.add(material.name);
  });
  return {
    metrics: {
      meshes,
      drawCalls: meshes,
      materials: materialNames.size,
      vertices,
      triangles,
      geometryBytes,
      estimatedGpuBytes: geometryBytes,
      bounds: { min: roundedVector(bounds.min), max: roundedVector(bounds.max) },
    },
    materialNames,
  };
}

function parseKtx2Header(buffer) {
  const identifier = Buffer.from([
    0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  invariant(buffer.subarray(0, 12).equals(identifier), "KTX2 identifier is invalid");
  const dfdOffset = buffer.readUInt32LE(48);
  return {
    width: buffer.readUInt32LE(20),
    height: buffer.readUInt32LE(24),
    faceCount: buffer.readUInt32LE(36),
    levelCount: buffer.readUInt32LE(40),
    supercompressionScheme: buffer.readUInt32LE(44),
    transferFunction: buffer[dfdOffset + 14],
  };
}

function verifyToolVersions() {
  const specifications = [
    {
      env: "WORLD_ASSETS_V2_BLENDER_BIN",
      argumentsList: ["--version"],
      expected: `Blender ${PINNED_TOOL_VERSIONS.blender}`,
    },
    {
      env: "WORLD_ASSETS_V2_TOKTX_BIN",
      argumentsList: ["--version"],
      expected: `v${PINNED_TOOL_VERSIONS.toktx}`,
    },
    {
      env: "WORLD_ASSETS_V2_KTX_BIN",
      argumentsList: ["--version"],
      expected: `v${PINNED_TOOL_VERSIONS.ktx}`,
    },
    {
      env: "WORLD_ASSETS_V2_GLTF_TRANSFORM_BIN",
      argumentsList: ["--version"],
      expected: PINNED_TOOL_VERSIONS.gltfTransform,
    },
  ];
  const checked = [];
  for (const specification of specifications) {
    const binary = process.env[specification.env];
    if (!binary) continue;
    const output = run(binary, specification.argumentsList);
    invariant(
      output.includes(specification.expected),
      `${specification.env} did not report ${specification.expected}`,
    );
    checked.push(specification.env);
  }
  return checked;
}

const requirePinnedTools = process.argv.includes("--require-tools");

const catalogBuffer = await readFile(catalogPath);
const manifestBuffer = await readFile(manifestPath);
const catalog = JSON.parse(catalogBuffer.toString("utf8"));
const manifest = JSON.parse(manifestBuffer.toString("utf8"));
const runtimeManifest = JSON.parse((await readFile(runtimeManifestPath)).toString("utf8"));
const packageManifest = JSON.parse((await readFile(packageManifestPath)).toString("utf8"));

invariant(catalog.schemaVersion === 1, "Catalog schema version must be 1");
invariant(catalog.provenance.origin === "project-original", "Catalog origin must be original");
invariant(catalog.provenance.thirdPartyArt === false, "Third-party art is forbidden");
invariant(catalog.provenance.networkInputs.length === 0, "Network inputs are forbidden");
invariant(catalog.families.length === 5, "Batch-1 must ship exactly five proof families");
invariant(
  sameJson(
    catalog.families.map((family) => family.kind),
    ["hero-building", "tree", "rock", "animal", "prop"],
  ),
  "Batch-1 family roles are incomplete or out of order",
);
invariant(catalog.textureDelivery.status === "ktx2-shipping", "KTX2 shipping proof is required");
invariant(
  catalog.textureDelivery.encoder.version === PINNED_TOOL_VERSIONS.toktx,
  "Catalog toktx version must match the immutable release pin",
);
invariant(catalog.conventions.forwardAxis === "+Z", "Catalog forward axis must remain +Z");
invariant(
  sameJson(catalog.conventions.lodSilhouette, EXPECTED_LOD_SILHOUETTE_CONTRACT),
  "Catalog LOD silhouette contract drifted",
);

invariant(manifest.deterministic === true, "Manifest must declare deterministic output");
invariant(manifest.originalArtOnly === true, "Manifest must cover original art only");
invariant(manifest.thirdPartyArt === false, "Manifest cannot contain third-party art");
invariant(manifest.networkInputs.length === 0, "Manifest cannot contain network inputs");

for (const source of manifest.sources) {
  const buffer = await readFile(resolve(repositoryRoot, source.path));
  invariant(buffer.byteLength === source.bytes, `${source.path} source byte count drifted`);
  invariant(sha256(buffer) === source.sha256, `${source.path} source hash drifted`);
}
invariant(
  sameJson(manifest.sources, catalog.provenance.sourceFiles),
  "Catalog and manifest source provenance must match exactly",
);

const expectedOutputPaths = new Set();
for (const output of manifest.outputs) {
  invariant(!expectedOutputPaths.has(output.path), `Duplicate manifest output ${output.path}`);
  expectedOutputPaths.add(output.path);
  const buffer = await readFile(resolve(repositoryRoot, output.path));
  invariant(buffer.byteLength === output.bytes, `${output.path} output byte count drifted`);
  invariant(sha256(buffer) === output.sha256, `${output.path} output hash drifted`);
}
invariant(
  manifest.outputs.find((output) => output.kind === "catalog")?.sha256 === sha256(catalogBuffer),
  "Manifest catalog hash does not match catalog-v1.json",
);

let totalGlbBytes = 0;
for (const family of catalog.families) {
  invariant(family.lods.length === 3, `${family.id} must provide three LODs`);
  invariant(
    family.footprint?.shape === "ellipse" || family.footprint?.shape === "rectangle",
    `${family.id} must declare an explicit placement footprint`,
  );
  invariant(
    family.footprint.center.length === 2 && family.footprint.center.every(Number.isFinite),
    `${family.id} footprint center must be a finite XZ point`,
  );
  invariant(
    family.footprint.halfExtents.length === 2 &&
      family.footprint.halfExtents.every((value) => Number.isFinite(value) && value > 0) &&
      Number.isFinite(family.footprint.clearanceMeters) &&
      family.footprint.clearanceMeters >= 0,
    `${family.id} footprint dimensions must be finite and positive`,
  );
  invariant(
    ASSET_BIOMES.has(family.biomeAffinity?.primary) &&
      family.biomeAffinity.compatible.includes(family.biomeAffinity.primary) &&
      family.biomeAffinity.compatible.every((biome) => ASSET_BIOMES.has(biome)) &&
      new Set(family.biomeAffinity.compatible).size === family.biomeAffinity.compatible.length,
    `${family.id} biome affinity is invalid`,
  );
  const footprintMinimumX = family.footprint.center[0] - family.footprint.halfExtents[0];
  const footprintMaximumX = family.footprint.center[0] + family.footprint.halfExtents[0];
  const footprintMinimumZ = family.footprint.center[1] - family.footprint.halfExtents[1];
  const footprintMaximumZ = family.footprint.center[1] + family.footprint.halfExtents[1];
  invariant(
    footprintMinimumX >= family.bounds.min[0] - 0.000001 &&
      footprintMaximumX <= family.bounds.max[0] + 0.000001 &&
      footprintMinimumZ >= family.bounds.min[2] - 0.000001 &&
      footprintMaximumZ <= family.bounds.max[2] + 0.000001,
    `${family.id} footprint exceeds its canonical LOD0 bounds`,
  );
  for (let axis = 0; axis < 3; axis += 1) {
    invariant(
      family.bounds.max[axis] > family.bounds.min[axis],
      `${family.id} bounds must have positive extent on axis ${axis}`,
    );
    invariant(
      family.collision.nodes.every((node) => node.halfExtents[axis] > 0),
      `${family.id} collision half-extents must be positive on axis ${axis}`,
    );
  }
  for (const node of family.collision.nodes) {
    const [halfX, halfY, halfZ] = node.halfExtents;
    if (node.shape === "sphere") {
      invariant(
        Math.abs(halfX - halfY) <= 0.000001 && Math.abs(halfX - halfZ) <= 0.000001,
        `${family.id}/${node.name} sphere collision must encode one equal radius`,
      );
    }
    if (node.shape === "capsule") {
      invariant(
        Math.abs(halfX - halfZ) <= 0.000001 && halfY + 0.000001 >= halfX,
        `${family.id}/${node.name} capsule collision dimensions are not exactly representable`,
      );
    }
  }
  if (family.kind === "animal") {
    invariant(family.orientation?.forwardAxis === "+Z", `${family.id} must declare +Z forward`);
    invariant(
      Math.abs(family.orientation.markerPosition[0]) < 0.000001 &&
        family.orientation.markerPosition[2] > 0,
      `${family.id} forward marker must be centered ahead on +Z`,
    );
  } else {
    invariant(family.orientation === null, `${family.id} must not declare an animal marker`);
  }
  const catalogMaterialNames = new Set(family.materials.map((material) => material.id));
  for (const [lodIndex, lod] of family.lods.entries()) {
    const path = resolve(repositoryRoot, lod.uri.replace("/assets/", "public/assets/"));
    const buffer = await readFile(path);
    totalGlbBytes += buffer.byteLength;
    invariant(buffer.toString("ascii", 0, 4) === "glTF", `${family.id}/${lod.slot} is not GLB`);
    invariant(buffer.readUInt32LE(4) === 2, `${family.id}/${lod.slot} is not glTF 2`);
    invariant(
      buffer.readUInt32LE(8) === buffer.byteLength,
      `${family.id}/${lod.slot} length header drifted`,
    );
    invariant(buffer.byteLength === lod.bytes, `${family.id}/${lod.slot} bytes drifted`);
    invariant(sha256(buffer) === lod.sha256, `${family.id}/${lod.slot} hash drifted`);
    const gltf = await parseGlb(buffer);
    const assetRoot = gltf.scene.children[0];
    invariant(assetRoot, `${family.id}/${lod.slot} has no asset root`);
    invariant(
      assetRoot.position
        .toArray()
        .every((value) => Number.isFinite(value) && Math.abs(value) < 0.000001),
      `${family.id}/${lod.slot} root must remain at a finite origin`,
    );
    invariant(
      assetRoot.pivot === null,
      `${family.id}/${lod.slot} must not misuse Three's reserved pivot`,
    );
    invariant(
      assetRoot.userData.originalAsset === true,
      `${family.id}/${lod.slot} lacks original marker`,
    );
    invariant(
      assetRoot.userData.pivotMode === "ground-center",
      `${family.id}/${lod.slot} pivot mode drifted`,
    );
    const { metrics, materialNames } = measureGltf(gltf.scene);
    invariant(sameJson(metrics, lod.metrics), `${family.id}/${lod.slot} catalog metrics drifted`);
    const measuredSilhouette = measureLodSilhouette(family.bounds, metrics.bounds);
    invariant(
      sameJson(lod.silhouette, {
        referenceSlot: EXPECTED_LOD_SILHOUETTE_CONTRACT.referenceSlot,
        ...measuredSilhouette,
        passes: true,
      }),
      `${family.id}/${lod.slot} silhouette metrics drifted`,
    );
    for (let axis = 0; axis < 3; axis += 1) {
      invariant(
        measuredSilhouette.envelopeDeltaRatio[axis] <=
          EXPECTED_LOD_SILHOUETTE_CONTRACT.maxEnvelopeDeltaRatio,
        `${family.id}/${lod.slot} envelope drift exceeds 10% on axis ${axis}`,
      );
      invariant(
        measuredSilhouette.extentDeltaRatio[axis] <=
          EXPECTED_LOD_SILHOUETTE_CONTRACT.maxExtentDeltaRatio,
        `${family.id}/${lod.slot} extent drift exceeds 10% on axis ${axis}`,
      );
      invariant(
        measuredSilhouette.centerDriftRatio[axis] <=
          EXPECTED_LOD_SILHOUETTE_CONTRACT.maxCenterDriftRatio,
        `${family.id}/${lod.slot} center drift exceeds 10% on axis ${axis}`,
      );
    }
    invariant(
      Math.abs(metrics.bounds.min[1]) < 0.000001,
      `${family.id}/${lod.slot} is not grounded`,
    );
    for (let axis = 0; axis < 3; axis += 1) {
      invariant(
        metrics.bounds.max[axis] > metrics.bounds.min[axis],
        `${family.id}/${lod.slot} bounds are non-positive on axis ${axis}`,
      );
    }
    for (const materialName of materialNames) {
      invariant(
        catalogMaterialNames.has(materialName),
        `${family.id} omits material ${materialName}`,
      );
    }
    const collision = assetRoot.getObjectByName(family.collision.nodes[0].name);
    invariant(
      collision?.userData.collisionProxy === true,
      `${family.id}/${lod.slot} collision is missing`,
    );
    invariant(
      collision.userData.shape === family.collision.nodes[0].shape,
      `${family.id}/${lod.slot} collision shape drifted`,
    );
    invariant(
      sameJson(collision.userData.halfExtents, family.collision.nodes[0].halfExtents),
      `${family.id}/${lod.slot} collision half-extents drifted`,
    );
    if (family.orientation) {
      invariant(
        assetRoot.userData.forwardAxis === family.orientation.forwardAxis,
        `${family.id}/${lod.slot} exported forward-axis marker drifted`,
      );
      const marker = assetRoot.getObjectByName(family.orientation.markerNode);
      invariant(
        marker?.userData.orientationMarker === true && marker.userData.forwardAxis === "+Z",
        `${family.id}/${lod.slot} +Z forward marker is missing`,
      );
      invariant(
        sameJson(roundedVector(marker.position), family.orientation.markerPosition),
        `${family.id}/${lod.slot} +Z forward marker position drifted`,
      );
      const width = metrics.bounds.max[0] - metrics.bounds.min[0];
      const depth = metrics.bounds.max[2] - metrics.bounds.min[2];
      invariant(
        depth > width * 2,
        `${family.id}/${lod.slot} geometry no longer has its longitudinal axis on +Z`,
      );
      const eyeMesh = assetRoot.getObjectByName("MESH_patch_fox_eye");
      if (eyeMesh) {
        const eyeCenter = new THREE.Box3().setFromObject(eyeMesh).getCenter(new THREE.Vector3());
        invariant(
          eyeCenter.z > 0 && Math.abs(eyeCenter.x) < 0.000001,
          `${family.id}/${lod.slot} facial geometry no longer faces +Z`,
        );
      }
    }
    const animation = gltf.animations.find((clip) => clip.name === family.animations[0].name);
    invariant(animation, `${family.id}/${lod.slot} named animation is missing`);
    invariant(
      Math.abs(animation.duration - family.animations[0].durationSeconds) < 0.00001,
      `${family.id}/${lod.slot} animation duration drifted`,
    );
    invariant(
      animation.tracks.some((track) => track.name.includes(family.animations[0].targetNodes[0])),
      `${family.id}/${lod.slot} animation target drifted`,
    );
    if (lodIndex > 0) {
      invariant(
        lod.metrics.triangles < family.lods[lodIndex - 1].metrics.triangles,
        `${family.id} triangles must decrease across LODs`,
      );
      invariant(
        lod.bytes < family.lods[lodIndex - 1].bytes,
        `${family.id} bytes must decrease across LODs`,
      );
    }
  }
}
invariant(totalGlbBytes < 1024 * 1024, "Batch-1 proof GLB budget exceeds 1 MiB");
const commitRidge = catalog.families.find((family) => family.id === "commit-ridge");
invariant(
  commitRidge?.collision.nodes[0]?.shape === "box",
  "Commit Ridge must ship an honest box proxy until authored hull geometry exists",
);

const texturedMaterials = catalog.families.flatMap((family) =>
  family.materials.filter((material) => material.mode === "textured-pbr"),
);
invariant(texturedMaterials.length === 1, "Batch-1 must have one bounded textured material proof");
const textureMaps = texturedMaterials[0].textureSet.maps;
invariant(
  sameJson(
    textureMaps.map((map) => map.channel),
    ["baseColor", "normal", "orm"],
  ),
  "KTX2 proof must ship baseColor, OpenGL normal, and ORM",
);
for (const map of textureMaps) {
  const path = resolve(repositoryRoot, map.uri.replace("/assets/", "public/assets/"));
  const buffer = await readFile(path);
  const header = parseKtx2Header(buffer);
  invariant(
    sha256(buffer) === map.sha256 && buffer.byteLength === map.bytes,
    `${map.channel} hash drifted`,
  );
  invariant(header.width === 512 && header.height === 512, `${map.channel} must be 512x512`);
  invariant(
    header.faceCount === 1 && header.levelCount === 10,
    `${map.channel} mip contract drifted`,
  );
  invariant(header.supercompressionScheme === 2, `${map.channel} must use Zstd supercompression`);
  const expectedTransfer = map.colorSpace === "srgb" ? 2 : 1;
  invariant(
    header.transferFunction === expectedTransfer,
    `${map.channel} transfer function drifted`,
  );
}

invariant(
  runtimeManifest.art === false,
  "Basis runtime dependency must never be classified as art",
);
invariant(
  runtimeManifest.dependency === "three",
  "Basis runtime dependency must come from installed Three",
);
invariant(
  packageManifest.dependencies?.three === runtimeManifest.version &&
    catalog.textureDelivery.localTranscoder.version === runtimeManifest.version,
  "Catalog and Basis runtime must match the exact installed Three version",
);
invariant(
  packageManifest.devDependencies?.["@gltf-transform/cli"] === PINNED_TOOL_VERSIONS.gltfTransform,
  "glTF Transform must remain pinned in package.json",
);
for (const file of runtimeManifest.files) {
  const outputBuffer = await readFile(resolve(repositoryRoot, file.path));
  const sourceBuffer = await readFile(resolve(repositoryRoot, file.source));
  invariant(sha256(outputBuffer) === file.sha256, `${file.path} runtime hash drifted`);
  invariant(
    outputBuffer.equals(sourceBuffer),
    `${file.path} does not match the installed Three runtime`,
  );
}

const blenderSource = await readFile(blenderScriptPath, "utf8");
const imports = blenderSource
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.startsWith("import ") || line.startsWith("from "));
const allowedImports = [
  "import argparse",
  "import bpy",
  "import json",
  "import math",
  "import sys",
  "from pathlib import Path",
];
invariant(
  imports.every((line) => allowedImports.includes(line)),
  "Blender source imports a non-audited module",
);
invariant(
  blenderSource.includes("bpy.app.background"),
  "Blender source must require background mode",
);
invariant(blenderSource.includes('export_format="GLB"'), "Blender source must export GLB");
const blendBuffer = await readFile(
  resolve(repositoryRoot, "art/world-v2/archive-spire/archive-spire.blend"),
);
invariant(
  blendBuffer.toString("ascii", 0, 7) === "BLENDER" || blendBuffer.readUInt32LE(0) === 0xfd2fb528,
  "Authored .blend source header is invalid",
);

const publicFiles = (await walkFiles(publicRoot)).map(normalizedPath).sort();
const allowedPublicFiles = new Set([
  ...manifest.outputs.map((output) => output.path),
  "public/assets/world-v2/original-asset-manifest.json",
  "public/assets/world-v2/basis/THREE-LICENSE.txt",
  "public/assets/world-v2/basis/basis_transcoder.js",
  "public/assets/world-v2/basis/basis_transcoder.wasm",
  "public/assets/world-v2/basis/runtime-dependencies.json",
]);
invariant(
  publicFiles.every((path) => allowedPublicFiles.has(path)) &&
    publicFiles.length === allowedPublicFiles.size,
  `Unexpected or missing public world-v2 file: ${publicFiles.filter((path) => !allowedPublicFiles.has(path)).join(", ")}`,
);

const checkedTools = verifyToolVersions();
if (requirePinnedTools) {
  invariant(
    checkedTools.length === 4,
    "Release verification requires Blender, toktx, ktx, and glTF Transform overrides.",
  );
}
if (process.env.WORLD_ASSETS_V2_KTX_BIN) {
  for (const map of textureMaps) {
    const path = resolve(repositoryRoot, map.uri.replace("/assets/", "public/assets/"));
    const info = run(process.env.WORLD_ASSETS_V2_KTX_BIN, ["info", path]);
    invariant(info.includes("Validation successful"), `${map.channel} failed libktx validation`);
    invariant(
      info.includes("pixelWidth: 512") && info.includes("levelCount: 10"),
      `${map.channel} ktx info drifted`,
    );
    invariant(info.includes("toktx v4.4.2"), `${map.channel} encoder metadata drifted`);
    if (map.channel === "normal") {
      invariant(
        info.includes("KHR_DF_CHANNEL_UASTC_RGB") && !info.includes("KHR_DF_CHANNEL_UASTC_RRRG"),
        "OpenGL normal map must retain RGB channels for MeshStandardMaterial",
      );
    }
  }
}

if (process.env.WORLD_ASSETS_V2_GLTF_TRANSFORM_BIN) {
  for (const family of catalog.families) {
    const path = resolve(repositoryRoot, family.lods[0].uri.replace("/assets/", "public/assets/"));
    const inspection = run(process.env.WORLD_ASSETS_V2_GLTF_TRANSFORM_BIN, ["inspect", path]);
    invariant(
      inspection.includes("OVERVIEW") &&
        inspection.includes(`ASSET_${family.id}_lod0`) &&
        inspection.includes(family.animations[0].name),
      `${family.id} failed glTF Transform structural inspection`,
    );
  }
}

if (process.env.WORLD_ASSETS_V2_BLENDER_BIN) {
  const committedBlendPath = resolve(
    repositoryRoot,
    "art/world-v2/archive-spire/archive-spire.blend",
  );
  const blendInspection = run(process.env.WORLD_ASSETS_V2_BLENDER_BIN, [
    "--background",
    committedBlendPath,
    "--python-exit-code",
    "1",
    "--python-expr",
    'import bpy; scene=bpy.context.scene; assert scene["originalAssetFamily"] == "archive-spire"; assert scene["authoringBlenderVersion"] == "5.1.2"; assert scene["networkInputs"] == 0',
  ]);
  invariant(blendInspection.includes("Blender 5.1.2"), "Committed .blend source failed inspection");
  const temporaryDirectory = await mkdtemp(resolve(tmpdir(), "world-assets-v2-blender-verify-"));
  try {
    const result = run(process.execPath, [
      "scripts/assets-v2/build-blender-authoring.mjs",
      "--recipe",
      "art/world-v2/batch-1-original-assets.recipe.json",
      "--family",
      "archive-spire",
      "--output",
      resolve(temporaryDirectory, "archive-spire.glb"),
      "--blend-output",
      resolve(temporaryDirectory, "archive-spire.blend"),
    ]);
    invariant(
      result.includes("Verified offline Blender 5.1.2 authoring"),
      "Blender source proof failed",
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

console.log(
  `Verified ${catalog.families.length} original families, 15 GLBs (${totalGlbBytes} bytes), 3 project-authored KTX2 maps, authored .blend source, and ${checkedTools.length} ${requirePinnedTools ? "required" : "optional"} pinned tool overrides.`,
);
