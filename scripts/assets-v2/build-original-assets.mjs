#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { format } from "prettier";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const defaultRecipePath = resolve(
  repositoryRoot,
  "art/world-v2/batch-1-original-assets.recipe.json",
);
const defaultOutputDirectory = resolve(repositoryRoot, "public/assets/world-v2");
const blenderScaffoldPath = resolve(
  repositoryRoot,
  "art/world-v2/blender/archive_spire_authoring.py",
);
const blenderSourcePath = resolve(repositoryRoot, "art/world-v2/archive-spire/archive-spire.blend");
const textureGeneratorPath = resolve(scriptDirectory, "build-original-textures.mjs");
const blenderBuildPath = resolve(scriptDirectory, "build-blender-authoring.mjs");
const generatorPath = fileURLToPath(import.meta.url);
const LOD_SILHOUETTE_CONTRACT = Object.freeze({
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
const TEXTURE_DEFINITIONS = Object.freeze([
  {
    channel: "baseColor",
    fileName: "archive-spire-stone-base-color.ktx2",
    colorSpace: "srgb",
  },
  {
    channel: "normal",
    fileName: "archive-spire-stone-normal.ktx2",
    colorSpace: "linear",
  },
  {
    channel: "orm",
    fileName: "archive-spire-stone-orm.ktx2",
    colorSpace: "linear",
  },
]);

const FAMILY_MATERIALS = Object.freeze({
  "hero-building": {
    stone: { metalness: 0, roughness: 0.82 },
    timber: { metalness: 0, roughness: 0.7 },
    roof: { metalness: 0.28, roughness: 0.42 },
    metal: { metalness: 0.72, roughness: 0.34 },
    window: { metalness: 0.08, roughness: 0.2, emissiveIntensity: 0.32 },
    beacon: { metalness: 0, roughness: 0.22, emissiveIntensity: 2.2 },
  },
  tree: {
    bark: { metalness: 0, roughness: 0.92 },
    foliage: { metalness: 0, roughness: 0.78 },
    foliageLight: { metalness: 0, roughness: 0.72 },
    fruit: { metalness: 0, roughness: 0.5, emissiveIntensity: 0.16 },
  },
  rock: {
    rock: { metalness: 0.04, roughness: 0.9 },
    rockLight: { metalness: 0.08, roughness: 0.76 },
    crystal: { metalness: 0.12, roughness: 0.24, emissiveIntensity: 1.1 },
  },
  animal: {
    fur: { metalness: 0, roughness: 0.88 },
    furLight: { metalness: 0, roughness: 0.82 },
    dark: { metalness: 0, roughness: 0.76 },
    eye: { metalness: 0.08, roughness: 0.18, emissiveIntensity: 0.62 },
  },
  prop: {
    wood: { metalness: 0, roughness: 0.82 },
    metal: { metalness: 0.74, roughness: 0.32 },
    glass: { metalness: 0.04, roughness: 0.18, emissiveIntensity: 0.42 },
    light: { metalness: 0, roughness: 0.18, emissiveIntensity: 2.4 },
  },
});

class NodeFileReader {
  result = null;
  onloadend = null;
  onerror = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(
      (value) => {
        this.result = value;
        this.onloadend?.();
      },
      (error) => this.onerror?.(error),
    );
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then(
      (value) => {
        this.result = `data:${blob.type};base64,${Buffer.from(value).toString("base64")}`;
        this.onloadend?.();
      },
      (error) => this.onerror?.(error),
    );
  }
}

if (typeof globalThis.FileReader === "undefined") globalThis.FileReader = NodeFileReader;

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

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function stableJson(value) {
  return format(JSON.stringify(value), { parser: "json", printWidth: 100 });
}

function canonicalSourcePath(path) {
  return relative(repositoryRoot, path).split("\\").join("/");
}

function boundsAxisMetrics(bounds, axis) {
  const minimum = bounds.min[axis];
  const maximum = bounds.max[axis];
  return {
    extent: maximum - minimum,
    center: (minimum + maximum) * 0.5,
  };
}

function measureLodSilhouette(referenceBounds, candidateBounds) {
  const envelopeDeltaRatio = [];
  const extentDeltaRatio = [];
  const centerDriftRatio = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const reference = boundsAxisMetrics(referenceBounds, axis);
    const candidate = boundsAxisMetrics(candidateBounds, axis);
    if (reference.extent < LOD_SILHOUETTE_CONTRACT.materialExtentEpsilonMeters) {
      envelopeDeltaRatio.push(0);
      extentDeltaRatio.push(0);
      centerDriftRatio.push(0);
      continue;
    }
    envelopeDeltaRatio.push(
      Number(
        (
          Math.max(
            Math.abs(candidateBounds.min[axis] - referenceBounds.min[axis]),
            Math.abs(candidateBounds.max[axis] - referenceBounds.max[axis]),
          ) / reference.extent
        ).toFixed(6),
      ),
    );
    extentDeltaRatio.push(
      Number((Math.abs(candidate.extent - reference.extent) / reference.extent).toFixed(6)),
    );
    centerDriftRatio.push(
      Number((Math.abs(candidate.center - reference.center) / reference.extent).toFixed(6)),
    );
  }
  return { envelopeDeltaRatio, extentDeltaRatio, centerDriftRatio };
}

