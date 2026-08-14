"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { WorldPlan } from "@/lib/kingdom/world-plan";

import {
  type PlannedWalkDetailInstance,
  type PlannedWalkDetailKind,
  type PlannedWalkDetailPlan,
} from "./planned-walk-detail-model";

export type PlannedWalkDetailProps = Readonly<{
  plan: WorldPlan;
  detail: PlannedWalkDetailPlan;
  reducedMotion: boolean;
  quality: "low" | "high";
}>;

type WindShader = THREE.WebGLProgramParametersWithUniforms &
  Readonly<{ uniforms: { uWalkDetailTime: THREE.IUniform<number> } }>;

const WALK_DETAIL_WIND_SHADERS = new WeakMap<THREE.Material, WindShader>();

const HIGH_QUALITY_LIMITS: Readonly<Record<PlannedWalkDetailKind, number>> = {
  grass: 400,
  flower: 180,
  reed: 65,
  stone: 140,
};

const LOW_QUALITY_LIMITS: Readonly<Record<PlannedWalkDetailKind, number>> = {
  grass: 200,
  flower: 90,
  reed: 33,
  stone: 72,
};

function createCrossedBladeGeometry(
  width: number,
  height: number,
  bend: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const windWeights: number[] = [];
  for (let plane = 0; plane < 2; plane += 1) {
    const angle = plane * (Math.PI / 2);
    const tangentX = Math.cos(angle) * width * 0.5;
    const tangentZ = Math.sin(angle) * width * 0.5;
    const bendX = Math.sin(angle + Math.PI * 0.25) * bend;
    const bendZ = Math.cos(angle + Math.PI * 0.25) * bend;
    const offset = positions.length / 3;
    positions.push(
      -tangentX,
      0,
      -tangentZ,
      tangentX,
      0,
      tangentZ,
      tangentX + bendX * 0.45,
      height * 0.54,
      tangentZ + bendZ * 0.45,
      -tangentX + bendX * 0.45,
      height * 0.54,
      -tangentZ + bendZ * 0.45,
      bendX,
      height,
      bendZ,
    );
    uvs.push(0, 0, 1, 0, 1, 0.54, 0, 0.54, 0.5, 1);
    windWeights.push(0, 0, 0.54, 0.54, 1);
    indices.push(
      offset,
      offset + 1,
      offset + 2,
      offset,
      offset + 2,
      offset + 3,
      offset + 3,
      offset + 2,
      offset + 4,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("walkDetailWindWeight", new THREE.Float32BufferAttribute(windWeights, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createOrganicBladeClusterGeometry(
  radius: number,
  width: number,
  height: number,
  lean: number,
): THREE.BufferGeometry {
  const bladeCount = 12;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const windWeights: number[] = [];

  // Vertex colors are linear multipliers over the biome-authored instance
  // color. Values stay near one so the crown gains depth without returning to
  // the near-black spike silhouettes this geometry replaces.
  const rootMultiplier = [0.78, 0.84, 0.73] as const;
  const shoulderMultiplier = [1.02, 1.06, 0.94] as const;
  const tipMultiplier = [1.16, 1.19, 1.05] as const;

  for (let blade = 0; blade < bladeCount; blade += 1) {
    const sequence = (blade + 0.5) / bladeCount;
    const radialDistance = radius * Math.sqrt(sequence) * (0.82 + (blade % 3) * 0.07);
    const radialAngle = blade * goldenAngle + (blade % 2 === 0 ? 0.17 : -0.11);
    const facingAngle = radialAngle * 1.73 + blade * 0.41;
    const bladeHeight = height * (0.58 + ((blade * 7) % 11) * 0.038);
    const bladeWidth = width * (0.72 + ((blade * 5) % 7) * 0.055);
    const shoulderSide = blade % 2 === 0 ? -1 : 1;
    const centerX = Math.cos(radialAngle) * radialDistance;
    const centerZ = Math.sin(radialAngle) * radialDistance;
    const tangentX = Math.cos(facingAngle);
    const tangentZ = Math.sin(facingAngle);
    const leanAngle = radialAngle + ((blade % 3) - 1) * 0.48;
    const leanX = Math.cos(leanAngle) * lean * (0.72 + sequence * 0.42);
    const leanZ = Math.sin(leanAngle) * lean * (0.72 + sequence * 0.42);
    const offset = positions.length / 3;

    positions.push(
      centerX - tangentX * bladeWidth * 0.5,
      0,
      centerZ - tangentZ * bladeWidth * 0.5,
      centerX + tangentX * bladeWidth * 0.5,
      0,
      centerZ + tangentZ * bladeWidth * 0.5,
      centerX + leanX * 0.46 + tangentX * bladeWidth * 0.16 * shoulderSide,
      bladeHeight * 0.58,
      centerZ + leanZ * 0.46 + tangentZ * bladeWidth * 0.16 * shoulderSide,
      centerX + leanX,
      bladeHeight,
      centerZ + leanZ,
    );
    indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
    uvs.push(0, 0, 1, 0, shoulderSide < 0 ? 0.18 : 0.82, 0.58, 0.5, 1);
    windWeights.push(0, 0, 0.5, 1);

    const bladeTint = 0.91 + (blade % 4) * 0.035;
    for (const color of [rootMultiplier, rootMultiplier, shoulderMultiplier, tipMultiplier]) {
      colors.push(color[0] * bladeTint, color[1] * bladeTint, color[2] * bladeTint);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("walkDetailWindWeight", new THREE.Float32BufferAttribute(windWeights, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createTuftGeometry(width: number, height: number, bend: number): THREE.BufferGeometry {
  const tuftOffsets = [
    [-0.2, 0, -0.11, -0.34],
    [0.17, 0, -0.08, 0.52],
    [-0.08, 0, 0.18, 1.04],
    [0.2, 0, 0.16, -1.22],
  ] as const;
  const blades = tuftOffsets.map(([x, y, z, rotation], index) => {
    const blade = createCrossedBladeGeometry(
      width * (index % 2 === 0 ? 0.92 : 1.08),
      height * (0.78 + index * 0.07),
      bend * (index % 2 === 0 ? 0.86 : 1.12),
    );
    blade.rotateY(rotation);
    blade.translate(x * width * 2.4, y, z * width * 2.4);
    return blade;
  });
  const geometry = mergeGeometries(blades, false);
  blades.forEach((blade) => blade.dispose());
  if (!geometry) throw new Error("Walk-detail tuft geometry could not be merged.");
  geometry.computeBoundingSphere();
  return geometry;
}

function addUniformColor(geometry: THREE.BufferGeometry, color: THREE.Color) {
  const values = new Float32Array(geometry.getAttribute("position").count * 3);
  for (let index = 0; index < values.length; index += 3) {
    values[index] = color.r;
    values[index + 1] = color.g;
    values[index + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(values, 3));
}

function createLegacyFlowerGeometry(): THREE.BufferGeometry {
  const flowerOffsets = [
    [-0.13, -0.05, 0.5, -0.3],
    [0.12, -0.02, 0.62, 0.45],
    [0.02, 0.14, 0.43, 1.1],
  ] as const;
  const parts: THREE.BufferGeometry[] = [];
  const stemColor = new THREE.Color("#3f6538");
  const petalColor = new THREE.Color("#ffffff");
  for (const [x, z, height, rotation] of flowerOffsets) {
    const stem = new THREE.CylinderGeometry(0.024, 0.036, height, 5, 1, false);
    stem.translate(x, height * 0.5, z);
    addUniformColor(stem, stemColor);
    const blossom = new THREE.CircleGeometry(0.135, 6);
    blossom.rotateX(-Math.PI / 2);
    blossom.rotateY(rotation);
    blossom.translate(x, height + 0.018, z);
    addUniformColor(blossom, petalColor);
    parts.push(stem, blossom);
  }
  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!geometry) {
    throw new Error("Walk-detail flower geometry could not be merged.");
  }
  geometry.computeBoundingSphere();
  return geometry;
}

function createOrganicFlowerGeometry(): THREE.BufferGeometry {
  const flowerOffsets = [
    [-0.19, -0.07, 0.46, -0.34],
    [0.18, -0.03, 0.64, 0.58],
    [0.015, 0.19, 0.53, 1.24],
  ] as const;
  const parts: THREE.BufferGeometry[] = [];
  const stemColor = new THREE.Color("#5f8248");
  const leafColor = new THREE.Color("#779657");
  const petalColor = new THREE.Color("#fff5ef");
  const pollenColor = new THREE.Color("#f5bd55");

  for (const [x, z, height, rotation] of flowerOffsets) {
    const stem = new THREE.CylinderGeometry(0.024, 0.038, height, 4, 1, false);
    stem.translate(x, height * 0.5, z);
    addUniformColor(stem, stemColor);

    for (const crossRotation of [0, Math.PI / 2]) {
      const blossom = new THREE.CircleGeometry(0.165, 4);
      const blossomPosition = blossom.getAttribute("position");
      const blossomColors = new Float32Array(blossomPosition.count * 3);
      for (let vertex = 0; vertex < blossomPosition.count; vertex += 1) {
        const distance = Math.hypot(blossomPosition.getX(vertex), blossomPosition.getY(vertex));
        const color = distance < 0.04 ? pollenColor : petalColor;
        const colorOffset = vertex * 3;
        blossomColors[colorOffset] = color.r;
        blossomColors[colorOffset + 1] = color.g;
        blossomColors[colorOffset + 2] = color.b;
      }
      blossom.setAttribute("color", new THREE.BufferAttribute(blossomColors, 3));
      blossom.rotateZ(rotation * 0.16);
      blossom.rotateY(rotation + crossRotation);
      blossom.translate(x, height, z);
      parts.push(blossom);
    }

    const leaf = new THREE.PlaneGeometry(0.16, 0.24, 1, 1);
    leaf.rotateZ(rotation > 0 ? -0.82 : 0.82);
    leaf.rotateY(rotation + 0.32);
    leaf.translate(x, height * 0.48, z);
    addUniformColor(leaf, leafColor);

    parts.push(stem, leaf);
  }

  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!geometry) throw new Error("Organic Walk-detail flower geometry could not be merged.");
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createStoneGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.DodecahedronGeometry(0.48, 1);
  geometry.scale(1, 0.54, 0.82);
  geometry.translate(0, 0.22, 0);
  geometry.computeBoundingSphere();
  return geometry;
}

export function createPlannedWalkDetailGeometry(
  kind: PlannedWalkDetailKind,
  quality: "low" | "high" = "high",
): THREE.BufferGeometry {
  // These are supporting ground-scale accents, not waist-high hero props.
  // Keeping their authored height below the camera's knee line preserves the
  // PBR terrain and buildings as the Walk view's dominant visual read.
  if (quality === "high" && kind === "grass") {
    return createOrganicBladeClusterGeometry(0.64, 0.17, 0.48, 0.2);
  }
  if (quality === "high" && kind === "reed") {
    return createOrganicBladeClusterGeometry(0.28, 0.075, 1.28, 0.12);
  }
  if (kind === "grass") return createTuftGeometry(0.18, 0.58, 0.07);
  if (kind === "reed") return createTuftGeometry(0.12, 1.28, 0.08);
  if (kind === "flower") {
    return quality === "high" ? createOrganicFlowerGeometry() : createLegacyFlowerGeometry();
  }
  return createStoneGeometry();
}

function addWind(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    const windShader = shader as WindShader;
    windShader.uniforms.uWalkDetailTime = { value: 0 };
    windShader.vertexShader = windShader.vertexShader.replace(
      "#include <common>",
      `#include <common>\nuniform float uWalkDetailTime;\nattribute float walkDetailWindWeight;`,
    );
    windShader.vertexShader = windShader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float walkDetailPhase = instanceMatrix[3][0] * 0.071 + instanceMatrix[3][2] * 0.053;
        float walkDetailHeight = walkDetailWindWeight;
        transformed.x += sin(uWalkDetailTime * 1.15 + walkDetailPhase) * 0.075 * walkDetailHeight;
        transformed.z += cos(uWalkDetailTime * 0.83 + walkDetailPhase * 1.37) * 0.052 * walkDetailHeight;
      #endif`,
    );
    WALK_DETAIL_WIND_SHADERS.set(material, windShader);
  };
  material.customProgramCacheKey = () => "repo-walk-detail-wind/v2";
}

function detailPalette(plan: WorldPlan, kind: PlannedWalkDetailKind): readonly THREE.Color[] {
  const terrain = plan.appearance.terrain;
  const foliage = plan.appearance.foliage;
  if (kind === "stone") {
    const base = new THREE.Color(terrain.escarpment);
    return [
      base.clone().multiplyScalar(0.72),
      base.clone().lerp(new THREE.Color(terrain.shore), 0.28),
      base.clone().multiplyScalar(1.04),
    ];
  }
  if (kind === "flower") {
    const first = new THREE.Color(foliage.flowering[0] ?? "#e6a7bc");
    const second = new THREE.Color(foliage.flowering[1] ?? "#f5d5df");
    return [
      first.clone().offsetHSL(-0.025, 0.08, 0.025),
      second.clone().lerp(first, 0.22).offsetHSL(0.025, 0.07, 0.015),
      first
        .clone()
        .lerp(new THREE.Color(plan.appearance.atmosphere.sunlight), 0.22)
        .offsetHSL(0.075, 0.1, 0.015),
    ];
  }
  if (kind === "reed") {
    const base = new THREE.Color(terrain.meadow).lerp(new THREE.Color("#7f9553"), 0.58);
    return [
      base.clone().offsetHSL(-0.01, 0.02, 0.035),
      base.clone().offsetHSL(0.008, -0.015, 0.085),
      base.clone().lerp(new THREE.Color(terrain.shore), 0.22).offsetHSL(0, 0, 0.055),
    ];
  }
  const base = new THREE.Color(terrain.meadow);
  const broadleaf = new THREE.Color(foliage.broadleaf[0] ?? "#557c42");
  const verdant = base.clone().lerp(broadleaf, 0.4);
  return [
    verdant.clone().offsetHSL(-0.012, 0.018, 0.04),
    verdant.clone().lerp(base, 0.28).offsetHSL(0.008, -0.02, 0.075),
    broadleaf.clone().lerp(base, 0.32).offsetHSL(0.016, -0.025, 0.09),
  ];
}

function setInstances(
  mesh: THREE.InstancedMesh,
  instances: ReadonlyArray<PlannedWalkDetailInstance>,
  palette: readonly THREE.Color[],
) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Euler();
  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index]!;
    position.set(instance.x, instance.y, instance.z);
    rotation.set(0, instance.rotation, 0);
    quaternion.setFromEuler(rotation);
    if (instance.kind === "stone") {
      scale.set(instance.scale * 1.2, instance.scale * 0.74, instance.scale);
    } else {
      scale.setScalar(instance.scale);
    }
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, palette[instance.colorVariant] ?? palette[0]!);
  }
  mesh.count = instances.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

function DetailBatch({
  kind,
  instances,
  plan,
  reducedMotion,
  quality,
}: Readonly<{
  kind: PlannedWalkDetailKind;
  instances: ReadonlyArray<PlannedWalkDetailInstance>;
  plan: WorldPlan;
  reducedMotion: boolean;
  quality: "low" | "high";
}>) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => createPlannedWalkDetailGeometry(kind, quality), [kind, quality]);
  const material = useMemo(() => {
    const next = new THREE.MeshStandardMaterial({
      // setColorAt stores the authored absolute palette color per instance.
      // Keep the material multiplier neutral so Three does not darken every
      // blade, flower, reed, and stone by multiplying the palette twice.
      color: "#ffffff",
      vertexColors:
        kind === "flower" || (quality === "high" && (kind === "grass" || kind === "reed")),
      roughness: kind === "flower" ? 0.7 : kind === "stone" ? 0.94 : 0.86,
      metalness: 0,
      side:
        kind === "grass" || kind === "reed" || kind === "flower"
          ? THREE.DoubleSide
          : THREE.FrontSide,
      flatShading: kind === "stone",
      dithering: quality === "high" && kind !== "stone",
    });
    if (kind === "grass" || kind === "reed") addWind(next);
    return next;
  }, [kind, quality]);
  const palette = useMemo(() => detailPalette(plan, kind), [kind, plan]);

  useLayoutEffect(() => {
    if (meshRef.current) setInstances(meshRef.current, instances, palette);
  }, [instances, palette]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame(({ clock }) => {
    const shader = WALK_DETAIL_WIND_SHADERS.get(material);
    if (reducedMotion || !shader) return;
    shader.uniforms.uWalkDetailTime.value = clock.getElapsedTime();
  });

  if (instances.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, instances.length]}
      castShadow={kind === "stone" || kind === "flower"}
      receiveShadow
      frustumCulled
      name={`walk-detail-${kind}`}
    />
  );
}

/** Close-range detail rendered only while the player is walking the world. */
export function PlannedWalkDetail({
  plan,
  detail,
  reducedMotion,
  quality,
}: PlannedWalkDetailProps) {
  const grouped = useMemo(() => {
    const limits = quality === "high" ? HIGH_QUALITY_LIMITS : LOW_QUALITY_LIMITS;
    return (Object.keys(limits) as PlannedWalkDetailKind[]).map((kind) => ({
      kind,
      instances: detail.instances
        .filter((instance) => instance.kind === kind)
        .slice(0, limits[kind]),
    }));
  }, [detail.instances, quality]);

  return (
    <group name="planned-walk-detail" userData={{ detailKey: detail.key }}>
      {grouped.map(({ kind, instances }) => (
        <DetailBatch
          key={kind}
          kind={kind}
          instances={instances}
          plan={plan}
          reducedMotion={reducedMotion}
          quality={quality}
        />
      ))}
    </group>
  );
}
