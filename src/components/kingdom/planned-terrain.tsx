"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { WorldPlan } from "@/lib/kingdom/world-plan";

import {
  buildPlannedTerrainGeometry,
  buildPlannedWaterGeometry,
  plannedTerrainMaterialCode,
  type PlannedGeometryData,
  type PlannedTerrainBuildOptions,
  type PlannedTerrainMaterialZone,
} from "./planned-terrain-model";

export type PlannedTerrainQuality = "low" | "high";

// Planned water indices wind toward -Y. BackSide makes that authored surface
// visible to the above-terrain camera without paying DoubleSide's fragment cost.
export const PLANNED_WATER_MATERIAL_SIDE = THREE.BackSide;

export type PlannedTerrainProps = Readonly<{
  plan: WorldPlan;
  quality?: PlannedTerrainQuality;
  receiveShadow?: boolean;
}>;

export type PlannedWatershedProps = Readonly<{
  plan: WorldPlan;
  quality?: PlannedTerrainQuality;
  reducedMotion?: boolean;
}>;

const QUALITY_OPTIONS: Readonly<Record<PlannedTerrainQuality, PlannedTerrainBuildOptions>> = {
  low: {
    segmentsX: 68,
    segmentsZ: 78,
    courseSegments: 42,
    courseCrossSegments: 3,
  },
  high: {
    segmentsX: 112,
    segmentsZ: 128,
    courseSegments: 76,
    courseCrossSegments: 5,
  },
};

function blendColor(first: string, second: string, amount: number): THREE.Color {
  return new THREE.Color(first).lerp(new THREE.Color(second), amount);
}

function terrainPalette(plan: WorldPlan): ReadonlyMap<number, THREE.Color> {
  const terrain = plan.appearance.terrain;
  const isSpring = plan.appearance.season === "spring";
  const lowMeadow = isSpring
    ? blendColor(terrain.lowland, "#9edb78", 0.46)
    : blendColor(terrain.lowland, plan.appearance.atmosphere.horizon, 0.1);
  const highMeadow = isSpring
    ? blendColor(terrain.meadow, "#c4e994", 0.52)
    : blendColor(terrain.meadow, plan.appearance.atmosphere.horizon, 0.08);
  const cliffStone = blendColor(terrain.escarpment, isSpring ? "#dfbba5" : "#b19a83", 0.7);
  const scree = cliffStone.clone().lerp(new THREE.Color(terrain.shore), 0.38);
  const shore = blendColor(terrain.shore, isSpring ? "#ead39f" : "#d0c19f", 0.42);
  const pathSoil = blendColor(shore.getStyle(), "#80664d", isSpring ? 0.42 : 0.48);
  const settlementSoil = highMeadow.clone().lerp(new THREE.Color("#947a57"), 0.28);
  const waterBed = blendColor(terrain.water, "#263f46", 0.58);
  const sideCliff = cliffStone.clone().lerp(new THREE.Color("#775d51"), 0.36);
  const palette = new Map<number, THREE.Color>();
  const assign = (material: PlannedTerrainMaterialZone, color: THREE.Color) => {
    palette.set(plannedTerrainMaterialCode(material), color);
  };
  assign("low-meadow", lowMeadow);
  assign("high-meadow", highMeadow);
  assign("path-soil", pathSoil);
  assign("settlement-soil", settlementSoil);
  assign("shore", shore);
  assign("river-bed", waterBed.clone().multiplyScalar(0.88));
  assign("lake-bed", waterBed);
  assign("cliff-stone", cliffStone);
  assign("scree", scree);
  assign("side-cliff", sideCliff);
  assign("outside", sideCliff.clone().lerp(new THREE.Color("#51473f"), 0.28));
  return palette;
}