function assertLodSilhouette(familyId, slot, silhouette) {
  for (let axis = 0; axis < 3; axis += 1) {
    if (silhouette.envelopeDeltaRatio[axis] > LOD_SILHOUETTE_CONTRACT.maxEnvelopeDeltaRatio) {
      throw new Error(
        `${familyId}/${slot} envelope drift on axis ${axis} exceeds ${LOD_SILHOUETTE_CONTRACT.maxEnvelopeDeltaRatio}`,
      );
    }
    if (silhouette.extentDeltaRatio[axis] > LOD_SILHOUETTE_CONTRACT.maxExtentDeltaRatio) {
      throw new Error(
        `${familyId}/${slot} extent drift on axis ${axis} exceeds ${LOD_SILHOUETTE_CONTRACT.maxExtentDeltaRatio}`,
      );
    }
    if (silhouette.centerDriftRatio[axis] > LOD_SILHOUETTE_CONTRACT.maxCenterDriftRatio) {
      throw new Error(
        `${familyId}/${slot} center drift on axis ${axis} exceeds ${LOD_SILHOUETTE_CONTRACT.maxCenterDriftRatio}`,
      );
    }
  }
}

function transformedGeometry(geometry, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
  const transformed = (geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(
    matrix,
  );
  geometry.dispose();
  return transformed;
}

function addBox(parts, role, position, size, rotation = [0, 0, 0]) {
  parts[role].push(transformedGeometry(new THREE.BoxGeometry(1, 1, 1), position, rotation, size));
}

function addCylinder(
  parts,
  role,
  position,
  radiusTop,
  radiusBottom,
  height,
  radialSegments,
  rotation = [0, 0, 0],
) {
  parts[role].push(
    transformedGeometry(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, 1, false),
      position,
      rotation,
    ),
  );
}

function addCone(parts, role, position, radius, height, radialSegments, rotation = [0, 0, 0]) {
  parts[role].push(
    transformedGeometry(
      new THREE.ConeGeometry(radius, height, radialSegments, 1, false),
      position,
      rotation,
    ),
  );
}

function addTorus(parts, role, position, radius, tube, radialSegments, tubularSegments) {
  parts[role].push(
    transformedGeometry(
      new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments),
      position,
      [Math.PI * 0.5, 0, 0],
    ),
  );
}

function addSphere(parts, role, position, radius, segments, scale = [1, 1, 1]) {
  parts[role].push(
    transformedGeometry(
      new THREE.SphereGeometry(radius, segments, Math.max(4, Math.floor(segments * 0.65))),
      position,
      [0, 0, 0],
      scale,
    ),
  );
}

function addPolyhedron(parts, role, position, radius, detail, scale, rotation = [0, 0, 0]) {
  parts[role].push(
    transformedGeometry(new THREE.IcosahedronGeometry(radius, detail), position, rotation, scale),
  );
}

function addRadialBox(parts, role, angle, radius, y, size) {
  addBox(parts, role, [Math.sin(angle) * radius, y, Math.cos(angle) * radius], size, [0, angle, 0]);
}

function materialName(family, role) {
  return `MAT_${family.id.replaceAll("-", "_")}_${role}`;
}

function createMaterials(family) {
  const definitions = FAMILY_MATERIALS[family.family];
  if (!definitions) throw new Error(`unsupported family kind ${family.family}`);
  return Object.fromEntries(
    Object.entries(definitions).map(([role, definition]) => {
      const color = family.palette[role];
      if (!color) throw new Error(`${family.id} is missing palette role ${role}`);
      const emissiveIntensity = definition.emissiveIntensity ?? 0;
      return [
        role,
        new THREE.MeshStandardMaterial({
          color,
          emissive: emissiveIntensity > 0 ? color : "#000000",
          emissiveIntensity,
          metalness: definition.metalness,
          roughness: definition.roughness,
          name: materialName(family, role),
        }),
      ];
    }),
  );
}

function createBuildContext(batchRecipe, family, lodDefinition) {
  const root = new THREE.Group();
  root.name = `ASSET_${family.id}_${lodDefinition.slot}`;
  root.userData = {
    originalAsset: true,
    recipe: batchRecipe.schema,
    batch: batchRecipe.batch,
    quality: batchRecipe.quality,
    pivotMode: batchRecipe.pivot,
    units: batchRecipe.units,
  };
  const content = new THREE.Group();
  content.name = `CONTENT_${family.id}`;
  root.add(content);
  const materials = createMaterials(family);
  const parts = Object.fromEntries(Object.keys(materials).map((role) => [role, []]));
  return { root, content, materials, parts };
}

