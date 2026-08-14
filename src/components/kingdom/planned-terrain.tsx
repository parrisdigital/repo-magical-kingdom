"use client";

import { useFrame, useThree } from "@react-three/fiber";
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
  type PlannedWaterGeometry,
} from "./planned-terrain-model";

export type PlannedTerrainQuality = "low" | "high";

export const PLANNED_TERRAIN_LAYER_ATTRIBUTE = "kingdomTerrainLayers";
export const PLANNED_TERRAIN_PROGRAM_CACHE_KEY = "planned-terrain-layered-pbr-v5";

export type PlannedTerrainMaterialSurface = "surface" | "side" | "islet";

export function resolvePlannedTerrainProgramCacheKey(
  quality: PlannedTerrainQuality,
  surface: PlannedTerrainMaterialSurface,
) {
  return `${PLANNED_TERRAIN_PROGRAM_CACHE_KEY}:${quality}:${surface}`;
}

type PlannedTerrainAtlasKind = "albedo" | "normal" | "roughness";

export type PlannedTerrainAtlasContract = Readonly<{
  width: number;
  height: number;
  cellSize: number;
  gutter: number;
  usableTileSize: number;
  bilinearSafeMipmapLevel: number;
  decodedBytesWithMipmaps: number;
  urls: Readonly<Record<PlannedTerrainAtlasKind, string>>;
}>;

export const PLANNED_TERRAIN_ATLAS_SLOTS = Object.freeze({
  grass: 0,
  soil: 1,
  rock: 2,
  shore: 3,
});

export const PLANNED_TERRAIN_ATLAS_CONTRACTS: Readonly<
  Record<PlannedTerrainQuality, PlannedTerrainAtlasContract>
> = Object.freeze({
  low: Object.freeze({
    width: 2_048,
    height: 512,
    cellSize: 512,
    gutter: 32,
    usableTileSize: 448,
    bilinearSafeMipmapLevel: 6,
    decodedBytesWithMipmaps: 16 * 1_024 * 1_024,
    urls: Object.freeze({
      albedo: "/assets/world/terrain/polyhaven/terrain-albedo-low.webp",
      normal: "/assets/world/terrain/polyhaven/terrain-normal-gl-low.webp",
      roughness: "/assets/world/terrain/polyhaven/terrain-roughness-low.webp",
    }),
  }),
  high: Object.freeze({
    width: 4_096,
    height: 1_024,
    cellSize: 1_024,
    gutter: 64,
    usableTileSize: 896,
    bilinearSafeMipmapLevel: 7,
    decodedBytesWithMipmaps: 64 * 1_024 * 1_024,
    urls: Object.freeze({
      albedo: "/assets/world/terrain/polyhaven/terrain-albedo.webp",
      normal: "/assets/world/terrain/polyhaven/terrain-normal-gl.webp",
      roughness: "/assets/world/terrain/polyhaven/terrain-roughness.webp",
    }),
  }),
});

export type PlannedTerrainAtlasUvParameters = Readonly<{
  slotSpan: number;
  gutterU: number;
  gutterV: number;
  usableU: number;
  usableV: number;
}>;

export function resolvePlannedTerrainAtlasUvParameters(
  contract: PlannedTerrainAtlasContract,
): PlannedTerrainAtlasUvParameters {
  return Object.freeze({
    slotSpan: contract.cellSize / contract.width,
    gutterU: contract.gutter / contract.width,
    gutterV: contract.gutter / contract.height,
    usableU: contract.usableTileSize / contract.width,
    usableV: contract.usableTileSize / contract.height,
  });
}

export const PLANNED_TERRAIN_ATLAS_UV_PARAMETERS = resolvePlannedTerrainAtlasUvParameters(
  PLANNED_TERRAIN_ATLAS_CONTRACTS.high,
);

export type PlannedTerrainTopLayer = "grass" | "soil" | "shore";

export type PlannedTerrainTopProjection = Readonly<{
  tileMeters: number;
  rotationAxis: readonly [number, number];
}>;

export const PLANNED_TERRAIN_TOP_PROJECTIONS: Readonly<
  Record<PlannedTerrainTopLayer, PlannedTerrainTopProjection>
> = Object.freeze({
  grass: Object.freeze({
    tileMeters: 2,
    rotationAxis: Object.freeze([0.939_693, 0.342_02] as const),
  }),
  soil: Object.freeze({
    tileMeters: 2.07,
    rotationAxis: Object.freeze([0.819_152, -0.573_576] as const),
  }),
  shore: Object.freeze({
    tileMeters: 15,
    rotationAxis: Object.freeze([0.965_926, 0.258_819] as const),
  }),
});

/** Maps an encoded tangent normal onto the same rotated flat XZ basis as its layer UV. */
export function resolvePlannedTerrainFlatNormalDirection(
  layer: PlannedTerrainTopLayer,
  encodedNormal: readonly [number, number, number],
): Readonly<{ x: number; y: number; z: number }> {
  const { rotationAxis } = PLANNED_TERRAIN_TOP_PROJECTIONS[layer];
  const tangentX = encodedNormal[0] * 2 - 1;
  const tangentY = encodedNormal[1] * 2 - 1;
  const tangentZ = encodedNormal[2] * 2 - 1;
  const x = tangentX * rotationAxis[0] - tangentY * rotationAxis[1];
  const y = tangentZ;
  const z = tangentX * rotationAxis[1] + tangentY * rotationAxis[0];
  const length = Math.max(Math.hypot(x, y, z), Number.EPSILON);
  return Object.freeze({ x: x / length, y: y / length, z: z / length });
}

export const PLANNED_TERRAIN_SHADER_TEXTURE_READ_BUDGET = Object.freeze({
  low: 12,
  high: 24,
});

export const PLANNED_TERRAIN_SHADER_HASH_SIN_BUDGET = Object.freeze({
  low: 8,
  high: 80,
});

// Planned water indices wind toward -Y. BackSide makes that authored surface
// visible to the above-terrain camera without paying DoubleSide's fragment cost.
export const PLANNED_WATER_MATERIAL_SIDE = THREE.BackSide;

export const PLANNED_WATER_MATERIAL_CONTRACT = Object.freeze({
  transparent: false,
  opacity: 1,
  depthWrite: true,
  side: PLANNED_WATER_MATERIAL_SIDE,
});

export const PLANNED_WATER_PROGRAM_CACHE_KEY = "planned-watershed-directional-water-v5";

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

export const PLANNED_TERRAIN_QUALITY_OPTIONS: Readonly<
  Record<PlannedTerrainQuality, PlannedTerrainBuildOptions>