function varyTerrainColor(
  color: THREE.Color,
  materialZone: number,
  x: number,
  y: number,
  z: number,
): THREE.Color {
  const lowMeadow = plannedTerrainMaterialCode("low-meadow");
  const highMeadow = plannedTerrainMaterialCode("high-meadow");
  const cliffStone = plannedTerrainMaterialCode("cliff-stone");
  const scree = plannedTerrainMaterialCode("scree");
  const sideCliff = plannedTerrainMaterialCode("side-cliff");
  const shore = plannedTerrainMaterialCode("shore");
  const pathSoil = plannedTerrainMaterialCode("path-soil");
  const settlementSoil = plannedTerrainMaterialCode("settlement-soil");
  const isGrass =
    materialZone === lowMeadow || materialZone === highMeadow || materialZone === settlementSoil;
  const isRock =
    materialZone === cliffStone || materialZone === scree || materialZone === sideCliff;
  const isEarth = materialZone === shore || materialZone === pathSoil;
  if (!isGrass && !isRock && !isEarth) return color;

  // Three broad-to-fine continuous frequencies break up large fields without
  // introducing a texture seam or exposing individual terrain triangles.
  const broad = Math.sin(x * 0.021 + z * 0.014) * 0.54 + Math.sin(z * 0.037 - x * 0.01) * 0.31;
  const middle = Math.sin(x * 0.081 - z * 0.053) * 0.26 + Math.cos(x * 0.047 + z * 0.096) * 0.19;
  const fine = Math.sin(x * 0.19 + z * 0.13) * 0.11;
  const field = broad + middle + fine;

  if (isGrass) {
    const heightLift = THREE.MathUtils.clamp(y * 0.000_7, -0.004, 0.016);
    return color.clone().offsetHSL(field * 0.009, field * 0.03, field * 0.052 + heightLift);
  }
  if (isRock) {
    // Broad vertical ribs and slower horizontal strata retain their value
    // contrast in the overview without keying variation to individual faces.
    const verticalRibs =
      Math.sin(x * 0.112 + z * 0.016) * 0.38 + Math.sin(x * 0.043 - z * 0.012) * 0.24;
    const horizontalStrata =
      Math.sin(y * 0.54 + x * 0.012) * 0.34 + Math.sin(y * 1.08 - z * 0.01) * 0.16;
    const strata = verticalRibs + horizontalStrata + field * 0.22;
    return color.clone().offsetHSL(strata * 0.01, -Math.abs(strata) * 0.012, strata * 0.09);
  }
  return color.clone().offsetHSL(field * 0.003, field * 0.014, field * 0.025);
}