function mergeRole(parent, family, slot, role, geometries, material) {
  if (geometries.length === 0) return;
  const geometry = mergeGeometries(geometries, false);
  if (!geometry) throw new Error(`failed to merge ${family.id}/${role}/${slot}`);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = `GEO_${family.id.replaceAll("-", "_")}_${role}_${slot}`;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `MESH_${family.id.replaceAll("-", "_")}_${role}`;
  mesh.castShadow = !["window", "beacon", "crystal", "eye", "glass", "light"].includes(role);
  mesh.receiveShadow = !["window", "beacon", "crystal", "eye", "glass", "light"].includes(role);
  parent.add(mesh);
  for (const source of geometries) source.dispose();
  geometries.length = 0;
}

function mergeAll(context, family, slot, animatedRoles = []) {
  const animated = new Set(animatedRoles);
  const animationTarget = new THREE.Group();
  animationTarget.name = family.animation.targetNode;
  animationTarget.userData = { animationRole: family.animation.motion };
  if (animated.size > 0) context.content.add(animationTarget);
  for (const [role, geometries] of Object.entries(context.parts)) {
    mergeRole(
      animated.has(role) ? animationTarget : context.content,
      family,
      slot,
      role,
      geometries,
      context.materials[role],
    );
  }
  return animationTarget;
}

function buildArchiveSpire(context, family, lod) {
  const { parts } = context;
  const segments = lod.radialSegments;
  addBox(parts, "stone", [0, 0.35, 0], [9.6, 0.7, 9.6]);
  addBox(parts, "stone", [0, 0.9, 0], [8.7, 0.4, 8.7]);
  addCylinder(parts, "stone", [0, 4.65, 0], 3.05, 3.28, 7.1, segments);
  addCylinder(parts, "stone", [0, 8.15, 0], 3.45, 3.45, 0.35, segments);
  addCone(parts, "roof", [0, 9.9, 0], 4.05, 3.25, segments);
  addCylinder(parts, "roof", [0, 11.45, 0], 0.62, 0.84, 0.9, Math.max(6, segments));
  for (let index = 0; index < lod.buttressCount; index += 1) {
    const angle = (index / lod.buttressCount) * Math.PI * 2;
    addRadialBox(parts, "stone", angle, 3.45, 3.1, [0.72, 4.6, 1.05]);
    addRadialBox(parts, "timber", angle, 3.84, 5.55, [0.2, 4.7, 0.22]);
  }
  for (let index = 0; index < lod.windowCount; index += 1) {
    const angle = (index / lod.windowCount) * Math.PI * 2;
    addRadialBox(parts, "window", angle, 3.22, 5.05, [0.82, 1.42, 0.12]);
    if (lod.slot === "lod0") {
      addRadialBox(parts, "metal", angle, 3.3, 5.05, [0.09, 1.62, 0.16]);
    }
  }
  addBox(parts, "timber", [-0.88, 2.45, 3.24], [0.22, 3.05, 0.25]);
  addBox(parts, "timber", [0.88, 2.45, 3.24], [0.22, 3.05, 0.25]);
  addBox(parts, "timber", [0, 3.88, 3.24], [1.98, 0.22, 0.25]);
  addBox(parts, "timber", [0, 2.28, 3.16], [1.48, 2.75, 0.16]);
  for (let ring = 0; ring < lod.detailCount; ring += 1) {
    addTorus(
      parts,
      "metal",
      [0, 8.72 + ring * 0.72, 0],
      3.58 - ring * 0.72,
      0.075,
      Math.max(5, Math.floor(segments / 2)),
      segments * 2,
    );
  }
  addPolyhedron(
    parts,
    "beacon",
    [0, 12.52, 0],
    0.48,
    lod.slot === "lod0" ? 2 : lod.slot === "lod1" ? 1 : 0,
    [1, 1, 1],
  );
  return mergeAll(context, family, lod.slot, ["beacon"]);
}