> = {
  low: {
    segmentsX: 68,
    segmentsZ: 78,
    courseSegments: 42,
    courseCrossSegments: 3,
    lakeRingCount: 6,
  },
  high: {
    segmentsX: 112,
    segmentsZ: 128,
    courseSegments: 76,
    courseCrossSegments: 5,
    lakeRingCount: 10,
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

const TERRAIN_LAYER_BYTES_BY_ZONE: Readonly<
  Record<number, readonly [number, number, number, number]>
> = Object.freeze({
  [plannedTerrainMaterialCode("low-meadow")]: [255, 0, 0, 0],
  [plannedTerrainMaterialCode("high-meadow")]: [255, 0, 0, 0],
  [plannedTerrainMaterialCode("path-soil")]: [0, 255, 0, 0],
  [plannedTerrainMaterialCode("settlement-soil")]: [84, 171, 0, 0],
  [plannedTerrainMaterialCode("shore")]: [0, 0, 0, 255],
  [plannedTerrainMaterialCode("river-bed")]: [0, 160, 0, 95],
  [plannedTerrainMaterialCode("lake-bed")]: [0, 144, 0, 111],
  [plannedTerrainMaterialCode("cliff-stone")]: [0, 0, 255, 0],
  [plannedTerrainMaterialCode("scree")]: [0, 45, 210, 0],
  [plannedTerrainMaterialCode("side-cliff")]: [0, 0, 255, 0],
  [plannedTerrainMaterialCode("outside")]: [0, 0, 255, 0],
});

const FALLBACK_TERRAIN_LAYER_BYTES = [255, 0, 0, 0] as const;

/**
 * Encodes authored material semantics as normalized RGBA weights. Uint8 keeps
 * the extra terrain attribute to four bytes per vertex while interpolation on
 * the GPU still produces soft material boundaries.
 */
export function createPlannedTerrainLayerWeights(data: PlannedGeometryData): Uint8Array {
  const weights = new Uint8Array(data.vertexCount * 4);
  for (let index = 0; index < data.vertexCount; index += 1) {
    const layerBytes =
      TERRAIN_LAYER_BYTES_BY_ZONE[data.materialZones[index] ?? -1] ?? FALLBACK_TERRAIN_LAYER_BYTES;
    const offset = index * 4;
    weights[offset] = layerBytes[0];
    weights[offset + 1] = layerBytes[1];
    weights[offset + 2] = layerBytes[2];
    weights[offset + 3] = layerBytes[3];
  }
  return weights;
}

export function configurePlannedTerrainAtlasTexture(
  texture: THREE.Texture,
  kind: PlannedTerrainAtlasKind,
  quality: PlannedTerrainQuality,
): THREE.Texture {
  texture.name = `planned-terrain-${quality}-${kind}-atlas`;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = quality === "high" ? 8 : 4;
  texture.colorSpace = kind === "albedo" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return texture;
}

type DisposableTerrainResource = Readonly<{ dispose: () => void }>;

export function disposePlannedTerrainResources(
  resources: ReadonlyArray<DisposableTerrainResource>,
) {
  for (const resource of resources) resource.dispose();
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
    geometry.setAttribute(
      PLANNED_TERRAIN_LAYER_ATTRIBUTE,
      new THREE.BufferAttribute(createPlannedTerrainLayerWeights(data), 4, true),
    );
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
  data: PlannedWaterGeometry,
): PlannedWaterSurfaceAttributes {
  return {
    edge: data.surfaceAttributes.edge.slice(),
    region: data.surfaceAttributes.region.slice(),
    progress: data.surfaceAttributes.progress.slice(),
    firstLakeIndex: data.ranges.lakeFirstVertex,
  };
}

function addWaterSurfaceAttributes(geometry: THREE.BufferGeometry, data: PlannedWaterGeometry) {
  const attributes = createPlannedWaterSurfaceAttributes(data);

  geometry.setAttribute("kingdomWaterEdge", new THREE.BufferAttribute(attributes.edge, 1));
  geometry.setAttribute("kingdomWaterRegion", new THREE.BufferAttribute(attributes.region, 1));
  geometry.setAttribute("kingdomWaterProgress", new THREE.BufferAttribute(attributes.progress, 1));
}

export type TerrainShaderUniforms = Readonly<{
  albedoAtlas: { value: THREE.Texture };
  normalAtlas: { value: THREE.Texture };
  roughnessAtlas: { value: THREE.Texture };
}>;

function createFallbackTerrainAtlas(kind: PlannedTerrainAtlasKind): THREE.DataTexture {
  const width = 16;
  const height = 4;
  const pixels = new Uint8Array(width * height * 3);
  const neutral =
    kind === "albedo"
      ? ([255, 255, 255] as const)
      : kind === "normal"
        ? ([128, 128, 255] as const)
        : ([235, 235, 235] as const);
  for (let offset = 0; offset < pixels.length; offset += 3) {
    pixels[offset] = neutral[0];
    pixels[offset + 1] = neutral[1];
    pixels[offset + 2] = neutral[2];
  }
  const texture = new THREE.DataTexture(
    pixels,
    width,
    height,
    THREE.RGBFormat,
    THREE.UnsignedByteType,
  );
  configurePlannedTerrainAtlasTexture(texture, kind, "low");
  texture.name = `planned-terrain-fallback-${kind}-atlas`;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

// These tiny neutral textures are module-lifetime fallbacks. They keep the
// standard-material program valid during image decoding and on asset failure,
// including demand-frame/reduced-motion sessions.
const FALLBACK_TERRAIN_ATLASES = Object.freeze({
  albedo: createFallbackTerrainAtlas("albedo"),
  normal: createFallbackTerrainAtlas("normal"),
  roughness: createFallbackTerrainAtlas("roughness"),
});

const FALLBACK_TERRAIN_SHADER_UNIFORMS: TerrainShaderUniforms = Object.freeze({
  albedoAtlas: { value: FALLBACK_TERRAIN_ATLASES.albedo },
  normalAtlas: { value: FALLBACK_TERRAIN_ATLASES.normal },
  roughnessAtlas: { value: FALLBACK_TERRAIN_ATLASES.roughness },
});

function usePlannedTerrainAtlasUniforms(quality: PlannedTerrainQuality): TerrainShaderUniforms {
  const invalidate = useThree((state) => state.invalidate);
  const uniforms = useMemo<TerrainShaderUniforms>(
    () => ({
      albedoAtlas: { value: FALLBACK_TERRAIN_ATLASES.albedo },
      normalAtlas: { value: FALLBACK_TERRAIN_ATLASES.normal },
      roughnessAtlas: { value: FALLBACK_TERRAIN_ATLASES.roughness },
    }),
    [],
  );

  useEffect(() => {
    const contract = PLANNED_TERRAIN_ATLAS_CONTRACTS[quality];
    const imageLoader = new THREE.ImageLoader();
    let active = true;
    const loadedTextures = {
      albedo: configurePlannedTerrainAtlasTexture(new THREE.Texture(), "albedo", quality),
      normal: configurePlannedTerrainAtlasTexture(new THREE.Texture(), "normal", quality),
      roughness: configurePlannedTerrainAtlasTexture(new THREE.Texture(), "roughness", quality),
    };
    const uniformByKind = {
      albedo: uniforms.albedoAtlas,
      normal: uniforms.normalAtlas,
      roughness: uniforms.roughnessAtlas,
    };

    for (const kind of ["albedo", "normal", "roughness"] as const) {
      imageLoader.load(
        contract.urls[kind],
        (image) => {
          if (!active) return;
          loadedTextures[kind].image = image;
          loadedTextures[kind].needsUpdate = true;
          uniformByKind[kind].value = loadedTextures[kind];
          invalidate();
        },
        undefined,
        () => {
          // A neutral sampler is intentionally retained if an optional detail
          // atlas cannot load; terrain geometry and semantic colors still render.
        },
      );
    }

    return () => {
      active = false;
      uniforms.albedoAtlas.value = FALLBACK_TERRAIN_ATLASES.albedo;
      uniforms.normalAtlas.value = FALLBACK_TERRAIN_ATLASES.normal;
      uniforms.roughnessAtlas.value = FALLBACK_TERRAIN_ATLASES.roughness;
      disposePlannedTerrainResources(Object.values(loadedTextures));
    };
  }, [invalidate, quality, uniforms]);

  return uniforms;
}

export function applyTerrainDetailShader(
  shader: THREE.WebGLProgramParametersWithUniforms,
  sideStrength: number,
  uniforms?: TerrainShaderUniforms,
  quality: PlannedTerrainQuality = "high",
) {
  const terrainUniforms = uniforms ?? FALLBACK_TERRAIN_SHADER_UNIFORMS;
  const boundedSideStrength = THREE.MathUtils.clamp(sideStrength, 0, 1.5).toFixed(3);
  const atlasUv = PLANNED_TERRAIN_ATLAS_UV_PARAMETERS;
  const atlasSlotSpan = atlasUv.slotSpan.toFixed(8);
  const atlasGutterU = atlasUv.gutterU.toFixed(8);
  const atlasGutterV = atlasUv.gutterV.toFixed(8);
  const atlasUsableU = atlasUv.usableU.toFixed(8);
  const atlasUsableV = atlasUv.usableV.toFixed(8);
  const grassProjection = PLANNED_TERRAIN_TOP_PROJECTIONS.grass;
  const soilProjection = PLANNED_TERRAIN_TOP_PROJECTIONS.soil;
  const shoreProjection = PLANNED_TERRAIN_TOP_PROJECTIONS.shore;
  const grassScale = (1 / grassProjection.tileMeters).toFixed(6);
  const soilScale = (1 / soilProjection.tileMeters).toFixed(6);
  const shoreScale = (1 / shoreProjection.tileMeters).toFixed(6);
  const grassAxis = grassProjection.rotationAxis.map((value) => value.toFixed(6)).join(", ");
  const soilAxis = soilProjection.rotationAxis.map((value) => value.toFixed(6)).join(", ");
  const shoreAxis = shoreProjection.rotationAxis.map((value) => value.toFixed(6)).join(", ");
  const fbmShader =
    quality === "high"
      ? `float kingdomTerrainFbm(vec2 point) {
  float value = kingdomTerrainValueNoise(point) * 0.5333;
  value += kingdomTerrainValueNoise(point * 2.03 + vec2(9.2, -4.7)) * 0.2667;
  value += kingdomTerrainValueNoise(point * 4.11 + vec2(-5.1, 13.8)) * 0.1333;
  value += kingdomTerrainValueNoise(point * 8.23 + vec2(17.4, 7.9)) * 0.0667;
  return value;
}`
      : `float kingdomTerrainFbm(vec2 point) {
  float value = kingdomTerrainValueNoise(point) * 0.6667;
  value += kingdomTerrainValueNoise(point * 2.03 + vec2(9.2, -4.7)) * 0.3333;
  return value;
}`;
  const layeredAtlasShader =
    quality === "high"
      ? `vec4 kingdomSampleLayeredTerrainAtlas(
  sampler2D atlas,
  vec3 worldPosition,
  vec3 worldNormal,
  vec4 layerWeights,
  float detailScale
) {
  vec3 projectionWeights = kingdomTerrainProjectionWeights(worldNormal);
  vec2 grassAxis = vec2(${grassAxis});
  vec2 soilAxis = vec2(${soilAxis});
  vec2 shoreAxis = vec2(${shoreAxis});
  float shoreDetailScale = mix(detailScale, 1.0, 0.78);
  vec2 grassUv = kingdomTerrainRotate(
    worldPosition.xz * ${grassScale} * detailScale,
    grassAxis
  );
  vec2 soilUv = kingdomTerrainRotate(
    worldPosition.xz * ${soilScale} * detailScale,
    soilAxis
  );
  vec2 shoreUv = kingdomTerrainRotate(
    worldPosition.xz * ${shoreScale} * shoreDetailScale,
    shoreAxis
  );
  vec4 grass = kingdomTerrainAtlasSample(atlas, grassUv, 0.0);
  vec4 soil = kingdomTerrainAtlasSample(atlas, soilUv, 1.0);
  vec4 rockX = kingdomTerrainAtlasSample(
    atlas,
    worldPosition.zy * 0.5 * detailScale,
    2.0
  );
  vec4 rockY = kingdomTerrainAtlasSample(
    atlas,
    worldPosition.xz * 0.5 * detailScale,
    2.0
  );
  vec4 rockZ = kingdomTerrainAtlasSample(
    atlas,
    worldPosition.xy * 0.5 * detailScale,
    2.0
  );
  vec4 rock = rockX * projectionWeights.x +
    rockY * projectionWeights.y + rockZ * projectionWeights.z;
  vec4 shore = kingdomTerrainAtlasSample(atlas, shoreUv, 3.0);
  return grass * layerWeights.x + soil * layerWeights.y +
    rock * layerWeights.z + shore * layerWeights.w;
}`
      : `vec4 kingdomSampleLayeredTerrainAtlas(
  sampler2D atlas,
  vec3 worldPosition,
  vec3 worldNormal,
  vec4 layerWeights,
  float detailScale
) {
  vec3 projectionWeights = kingdomTerrainProjectionWeights(worldNormal);
  vec2 grassAxis = vec2(${grassAxis});
  vec2 soilAxis = vec2(${soilAxis});
  vec2 shoreAxis = vec2(${shoreAxis});
  vec2 grassUv = kingdomTerrainRotate(
    worldPosition.xz * ${grassScale} * detailScale,
    grassAxis
  );
  vec2 soilUv = kingdomTerrainRotate(
    worldPosition.xz * ${soilScale} * detailScale,
    soilAxis
  );
  vec2 shoreUv = kingdomTerrainRotate(
    worldPosition.xz * ${shoreScale} * detailScale,
    shoreAxis
  );
  vec2 rockUv = worldPosition.xz * 0.5 * detailScale;
  if (projectionWeights.x >= projectionWeights.y &&
      projectionWeights.x >= projectionWeights.z) {
    rockUv = worldPosition.zy * 0.5 * detailScale;
  } else if (projectionWeights.z > projectionWeights.y) {
    rockUv = worldPosition.xy * 0.5 * detailScale;
  }
  vec4 grass = kingdomTerrainAtlasSample(atlas, grassUv, 0.0);
  vec4 soil = kingdomTerrainAtlasSample(atlas, soilUv, 1.0);
  vec4 rock = kingdomTerrainAtlasSample(atlas, rockUv, 2.0);
  vec4 shore = kingdomTerrainAtlasSample(atlas, shoreUv, 3.0);
  return grass * layerWeights.x + soil * layerWeights.y +
    rock * layerWeights.z + shore * layerWeights.w;
}`;
  const layeredNormalShader =
    quality === "high"
      ? `vec3 kingdomSampleLayeredTerrainNormal(
  sampler2D atlas,
  vec3 worldPosition,
  vec3 worldNormal,
  vec4 layerWeights
) {
  vec3 projectionWeights = kingdomTerrainProjectionWeights(worldNormal);
  vec3 axisSign = sign(worldNormal + vec3(0.000001));
  vec2 grassAxis = vec2(${grassAxis});
  vec2 soilAxis = vec2(${soilAxis});
  vec2 shoreAxis = vec2(${shoreAxis});
  vec2 grassUv = kingdomTerrainRotate(worldPosition.xz * ${grassScale}, grassAxis);
  vec2 soilUv = kingdomTerrainRotate(worldPosition.xz * ${soilScale}, soilAxis);
  vec2 shoreUv = kingdomTerrainRotate(worldPosition.xz * ${shoreScale}, shoreAxis);
  vec3 grassMap = kingdomTerrainUnpackNormal(
    kingdomTerrainAtlasSample(atlas, grassUv, 0.0).rgb,
    0.38
  );
  vec3 soilMap = kingdomTerrainUnpackNormal(
    kingdomTerrainAtlasSample(atlas, soilUv, 1.0).rgb,
    0.52
  );
  vec3 shoreMap = kingdomTerrainUnpackNormal(
    kingdomTerrainAtlasSample(atlas, shoreUv, 3.0).rgb,
    0.46
  );
  vec3 rockMapX = kingdomTerrainUnpackNormal(
    kingdomTerrainAtlasSample(atlas, worldPosition.zy * 0.5, 2.0).rgb,
    0.86
  );
  vec3 rockMapY = kingdomTerrainUnpackNormal(
    kingdomTerrainAtlasSample(atlas, worldPosition.xz * 0.5, 2.0).rgb,
    0.86
  );
  vec3 rockMapZ = kingdomTerrainUnpackNormal(
    kingdomTerrainAtlasSample(atlas, worldPosition.xy * 0.5, 2.0).rgb,
    0.86
  );
  vec3 grassNormal = kingdomTerrainTopNormal(grassMap, worldNormal, grassAxis);
  vec3 soilNormal = kingdomTerrainTopNormal(soilMap, worldNormal, soilAxis);
  vec3 shoreNormal = kingdomTerrainTopNormal(shoreMap, worldNormal, shoreAxis);
  vec3 rockNormalX = normalize(vec3(
    rockMapX.z * axisSign.x,
    rockMapX.y,
    rockMapX.x * axisSign.x
  ));
  vec3 rockNormalY = normalize(vec3(
    rockMapY.x * axisSign.y,
    rockMapY.z * axisSign.y,
    rockMapY.y
  ));
  vec3 rockNormalZ = normalize(vec3(
    rockMapZ.x * axisSign.z,
    rockMapZ.y,
    rockMapZ.z * axisSign.z
  ));
  vec3 rockNormal = normalize(
    rockNormalX * projectionWeights.x +
    rockNormalY * projectionWeights.y +
    rockNormalZ * projectionWeights.z
  );
  vec3 layeredNormal = normalize(
    grassNormal * layerWeights.x +
    soilNormal * layerWeights.y +
    rockNormal * layerWeights.z +
    shoreNormal * layerWeights.w
  );
  float detailStrength = dot(layerWeights, vec4(0.5, 0.64, 0.92, 0.58));
  return normalize(mix(worldNormal, layeredNormal, detailStrength));
}`
      : `vec3 kingdomSampleLayeredTerrainNormal(
  sampler2D atlas,
  vec3 worldPosition,
  vec3 worldNormal,
  vec4 layerWeights
) {
  vec3 projectionWeights = kingdomTerrainProjectionWeights(worldNormal);
  vec3 axisSign = sign(worldNormal + vec3(0.000001));
  vec2 grassAxis = vec2(${grassAxis});
  vec2 soilAxis = vec2(${soilAxis});
  vec2 shoreAxis = vec2(${shoreAxis});
  vec2 grassUv = kingdomTerrainRotate(worldPosition.xz * ${grassScale}, grassAxis);
  vec2 soilUv = kingdomTerrainRotate(worldPosition.xz * ${soilScale}, soilAxis);
  vec2 shoreUv = kingdomTerrainRotate(worldPosition.xz * ${shoreScale}, shoreAxis);
  vec2 rockUv = worldPosition.xz * 0.5;
  float rockProjection = 1.0;
  if (projectionWeights.x >= projectionWeights.y &&
      projectionWeights.x >= projectionWeights.z) {
    rockUv = worldPosition.zy * 0.5;
    rockProjection = 0.0;
  } else if (projectionWeights.z > projectionWeights.y) {
    rockUv = worldPosition.xy * 0.5;
    rockProjection = 2.0;
  }
  vec3 grassMap = kingdomTerrainUnpackNormal(
    kingdomTerrainAtlasSample(atlas, grassUv, 0.0).rgb,
    0.38
  );
  vec3 soilMap = kingdomTerrainUnpackNormal(
    kingdomTerrainAtlasSample(atlas, soilUv, 1.0).rgb,
    0.52
  );
  vec3 shoreMap = kingdomTerrainUnpackNormal(
    kingdomTerrainAtlasSample(atlas, shoreUv, 3.0).rgb,
    0.46
  );
  vec3 rockMap = kingdomTerrainUnpackNormal(
    kingdomTerrainAtlasSample(atlas, rockUv, 2.0).rgb,
    0.86
  );
  vec3 grassNormal = kingdomTerrainTopNormal(grassMap, worldNormal, grassAxis);
  vec3 soilNormal = kingdomTerrainTopNormal(soilMap, worldNormal, soilAxis);
  vec3 shoreNormal = kingdomTerrainTopNormal(shoreMap, worldNormal, shoreAxis);
  vec3 rockNormal = normalize(vec3(
    rockMap.x * axisSign.y,
    rockMap.z * axisSign.y,
    rockMap.y
  ));
  if (rockProjection < 0.5) {
    rockNormal = normalize(vec3(
      rockMap.z * axisSign.x,
      rockMap.y,
      rockMap.x * axisSign.x
    ));
  } else if (rockProjection > 1.5) {
    rockNormal = normalize(vec3(
      rockMap.x * axisSign.z,
      rockMap.y,
      rockMap.z * axisSign.z
    ));
  }
  vec3 layeredNormal = normalize(
    grassNormal * layerWeights.x +
    soilNormal * layerWeights.y +
    rockNormal * layerWeights.z +
    shoreNormal * layerWeights.w
  );
  float detailStrength = dot(layerWeights, vec4(0.5, 0.64, 0.92, 0.58));
  return normalize(mix(worldNormal, layeredNormal, detailStrength));
}`;
  const macroVariationShader =
    quality === "high"
      ? `vec2 kingdomTerrainMacroPoint = vKingdomWorldPosition.xz * 0.026;
vec2 kingdomTerrainWarp = vec2(
  kingdomTerrainFbm(kingdomTerrainMacroPoint + vec2(4.7, -11.3)),
  kingdomTerrainFbm(kingdomTerrainMacroPoint + vec2(-8.1, 6.9))
);
float kingdomTerrainMacro = kingdomTerrainFbm(
  kingdomTerrainMacroPoint + (kingdomTerrainWarp - 0.5) * 1.8
);
float kingdomTerrainBroad = kingdomTerrainFbm(
  vKingdomWorldPosition.xz * 0.009 + vec2(19.4, -3.2)
);
float kingdomTerrainMacroMix = kingdomTerrainMacro * 0.68 + kingdomTerrainBroad * 0.32;`
      : `vec2 kingdomTerrainMacroPoint = vKingdomWorldPosition.xz * 0.021;
float kingdomTerrainMacroMix = kingdomTerrainFbm(
  kingdomTerrainMacroPoint + vec2(4.7, -11.3)
);`;
  const albedoSampleShader =
    quality === "high"
      ? `vec3 kingdomTerrainDetailAlbedo = kingdomSampleLayeredTerrainAtlas(
  uKingdomTerrainAlbedoAtlas,
  vKingdomWorldPosition,
  kingdomTerrainWorldNormal,
  kingdomLayerWeights,
  1.0
).rgb;
vec3 kingdomTerrainAerialAlbedo = kingdomSampleLayeredTerrainAtlas(
  uKingdomTerrainAlbedoAtlas,
  vKingdomWorldPosition,
  kingdomTerrainWorldNormal,
  kingdomLayerWeights,
  0.085
).rgb;
float kingdomTerrainCameraDistance = length(cameraPosition - vKingdomWorldPosition);
float kingdomTerrainAerialBlend = smoothstep(
  54.0,
  148.0,
  kingdomTerrainCameraDistance
) * 0.72;
vec3 kingdomTerrainAlbedoSample = mix(
  kingdomTerrainDetailAlbedo,
  kingdomTerrainAerialAlbedo,
  kingdomTerrainAerialBlend
);`
      : `vec3 kingdomTerrainAlbedoSample = kingdomSampleLayeredTerrainAtlas(
  uKingdomTerrainAlbedoAtlas,
  vKingdomWorldPosition,
  kingdomTerrainWorldNormal,
  kingdomLayerWeights,
  1.0
).rgb;`;
  const strataShader =
    quality === "high"
      ? `float kingdomTerrainStrata = 0.5 + 0.5 * sin(
  vKingdomWorldPosition.y * 0.71 +
  kingdomTerrainFbm(vKingdomWorldPosition.xz * 0.045) * 2.4
);`
      : `float kingdomTerrainStrata = 0.5 + 0.5 * sin(
  vKingdomWorldPosition.y * 0.71 + kingdomTerrainMacroMix * 2.4
);`;
  shader.uniforms.uKingdomTerrainAlbedoAtlas = terrainUniforms.albedoAtlas;
  shader.uniforms.uKingdomTerrainNormalAtlas = terrainUniforms.normalAtlas;
  shader.uniforms.uKingdomTerrainRoughnessAtlas = terrainUniforms.roughnessAtlas;
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>
attribute vec4 ${PLANNED_TERRAIN_LAYER_ATTRIBUTE};
varying vec3 vKingdomWorldPosition;
varying vec3 vKingdomWorldNormal;
varying vec4 vKingdomTerrainLayers;`,
    )
    .replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
vec4 kingdomTerrainWorldPosition = modelMatrix * vec4(transformed, 1.0);
vKingdomWorldPosition = kingdomTerrainWorldPosition.xyz;
vKingdomWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
vKingdomTerrainLayers = ${PLANNED_TERRAIN_LAYER_ATTRIBUTE};`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
uniform sampler2D uKingdomTerrainAlbedoAtlas;
uniform sampler2D uKingdomTerrainNormalAtlas;
uniform sampler2D uKingdomTerrainRoughnessAtlas;
varying vec3 vKingdomWorldPosition;
varying vec3 vKingdomWorldNormal;
varying vec4 vKingdomTerrainLayers;
float kingdomTerrainHash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}
float kingdomTerrainValueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 eased = local * local * (3.0 - 2.0 * local);
  float northWest = kingdomTerrainHash(cell);
  float northEast = kingdomTerrainHash(cell + vec2(1.0, 0.0));
  float southWest = kingdomTerrainHash(cell + vec2(0.0, 1.0));
  float southEast = kingdomTerrainHash(cell + vec2(1.0, 1.0));
  return mix(
    mix(northWest, northEast, eased.x),
    mix(southWest, southEast, eased.x),
    eased.y
  );
}
${fbmShader}
vec2 kingdomTerrainRotate(vec2 point, vec2 axis) {
  return vec2(
    dot(point, axis),
    dot(point, vec2(-axis.y, axis.x))
  );
}
vec2 kingdomTerrainAtlasUv(vec2 point, float slot) {
  vec2 tileUv = fract(point);
  return vec2(
    slot * ${atlasSlotSpan} + ${atlasGutterU} + tileUv.x * ${atlasUsableU},
    ${atlasGutterV} + tileUv.y * ${atlasUsableV}
  );
}
vec4 kingdomTerrainAtlasSample(sampler2D atlas, vec2 point, float slot) {
  vec2 atlasDerivativeScale = vec2(${atlasUsableU}, ${atlasUsableV});
  return texture2DGradEXT(
    atlas,
    kingdomTerrainAtlasUv(point, slot),
    dFdx(point) * atlasDerivativeScale,
    dFdy(point) * atlasDerivativeScale
  );
}
vec3 kingdomTerrainProjectionWeights(vec3 worldNormal) {
  vec3 weights = pow(abs(worldNormal), vec3(5.0));
  return weights / max(weights.x + weights.y + weights.z, 0.0001);
}
${layeredAtlasShader}
vec3 kingdomTerrainUnpackNormal(vec3 encodedNormal, float strength) {
  vec3 tangentNormal = encodedNormal * 2.0 - 1.0;
  tangentNormal.xy *= strength;
  tangentNormal.z = sqrt(max(1.0 - dot(tangentNormal.xy, tangentNormal.xy), 0.01));
  return normalize(tangentNormal);
}
vec3 kingdomTerrainTopNormal(
  vec3 tangentNormal,
  vec3 worldNormal,
  vec2 uvAxis
) {
  vec3 uvAxisU = vec3(uvAxis.x, 0.0, uvAxis.y);
  vec3 uvAxisV = vec3(-uvAxis.y, 0.0, uvAxis.x);
  vec3 tangentU = cross(worldNormal, uvAxisV);
  tangentU *= sign(dot(tangentU, uvAxisU) + 0.000001);
  tangentU /= max(length(tangentU), 0.0001);
  vec3 tangentV = cross(uvAxisU, worldNormal);
  tangentV *= sign(dot(tangentV, uvAxisV) + 0.000001);
  tangentV /= max(length(tangentV), 0.0001);
  return normalize(
    tangentU * tangentNormal.x +
    tangentV * tangentNormal.y +
    worldNormal * tangentNormal.z
  );
}
${layeredNormalShader}`,
    )
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
vec3 kingdomTerrainWorldNormal = normalize(vKingdomWorldNormal) *
  (gl_FrontFacing ? 1.0 : -1.0);
float kingdomTerrainVerticality = 1.0 - clamp(abs(kingdomTerrainWorldNormal.y), 0.0, 1.0);
float kingdomTerrainSlopeRock = smoothstep(0.18, 0.67, kingdomTerrainVerticality);
float kingdomTerrainAltitude = smoothstep(5.5, 22.0, vKingdomWorldPosition.y);
vec4 kingdomLayerWeights = max(vKingdomTerrainLayers, vec4(0.0));
kingdomLayerWeights /= max(dot(kingdomLayerWeights, vec4(1.0)), 0.0001);
float kingdomTerrainConvertible = kingdomLayerWeights.x + kingdomLayerWeights.y;
float kingdomTerrainRockConversion = clamp(
  kingdomTerrainSlopeRock *
  mix(0.38, 0.82, kingdomTerrainAltitude) *
  ${boundedSideStrength},
  0.0,
  0.94
);
kingdomLayerWeights.z += kingdomTerrainConvertible * kingdomTerrainRockConversion;
kingdomLayerWeights.x *= 1.0 - kingdomTerrainRockConversion * 0.9;
kingdomLayerWeights.y *= 1.0 - kingdomTerrainRockConversion * 0.58;
kingdomLayerWeights /= max(dot(kingdomLayerWeights, vec4(1.0)), 0.0001);
${macroVariationShader}
vec3 kingdomGrassMacro = mix(
  vec3(0.9, 0.955, 0.86),
  vec3(1.075, 1.035, 0.92),
  kingdomTerrainMacroMix
);
vec3 kingdomSoilMacro = mix(
  vec3(0.9, 0.875, 0.82),
  vec3(1.08, 1.035, 0.94),
  kingdomTerrainMacroMix
);
vec3 kingdomRockMacro = mix(
  vec3(0.84, 0.87, 0.9),
  vec3(1.1, 1.07, 1.015),
  kingdomTerrainMacroMix
);
vec3 kingdomShoreMacro = mix(
  vec3(0.9, 0.91, 0.86),
  vec3(1.08, 1.055, 0.97),
  kingdomTerrainMacroMix
);
vec3 kingdomTerrainMacroTint =
  kingdomGrassMacro * kingdomLayerWeights.x +
  kingdomSoilMacro * kingdomLayerWeights.y +
  kingdomRockMacro * kingdomLayerWeights.z +
  kingdomShoreMacro * kingdomLayerWeights.w;
${albedoSampleShader}
float kingdomTerrainAlbedoLuma = dot(
  kingdomTerrainAlbedoSample,
  vec3(0.2126, 0.7152, 0.0722)
);
float kingdomTerrainPaletteLuma = dot(
  diffuseColor.rgb,
  vec3(0.2126, 0.7152, 0.0722)
);
vec3 kingdomTerrainRelitAlbedo = clamp(
  kingdomTerrainAlbedoSample * clamp(
    kingdomTerrainPaletteLuma / max(kingdomTerrainAlbedoLuma, 0.04),
    0.45,
    3.5
  ),
  vec3(0.0),
  vec3(1.0)
);
float kingdomTerrainAlbedoBlend = dot(
  kingdomLayerWeights,
  vec4(0.48, 0.62, 0.78, 0.58)
);
float kingdomTerrainMicroValue = mix(
  0.9,
  1.1,
  smoothstep(0.1, 0.78, kingdomTerrainAlbedoLuma)
);
vec3 kingdomTerrainTextureChroma = clamp(
  kingdomTerrainAlbedoSample / max(kingdomTerrainAlbedoLuma, 0.08),
  vec3(0.6),
  vec3(1.5)
);
vec3 kingdomTerrainTextureModulation = mix(
  vec3(kingdomTerrainMicroValue),
  kingdomTerrainTextureChroma * kingdomTerrainMicroValue,
  0.14
);
float kingdomTerrainAtlasRoughness = kingdomSampleLayeredTerrainAtlas(
  uKingdomTerrainRoughnessAtlas,
  vKingdomWorldPosition,
  kingdomTerrainWorldNormal,
  kingdomLayerWeights,
  1.0
).r;
float kingdomTerrainContact = clamp(
  (1.0 - smoothstep(0.1, 0.62, kingdomTerrainAlbedoLuma)) * 0.52 +
  (1.0 - kingdomTerrainMacroMix) * 0.12 +
  kingdomTerrainSlopeRock * kingdomLayerWeights.z * 0.16,
  0.0,
  1.0
);
${strataShader}
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  kingdomTerrainRelitAlbedo,
  kingdomTerrainAlbedoBlend
);
diffuseColor.rgb *= kingdomTerrainMacroTint;
diffuseColor.rgb *= mix(vec3(1.0), kingdomTerrainTextureModulation, 0.76);
diffuseColor.rgb *= mix(
  1.0,
  mix(0.91, 1.065, kingdomTerrainStrata),
  kingdomLayerWeights.z * 0.28
);`,
    )
    .replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
float kingdomTerrainMaterialRoughness = dot(
  kingdomLayerWeights,
  vec4(0.93, 0.97, 0.83, 0.76)
);
roughnessFactor = clamp(
  mix(kingdomTerrainMaterialRoughness, kingdomTerrainAtlasRoughness, 0.58) +
  kingdomTerrainContact * 0.08 - kingdomLayerWeights.w * 0.055,
  0.48,
  1.0
);`,
    )
    .replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
vec3 kingdomTerrainDetailWorldNormal = kingdomSampleLayeredTerrainNormal(
  uKingdomTerrainNormalAtlas,
  vKingdomWorldPosition,
  kingdomTerrainWorldNormal,
  kingdomLayerWeights
);
normal = normalize(mat3(viewMatrix) * kingdomTerrainDetailWorldNormal);`,
    )
    .replace(
      "#include <aomap_fragment>",
      `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= 1.0 - kingdomTerrainContact * 0.2;
reflectedLight.indirectSpecular *= 1.0 - kingdomTerrainContact * 0.08;`,
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

export function updatePlannedWaterAnimationTime<T extends { value: number }>(
  timeUniform: T,
  elapsedTime: number,
  reducedMotion: boolean,
): T {
  timeUniform.value = resolvePlannedWaterAnimationTime(elapsedTime, reducedMotion);
  return timeUniform;
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
float kingdomShoreDamping = 1.0 - smoothstep(0.76, 1.0, kingdomWaterEdge) * 0.72;
vec2 kingdomWaterPoint = position.xz;
float kingdomLakeDomain = sin(
  dot(kingdomWaterPoint, vec2(0.071, 0.113)) + uKingdomWaterTime * 0.09
) * 0.56;
float kingdomLakePhaseA = dot(kingdomWaterPoint, vec2(0.913, 0.408)) * 0.21 +
  kingdomLakeDomain + uKingdomWaterTime * 0.34;
float kingdomLakePhaseB = dot(kingdomWaterPoint, vec2(-0.517, 0.856)) * 0.39 -
  kingdomLakeDomain * 0.43 - uKingdomWaterTime * 0.27 + 1.73;
float kingdomLakePhaseC = dot(kingdomWaterPoint, vec2(0.218, -0.976)) * 0.73 +
  kingdomLakeDomain * 0.27 + uKingdomWaterTime * 0.51 + 4.19;
float kingdomLakeWave = (
  sin(kingdomLakePhaseA) * 0.034 +
  sin(kingdomLakePhaseB) * 0.018 +
  sin(kingdomLakePhaseC) * 0.008
) * kingdomShoreDamping;
float kingdomRiverBend = sin(
  kingdomWaterProgress * 9.3 + dot(kingdomWaterPoint, vec2(0.083, -0.057))
) * 0.48;
float kingdomRiverPhaseA = kingdomWaterProgress * 36.0 +
  dot(kingdomWaterPoint, vec2(0.132, 0.089)) + kingdomRiverBend -
  uKingdomWaterTime * 1.34;
float kingdomRiverPhaseB = kingdomWaterProgress * 59.0 +
  dot(kingdomWaterPoint, vec2(-0.076, 0.164)) - kingdomRiverBend * 0.38 -
  uKingdomWaterTime * 1.92 + 2.41;
float kingdomRiverWave = (
  sin(kingdomRiverPhaseA) * 0.014 + sin(kingdomRiverPhaseB) * 0.006
) * kingdomShoreDamping;
float kingdomWaterWave = mix(kingdomRiverWave, kingdomLakeWave, kingdomWaterRegion);
vec2 kingdomLakeDerivative = (
  vec2(0.913, 0.408) * cos(kingdomLakePhaseA) * 0.21 * 0.034 +
  vec2(-0.517, 0.856) * cos(kingdomLakePhaseB) * 0.39 * 0.018 +
  vec2(0.218, -0.976) * cos(kingdomLakePhaseC) * 0.73 * 0.008
) * kingdomShoreDamping;
vec2 kingdomRiverDerivative = (
  vec2(0.132, 0.089) * cos(kingdomRiverPhaseA) * 0.014 +
  vec2(-0.076, 0.164) * cos(kingdomRiverPhaseB) * 0.006
) * kingdomShoreDamping;
vec2 kingdomWaterDerivative = mix(
  kingdomRiverDerivative,
  kingdomLakeDerivative,
  kingdomWaterRegion
);
transformed.y += kingdomWaterWave;
vKingdomWaterNormalView = normalize(
  normalMatrix * vec3(-kingdomWaterDerivative.x, 1.0, -kingdomWaterDerivative.y)
);
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
vec2 kingdomLakeWaveSlope(vec2 point, float edge, float time) {
  float damping = 1.0 - smoothstep(0.78, 1.0, edge) * 0.58;
  float domainA = sin(dot(point, vec2(0.047, 0.083)) + time * 0.11) * 0.72;
  float domainB = sin(dot(point, vec2(-0.061, 0.039)) - time * 0.07 + 2.17) * 0.44;
  float phaseA = dot(point, vec2(0.913, 0.408)) * 0.31 + domainA + time * 0.37;
  float phaseB = dot(point, vec2(-0.517, 0.856)) * 0.57 - domainA * 0.36 +
    domainB + 1.73 - time * 0.29;
  float phaseC = dot(point, vec2(0.218, -0.976)) * 1.03 + domainA * 0.18 -
    domainB * 0.31 + 4.19 + time * 0.53;
  float phaseD = dot(point, vec2(-0.781, -0.625)) * 1.69 - domainA * 0.12 +
    domainB * 0.16 + 0.83 - time * 0.71;
  return (
    vec2(0.913, 0.408) * cos(phaseA) * 0.048 +
    vec2(-0.517, 0.856) * cos(phaseB) * 0.032 +
    vec2(0.218, -0.976) * cos(phaseC) * 0.018 +
    vec2(-0.781, -0.625) * cos(phaseD) * 0.009
  ) * damping;
}
vec2 kingdomRiverFlowSlope(vec2 point, float progress, float edge, float time) {
  float damping = 1.0 - smoothstep(0.74, 1.0, edge) * 0.64;
  float bend = sin(progress * 10.7 + dot(point, vec2(0.057, -0.043))) * 0.62;
  float phaseA = progress * 41.0 + dot(point, vec2(0.191, 0.127)) +
    bend - time * 1.48;
  float phaseB = progress * 67.0 + dot(point, vec2(-0.116, 0.238)) -
    bend * 0.41 + 2.61 - time * 2.06;
  float phaseC = progress * 23.0 + dot(point, vec2(0.347, -0.072)) +
    sin(progress * 6.3 + 1.2) * 0.37 + time * 0.82;
  return (
    vec2(0.191, 0.127) * cos(phaseA) * 0.12 +
    vec2(-0.116, 0.238) * cos(phaseB) * 0.075 +
    vec2(0.347, -0.072) * cos(phaseC) * 0.036
  ) * damping;
}
float kingdomBrokenFoam(vec2 point, float progress, float region, float time) {
  float slowWarp = sin(
    dot(point, vec2(-0.137, 0.219)) + progress * mix(8.3, 2.1, region) - time * 0.12
  );
  float broad = 0.5 + 0.5 * sin(
    dot(point, vec2(0.311, 0.173)) + slowWarp * 1.34 +
    progress * mix(16.7, 3.4, region) + time * 0.18
  );
  float fine = 0.5 + 0.5 * sin(
    dot(point, vec2(-0.427, 0.689)) - slowWarp * 0.48 -
    progress * mix(27.0, 5.2, region) - time * 0.23 + 2.37
  );
  float interruption = 0.5 + 0.5 * sin(
    dot(point, vec2(0.193, -0.517)) + slowWarp * 0.77 +
    progress * mix(39.0, 7.1, region) + time * 0.09 + 0.61
  );
  float brokenCrest = smoothstep(0.67, 0.84, broad * 0.66 + fine * 0.34);
  return brokenCrest * smoothstep(0.42, 0.76, interruption);
}`,
    )
    .replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
vec3 kingdomWaterDetailNormalView = normalize(
  mat3(viewMatrix) * vec3(-kingdomWaterSlope.x, 1.0, -kingdomWaterSlope.y)
);
normal = normalize(mix(vKingdomWaterNormalView, kingdomWaterDetailNormalView, 0.92));`,
    )
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
vec2 kingdomLakeSlope = kingdomLakeWaveSlope(
  vKingdomWaterWorldPosition.xz,
  vKingdomWaterEdge,
  uKingdomWaterTime
);
vec2 kingdomRiverSlope = kingdomRiverFlowSlope(
  vKingdomWaterWorldPosition.xz,
  vKingdomWaterProgress,
  vKingdomWaterEdge,
  uKingdomWaterTime
);
vec2 kingdomWaterSlope = mix(kingdomRiverSlope, kingdomLakeSlope, vKingdomWaterRegion);
float kingdomWaterInterior = clamp(1.0 - vKingdomWaterEdge, 0.0, 1.0);
float kingdomWaterDepth = pow(
  smoothstep(0.015, 0.96, kingdomWaterInterior),
  mix(0.84, 0.7, vKingdomWaterRegion)
);
kingdomWaterDepth *= mix(0.79, 1.0, vKingdomWaterRegion);
float kingdomColorDepth = smoothstep(0.08, 0.92, kingdomWaterDepth);
vec3 kingdomWaterBase = mix(
  uKingdomWaterShallowColor,
  uKingdomWaterDeepColor,
  kingdomColorDepth
);
float kingdomRiverFlowLight = 0.5 + 0.5 * sin(
  vKingdomWaterProgress * 31.0 - uKingdomWaterTime * 1.37 +
  dot(vKingdomWaterWorldPosition.xz, vec2(0.071, 0.119)) +
  sin(vKingdomWaterProgress * 7.7 + 1.4) * 0.63
);
float kingdomRiverFineLight = 0.5 + 0.5 * sin(
  vKingdomWaterProgress * 53.0 - uKingdomWaterTime * 1.91 +
  dot(vKingdomWaterWorldPosition.xz, vec2(-0.093, 0.167)) + 2.31
);
float kingdomRiverFlowHighlight = smoothstep(
  0.52,
  0.9,
  kingdomRiverFlowLight * 0.7 + kingdomRiverFineLight * 0.3
) * (1.0 - vKingdomWaterRegion) * (1.0 - vKingdomWaterEdge * 0.56);
vec3 kingdomWaterDetailWorldNormal = normalize(
  vec3(-kingdomWaterSlope.x, 1.0, -kingdomWaterSlope.y)
);
vec3 kingdomWaterViewDirection = normalize(
  cameraPosition - vKingdomWaterWorldPosition
);
float kingdomFresnel = 0.035 + 0.965 * pow(
  1.0 - clamp(
    dot(kingdomWaterViewDirection, kingdomWaterDetailWorldNormal),
    0.0,
    1.0
  ),
  3.1
);
float kingdomBroadReflectionModulation = 0.82 + 0.18 * (
  0.5 + 0.5 * sin(
    dot(vKingdomWaterWorldPosition.xz, vec2(0.043, -0.067)) +
    sin(dot(vKingdomWaterWorldPosition.xz, vec2(-0.031, 0.052))) * 0.74 +
    uKingdomWaterTime * 0.08
  )
);
vec3 kingdomSkyGradient = mix(
  uKingdomWaterSkyColor * 0.62,
  mix(uKingdomWaterSkyColor, uKingdomWaterFoamColor, 0.32),
  smoothstep(0.16, 0.86, kingdomWaterViewDirection.y)
);
vec3 kingdomSunDirection = normalize(vec3(-0.36, 0.86, 0.37));
vec3 kingdomSunHalfDirection = normalize(
  kingdomWaterViewDirection + kingdomSunDirection
);
float kingdomSunAlignment = max(
  dot(kingdomWaterDetailWorldNormal, kingdomSunHalfDirection),
  0.0
);
float kingdomSunGlint = pow(kingdomSunAlignment, 128.0) * 0.92 +
  pow(kingdomSunAlignment, 36.0) * 0.045;
float kingdomFoamBand = smoothstep(0.978, 0.996, vKingdomWaterEdge);
float kingdomFoamBreakup = kingdomBrokenFoam(
  vKingdomWaterWorldPosition.xz,
  vKingdomWaterProgress,
  vKingdomWaterRegion,
  uKingdomWaterTime
);
float kingdomFoam = kingdomFoamBand * kingdomFoamBreakup *
  mix(0.7, 0.86, vKingdomWaterRegion);
float kingdomShallowRibbon = 1.0 - smoothstep(0.03, 0.21, kingdomWaterDepth);
kingdomWaterBase = mix(
  kingdomWaterBase,
  uKingdomWaterShallowColor,
  kingdomShallowRibbon * 0.18
);
kingdomWaterBase = mix(
  kingdomWaterBase,
  kingdomSkyGradient,
  clamp(kingdomFresnel * kingdomBroadReflectionModulation * 0.28, 0.0, 0.3)
);
kingdomWaterBase = mix(
  kingdomWaterBase,
  uKingdomWaterShallowColor,
  kingdomRiverFlowHighlight * 0.1
);
kingdomWaterBase += uKingdomWaterFoamColor * kingdomSunGlint;
kingdomWaterBase = mix(kingdomWaterBase, uKingdomWaterFoamColor, kingdomFoam * 0.58);
diffuseColor.rgb = kingdomWaterBase;
diffuseColor.a = 1.0;`,
    )
    .replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
totalEmissiveRadiance += kingdomWaterBase * 0.025;
totalEmissiveRadiance += uKingdomWaterFoamColor * kingdomFoam * 0.08;`,
    )
    .replace(
      "#include <opaque_fragment>",
      `outgoingLight = mix(outgoingLight, kingdomWaterBase, 0.2);
outgoingLight += uKingdomWaterFoamColor * kingdomFoam * 0.022;
#include <opaque_fragment>`,
    );
}