function toBufferGeometry(
  data: PlannedGeometryData,
  palette: ReadonlyMap<number, THREE.Color> | null,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  if (palette) {
    const colors = new Float32Array(data.vertexCount * 3);
    const fallback = new THREE.Color("#80936a");
    for (let index = 0; index < data.vertexCount; index += 1) {
      const materialZone = data.materialZones[index] ?? -1;
      const baseColor = palette.get(materialZone) ?? fallback;
      const color = varyTerrainColor(
        baseColor,
        materialZone,
        data.positions[index * 3] ?? 0,
        data.positions[index * 3 + 1] ?? 0,
        data.positions[index * 3 + 2] ?? 0,
      );
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export type PlannedWaterSurfaceAttributes = Readonly<{
  edge: Float32Array;
  region: Float32Array;
  progress: Float32Array;
  firstLakeIndex: number;
}>;

export function createPlannedWaterSurfaceAttributes(
  data: PlannedGeometryData & Readonly<{ ranges: { courseTriangles: number } }>,
  crossSegments: number,
): PlannedWaterSurfaceAttributes {
  const edge = new Float32Array(data.vertexCount);
  const region = new Float32Array(data.vertexCount);
  const progress = new Float32Array(data.vertexCount);
  const firstLakeIndex = data.indices[data.ranges.courseTriangles * 3] ?? data.vertexCount;
  const courseRowWidth = crossSegments + 1;
  const courseRows = Math.max(1, Math.round(firstLakeIndex / courseRowWidth));

  for (let index = 0; index < firstLakeIndex; index += 1) {
    const column = index % courseRowWidth;
    const row = Math.floor(index / courseRowWidth);
    edge[index] = Math.abs(-1 + (column / crossSegments) * 2);
    progress[index] = courseRows <= 1 ? 0 : row / (courseRows - 1);
  }
  for (let index = firstLakeIndex; index < data.vertexCount; index += 1) {
    region[index] = 1;
    edge[index] = index === firstLakeIndex ? 0 : 1;
    progress[index] =
      index === firstLakeIndex
        ? 0
        : (index - firstLakeIndex - 1) / Math.max(1, data.vertexCount - firstLakeIndex - 2);
  }

  return { edge, region, progress, firstLakeIndex };
}

function addWaterSurfaceAttributes(
  geometry: THREE.BufferGeometry,
  data: PlannedGeometryData & Readonly<{ ranges: { courseTriangles: number } }>,
  crossSegments: number,
) {
  const attributes = createPlannedWaterSurfaceAttributes(data, crossSegments);

  geometry.setAttribute("kingdomWaterEdge", new THREE.BufferAttribute(attributes.edge, 1));
  geometry.setAttribute("kingdomWaterRegion", new THREE.BufferAttribute(attributes.region, 1));
  geometry.setAttribute("kingdomWaterProgress", new THREE.BufferAttribute(attributes.progress, 1));
}

function applyTerrainDetailShader(
  shader: THREE.WebGLProgramParametersWithUniforms,
  sideStrength: number,
) {
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>
varying vec3 vKingdomWorldPosition;
varying vec3 vKingdomWorldNormal;`,
    )
    .replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
vec4 kingdomTerrainWorldPosition = modelMatrix * vec4(transformed, 1.0);
vKingdomWorldPosition = kingdomTerrainWorldPosition.xyz;
vKingdomWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
varying vec3 vKingdomWorldPosition;
varying vec3 vKingdomWorldNormal;
float kingdomHash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}`,
    )
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
vec3 kingdomNormal = normalize(vKingdomWorldNormal);
float kingdomSlope = 1.0 - smoothstep(0.42, 0.88, abs(kingdomNormal.y));
float kingdomStrata = 0.5 + 0.5 * sin(
  vKingdomWorldPosition.y * 0.72 +
  sin(vKingdomWorldPosition.x * 0.06) * 0.72
);
float kingdomRibs = 0.5 + 0.5 * sin(
  vKingdomWorldPosition.x * 0.2 +
  vKingdomWorldPosition.z * 0.042 +
  sin(vKingdomWorldPosition.x * 0.071) * 1.45
);
float kingdomFineRibs = 0.5 + 0.5 * sin(
  vKingdomWorldPosition.x * 0.47 -
  vKingdomWorldPosition.z * 0.025
);
float kingdomRockValue = mix(
  0.84,
  1.12,
  kingdomRibs * 0.55 + kingdomFineRibs * 0.26 + kingdomStrata * 0.19
);
diffuseColor.rgb *= mix(vec3(1.0), vec3(kingdomRockValue), kingdomSlope * ${sideStrength.toFixed(2)});
float kingdomVein = smoothstep(0.57, 0.93, kingdomRibs * 0.72 + kingdomFineRibs * 0.28) * kingdomSlope;
vec3 kingdomVeinColor = vec3(0.58, 0.63, 0.57);
diffuseColor.rgb = mix(diffuseColor.rgb, kingdomVeinColor, kingdomVein * 0.27 * ${sideStrength.toFixed(2)});
float kingdomMeadow = smoothstep(0.82, 0.97, kingdomNormal.y);
float kingdomMeadowNoise = kingdomHash(floor(vKingdomWorldPosition.xz * 0.72));
float kingdomMeadowBroad = 0.5 + 0.5 * sin(vKingdomWorldPosition.x * 0.15 + sin(vKingdomWorldPosition.z * 0.11));
diffuseColor.rgb *= mix(
  vec3(1.0),
  vec3(0.9 + kingdomMeadowNoise * 0.14 + kingdomMeadowBroad * 0.045),
  kingdomMeadow * 0.78
);`,
    );
}

export type WaterShaderUniforms = Readonly<{
  time: { value: number };
  deepColor: { value: THREE.Color };
  shallowColor: { value: THREE.Color };
  foamColor: { value: THREE.Color };
  skyColor: { value: THREE.Color };
}>;

export function resolvePlannedWaterAnimationTime(
  elapsedTime: number,
  reducedMotion: boolean,
): number {
  return reducedMotion || !Number.isFinite(elapsedTime) ? 0 : Math.max(0, elapsedTime);
}

export function applyWaterDetailShader(
  shader: THREE.WebGLProgramParametersWithUniforms,
  uniforms: WaterShaderUniforms,
) {
  shader.uniforms.uKingdomWaterTime = uniforms.time;
  shader.uniforms.uKingdomWaterDeepColor = uniforms.deepColor;
  shader.uniforms.uKingdomWaterShallowColor = uniforms.shallowColor;
  shader.uniforms.uKingdomWaterFoamColor = uniforms.foamColor;
  shader.uniforms.uKingdomWaterSkyColor = uniforms.skyColor;
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>
uniform float uKingdomWaterTime;
attribute float kingdomWaterEdge;
attribute float kingdomWaterRegion;
attribute float kingdomWaterProgress;
varying vec3 vKingdomWaterWorldPosition;
varying vec3 vKingdomWaterNormalView;
varying float vKingdomWaterEdge;
varying float vKingdomWaterRegion;
varying float vKingdomWaterProgress;`,
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
float kingdomRiverWeight = 1.0 - kingdomWaterRegion;
float kingdomShoreDamping = 1.0 - smoothstep(0.72, 1.0, kingdomWaterEdge) * 0.76;
float kingdomWaveAmplitude = mix(0.032, 0.058, kingdomWaterRegion) * kingdomShoreDamping;
float kingdomPhaseA = position.x * 0.24 + position.z * 0.075 + uKingdomWaterTime * 0.58;
float kingdomPhaseB = position.z * 0.36 - position.x * 0.095 - uKingdomWaterTime * 0.41;
float kingdomPhaseC = (position.x + position.z) * 0.64 + uKingdomWaterTime * 0.77;
float kingdomCurrent = sin(kingdomWaterProgress * 74.0 - uKingdomWaterTime * 1.65) * kingdomRiverWeight;
float kingdomWaterWave = (
  sin(kingdomPhaseA) * 0.52 +
  sin(kingdomPhaseB) * 0.3 +
  sin(kingdomPhaseC) * 0.18
) * kingdomWaveAmplitude + kingdomCurrent * 0.01;
float kingdomDerivativeX = (
  cos(kingdomPhaseA) * 0.24 * 0.52 +
  cos(kingdomPhaseB) * -0.095 * 0.3 +
  cos(kingdomPhaseC) * 0.64 * 0.18
) * kingdomWaveAmplitude;
float kingdomDerivativeZ = (
  cos(kingdomPhaseA) * 0.075 * 0.52 +
  cos(kingdomPhaseB) * 0.36 * 0.3 +
  cos(kingdomPhaseC) * 0.64 * 0.18
) * kingdomWaveAmplitude;
transformed.y += kingdomWaterWave;
vKingdomWaterNormalView = normalize(normalMatrix * vec3(-kingdomDerivativeX, 1.0, -kingdomDerivativeZ));
vKingdomWaterEdge = kingdomWaterEdge;
vKingdomWaterRegion = kingdomWaterRegion;
vKingdomWaterProgress = kingdomWaterProgress;`,
    )
    .replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
vec4 kingdomWaterWorldPosition = modelMatrix * vec4(transformed, 1.0);
vKingdomWaterWorldPosition = kingdomWaterWorldPosition.xyz;`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
uniform float uKingdomWaterTime;
uniform vec3 uKingdomWaterDeepColor;
uniform vec3 uKingdomWaterShallowColor;
uniform vec3 uKingdomWaterFoamColor;
uniform vec3 uKingdomWaterSkyColor;
varying vec3 vKingdomWaterWorldPosition;
varying vec3 vKingdomWaterNormalView;
varying float vKingdomWaterEdge;
varying float vKingdomWaterRegion;
varying float vKingdomWaterProgress;
float kingdomWaterNoise(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}
vec2 kingdomWaterRippleSlope(vec2 point, float region, float edge, float time) {
  float phaseA = point.x * 0.72 + point.y * 0.24 + time * 0.72;
  float phaseB = point.y * 0.96 - point.x * 0.31 - time * 0.48;
  float phaseC = (point.x + point.y) * 1.36 + time * 0.93;
  float damping = 1.0 - smoothstep(0.82, 1.0, edge) * 0.52;
  float strength = mix(0.038, 0.054, region) * damping;
  return vec2(
    cos(phaseA) * 0.72 * 0.48 + cos(phaseB) * -0.31 * 0.32 + cos(phaseC) * 1.36 * 0.2,
    cos(phaseA) * 0.24 * 0.48 + cos(phaseB) * 0.96 * 0.32 + cos(phaseC) * 1.36 * 0.2
  ) * strength;
}`,
    )
    .replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
vec2 kingdomWaterSlope = kingdomWaterRippleSlope(
  vKingdomWaterWorldPosition.xz,
  vKingdomWaterRegion,
  vKingdomWaterEdge,
  uKingdomWaterTime
);
vec3 kingdomWaterDetailNormalView = normalize(
  mat3(viewMatrix) * vec3(-kingdomWaterSlope.x, 1.0, -kingdomWaterSlope.y)
);
normal = normalize(mix(vKingdomWaterNormalView, kingdomWaterDetailNormalView, 0.88));`,
    )
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
float kingdomWaterDepth = pow(clamp(1.0 - vKingdomWaterEdge, 0.0, 1.0), 0.68);
kingdomWaterDepth *= mix(0.78, 0.94, vKingdomWaterRegion);
float kingdomColorDepth = kingdomWaterDepth * 0.98;
vec3 kingdomWaterBase = mix(
  uKingdomWaterShallowColor,
  uKingdomWaterDeepColor,
  kingdomColorDepth
);
float kingdomRiverCurrent = 0.5 + 0.5 * sin(
  vKingdomWaterProgress * 92.0 - uKingdomWaterTime * 2.25 +
  vKingdomWaterEdge * 5.2 + sin(vKingdomWaterWorldPosition.x * 0.24) * 1.35
);
float kingdomRiverThread = 0.5 + 0.5 * sin(
  vKingdomWaterProgress * 137.0 - uKingdomWaterTime * 2.82 -
  vKingdomWaterEdge * 8.4
);
float kingdomLakeRippleA = 0.5 + 0.5 * sin(
  vKingdomWaterWorldPosition.x * 0.78 +
  vKingdomWaterWorldPosition.z * 0.26 +
  uKingdomWaterTime * 0.63
);
float kingdomLakeRippleB = 0.5 + 0.5 * sin(
  vKingdomWaterWorldPosition.z * 1.04 -
  vKingdomWaterWorldPosition.x * 0.34 -
  uKingdomWaterTime * 0.49
);
float kingdomLakeRippleC = 0.5 + 0.5 * sin(
  (vKingdomWaterWorldPosition.x + vKingdomWaterWorldPosition.z) * 1.42 +
  uKingdomWaterTime * 0.82
);
float kingdomLakeHighlight = smoothstep(
  0.74,
  0.96,
  kingdomLakeRippleA * 0.68 + kingdomLakeRippleB * 0.22 + kingdomLakeRippleC * 0.1
) * vKingdomWaterRegion;
float kingdomCurrentHighlight = smoothstep(
  0.66,
  0.94,
  kingdomRiverCurrent * 0.66 + kingdomRiverThread * 0.34
) * (1.0 - vKingdomWaterRegion);
vec2 kingdomWaterFresnelSlope = kingdomWaterRippleSlope(
  vKingdomWaterWorldPosition.xz,
  vKingdomWaterRegion,
  vKingdomWaterEdge,
  uKingdomWaterTime
);
vec3 kingdomWaterFresnelNormalView = normalize(
  mat3(viewMatrix) * vec3(-kingdomWaterFresnelSlope.x, 1.0, -kingdomWaterFresnelSlope.y)
);
float kingdomFresnel = pow(
  1.0 - clamp(dot(normalize(vViewPosition), kingdomWaterFresnelNormalView), 0.0, 1.0),
  1.9
);
float kingdomShoreNoise = kingdomWaterNoise(floor(vKingdomWaterWorldPosition.xz * 1.18));
float kingdomShorePulse = 0.5 + 0.5 * sin(
  vKingdomWaterProgress * 88.0 +
  vKingdomWaterWorldPosition.x * 0.42 -
  vKingdomWaterWorldPosition.z * 0.31 +
  uKingdomWaterTime * 0.31
);
float kingdomFoamThreshold = 0.96 + (kingdomShoreNoise - 0.5) * 0.014;
float kingdomFoamBand = smoothstep(kingdomFoamThreshold, kingdomFoamThreshold + 0.025, vKingdomWaterEdge);
float kingdomFoamBreakup = smoothstep(
  0.3,
  0.72,
  kingdomShoreNoise * 0.48 + kingdomShorePulse * 0.52
);
float kingdomFoam = kingdomFoamBand * mix(0.16, 0.74, kingdomFoamBreakup);
kingdomWaterBase = mix(kingdomWaterBase, uKingdomWaterSkyColor, kingdomFresnel * 0.4);
kingdomWaterBase = mix(
  kingdomWaterBase,
  uKingdomWaterShallowColor,
  kingdomLakeHighlight * 0.2 + kingdomCurrentHighlight * 0.28
);
kingdomWaterBase = mix(kingdomWaterBase, uKingdomWaterFoamColor, kingdomFoam * 0.76);
diffuseColor.rgb = kingdomWaterBase;
diffuseColor.a = 1.0;`,
    )
    .replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
totalEmissiveRadiance += kingdomWaterBase * 0.07;
totalEmissiveRadiance += uKingdomWaterFoamColor * kingdomFoam * 0.22;`,
    )
    .replace(
      "#include <opaque_fragment>",
      `outgoingLight = mix(outgoingLight, kingdomWaterBase, 0.52);
outgoingLight += uKingdomWaterFoamColor * kingdomFoam * 0.06;
#include <opaque_fragment>`,
    );
}