function buildLedgerPine(context, family, lod) {
  const { parts } = context;
  addCylinder(parts, "bark", [0, 3.15, 0], 0.48, 0.72, 6.3, lod.radialSegments);
  for (let index = 0; index < lod.branchCount; index += 1) {
    const angle = (index / lod.branchCount) * Math.PI * 2;
    addRadialBox(parts, "bark", angle, 1.22, 5.1 + (index % 3) * 0.52, [0.18, 0.18, 2.5]);
  }
  for (let index = 0; index < lod.canopyCount; index += 1) {
    const normalizedIndex = lod.canopyCount === 1 ? 0.5 : index / (lod.canopyCount - 1);
    const y = 5.35 + normalizedIndex * 4.2;
    const radius = lod.canopyCount === 1 ? 3.05 : 3.05 - normalizedIndex * 1.52;
    const height = lod.canopyCount === 1 ? 7.4 : 3.2;
    addCone(
      parts,
      index % 2 === 0 ? "foliage" : "foliageLight",
      [0, y, 0],
      radius,
      height,
      Math.max(8, lod.radialSegments),
    );
  }
  for (let index = 0; index < lod.detailCount; index += 1) {
    const angle = (index / lod.detailCount) * Math.PI * 2;
    addSphere(
      parts,
      "fruit",
      [Math.sin(angle) * 1.85, 6.4 + (index % 2) * 1.15, Math.cos(angle) * 1.85],
      0.13,
      Math.max(5, lod.radialSegments - 2),
    );
  }
  return mergeAll(context, family, lod.slot, ["foliage", "foliageLight", "fruit"]);
}

function buildCommitRidge(context, family, lod) {
  const { parts } = context;
  const detail = lod.slot === "lod0" ? 2 : lod.slot === "lod1" ? 1 : 0;
  addPolyhedron(parts, "rock", [-1.25, 2.25, 0], 1, detail, [3.3, 2.45, 2.7], [0.08, 0.3, -0.08]);
  addPolyhedron(
    parts,
    "rock",
    [2.05, 1.75, 0.35],
    1,
    detail,
    [2.4, 1.9, 2.25],
    [-0.12, -0.4, 0.16],
  );
  const silhouetteRockCount = Math.max(2, lod.detailCount);
  for (let index = 0; index < silhouetteRockCount; index += 1) {
    const angle = (index / silhouetteRockCount) * Math.PI * 2;
    addPolyhedron(
      parts,
      "rockLight",
      [Math.sin(angle) * 3.3, 1.05 + (index % 2) * 0.4, Math.cos(angle) * 2.25],
      0.72,
      Math.max(0, detail - 1),
      [1.2, 1.55, 1],
      [angle * 0.18, angle, 0],
    );
  }
  for (let index = 0; index < lod.shardCount; index += 1) {
    const angle = (index / lod.shardCount) * Math.PI * 2;
    const isSilhouetteAnchor = index === 0;
    const height = isSilhouetteAnchor ? 1.81 : 1.25 + (index % 3) * 0.28;
    const y = isSilhouetteAnchor ? 5.12 : 4.4 + (index % 3) * 0.36;
    addCone(
      parts,
      "crystal",
      [Math.sin(angle) * (1.2 + (index % 2) * 0.65), y, Math.cos(angle) * 1.4],
      0.22 + (index % 2) * 0.08,
      height,
      Math.max(5, lod.radialSegments),
      [0.08 * Math.sin(angle), 0, 0.1 * Math.cos(angle)],
    );
  }
  return mergeAll(context, family, lod.slot, ["crystal"]);
}

function buildPatchFox(context, family, lod) {
  const { parts } = context;
  const segments = lod.radialSegments;
  addSphere(parts, "fur", [0, 1.22, 0], 1, segments, [1.65, 0.72, 0.68]);
  addSphere(parts, "fur", [1.42, 1.48, 0], 0.72, segments, [1, 0.86, 0.88]);
  addCone(parts, "fur", [-1.9, 1.38, 0], 0.5, 2.2, segments, [0, 0, Math.PI * 0.48]);
  for (let index = 0; index < lod.limbCount; index += 1) {
    const x = index < 2 ? -0.88 : 0.82;
    const z = index % 2 === 0 ? -0.43 : 0.43;
    addCylinder(parts, "dark", [x, 0.48, z], 0.12, 0.16, 0.96, Math.max(5, segments));
  }
  addSphere(parts, "furLight", [1.92, 1.35, 0], 0.34, Math.max(5, segments - 1), [1.1, 0.72, 0.72]);
  addSphere(parts, "dark", [2.27, 1.38, 0], 0.13, Math.max(5, segments - 2));
  addCone(
    parts,
    "dark",
    [1.25, 2.16, -0.38],
    0.25,
    0.68,
    Math.max(5, segments - 2),
    [0.18, 0, -0.16],
  );
  addCone(
    parts,
    "dark",
    [1.25, 2.16, 0.38],
    0.25,
    0.68,
    Math.max(5, segments - 2),
    [-0.18, 0, -0.16],
  );
  if (lod.detailCount > 0) {
    addSphere(parts, "eye", [1.91, 1.69, -0.53], 0.07, 5);
    addSphere(parts, "eye", [1.91, 1.69, 0.53], 0.07, 5);
  }
  const positiveXToPositiveZ = new THREE.Matrix4().makeRotationY(-Math.PI * 0.5);
  for (const geometries of Object.values(parts)) {
    for (const geometry of geometries) geometry.applyMatrix4(positiveXToPositiveZ);
  }
  return mergeAll(context, family, lod.slot, Object.keys(context.parts));
}