export function PlannedTerrain({
  plan,
  quality = "high",
  receiveShadow = true,
}: PlannedTerrainProps) {
  const terrainUniforms = usePlannedTerrainAtlasUniforms(quality);
  const terrain = useMemo(
    () => buildPlannedTerrainGeometry(plan, PLANNED_TERRAIN_QUALITY_OPTIONS[quality]),
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
      disposePlannedTerrainResources([surfaceGeometry, sideGeometry, isletGeometry]);
    },
    [isletGeometry, sideGeometry, surfaceGeometry],
  );

  return (
    <group name="planned-global-terrain">
      <mesh geometry={surfaceGeometry} receiveShadow={receiveShadow} castShadow={false}>
        <meshStandardMaterial
          key={resolvePlannedTerrainProgramCacheKey(quality, "surface")}
          vertexColors
          roughness={1}
          metalness={0}
          envMapIntensity={0.46}
          dithering
          onBeforeCompile={(shader) =>
            applyTerrainDetailShader(shader, 0.9, terrainUniforms, quality)
          }
          customProgramCacheKey={() => resolvePlannedTerrainProgramCacheKey(quality, "surface")}
          side={THREE.FrontSide}
        />
      </mesh>
      <mesh geometry={sideGeometry} receiveShadow={receiveShadow} castShadow={false}>
        <meshStandardMaterial
          key={resolvePlannedTerrainProgramCacheKey(quality, "side")}
          vertexColors
          roughness={1}
          metalness={0}
          envMapIntensity={0.32}
          dithering
          onBeforeCompile={(shader) =>
            applyTerrainDetailShader(shader, 1.18, terrainUniforms, quality)
          }
          customProgramCacheKey={() => resolvePlannedTerrainProgramCacheKey(quality, "side")}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={isletGeometry} receiveShadow={receiveShadow} castShadow={false}>
        <meshStandardMaterial
          key={resolvePlannedTerrainProgramCacheKey(quality, "islet")}
          vertexColors
          roughness={1}
          metalness={0}
          envMapIntensity={0.44}
          dithering
          onBeforeCompile={(shader) =>
            applyTerrainDetailShader(shader, 0.82, terrainUniforms, quality)
          }
          customProgramCacheKey={() => resolvePlannedTerrainProgramCacheKey(quality, "islet")}
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
    () => buildPlannedWaterGeometry(plan, PLANNED_TERRAIN_QUALITY_OPTIONS[quality]),
    [plan, quality],
  );
  const geometry = useMemo(() => {
    const nextGeometry = toBufferGeometry(water, null);
    addWaterSurfaceAttributes(nextGeometry, water);
    return nextGeometry;
  }, [water]);

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
    updatePlannedWaterAnimationTime(
      uniforms.current.time,
      uniforms.current.time.value,
      reducedMotion,
    );
  }, [reducedMotion, waterColors]);
  useFrame(({ clock }) => {
    updatePlannedWaterAnimationTime(uniforms.current.time, clock.elapsedTime, reducedMotion);
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
        transparent={PLANNED_WATER_MATERIAL_CONTRACT.transparent}
        opacity={PLANNED_WATER_MATERIAL_CONTRACT.opacity}
        depthWrite={PLANNED_WATER_MATERIAL_CONTRACT.depthWrite}
        dithering
        onBeforeCompile={(shader) => applyWaterDetailShader(shader, uniforms.current)}
        customProgramCacheKey={() => PLANNED_WATER_PROGRAM_CACHE_KEY}
        side={PLANNED_WATER_MATERIAL_CONTRACT.side}
      />
    </mesh>
  );
}