export function PlannedTerrain({
  plan,
  quality = "high",
  receiveShadow = true,
}: PlannedTerrainProps) {
  const terrain = useMemo(
    () => buildPlannedTerrainGeometry(plan, QUALITY_OPTIONS[quality]),
    [plan, quality],
  );
  const palette = useMemo(() => terrainPalette(plan), [plan]);
  const surfaceGeometry = useMemo(
    () => toBufferGeometry(terrain.surface, palette),
    [palette, terrain.surface],
  );
  const sideGeometry = useMemo(
    () => toBufferGeometry(terrain.sideCliffs, palette),
    [palette, terrain.sideCliffs],
  );
  const isletGeometry = useMemo(
    () => toBufferGeometry(terrain.islet, palette),
    [palette, terrain.islet],
  );

  useEffect(
    () => () => {
      surfaceGeometry.dispose();
      sideGeometry.dispose();
      isletGeometry.dispose();
    },
    [isletGeometry, sideGeometry, surfaceGeometry],
  );

  return (
    <group name="planned-global-terrain">
      <mesh geometry={surfaceGeometry} receiveShadow={receiveShadow} castShadow={false}>
        <meshStandardMaterial
          vertexColors
          roughness={0.98}
          metalness={0}
          envMapIntensity={0.34}
          dithering
          onBeforeCompile={(shader) => applyTerrainDetailShader(shader, 0.9)}
          customProgramCacheKey={() => "planned-terrain-surface-detail-v1"}
          side={THREE.FrontSide}
        />
      </mesh>
      <mesh geometry={sideGeometry} receiveShadow={receiveShadow} castShadow={false}>
        <meshStandardMaterial
          vertexColors
          roughness={0.97}
          metalness={0}
          envMapIntensity={0.22}
          dithering
          onBeforeCompile={(shader) => applyTerrainDetailShader(shader, 1.18)}
          customProgramCacheKey={() => "planned-terrain-side-detail-v1"}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={isletGeometry} receiveShadow={receiveShadow} castShadow={false}>
        <meshStandardMaterial
          vertexColors
          roughness={0.94}
          metalness={0}
          envMapIntensity={0.42}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

export function PlannedWatershed({
  plan,
  quality = "high",
  reducedMotion = false,
}: PlannedWatershedProps) {
  const water = useMemo(
    () => buildPlannedWaterGeometry(plan, QUALITY_OPTIONS[quality]),
    [plan, quality],
  );
  const geometry = useMemo(() => {
    const nextGeometry = toBufferGeometry(water, null);
    addWaterSurfaceAttributes(
      nextGeometry,
      water,
      QUALITY_OPTIONS[quality].courseCrossSegments ?? 4,
    );
    return nextGeometry;
  }, [quality, water]);

  const waterColors = useMemo(() => {
    const source = new THREE.Color(plan.appearance.terrain.water);
    const spring = plan.appearance.season === "spring";
    return {
      deep: source
        .clone()
        .lerp(new THREE.Color(spring ? "#357f99" : "#477f8e"), spring ? 0.8 : 0.34),
      shallow: source
        .clone()
        .lerp(new THREE.Color(spring ? "#8ccad2" : "#84c4cc"), spring ? 0.82 : 0.68),
      foam: new THREE.Color(plan.appearance.atmosphere.horizon).lerp(
        new THREE.Color("#f5fbef"),
        0.68,
      ),
      sky: new THREE.Color(plan.appearance.atmosphere.sky).lerp(
        new THREE.Color(plan.appearance.atmosphere.horizon),
        0.42,
      ),
    };
  }, [plan]);
  const uniforms = useRef<WaterShaderUniforms>({
    time: { value: 0 },
    deepColor: { value: waterColors.deep.clone() },
    shallowColor: { value: waterColors.shallow.clone() },
    foamColor: { value: waterColors.foam.clone() },
    skyColor: { value: waterColors.sky.clone() },
  });

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    uniforms.current.deepColor.value.copy(waterColors.deep);
    uniforms.current.shallowColor.value.copy(waterColors.shallow);
    uniforms.current.foamColor.value.copy(waterColors.foam);
    uniforms.current.skyColor.value.copy(waterColors.sky);
    uniforms.current.time.value = resolvePlannedWaterAnimationTime(
      uniforms.current.time.value,
      reducedMotion,
    );
  }, [reducedMotion, waterColors]);
  useFrame(({ clock }) => {
    uniforms.current.time.value = resolvePlannedWaterAnimationTime(
      clock.elapsedTime,
      reducedMotion,
    );
  });

  return (
    <mesh name="planned-watershed" geometry={geometry} receiveShadow={false} renderOrder={4}>
      <meshPhysicalMaterial
        color="#ffffff"
        roughness={0.24}
        metalness={0.02}
        clearcoat={1}
        clearcoatRoughness={0.12}
        sheen={0.12}
        sheenColor={waterColors.sky}
        ior={1.333}
        reflectivity={0.62}
        specularIntensity={0.74}
        specularColor={waterColors.foam}
        transparent={false}
        depthWrite
        dithering
        onBeforeCompile={(shader) => applyWaterDetailShader(shader, uniforms.current)}
        customProgramCacheKey={() => "planned-watershed-depth-flow-foam-v3"}
        side={PLANNED_WATER_MATERIAL_SIDE}
      />
    </mesh>
  );
}