function buildBranchLantern(context, family, lod) {
  const { parts } = context;
  addCylinder(parts, "wood", [0, 0.14, 0], 0.58, 0.58, 0.28, Math.max(6, lod.radialSegments));
  addBox(parts, "wood", [0, 2.15, 0], [0.48, 4.3, 0.48]);
  addBox(parts, "wood", [0.68, 4.16, 0], [1.7, 0.28, 0.34]);
  addBox(parts, "metal", [1.42, 3.72, 0], [0.92, 0.16, 0.92]);
  addBox(parts, "metal", [1.42, 4.38, 0], [0.92, 0.16, 0.92]);
  addCylinder(parts, "glass", [1.42, 4.05, 0], 0.37, 0.42, 0.66, lod.radialSegments);
  addSphere(parts, "light", [1.42, 4.05, 0], 0.24, Math.max(5, lod.radialSegments - 1));
  for (let index = 0; index < lod.braceCount; index += 1) {
    const angle = (index / lod.braceCount) * Math.PI * 2;
    addRadialBox(parts, "metal", angle, 0.44, 4.05, [0.08, 0.78, 0.08]);
  }
  for (let index = 0; index < lod.detailCount; index += 1) {
    addTorus(
      parts,
      "metal",
      [0, 0.24 + index * 0.16, 0],
      0.34 + index * 0.05,
      0.035,
      5,
      Math.max(6, lod.radialSegments),
    );
  }
  return mergeAll(context, family, lod.slot, ["light"]);
}

const FAMILY_BUILDERS = Object.freeze({
  "hero-building": buildArchiveSpire,
  tree: buildLedgerPine,
  rock: buildCommitRidge,
  animal: buildPatchFox,
  prop: buildBranchLantern,
});

function createAnimation(family, target) {
  const animation = family.animation;
  const times = [0, animation.durationSeconds * 0.5, animation.durationSeconds];
  let track;
  if (animation.motion === "pulse") {
    const peak = 1 + animation.amount;
    track = new THREE.VectorKeyframeTrack(
      `${animation.targetNode}.scale`,
      times,
      [1, 1, 1, peak, peak, peak, 1, 1, 1],
      THREE.InterpolateSmooth,
    );
  } else if (animation.motion === "sway") {
    const first = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -animation.amount));
    const second = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, animation.amount));
    track = new THREE.QuaternionKeyframeTrack(
      `${animation.targetNode}.quaternion`,
      times,
      [...first.toArray(), ...second.toArray(), ...first.toArray()],
      THREE.InterpolateLinear,
    );
  } else if (animation.motion === "bounce") {
    track = new THREE.VectorKeyframeTrack(
      `${animation.targetNode}.position`,
      times,
      [
        target.position.x,
        target.position.y,
        target.position.z,
        target.position.x,
        target.position.y + animation.amount,
        target.position.z,
        target.position.x,
        target.position.y,
        target.position.z,
      ],
      THREE.InterpolateSmooth,
    );
  } else {
    throw new Error(`unsupported animation motion ${animation.motion}`);
  }
  return new THREE.AnimationClip(animation.name, animation.durationSeconds, [track]);
}

function buildFamily(batchRecipe, family, lodDefinition) {
  const context = createBuildContext(batchRecipe, family, lodDefinition);
  const build = FAMILY_BUILDERS[family.family];
  if (!build) throw new Error(`missing builder for ${family.family}`);
  const animationTarget = build(context, family, lodDefinition);
  const contentBounds = new THREE.Box3().setFromObject(context.content);
  if (!Number.isFinite(contentBounds.min.y))
    throw new Error(`${family.id} contains invalid bounds`);
  context.content.position.y -= contentBounds.min.y;

  if (family.orientation) {
    context.root.userData.forwardAxis = family.orientation.forwardAxis;
    const forwardMarker = new THREE.Object3D();
    forwardMarker.name = family.orientation.markerNode;
    forwardMarker.position.fromArray(family.orientation.markerPosition);
    forwardMarker.userData = {
      orientationMarker: true,
      forwardAxis: family.orientation.forwardAxis,
    };
    context.root.add(forwardMarker);
  }

  const collision = new THREE.Object3D();
  collision.name = family.collision.node;
  collision.position.fromArray(family.collision.center);
  collision.userData = {
    collisionProxy: true,
    shape: family.collision.shape,
    halfExtents: family.collision.halfExtents,
  };
  context.root.add(collision);
  context.root.updateMatrixWorld(true);
  const animation = createAnimation(family, animationTarget);
  return { ...context, animation };
}

function measureAsset(root) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const geometries = new Set();
  const materialNames = new Set();
  let meshes = 0;
  let vertices = 0;
  let triangles = 0;
  let geometryBytes = 0;
  root.traverse((node) => {
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
    meshes,
    drawCalls: meshes,
    materials: materialNames.size,
    vertices,
    triangles,
    geometryBytes,
    estimatedGpuBytes: geometryBytes,
    bounds: {
      min: bounds.min.toArray().map((value) => Number(value.toFixed(6))),
      max: bounds.max.toArray().map((value) => Number(value.toFixed(6))),
    },
  };
}

async function exportGlb(root, animation) {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(root, {
    animations: [animation],
    binary: true,
    includeCustomExtensions: false,
    onlyVisible: false,
    trs: false,
  });
  if (!(result instanceof ArrayBuffer)) throw new Error("GLTFExporter did not return binary GLB");
  return Buffer.from(result);
}

function disposeAsset(root, materials) {
  root.traverse((node) => {
    if (node.isMesh) node.geometry.dispose();
  });
  for (const material of Object.values(materials)) material.dispose();
}

const argumentsMap = parseArguments(process.argv.slice(2));
const recipePath = resolve(argumentsMap.get("recipe") || defaultRecipePath);
const outputDirectory = resolve(argumentsMap.get("output") || defaultOutputDirectory);
const textureInputDirectory = resolve(argumentsMap.get("texture-input") || outputDirectory);
const catalogPath = resolve(
  argumentsMap.get("catalog") || resolve(outputDirectory, "catalog-v1.json"),
);
const manifestPath = resolve(
  argumentsMap.get("manifest") || resolve(outputDirectory, "original-asset-manifest.json"),
);

const recipeBuffer = await readFile(recipePath);
const batchRecipe = JSON.parse(recipeBuffer.toString("utf8"));
if (batchRecipe.schema !== "repository-worlds-v2/original-batch-recipe-v1") {
  throw new Error("unsupported original asset batch recipe schema");
}
if (batchRecipe.license !== "LicenseRef-Repository-Worlds-Original") {
  throw new Error("Batch-1 procedural assets must use the project-original license marker");
}
if (!Array.isArray(batchRecipe.families) || batchRecipe.families.length !== 5) {
  throw new Error("Batch-1 requires exactly five proof families");
}
if (batchRecipe.forwardAxis !== "+Z") {
  throw new Error("Batch-1 assets must use +Z as their authored forward axis");
}

const catalogFamilies = [];
const textureRecords = await Promise.all(
  TEXTURE_DEFINITIONS.map(async (definition) => {
    const path = resolve(textureInputDirectory, "archive-spire", "textures", definition.fileName);
    const buffer = await readFile(path);
    return {
      channel: definition.channel,
      uri: `/assets/world-v2/archive-spire/textures/${definition.fileName}`,
      colorSpace: definition.colorSpace,
      sha256: sha256(buffer),
      bytes: buffer.byteLength,
      width: 512,
      height: 512,
      mipLevels: 10,
      encoding: "uastc-zstd",
      decodedGpuBytes: 1_398_100,
    };
  }),
);
const outputRecords = textureRecords.map((texture) => ({
  path: texture.uri.replace("/assets/world-v2/", "public/assets/world-v2/"),
  sha256: texture.sha256,
  bytes: texture.bytes,
  kind: "ktx2",
}));
for (const family of batchRecipe.families) {
  if (
    !["ellipse", "rectangle"].includes(family.footprint?.shape) ||
    !Array.isArray(family.footprint.center) ||
    family.footprint.center.length !== 2 ||
    !family.footprint.center.every(Number.isFinite) ||
    !Array.isArray(family.footprint.halfExtents) ||
    family.footprint.halfExtents.length !== 2 ||
    !family.footprint.halfExtents.every((value) => Number.isFinite(value) && value > 0) ||
    !Number.isFinite(family.footprint.clearanceMeters) ||
    family.footprint.clearanceMeters < 0
  ) {
    throw new Error(`${family.id} requires an explicit finite placement footprint`);
  }
  if (
    !ASSET_BIOMES.has(family.biomeAffinity?.primary) ||
    !Array.isArray(family.biomeAffinity.compatible) ||
    !family.biomeAffinity.compatible.includes(family.biomeAffinity.primary) ||
    family.biomeAffinity.compatible.some((biome) => !ASSET_BIOMES.has(biome)) ||
    new Set(family.biomeAffinity.compatible).size !== family.biomeAffinity.compatible.length
  ) {
    throw new Error(`${family.id} requires a valid explicit biome affinity`);
  }
  const collisionHalfExtents = family.collision?.halfExtents;
  if (
    !["box", "sphere", "capsule"].includes(family.collision?.shape) ||
    !Array.isArray(collisionHalfExtents) ||
    collisionHalfExtents.length !== 3 ||
    !collisionHalfExtents.every((value) => Number.isFinite(value) && value > 0)
  ) {
    throw new Error(`${family.id} requires a finite supported collision proxy`);
  }
  const [collisionHalfX, collisionHalfY, collisionHalfZ] = collisionHalfExtents;
  if (
    family.collision.shape === "sphere" &&
    (Math.abs(collisionHalfX - collisionHalfY) > 0.000001 ||
      Math.abs(collisionHalfX - collisionHalfZ) > 0.000001)
  ) {
    throw new Error(`${family.id} sphere collision must encode one equal radius`);
  }
  if (
    family.collision.shape === "capsule" &&
    (Math.abs(collisionHalfX - collisionHalfZ) > 0.000001 ||
      collisionHalfY + 0.000001 < collisionHalfX)
  ) {
    throw new Error(`${family.id} capsule collision dimensions are not exactly representable`);
  }
  if (
    family.family === "animal" &&
    (family.orientation?.forwardAxis !== batchRecipe.forwardAxis ||
      !family.orientation.markerNode?.startsWith("FORWARD_") ||
      family.orientation.markerPosition?.[0] !== 0 ||
      !(family.orientation.markerPosition?.[2] > 0))
  ) {
    throw new Error(`${family.id} requires a centered +Z forward marker`);
  }
  await mkdir(resolve(outputDirectory, family.id), { recursive: true });
  const lods = [];
  for (const lodDefinition of family.lods) {
    const { root, animation, materials } = buildFamily(batchRecipe, family, lodDefinition);
    const metrics = measureAsset(root);
    if (Math.abs(metrics.bounds.min[1]) > 0.000001) {
      throw new Error(`${family.id}/${lodDefinition.slot} is not grounded`);
    }
    const buffer = await exportGlb(root, animation);
    const fileName = `${family.id}-${lodDefinition.slot}.glb`;
    await writeFile(resolve(outputDirectory, family.id, fileName), buffer);
    const lod = {
      slot: lodDefinition.slot,
      uri: `/assets/world-v2/${family.id}/${fileName}`,
      sha256: sha256(buffer),
      bytes: buffer.byteLength,
      maxDistance: lodDefinition.maxDistance,
      geometryCompression: "none-batch-1-proof",
      metrics,
    };
    lods.push(lod);
    outputRecords.push({
      path: lod.uri.replace("/assets/world-v2/", "public/assets/world-v2/"),
      sha256: lod.sha256,
      bytes: lod.bytes,
      kind: "glb",
    });
    disposeAsset(root, materials);
  }
  for (let index = 1; index < lods.length; index += 1) {
    if (
      lods[index].metrics.triangles >= lods[index - 1].metrics.triangles ||
      lods[index].bytes >= lods[index - 1].bytes
    ) {
      throw new Error(`${family.id} LOD complexity does not strictly decrease`);
    }
  }
  const referenceBounds = lods[0].metrics.bounds;
  const footprintMinimumX = family.footprint.center[0] - family.footprint.halfExtents[0];
  const footprintMaximumX = family.footprint.center[0] + family.footprint.halfExtents[0];
  const footprintMinimumZ = family.footprint.center[1] - family.footprint.halfExtents[1];
  const footprintMaximumZ = family.footprint.center[1] + family.footprint.halfExtents[1];
  if (
    footprintMinimumX < referenceBounds.min[0] - 0.000001 ||
    footprintMaximumX > referenceBounds.max[0] + 0.000001 ||
    footprintMinimumZ < referenceBounds.min[2] - 0.000001 ||
    footprintMaximumZ > referenceBounds.max[2] + 0.000001
  ) {
    throw new Error(`${family.id} placement footprint exceeds its canonical LOD0 bounds`);
  }
  for (const lod of lods) {
    const silhouette = measureLodSilhouette(referenceBounds, lod.metrics.bounds);
    assertLodSilhouette(family.id, lod.slot, silhouette);
    lod.silhouette = {
      referenceSlot: LOD_SILHOUETTE_CONTRACT.referenceSlot,
      ...silhouette,
      passes: true,
    };
  }
  catalogFamilies.push({
    id: family.id,
    title: family.title,
    kind: family.family,
    batch: batchRecipe.batch,
    quality: batchRecipe.quality,
    original: true,
    sourceRecipe: canonicalSourcePath(recipePath),
    pivot: { mode: batchRecipe.pivot, position: [0, 0, 0] },
    orientation: family.orientation ?? null,
    bounds: lods[0].metrics.bounds,
    footprint: family.footprint,
    biomeAffinity: family.biomeAffinity,
    materials: Object.keys(FAMILY_MATERIALS[family.family]).map((role) =>
      family.id === "archive-spire" && role === "stone"
        ? {
            id: materialName(family, role),
            mode: "textured-pbr",
            textureSet: {
              id: "archive-spire-stone",
              container: "ktx2",
              maps: textureRecords,
            },
            ktx2Ready: true,
          }
        : {
            id: materialName(family, role),
            mode: "constant-pbr",
            textureSet: null,
            ktx2Ready: true,
          },
    ),
    lods,
    collision: {
      kind: "compound",
      nodes: [
        {
          name: family.collision.node,
          shape: family.collision.shape,
          center: family.collision.center,
          halfExtents: family.collision.halfExtents,
        },
      ],
    },
    animations: [
      {
        name: family.animation.name,
        durationSeconds: family.animation.durationSeconds,
        targetNodes: [family.animation.targetNode],
        channels: 1,
        loop: true,
      },
    ],
    tags: family.tags,
    limitations: [
      "Batch-1 procedural proof; not AAA-complete.",
      family.id === "archive-spire"
        ? "Project-authored KTX2 stone detail is proven; full-family texture coverage and sculpted high-poly bakes are pending."
        : "Constant PBR materials only; sculpted high-poly bake and KTX2 texture set are pending.",
      "Geometry is merged but not Meshopt-compressed in this proof build.",
    ],
  });
}

const sourceFiles = await Promise.all(
  [
    recipePath,
    generatorPath,
    textureGeneratorPath,
    blenderBuildPath,
    blenderScaffoldPath,
    blenderSourcePath,
  ].map(async (path) => {
    const buffer = await readFile(path);
    return { path: canonicalSourcePath(path), sha256: sha256(buffer), bytes: buffer.byteLength };
  }),
);

const catalog = {
  schemaVersion: 1,
  id: "repository-worlds-v2-original-assets",
  generatedAt: batchRecipe.authoredAt,
  provenance: {
    origin: "project-original",
    thirdPartyArt: false,
    networkInputs: [],
    license: batchRecipe.license,
    authors: [batchRecipe.author],
    sourceFiles,
    generator: {
      id: "repository-worlds-v2-procedural-v1",
      engine: `three-r${THREE.REVISION}`,
      deterministic: true,
      blenderRequired: false,
      blenderPolicy: "offline-background-only",
    },
  },
  conventions: {
    shippingFormat: "glb",
    coordinateSystem: "right-handed",
    units: "meters",
    upAxis: "+Y",
    forwardAxis: "+Z",
    pivot: "ground-center",
    textureContainer: "ktx2",
    geometryCompressionTarget: "meshopt",
    lodSilhouette: LOD_SILHOUETTE_CONTRACT,
  },
  textureDelivery: {
    status: "ktx2-shipping",
    preferredContainer: "ktx2",
    source: "project-authored-procedural",
    encoder: {
      id: "toktx",
      version: "4.4.2",
      envOverride: "WORLD_ASSETS_V2_TOKTX_BIN",
    },
    localTranscoder: {
      basePath: "/assets/world-v2/basis/",
      dependency: "three",
      version: "0.185.1",
      art: false,
    },
    channels: {
      baseColor: "srgb",
      emissive: "srgb",
      normal: "linear-opengl-y-positive",
      orm: "linear-occlusion-roughness-metalness",
    },
  },
  families: catalogFamilies,
};

const catalogBuffer = Buffer.from(await stableJson(catalog));
await mkdir(dirname(catalogPath), { recursive: true });
await writeFile(catalogPath, catalogBuffer);

const manifest = {
  schema: "repository-worlds-v2/original-asset-manifest-v1",
  generatedAt: batchRecipe.authoredAt,
  deterministic: true,
  originalArtOnly: true,
  thirdPartyArt: false,
  networkInputs: [],
  license: batchRecipe.license,
  sources: sourceFiles,
  outputs: [
    ...outputRecords,
    {
      path: "public/assets/world-v2/catalog-v1.json",
      sha256: sha256(catalogBuffer),
      bytes: catalogBuffer.byteLength,
      kind: "catalog",
    },
  ],
  rebuild: {
    command:
      "node scripts/assets-v2/build-original-assets.mjs --recipe art/world-v2/batch-1-original-assets.recipe.json",
    runtimeDownloadsAllowed: false,
    blenderRuntimeAllowed: false,
    blenderAuthoringPolicy: "offline-background-only",
  },
};
await mkdir(dirname(manifestPath), { recursive: true });
await writeFile(manifestPath, await stableJson(manifest));

console.log(
  `Built ${catalogFamilies.length} original proof families (${catalogFamilies.length * 3} GLBs, ${outputRecords.reduce((sum, output) => sum + output.bytes, 0)} shipped bytes including KTX2).`,
);
