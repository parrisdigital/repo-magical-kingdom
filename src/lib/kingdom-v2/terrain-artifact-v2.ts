import { stableDigest, stableHash } from "@/lib/kingdom/hash";
import type {
  CorridorRegionMask,
  EllipseRegionMask,
  WorldPlan,
  WorldPlanEnvelope,
  WorldPlanPoint,
} from "@/lib/kingdom/world-plan";

import { assertWorldDesignSpecV3Integrity, type WorldDesignSpecV3 } from "./world-design-spec-v3";

export const TERRAIN_ARTIFACT_V2_SCHEMA = "repo-terrain-artifact/v2" as const;
export const TERRAIN_ARTIFACT_V2_GENERATOR_REVISION = "terrain-artifact-v2-generator/3" as const;
export const TERRAIN_ARTIFACT_V2_RESOLUTION = 513 as const;
export const TERRAIN_ARTIFACT_V2_CHUNK_CELLS = 128 as const;
export const TERRAIN_ARTIFACT_V2_CHUNKS_PER_AXIS = 4 as const;
export const TERRAIN_ARTIFACT_V2_CHUNK_LODS = [129, 65, 33] as const;
export const TERRAIN_ARTIFACT_V2_WATER_TOPOLOGY_SAMPLE_STEP = 1 as const;
const MAXIMUM_WATER_FLOW_RISE_METERS = 0.0799;

export const TERRAIN_ARTIFACT_V2_MATERIAL_CHANNELS = [
  "meadow",
  "forest-floor",
  "soil",
  "rock",
  "shore",
  "river-bed",
  "lake-bed",
  "submerged",
] as const;

export type TerrainArtifactV2MaterialChannel =
  (typeof TERRAIN_ARTIFACT_V2_MATERIAL_CHANNELS)[number];

export const TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND = Object.freeze({
  dry: 0,
  river: 1,
  lake: 2,
  ocean: 3,
} as const);

export type TerrainArtifactV2HydrologyKind =
  (typeof TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND)[keyof typeof TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND];

export type TerrainArtifactV2OperatorKind =
  | "ridge"
  | "basin"
  | "terrace"
  | "river-valley"
  | "cliff"
  | "erosion-channel"
  | "irregular-shoreline";

export type TerrainArtifactV2Operator = Readonly<{
  kind: TerrainArtifactV2OperatorKind;
  scaleMeters: number;
  amplitudeMeters: number;
}>;

export type TerrainArtifactV2LodId = "near" | "mid" | "far";

export type TerrainArtifactV2LodDefinition = Readonly<{
  id: TerrainArtifactV2LodId;
  vertexResolution: 129 | 65 | 33;
  sampleStep: 1 | 2 | 4;
  segmentsPerChunk: 128 | 64 | 32;
  maximumDistance: number;
  skirtDepth: number;
  crackStrategy: "shared-power-of-two-edges-and-skirts";
}>;

export const TERRAIN_ARTIFACT_V2_LOD_DEFINITIONS: ReadonlyArray<TerrainArtifactV2LodDefinition> =
  Object.freeze([
    Object.freeze({
      id: "near",
      vertexResolution: 129,
      sampleStep: 1,
      segmentsPerChunk: 128,
      maximumDistance: 96,
      skirtDepth: 18,
      crackStrategy: "shared-power-of-two-edges-and-skirts",
    }),
    Object.freeze({
      id: "mid",
      vertexResolution: 65,
      sampleStep: 2,
      segmentsPerChunk: 64,
      maximumDistance: 208,
      skirtDepth: 18,
      crackStrategy: "shared-power-of-two-edges-and-skirts",
    }),
    Object.freeze({
      id: "far",
      vertexResolution: 33,
      sampleStep: 4,
      segmentsPerChunk: 32,
      maximumDistance: Number.POSITIVE_INFINITY,
      skirtDepth: 18,
      crackStrategy: "shared-power-of-two-edges-and-skirts",
    }),
  ]);

export type TerrainArtifactV2Chunk = Readonly<{
  id: string;
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
  maximumLod: 2;
  skirtDepth: number;
  chunkX: number;
  chunkZ: number;
  sampleMinX: number;
  sampleMaxX: number;
  sampleMinZ: number;
  sampleMaxZ: number;
  worldMinX: number;
  worldMaxX: number;
  worldMinZ: number;
  worldMaxZ: number;
}>;

export type TerrainArtifactV2Metrics = Readonly<{
  sampleCount: number;
  allocatedBytes: number;
  minimumHeight: number;
  maximumHeight: number;
  meanHeight: number;
  maximumSlopeDegrees: number;
  drySamples: number;
  riverSamples: number;
  lakeSamples: number;
  oceanSamples: number;
  operatorCount: 7;
  checksums: Readonly<{
    height: string;
    materialWeights: string;
    landMask: string;
    hydrology: string;
    combined: string;
  }>;
}>;

export type TerrainArtifactV2 = Readonly<{
  schema: typeof TERRAIN_ARTIFACT_V2_SCHEMA;
  key: string;
  generatorRevision: typeof TERRAIN_ARTIFACT_V2_GENERATOR_REVISION;
  sourceTerrainKey: string;
  morphologySignature: string;
  metadataChecksum: string;
  /** Repository-derived and intentionally independent of theme and season. */
  structureKey: string;
  resolution: typeof TERRAIN_ARTIFACT_V2_RESOLUTION;
  envelope: WorldPlanEnvelope;
  chunkLods: typeof TERRAIN_ARTIFACT_V2_CHUNK_LODS;
  lodDefinitions: ReadonlyArray<TerrainArtifactV2LodDefinition>;
  chunks: ReadonlyArray<TerrainArtifactV2Chunk>;
  operators: ReadonlyArray<TerrainArtifactV2Operator>;
  heightField: Float32Array;
  /** Eight interleaved normalized byte weights; every texel sums to 255. */
  materialWeights: Uint8Array;
  landMask: Uint8Array;
  waterDepth: Float32Array;
  flow: Readonly<{ x: Float32Array; z: Float32Array }>;
  wetness: Uint8Array;
  hydrology: Readonly<{
    kind: Uint8Array;
    surfaceHeight: Float32Array;
  }>;
  metrics: TerrainArtifactV2Metrics;
}>;

export type CreateTerrainArtifactV2Input = Readonly<{
  plan: WorldPlan;
  design: WorldDesignSpecV3;
}>;

export type TerrainArtifactV2SampleMode = "clamp" | "reject";

export type TerrainArtifactV2CollisionSample = Readonly<{
  x: number;
  z: number;
  height: number;
  normal: readonly [number, number, number];
  slopeDegrees: number;
  landCoverage: number;
  hydrologyKind: TerrainArtifactV2HydrologyKind;
  waterDepth: number;
  waterSurfaceHeight: number | null;
  flow: Readonly<{ x: number; z: number }>;
  walkable: boolean;
}>;

export type TerrainArtifactV2NavigationOptions = Readonly<{
  maximumSlopeDegrees?: number;
  maximumWaterDepth?: number;
  minimumLandCoverage?: number;
}>;

export type TerrainArtifactV2MeshData = Readonly<{
  requestedLod: TerrainArtifactV2LodId;
  effectiveLod: TerrainArtifactV2LodId;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  materialWeights: Uint8Array;
  landCoverage: Uint8Array;
  sourceSampleIndices: Uint32Array;
  indices: Uint32Array;
  vertexCount: number;
  triangleCount: number;
  topVertexCount: number;
  topTriangleCount: number;
  skirtVertexCount: number;
  skirtTriangleCount: number;
  skirtStartVertex: number;
  edgeSampleIndices: Readonly<{
    north: Uint32Array;
    east: Uint32Array;
    south: Uint32Array;
    west: Uint32Array;
  }>;
}>;

export type TerrainArtifactV2WaterMeshData = Readonly<{
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  depth: Float32Array;
  wetness: Uint8Array;
  flow: Float32Array;
  sourceSampleIndices: Uint32Array;
  indices: Uint32Array;
  vertexCount: number;
  triangleCount: number;
}>;

type CorridorQuery = Readonly<{
  distance: number;
  progress: number;
  tangentX: number;
  tangentZ: number;
}>;

type GridCoordinate = Readonly<{
  gridX: number;
  gridZ: number;
  u: number;
  v: number;
}>;

const MATERIAL_CHANNEL_COUNT = TERRAIN_ARTIFACT_V2_MATERIAL_CHANNELS.length;
const SAMPLE_CELLS = TERRAIN_ARTIFACT_V2_RESOLUTION - 1;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function mix(first: number, second: number, amount: number): number {
  return first + (second - first) * amount;
}

function round(value: number, precision = 1_000_000): number {
  return Math.round(value * precision) / precision;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function smootherstep(value: number): number {
  const normalized = clamp(value, 0, 1);
  return normalized * normalized * normalized * (normalized * (normalized * 6 - 15) + 10);
}

function hashLattice(seed: number, x: number, z: number): number {
  let value = seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1);
  value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return ((value ^ (value >>> 16)) >>> 0) / 0x1_0000_0000;
}

function valueNoise(seed: number, x: number, z: number): number {
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const localX = smootherstep(x - cellX);
  const localZ = smootherstep(z - cellZ);
  const northWest = hashLattice(seed, cellX, cellZ) * 2 - 1;
  const northEast = hashLattice(seed, cellX + 1, cellZ) * 2 - 1;
  const southWest = hashLattice(seed, cellX, cellZ + 1) * 2 - 1;
  const southEast = hashLattice(seed, cellX + 1, cellZ + 1) * 2 - 1;
  return mix(mix(northWest, northEast, localX), mix(southWest, southEast, localX), localZ);
}

function fractalNoise(seed: number, x: number, z: number): number {
  return (
    valueNoise(seed, x * 1.1, z * 1.1) * 0.52 +
    valueNoise(seed + 0x51f, x * 2.7, z * 2.7) * 0.29 +
    valueNoise(seed + 0xa97, x * 6.4, z * 6.4) * 0.14 +
    valueNoise(seed + 0x12d1, x * 13.8, z * 13.8) * 0.05
  );
}

function ellipseRadius(mask: EllipseRegionMask, x: number, z: number): number {
  const cosine = Math.cos(-mask.rotation);
  const sine = Math.sin(-mask.rotation);
  const deltaX = x - mask.center.x;
  const deltaZ = z - mask.center.z;
  const localX = deltaX * cosine - deltaZ * sine;
  const localZ = deltaX * sine + deltaZ * cosine;
  return Math.hypot(localX / Math.max(mask.radiusX, 0.001), localZ / Math.max(mask.radiusZ, 0.001));
}

function queryCorridor(mask: CorridorRegionMask, point: WorldPlanPoint): CorridorQuery {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestProgress = 0;
  let bestTangentX = 0;
  let bestTangentZ = 1;
  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let index = 0; index < mask.points.length - 1; index += 1) {
    const start = mask.points[index]!;
    const end = mask.points[index + 1]!;
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    segmentLengths.push(length);
    totalLength += length;
  }
  const progressBlendScale = Math.max(mask.width * 0.75, 0.5);
  let progressWeight = 0;
  let weightedProgress = 0;
  let traversed = 0;
  for (let index = 0; index < mask.points.length - 1; index += 1) {
    const start = mask.points[index]!;
    const end = mask.points[index + 1]!;
    const deltaX = end.x - start.x;
    const deltaZ = end.z - start.z;
    const length = segmentLengths[index] ?? 0;
    const lengthSquared = Math.max(length * length, Number.EPSILON);
    const segmentProgress = clamp(
      ((point.x - start.x) * deltaX + (point.z - start.z) * deltaZ) / lengthSquared,
      0,
      1,
    );
    const closestX = start.x + deltaX * segmentProgress;
    const closestZ = start.z + deltaZ * segmentProgress;
    const distance = Math.hypot(point.x - closestX, point.z - closestZ);
    const courseProgress =
      totalLength > 0 ? (traversed + length * segmentProgress) / totalLength : 0;
    const weight = Math.exp(-(distance * distance) / (2 * progressBlendScale * progressBlendScale));
    weightedProgress += courseProgress * weight;
    progressWeight += weight;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestProgress = courseProgress;
      bestTangentX = length > 0 ? deltaX / length : 0;
      bestTangentZ = length > 0 ? deltaZ / length : 1;
    }
    traversed += length;
  }
  return {
    distance: bestDistance,
    // Blend nearby topological segment progress values so a self-approaching
    // meander cannot switch abruptly to a distant downstream elevation.
    progress: clamp(progressWeight > 1e-8 ? weightedProgress / progressWeight : bestProgress, 0, 1),
    tangentX: bestTangentX,
    tangentZ: bestTangentZ,
  };
}

function requiredWaterMasks(design: WorldDesignSpecV3): Readonly<{
  river: CorridorRegionMask;
  lake: EllipseRegionMask;
}> {
  const river = design.terrain.zones.find(
    (zone) => zone.kind === "watershed" && zone.mask.shape === "corridor",
  )?.mask;
  const lake = design.terrain.zones.find(
    (zone) => zone.kind === "lake" && zone.mask.shape === "ellipse",
  )?.mask;
  if (!river || river.shape !== "corridor" || river.points.length < 2) {
    throw new Error("TerrainArtifactV2 requires a watershed corridor with at least two points.");
  }
  if (!lake || lake.shape !== "ellipse") {
    throw new Error("TerrainArtifactV2 requires one elliptical lake mask.");
  }
  return { river, lake };
}

function morphologySignature(design: WorldDesignSpecV3): string {
  const morphology = design.terrain.morphology;
  const identity = {
    ridgeBearingRadians: morphology.ridgeBearingRadians,
    ridgeBranches: morphology.ridgeBranches,
    basinCount: morphology.basinCount,
    shorelineLobes: morphology.shorelineLobes,
    watershedBranches: morphology.watershedBranches,
    coastOpening: morphology.coastOpening,
    relief: morphology.relief,
  };
  return `terrain-morphology-v3:${stableDigest(JSON.stringify(identity))}`;
}

function assertCompatibleDesign(plan: WorldPlan, design: WorldDesignSpecV3) {
  assertWorldDesignSpecV3Integrity(design);
  const source = design.sourcePlan;
  if (
    source.schema !== plan.schema ||
    source.version !== plan.version ||
    source.topologyKey !== plan.topologyKey ||
    source.terrainKey !== plan.terrainKey ||
    source.placementKey !== plan.placementKey
  ) {
    throw new Error(
      "TerrainArtifactV2 requires a WorldDesignSpecV3 built from the same topology, terrain, and placement keys.",
    );
  }
  if (design.terrain.artifactResolution !== TERRAIN_ARTIFACT_V2_RESOLUTION) {
    throw new Error("TerrainArtifactV2 design resolution must be 513.");
  }
  if (
    design.terrain.chunkLods.some(
      (resolution, index) => resolution !== TERRAIN_ARTIFACT_V2_CHUNK_LODS[index],
    )
  ) {
    throw new Error("TerrainArtifactV2 design chunk LODs must be 129, 65, and 33.");
  }
  const envelope = design.terrain.envelope;
  const planEnvelope = plan.topology.envelope;
  const canonicalEnvelope = cloneEnvelope(envelope);
  const canonicalPlanEnvelope = cloneEnvelope(planEnvelope);
  validateEnvelope(canonicalEnvelope);
  validateEnvelope(canonicalPlanEnvelope);
  if (JSON.stringify(canonicalEnvelope) !== JSON.stringify(canonicalPlanEnvelope)) {
    throw new Error("TerrainArtifactV2 design envelope does not match its source plan.");
  }
  const requiredOperators: ReadonlyArray<TerrainArtifactV2OperatorKind> = [
    "ridge",
    "basin",
    "terrace",
    "river-valley",
    "cliff",
    "erosion-channel",
    "irregular-shoreline",
  ];
  if (
    requiredOperators.some(
      (kind) => !design.terrain.operators.some((operator) => operator.kind === kind),
    )
  ) {
    throw new Error("TerrainArtifactV2 design is missing a required geomorphic operator.");
  }
  if (
    design.terrain.operators.some(
      (operator) =>
        !Number.isFinite(operator.weight) || operator.weight <= 0 || operator.weight > 4,
    )
  ) {
    throw new Error("TerrainArtifactV2 geomorphic operator weights must be finite and bounded.");
  }
  const morphology = design.terrain.morphology;
  const morphologyNumbers = [
    morphology.ridgeBearingRadians,
    morphology.ridgeBranches,
    morphology.basinCount,
    morphology.shorelineLobes,
    morphology.watershedBranches,
    morphology.relief,
  ];
  if (
    !morphologyNumbers.every(Number.isFinite) ||
    !Number.isInteger(morphology.ridgeBranches) ||
    !Number.isInteger(morphology.basinCount) ||
    !Number.isInteger(morphology.shorelineLobes) ||
    !Number.isInteger(morphology.watershedBranches) ||
    morphology.ridgeBranches < 1 ||
    morphology.ridgeBranches > 8 ||
    morphology.basinCount < 1 ||
    morphology.basinCount > 8 ||
    morphology.shorelineLobes < 3 ||
    morphology.shorelineLobes > 24 ||
    morphology.watershedBranches < 1 ||
    morphology.watershedBranches > 8 ||
    morphology.relief <= 0 ||
    morphology.relief > 2 ||
    !(["north", "east", "south", "west"] as const).includes(morphology.coastOpening)
  ) {
    throw new Error("TerrainArtifactV2 requires finite, positive, bounded morphology controls.");
  }
  if (morphology.signature !== morphologySignature(design)) {
    throw new Error("TerrainArtifactV2 morphology signature does not match its controls.");
  }
}

function validateEnvelope(envelope: WorldPlanEnvelope) {
  const values = [
    envelope.minX,
    envelope.maxX,
    envelope.minZ,
    envelope.maxZ,
    envelope.width,
    envelope.depth,
    envelope.center.x,
    envelope.center.z,
    envelope.safeMargin,
  ];
  const expectedWidth = envelope.maxX - envelope.minX;
  const expectedDepth = envelope.maxZ - envelope.minZ;
  const expectedCenterX = (envelope.minX + envelope.maxX) * 0.5;
  const expectedCenterZ = (envelope.minZ + envelope.maxZ) * 0.5;
  // WorldPlan serializes envelope fields to 0.001 precision; accept that exact
  // compiler quantization while rejecting materially incoherent bounds.
  const tolerance = Math.max(0.001, Math.max(envelope.width, envelope.depth) * 1e-8);
  if (
    !values.every(Number.isFinite) ||
    envelope.width <= 0 ||
    envelope.depth <= 0 ||
    expectedWidth <= 0 ||
    expectedDepth <= 0 ||
    Math.abs(envelope.width - expectedWidth) > tolerance ||
    Math.abs(envelope.depth - expectedDepth) > tolerance ||
    Math.abs(envelope.center.x - expectedCenterX) > tolerance ||
    Math.abs(envelope.center.z - expectedCenterZ) > tolerance ||
    envelope.safeMargin < 0 ||
    envelope.safeMargin > Math.min(envelope.width, envelope.depth) * 0.5
  ) {
    throw new Error("TerrainArtifactV2 requires a finite, positive world envelope.");
  }
}

function createOperators(
  envelope: WorldPlanEnvelope,
  design: WorldDesignSpecV3,
): ReadonlyArray<TerrainArtifactV2Operator> {
  const span = Math.max(envelope.width, envelope.depth);
  const reliefScale = 0.65 + design.terrain.morphology.relief * 0.7;
  const weight = (kind: TerrainArtifactV2OperatorKind) =>
    design.terrain.operators.find((operator) => operator.kind === kind)?.weight ?? 1;
  return Object.freeze([
    Object.freeze({
      kind: "ridge",
      scaleMeters: round(span * 0.34),
      amplitudeMeters: round(25 * reliefScale * weight("ridge")),
    }),
    Object.freeze({
      kind: "basin",
      scaleMeters: round(span * 0.19),
      amplitudeMeters: round(-6.4 * reliefScale * weight("basin")),
    }),
    Object.freeze({
      kind: "terrace",
      scaleMeters: round(span * 0.075),
      amplitudeMeters: round(4.2 * weight("terrace")),
    }),
    Object.freeze({
      kind: "river-valley",
      scaleMeters: round(span * 0.11),
      amplitudeMeters: round(-4.8 * weight("river-valley")),
    }),
    Object.freeze({
      kind: "cliff",
      scaleMeters: round(span * 0.055),
      amplitudeMeters: round(6.2 * reliefScale * weight("cliff")),
    }),
    Object.freeze({
      kind: "erosion-channel",
      scaleMeters: round(span * 0.024),
      amplitudeMeters: round(-3.1 * reliefScale * weight("erosion-channel")),
    }),
    Object.freeze({
      kind: "irregular-shoreline",
      scaleMeters: round(span * 0.018),
      amplitudeMeters: round(-7.2 * weight("irregular-shoreline")),
    }),
  ]);
}

function cloneEnvelope(envelope: WorldPlanEnvelope): WorldPlanEnvelope {
  const safeMargin = Number.isFinite(envelope.safeMargin) ? envelope.safeMargin : 0;
  return Object.freeze({
    minX: envelope.minX,
    maxX: envelope.maxX,
    minZ: envelope.minZ,
    maxZ: envelope.maxZ,
    width: envelope.width,
    depth: envelope.depth,
    center: Object.freeze({ x: envelope.center.x, z: envelope.center.z }),
    safeMargin,
  });
}

function createChunks(envelope: WorldPlanEnvelope): ReadonlyArray<TerrainArtifactV2Chunk> {
  const chunks: TerrainArtifactV2Chunk[] = [];
  for (let chunkZ = 0; chunkZ < TERRAIN_ARTIFACT_V2_CHUNKS_PER_AXIS; chunkZ += 1) {
    for (let chunkX = 0; chunkX < TERRAIN_ARTIFACT_V2_CHUNKS_PER_AXIS; chunkX += 1) {
      const sampleMinX = chunkX * TERRAIN_ARTIFACT_V2_CHUNK_CELLS;
      const sampleMinZ = chunkZ * TERRAIN_ARTIFACT_V2_CHUNK_CELLS;
      const sampleMaxX = sampleMinX + TERRAIN_ARTIFACT_V2_CHUNK_CELLS;
      const sampleMaxZ = sampleMinZ + TERRAIN_ARTIFACT_V2_CHUNK_CELLS;
      chunks.push(
        Object.freeze({
          id: `terrain-v2-chunk-${chunkX}-${chunkZ}`,
          bounds: Object.freeze({
            minX: round(envelope.minX + (sampleMinX / SAMPLE_CELLS) * envelope.width),
            maxX: round(envelope.minX + (sampleMaxX / SAMPLE_CELLS) * envelope.width),
            minZ: round(envelope.minZ + (sampleMinZ / SAMPLE_CELLS) * envelope.depth),
            maxZ: round(envelope.minZ + (sampleMaxZ / SAMPLE_CELLS) * envelope.depth),
          }),
          maximumLod: 2,
          skirtDepth: TERRAIN_ARTIFACT_V2_LOD_DEFINITIONS[2]!.skirtDepth,
          chunkX,
          chunkZ,
          sampleMinX,
          sampleMaxX,
          sampleMinZ,
          sampleMaxZ,
          worldMinX: round(envelope.minX + (sampleMinX / SAMPLE_CELLS) * envelope.width),
          worldMaxX: round(envelope.minX + (sampleMaxX / SAMPLE_CELLS) * envelope.width),
          worldMinZ: round(envelope.minZ + (sampleMinZ / SAMPLE_CELLS) * envelope.depth),
          worldMaxZ: round(envelope.minZ + (sampleMaxZ / SAMPLE_CELLS) * envelope.depth),
        }),
      );
    }
  }
  return Object.freeze(chunks);
}

function encodeNormalizedWeights(target: Uint8Array, offset: number, raw: readonly number[]) {
  const sum = raw.reduce((total, value) => total + Math.max(0, value), 0);
  let encodedSum = 0;
  let dominant = 0;
  for (let channel = 1; channel < raw.length; channel += 1) {
    if ((raw[channel] ?? 0) > (raw[dominant] ?? 0)) dominant = channel;
  }
  for (let channel = 0; channel < MATERIAL_CHANNEL_COUNT; channel += 1) {
    const encoded = sum > 0 ? Math.floor((Math.max(0, raw[channel] ?? 0) / sum) * 255) : 0;
    target[offset + channel] = encoded;
    encodedSum += encoded;
  }
  target[offset + dominant] = (target[offset + dominant] ?? 0) + (255 - encodedSum);
}

function checksumBytes(values: Uint8Array, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let index = 0; index < values.length; index += 1) {
    hash ^= values[index]!;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function checksumFloats(values: Float32Array, scale: number, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    const encoded = Number.isFinite(value) ? Math.round(value * scale) : 0x7fffffff;
    hash ^= encoded;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function checksumLabel(value: number): string {
  return value.toString(16).padStart(8, "0");
}

export function createTerrainArtifactV2BufferChecksums(
  input: Readonly<{
    heightField: Float32Array;
    materialWeights: Uint8Array;
    landMask: Uint8Array;
    hydrologyKind: Uint8Array;
    wetness: Uint8Array;
    waterDepth: Float32Array;
    flowX: Float32Array;
    flowZ: Float32Array;
    surfaceHeight: Float32Array;
  }>,
): TerrainArtifactV2Metrics["checksums"] {
  const heightChecksum = checksumFloats(input.heightField, 1_000);
  const weightChecksum = checksumBytes(input.materialWeights);
  const landMaskChecksum = checksumBytes(input.landMask);
  let hydrologyChecksum = checksumBytes(input.hydrologyKind);
  hydrologyChecksum = checksumBytes(input.wetness, hydrologyChecksum);
  hydrologyChecksum = checksumFloats(input.waterDepth, 1_000, hydrologyChecksum);
  hydrologyChecksum = checksumFloats(input.flowX, 10_000, hydrologyChecksum);
  hydrologyChecksum = checksumFloats(input.flowZ, 10_000, hydrologyChecksum);
  hydrologyChecksum = checksumFloats(input.surfaceHeight, 1_000, hydrologyChecksum);
  const combinedChecksum =
    Math.imul(
      heightChecksum ^ weightChecksum ^ landMaskChecksum ^ hydrologyChecksum,
      0x9e3779b1,
    ) >>> 0;
  return Object.freeze({
    height: checksumLabel(heightChecksum),
    materialWeights: checksumLabel(weightChecksum),
    landMask: checksumLabel(landMaskChecksum),
    hydrology: checksumLabel(hydrologyChecksum),
    combined: checksumLabel(combinedChecksum),
  });
}

export function deriveTerrainArtifactV2Key(
  input: Readonly<{
    structureKey: string;
    morphologySignature: string;
    sourceTerrainKey: string;
    metadataChecksum: string;
    combinedChecksum: string;
  }>,
): string {
  return `terrain-artifact-v2:${stableDigest(
    `${TERRAIN_ARTIFACT_V2_SCHEMA}:${TERRAIN_ARTIFACT_V2_GENERATOR_REVISION}:${input.structureKey}:${input.morphologySignature}:${input.sourceTerrainKey}:${TERRAIN_ARTIFACT_V2_RESOLUTION}:${input.metadataChecksum}:${input.combinedChecksum}`,
  )}`;
}

function terrainArtifactV2MetadataChecksum(
  input: Readonly<{
    envelope: WorldPlanEnvelope;
    chunkLods: typeof TERRAIN_ARTIFACT_V2_CHUNK_LODS;
    lodDefinitions: ReadonlyArray<TerrainArtifactV2LodDefinition>;
    chunks: ReadonlyArray<TerrainArtifactV2Chunk>;
    operators: ReadonlyArray<TerrainArtifactV2Operator>;
    metrics: Omit<TerrainArtifactV2Metrics, "checksums">;
  }>,
): string {
  return `terrain-metadata-v2:${stableDigest(JSON.stringify(input))}`;
}

function assertTerrainBufferTypeAndLength(
  label: string,
  value: unknown,
  constructor: typeof Float32Array | typeof Uint8Array,
  length: number,
): asserts value is Float32Array | Uint8Array {
  if (!(value instanceof constructor) || value.length !== length) {
    throw new Error(
      `TerrainArtifactV2 ${label} must be a ${constructor.name} with ${length} entries.`,
    );
  }
}

/**
 * Validates a structured-cloned or cache-restored terrain artifact exactly
 * once before ownership is transferred to rendering/navigation consumers.
 * Typed arrays cannot be deeply frozen, so content identity is proven by
 * recomputing every buffer checksum and the generator-versioned artifact key.
 */
export function assertTerrainArtifactV2Integrity(
  artifact: TerrainArtifactV2,
): asserts artifact is TerrainArtifactV2 {
  if (
    artifact.schema !== TERRAIN_ARTIFACT_V2_SCHEMA ||
    artifact.generatorRevision !== TERRAIN_ARTIFACT_V2_GENERATOR_REVISION ||
    artifact.resolution !== TERRAIN_ARTIFACT_V2_RESOLUTION
  ) {
    throw new Error("TerrainArtifactV2 has an unsupported schema, generator, or resolution.");
  }
  for (const [label, value] of [
    ["key", artifact.key],
    ["structure key", artifact.structureKey],
    ["source terrain key", artifact.sourceTerrainKey],
    ["morphology signature", artifact.morphologySignature],
    ["metadata checksum", artifact.metadataChecksum],
  ] as const) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`TerrainArtifactV2 ${label} must not be empty.`);
    }
  }
  validateEnvelope(artifact.envelope);
  if (JSON.stringify(artifact.chunkLods) !== JSON.stringify(TERRAIN_ARTIFACT_V2_CHUNK_LODS)) {
    throw new Error("TerrainArtifactV2 chunk LOD tuple is not canonical.");
  }
  if (
    JSON.stringify(artifact.lodDefinitions) !== JSON.stringify(TERRAIN_ARTIFACT_V2_LOD_DEFINITIONS)
  ) {
    throw new Error("TerrainArtifactV2 LOD definitions are not canonical.");
  }
  if (JSON.stringify(artifact.chunks) !== JSON.stringify(createChunks(artifact.envelope))) {
    throw new Error("TerrainArtifactV2 chunk metadata does not match its envelope.");
  }
  const requiredOperatorKinds = new Set<TerrainArtifactV2OperatorKind>([
    "ridge",
    "basin",
    "terrace",
    "river-valley",
    "cliff",
    "erosion-channel",
    "irregular-shoreline",
  ]);
  if (
    artifact.operators.length !== requiredOperatorKinds.size ||
    artifact.operators.some(
      ({ kind, scaleMeters, amplitudeMeters }) =>
        !requiredOperatorKinds.delete(kind) ||
        !Number.isFinite(scaleMeters) ||
        scaleMeters <= 0 ||
        scaleMeters > Math.max(artifact.envelope.width, artifact.envelope.depth) * 2 ||
        !Number.isFinite(amplitudeMeters) ||
        Math.abs(amplitudeMeters) > 64,
    ) ||
    requiredOperatorKinds.size !== 0
  ) {
    throw new Error("TerrainArtifactV2 geomorphic operator metadata is invalid.");
  }

  const sampleCount = TERRAIN_ARTIFACT_V2_RESOLUTION * TERRAIN_ARTIFACT_V2_RESOLUTION;
  assertTerrainBufferTypeAndLength("height field", artifact.heightField, Float32Array, sampleCount);
  assertTerrainBufferTypeAndLength(
    "material weights",
    artifact.materialWeights,
    Uint8Array,
    sampleCount * MATERIAL_CHANNEL_COUNT,
  );
  assertTerrainBufferTypeAndLength("land mask", artifact.landMask, Uint8Array, sampleCount);
  assertTerrainBufferTypeAndLength("water depth", artifact.waterDepth, Float32Array, sampleCount);
  assertTerrainBufferTypeAndLength("flow x", artifact.flow?.x, Float32Array, sampleCount);
  assertTerrainBufferTypeAndLength("flow z", artifact.flow?.z, Float32Array, sampleCount);
  assertTerrainBufferTypeAndLength("wetness", artifact.wetness, Uint8Array, sampleCount);
  assertTerrainBufferTypeAndLength(
    "hydrology kind",
    artifact.hydrology?.kind,
    Uint8Array,
    sampleCount,
  );
  assertTerrainBufferTypeAndLength(
    "surface height",
    artifact.hydrology?.surfaceHeight,
    Float32Array,
    sampleCount,
  );

  const hydrologyCounts = [0, 0, 0, 0];
  let minimumHeight = Number.POSITIVE_INFINITY;
  let maximumHeight = Number.NEGATIVE_INFINITY;
  let heightTotal = 0;
  let maximumSlopeDegrees = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const height = artifact.heightField[index]!;
    const depth = artifact.waterDepth[index]!;
    const flowX = artifact.flow.x[index]!;
    const flowZ = artifact.flow.z[index]!;
    const kind = artifact.hydrology.kind[index]!;
    const surface = artifact.hydrology.surfaceHeight[index]!;
    if (![height, depth, flowX, flowZ].every(Number.isFinite) || depth < 0) {
      throw new Error(`TerrainArtifactV2 has invalid finite buffer data at sample ${index}.`);
    }
    if (kind > TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.ocean) {
      throw new Error(`TerrainArtifactV2 has an invalid hydrology kind at sample ${index}.`);
    }
    if (
      (kind === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry && !Number.isNaN(surface)) ||
      (kind !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry && !Number.isFinite(surface))
    ) {
      throw new Error(`TerrainArtifactV2 has an invalid hydrology surface at sample ${index}.`);
    }
    hydrologyCounts[kind] = hydrologyCounts[kind]! + 1;
    minimumHeight = Math.min(minimumHeight, height);
    maximumHeight = Math.max(maximumHeight, height);
    heightTotal += height;
    maximumSlopeDegrees = Math.max(
      maximumSlopeDegrees,
      sampleSlopeDegrees(
        artifact.heightField,
        artifact.envelope,
        index % TERRAIN_ARTIFACT_V2_RESOLUTION,
        Math.floor(index / TERRAIN_ARTIFACT_V2_RESOLUTION),
      ),
    );
    let weightTotal = 0;
    const weightOffset = index * MATERIAL_CHANNEL_COUNT;
    for (let channel = 0; channel < MATERIAL_CHANNEL_COUNT; channel += 1) {
      weightTotal += artifact.materialWeights[weightOffset + channel]!;
    }
    if (weightTotal !== 255) {
      throw new Error(`TerrainArtifactV2 material weights must sum to 255 at sample ${index}.`);
    }
  }

  const checksums = createTerrainArtifactV2BufferChecksums({
    heightField: artifact.heightField,
    materialWeights: artifact.materialWeights,
    landMask: artifact.landMask,
    hydrologyKind: artifact.hydrology.kind,
    wetness: artifact.wetness,
    waterDepth: artifact.waterDepth,
    flowX: artifact.flow.x,
    flowZ: artifact.flow.z,
    surfaceHeight: artifact.hydrology.surfaceHeight,
  });
  if (JSON.stringify(checksums) !== JSON.stringify(artifact.metrics.checksums)) {
    throw new Error("TerrainArtifactV2 buffer checksums do not match its metrics identity.");
  }
  const allocatedBytes =
    artifact.heightField.byteLength +
    artifact.materialWeights.byteLength +
    artifact.landMask.byteLength +
    artifact.waterDepth.byteLength +
    artifact.flow.x.byteLength +
    artifact.flow.z.byteLength +
    artifact.wetness.byteLength +
    artifact.hydrology.kind.byteLength +
    artifact.hydrology.surfaceHeight.byteLength;
  if (
    artifact.metrics.sampleCount !== sampleCount ||
    artifact.metrics.allocatedBytes !== allocatedBytes ||
    artifact.metrics.drySamples !== hydrologyCounts[0] ||
    artifact.metrics.riverSamples !== hydrologyCounts[1] ||
    artifact.metrics.lakeSamples !== hydrologyCounts[2] ||
    artifact.metrics.oceanSamples !== hydrologyCounts[3]
  ) {
    throw new Error("TerrainArtifactV2 metrics do not match its transferred buffers.");
  }
  const recomputedMetrics: Omit<TerrainArtifactV2Metrics, "checksums"> = {
    sampleCount,
    allocatedBytes,
    minimumHeight: round(minimumHeight),
    maximumHeight: round(maximumHeight),
    meanHeight: round(heightTotal / sampleCount),
    maximumSlopeDegrees: round(maximumSlopeDegrees),
    drySamples: hydrologyCounts[0]!,
    riverSamples: hydrologyCounts[1]!,
    lakeSamples: hydrologyCounts[2]!,
    oceanSamples: hydrologyCounts[3]!,
    operatorCount: 7,
  };
  const metadataChecksum = terrainArtifactV2MetadataChecksum({
    envelope: artifact.envelope,
    chunkLods: artifact.chunkLods,
    lodDefinitions: artifact.lodDefinitions,
    chunks: artifact.chunks,
    operators: artifact.operators,
    metrics: recomputedMetrics,
  });
  if (
    JSON.stringify(recomputedMetrics) !==
      JSON.stringify({
        sampleCount: artifact.metrics.sampleCount,
        allocatedBytes: artifact.metrics.allocatedBytes,
        minimumHeight: artifact.metrics.minimumHeight,
        maximumHeight: artifact.metrics.maximumHeight,
        meanHeight: artifact.metrics.meanHeight,
        maximumSlopeDegrees: artifact.metrics.maximumSlopeDegrees,
        drySamples: artifact.metrics.drySamples,
        riverSamples: artifact.metrics.riverSamples,
        lakeSamples: artifact.metrics.lakeSamples,
        oceanSamples: artifact.metrics.oceanSamples,
        operatorCount: artifact.metrics.operatorCount,
      }) ||
    artifact.metadataChecksum !== metadataChecksum
  ) {
    throw new Error("TerrainArtifactV2 scalar metadata does not match its generated content.");
  }
  const expectedKey = deriveTerrainArtifactV2Key({
    structureKey: artifact.structureKey,
    morphologySignature: artifact.morphologySignature,
    sourceTerrainKey: artifact.sourceTerrainKey,
    metadataChecksum,
    combinedChecksum: checksums.combined,
  });
  if (artifact.key !== expectedKey) {
    throw new Error("TerrainArtifactV2 key does not match its generator and buffer identity.");
  }
}

function sampleIndex(gridX: number, gridZ: number): number {
  return gridZ * TERRAIN_ARTIFACT_V2_RESOLUTION + gridX;
}

function createReceivingWaterDistance(hydrologyKind: Uint8Array): Int32Array {
  const distances = new Int32Array(hydrologyKind.length);
  distances.fill(-1);
  const queue = new Int32Array(hydrologyKind.length);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < hydrologyKind.length; index += 1) {
    const kind = hydrologyKind[index];
    if (
      kind !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.lake &&
      kind !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.ocean
    ) {
      continue;
    }
    distances[index] = 0;
    queue[tail] = index;
    tail += 1;
  }
  while (head < tail) {
    const index = queue[head]!;
    head += 1;
    const gridX = index % TERRAIN_ARTIFACT_V2_RESOLUTION;
    const gridZ = Math.floor(index / TERRAIN_ARTIFACT_V2_RESOLUTION);
    for (const [offsetX, offsetZ] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const neighborX = gridX + offsetX;
      const neighborZ = gridZ + offsetZ;
      if (
        neighborX < 0 ||
        neighborX >= TERRAIN_ARTIFACT_V2_RESOLUTION ||
        neighborZ < 0 ||
        neighborZ >= TERRAIN_ARTIFACT_V2_RESOLUTION
      ) {
        continue;
      }
      const neighbor = sampleIndex(neighborX, neighborZ);
      if (
        distances[neighbor]! >= 0 ||
        hydrologyKind[neighbor] === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry
      ) {
        continue;
      }
      distances[neighbor] = distances[index]! + 1;
      queue[tail] = neighbor;
      tail += 1;
    }
  }
  return distances;
}

function sampleSlopeDegrees(
  heightField: Float32Array,
  envelope: WorldPlanEnvelope,
  gridX: number,
  gridZ: number,
): number {
  const leftX = Math.max(0, gridX - 1);
  const rightX = Math.min(SAMPLE_CELLS, gridX + 1);
  const northZ = Math.max(0, gridZ - 1);
  const southZ = Math.min(SAMPLE_CELLS, gridZ + 1);
  const deltaWorldX = ((rightX - leftX) * envelope.width) / SAMPLE_CELLS;
  const deltaWorldZ = ((southZ - northZ) * envelope.depth) / SAMPLE_CELLS;
  const slopeX =
    (heightField[sampleIndex(rightX, gridZ)]! - heightField[sampleIndex(leftX, gridZ)]!) /
    Math.max(deltaWorldX, Number.EPSILON);
  const slopeZ =
    (heightField[sampleIndex(gridX, southZ)]! - heightField[sampleIndex(gridX, northZ)]!) /
    Math.max(deltaWorldZ, Number.EPSILON);
  return (Math.atan(Math.hypot(slopeX, slopeZ)) * 180) / Math.PI;
}

/**
 * Builds the canonical repository terrain artifact. It imports no renderer,
 * browser, or React state and can run unchanged inside a module worker.
 */
export function createTerrainArtifactV2({
  plan,
  design,
}: CreateTerrainArtifactV2Input): TerrainArtifactV2 {
  assertCompatibleDesign(plan, design);
  const envelope = cloneEnvelope(design.terrain.envelope);
  validateEnvelope(envelope);
  const { river, lake } = requiredWaterMasks(design);
  const morphology = design.terrain.morphology;
  // Theme-specific ecology is structural for placement/cache identity, but it
  // must not move repository geography. Terrain is seeded only by the
  // theme-invariant terrain key and authenticated morphology.
  const seed = stableHash(`${plan.terrainKey}:${morphology.signature}`);
  const reliefScale = 0.65 + morphology.relief * 0.7;
  const operatorWeight = (kind: TerrainArtifactV2OperatorKind) =>
    design.terrain.operators.find((operator) => operator.kind === kind)?.weight ?? 1;
  const sampleCount = TERRAIN_ARTIFACT_V2_RESOLUTION * TERRAIN_ARTIFACT_V2_RESOLUTION;
  const heightField = new Float32Array(sampleCount);
  const materialWeights = new Uint8Array(sampleCount * MATERIAL_CHANNEL_COUNT);
  const landMask = new Uint8Array(sampleCount);
  const waterDepth = new Float32Array(sampleCount);
  const flowX = new Float32Array(sampleCount);
  const flowZ = new Float32Array(sampleCount);
  const wetness = new Uint8Array(sampleCount);
  const hydrologyKind = new Uint8Array(sampleCount);
  const surfaceHeight = new Float32Array(sampleCount);
  surfaceHeight.fill(Number.NaN);

  const phaseA = ((seed & 0xffff) / 0xffff) * Math.PI * 2;
  const phaseB = (((seed >>> 16) & 0xffff) / 0xffff) * Math.PI * 2;
  const coastOpeningAngle = {
    north: -Math.PI * 0.5,
    east: 0,
    south: Math.PI * 0.5,
    west: Math.PI,
  }[morphology.coastOpening];
  const secondaryBasins = Array.from(
    { length: Math.max(0, morphology.basinCount - 1) },
    (_, index) => {
      const basinSeed = seed + 0x4d1 + index * 0x127;
      const angle = hashLattice(basinSeed, index, 3) * Math.PI * 2;
      const radius = 0.18 + hashLattice(basinSeed, index, 7) * 0.36;
      return {
        centerX: Math.cos(angle) * radius,
        centerZ: Math.sin(angle) * radius,
        radiusX: 0.16 + hashLattice(basinSeed, index, 11) * 0.13,
        radiusZ: 0.14 + hashLattice(basinSeed, index, 17) * 0.12,
        depth: 1.35 + hashLattice(basinSeed, index, 23) * 1.65,
      };
    },
  );
  const hamletMasks = design.regions
    .filter((region) => region.hamlet !== null)
    .map((region, index) => ({
      mask: region.mask,
      targetHeight:
        2.1 +
        valueNoise(
          seed + 0x2f31 + index * 17,
          (region.mask.center.x - envelope.center.x) / Math.max(envelope.width, 1),
          (region.mask.center.z - envelope.center.z) / Math.max(envelope.depth, 1),
        ) *
          0.65,
    }));

  let minimumHeight = Number.POSITIVE_INFINITY;
  let maximumHeight = Number.NEGATIVE_INFINITY;
  let heightTotal = 0;
  let drySamples = 0;
  let riverSamples = 0;
  let lakeSamples = 0;
  let oceanSamples = 0;

  for (let gridZ = 0; gridZ < TERRAIN_ARTIFACT_V2_RESOLUTION; gridZ += 1) {
    const v = gridZ / SAMPLE_CELLS;
    const z = envelope.minZ + v * envelope.depth;
    const normalizedZ = (z - envelope.center.z) / (envelope.depth * 0.5);
    for (let gridX = 0; gridX < TERRAIN_ARTIFACT_V2_RESOLUTION; gridX += 1) {
      const u = gridX / SAMPLE_CELLS;
      const x = envelope.minX + u * envelope.width;
      const normalizedX = (x - envelope.center.x) / (envelope.width * 0.5);
      const index = sampleIndex(gridX, gridZ);
      const angle = Math.atan2(normalizedZ, normalizedX);
      const coastAngleDistance = Math.abs(
        Math.atan2(Math.sin(angle - coastOpeningAngle), Math.cos(angle - coastOpeningAngle)),
      );
      const coastOpening = Math.exp(-Math.pow(coastAngleDistance / 0.34, 2));
      const shorelineNoise = fractalNoise(seed + 0x713, normalizedX * 2.4, normalizedZ * 2.4);
      const shorelineRadius =
        0.92 +
        Math.sin(angle * morphology.shorelineLobes + phaseA) * 0.065 +
        Math.sin(angle * (morphology.shorelineLobes + 3) - phaseB) * 0.032 +
        shorelineNoise * 0.042 * operatorWeight("irregular-shoreline") -
        coastOpening * 0.19;
      const ellipticalRadius = Math.hypot(normalizedX / 1.03, normalizedZ / 0.96);
      const shorelineSignedDistance = shorelineRadius - ellipticalRadius;
      const perimeterDistance = Math.min(u, 1 - u, v, 1 - v);
      const perimeterLandEnvelope = smoothstep(0.012, 0.055, perimeterDistance);
      const land = smoothstep(-0.045, 0.055, shorelineSignedDistance) * perimeterLandEnvelope;
      landMask[index] = Math.round(land * 255);

      const broadNoise = fractalNoise(seed + 0x119, normalizedX * 1.45, normalizedZ * 1.45);
      const fineNoise = fractalNoise(seed + 0x9c7, normalizedX * 4.7, normalizedZ * 4.7);
      let ridgeEnvelope = 0;
      for (let branch = 0; branch < morphology.ridgeBranches; branch += 1) {
        const branchOffset =
          morphology.ridgeBranches === 1 ? 0 : branch / (morphology.ridgeBranches - 1) - 0.5;
        const branchBearing = morphology.ridgeBearingRadians + branchOffset * 0.64;
        const branchCosine = Math.cos(branchBearing);
        const branchSine = Math.sin(branchBearing);
        const ridgeAlong = normalizedX * branchCosine + normalizedZ * branchSine;
        const ridgeAcross = -normalizedX * branchSine + normalizedZ * branchCosine;
        const ridgeAxis =
          -0.36 +
          branchOffset * 0.3 +
          Math.sin(ridgeAlong * (2.35 + branch * 0.17) + phaseB + branch * 0.71) * 0.055;
        const ridgeDistance = (ridgeAcross - ridgeAxis) / (branch === 0 ? 0.19 : 0.145);
        const branchEnvelope =
          Math.exp(-(ridgeDistance * ridgeDistance)) * (branch === 0 ? 1 : 0.76);
        ridgeEnvelope = Math.max(ridgeEnvelope, branchEnvelope);
      }
      const ridgeBreakup = 0.68 + smoothstep(-0.65, 0.8, broadNoise) * 0.52;
      const ridge = ridgeEnvelope * ridgeBreakup * 25 * reliefScale * operatorWeight("ridge");
      const cliff =
        smoothstep(0.28, 0.69, ridgeEnvelope) *
        (4.8 + Math.max(0, fineNoise) * 1.4) *
        reliefScale *
        operatorWeight("cliff");
      const lakeRadius = ellipseRadius(lake, x, z);
      const lakeBoundaryNoise =
        fractalNoise(seed + 0x51d, normalizedX * 5.2, normalizedZ * 5.2) * 0.085 +
        Math.sin(angle * 5 + phaseA) * 0.025;
      const lakeBoundary = 1 + lakeBoundaryNoise;
      let basin = -(1 - smoothstep(0.22, 1.5, lakeRadius)) * 6.4;
      for (const secondaryBasin of secondaryBasins) {
        const basinRadius = Math.hypot(
          (normalizedX - secondaryBasin.centerX) / secondaryBasin.radiusX,
          (normalizedZ - secondaryBasin.centerZ) / secondaryBasin.radiusZ,
        );
        basin -= (1 - smoothstep(0.18, 1.24, basinRadius)) * secondaryBasin.depth;
      }
      basin *= reliefScale * operatorWeight("basin");
      const riverQuery = queryCorridor(river, { x, z });
      const variableRiverWidth =
        river.width *
        (0.4 +
          Math.sin(riverQuery.progress * Math.PI) * 0.15 +
          Math.sin(riverQuery.progress * Math.PI * (3 + morphology.watershedBranches) + phaseB) *
            0.035);
      const riverInfluence =
        1 - smoothstep(variableRiverWidth * 0.46, variableRiverWidth * 1.8, riverQuery.distance);
      const riverValley =
        -riverInfluence *
        (3.4 + (1 - riverQuery.progress) * 1.4) *
        reliefScale *
        operatorWeight("river-valley");
      const erosionSignal =
        1 - Math.abs(fractalNoise(seed + 0x1b91, normalizedX * 7.2, normalizedZ * 7.2));
      let watershedInfluence = 0;
      for (let branch = 0; branch < morphology.watershedBranches; branch += 1) {
        const branchOffset =
          morphology.watershedBranches === 1
            ? 0
            : branch / (morphology.watershedBranches - 1) - 0.5;
        const watershedBearing =
          morphology.ridgeBearingRadians + Math.PI * 0.5 + branchOffset * 0.82;
        const branchCosine = Math.cos(watershedBearing);
        const branchSine = Math.sin(watershedBearing);
        const watershedAlong = normalizedX * branchCosine + normalizedZ * branchSine;
        const watershedAcross = -normalizedX * branchSine + normalizedZ * branchCosine;
        const channelAxis =
          branchOffset * 0.62 +
          Math.sin(watershedAlong * (3.2 + branch * 0.29) + phaseA + branch) * 0.055;
        const branchDistance = Math.abs(watershedAcross - channelAxis);
        const branchInfluence =
          (1 - smoothstep(0.018, 0.072, branchDistance)) *
          smoothstep(-0.92, -0.56, watershedAlong) *
          (1 - smoothstep(0.72, 1.02, watershedAlong));
        watershedInfluence = Math.max(watershedInfluence, branchInfluence);
      }
      const erosionChannel =
        -Math.max(
          smoothstep(0.74, 0.94, erosionSignal) * smoothstep(0.1, 0.72, ridgeEnvelope),
          watershedInfluence * 0.82,
        ) *
        3.1 *
        reliefScale *
        operatorWeight("erosion-channel");
      const lowUndulation = (broadNoise * 2.35 + fineNoise * 0.68) * reliefScale;
      let height =
        (1.85 + lowUndulation + ridge + cliff + basin + riverValley + erosionChannel) * land +
        (-7.2 + fineNoise * 0.62) * (1 - land);

      for (const terrace of hamletMasks) {
        const radius = ellipseRadius(terrace.mask, x, z);
        const influence = 1 - smoothstep(0.72, 1.32, radius);
        if (influence > 0) {
          const microRelief = fineNoise * 0.12;
          height = mix(
            height,
            terrace.targetHeight + microRelief,
            influence * clamp(0.92 * operatorWeight("terrace"), 0, 1),
          );
        }
      }

      const lakeCoverage = smoothstep(lakeBoundary + 0.055, lakeBoundary - 0.035, lakeRadius);
      const lakeBankCoverage = smoothstep(lakeBoundary + 0.16, lakeBoundary - 0.14, lakeRadius);
      const riverCoverage =
        1 - smoothstep(variableRiverWidth * 0.38, variableRiverWidth * 0.58, riverQuery.distance);
      const riverBankCoverage =
        1 - smoothstep(variableRiverWidth * 0.38, variableRiverWidth * 1.8, riverQuery.distance);
      const oceanCoverage = 1 - smoothstep(0.18, 0.54, land);
      const lakeSurface = 0.42;
      const lakeTargetDepth =
        1.45 + (1 - clamp(lakeRadius / Math.max(lakeBoundary, 0.001), 0, 1)) * 2.2;
      const oceanSurface = 0;
      const oceanTargetDepth = 1.1 + oceanCoverage * 2.6;
      const courseSurface = mix(4.8, lakeSurface, riverQuery.progress);
      const lakeReceivingWeight = smoothstep(0.05, 0.78, lakeBankCoverage);
      const oceanReceivingWeight = 1 - smoothstep(-0.01, 0.2, shorelineSignedDistance);
      const receivingWeight = lakeReceivingWeight + oceanReceivingWeight;
      const receivingSurface =
        receivingWeight > 0
          ? (lakeSurface * lakeReceivingWeight + oceanSurface * oceanReceivingWeight) /
            receivingWeight
          : courseSurface;
      const riverSurface = mix(courseSurface, receivingSurface, clamp(receivingWeight, 0, 1));
      const riverTargetDepth = 0.72 + riverCoverage * 0.48;
      let bankCoverage = lakeBankCoverage;
      let bankSurface = lakeSurface;
      let bankTargetDepth = lakeTargetDepth;
      if (riverBankCoverage > bankCoverage) {
        bankCoverage = riverBankCoverage;
        bankSurface = riverSurface;
        bankTargetDepth = riverTargetDepth;
      }
      if (oceanCoverage > bankCoverage) {
        bankCoverage = oceanCoverage;
        bankSurface = oceanSurface;
        bankTargetDepth = oceanTargetDepth;
      }
      const bankDepth = bankTargetDepth * smoothstep(0.44, 0.96, bankCoverage);
      const bankCarve = smoothstep(0.015, 0.82, bankCoverage);
      height = mix(height, Math.min(height, bankSurface - bankDepth), bankCarve);
      wetness[index] = Math.round(smoothstep(0.01, 0.68, bankCoverage) * 255);

      let kind: TerrainArtifactV2HydrologyKind = TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry;
      let waterSurface = Number.NaN;
      let waterCoverage = 0;
      let waterTargetDepth = 0;
      if (lakeCoverage >= 0.5) {
        kind = TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.lake;
        waterSurface = lakeSurface;
        waterCoverage = lakeBankCoverage;
        waterTargetDepth = lakeTargetDepth;
        lakeSamples += 1;
      } else if (riverCoverage >= 0.5) {
        kind = TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.river;
        waterSurface = riverSurface;
        waterCoverage = riverBankCoverage;
        waterTargetDepth = riverTargetDepth;
        flowX[index] = riverQuery.tangentX;
        flowZ[index] = riverQuery.tangentZ;
        riverSamples += 1;
      } else if (oceanCoverage >= 0.5) {
        kind = TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.ocean;
        waterSurface = oceanSurface;
        waterCoverage = oceanCoverage;
        waterTargetDepth = oceanTargetDepth;
        oceanSamples += 1;
      } else {
        drySamples += 1;
      }

      if (kind !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry) {
        height = Math.min(
          height,
          waterSurface - waterTargetDepth * smoothstep(0.44, 0.96, waterCoverage),
        );
        surfaceHeight[index] = waterSurface;
        waterDepth[index] = Math.max(0, waterSurface - height);
      }

      heightField[index] = height;
      hydrologyKind[index] = kind;
      minimumHeight = Math.min(minimumHeight, height);
      maximumHeight = Math.max(maximumHeight, height);
      heightTotal += height;
    }
  }

  const relaxedSurfaceHeight = surfaceHeight.slice();
  const waterSurfaceEdges: Array<Readonly<{ first: number; second: number; maximumRise: number }>> =
    [];
  const waterSurfaceGrade = Math.tan((8 * Math.PI) / 180);
  const gridSpacingX = envelope.width / SAMPLE_CELLS;
  const gridSpacingZ = envelope.depth / SAMPLE_CELLS;
  for (let gridZ = 0; gridZ < TERRAIN_ARTIFACT_V2_RESOLUTION; gridZ += 1) {
    for (let gridX = 0; gridX < TERRAIN_ARTIFACT_V2_RESOLUTION; gridX += 1) {
      const index = sampleIndex(gridX, gridZ);
      if (hydrologyKind[index] === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry) continue;
      for (const [offsetX, offsetZ, spacing] of [
        [1, 0, gridSpacingX],
        [0, 1, gridSpacingZ],
      ] as const) {
        if (gridX + offsetX >= TERRAIN_ARTIFACT_V2_RESOLUTION) continue;
        if (gridZ + offsetZ >= TERRAIN_ARTIFACT_V2_RESOLUTION) continue;
        const neighbor = sampleIndex(gridX + offsetX, gridZ + offsetZ);
        if (hydrologyKind[neighbor] === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry) continue;
        waterSurfaceEdges.push({
          first: index,
          second: neighbor,
          // The route selector moves one axial sample at a time. Keep the
          // relaxation bound inside its absolute contract with Float32
          // headroom so every river sample retains a valid wet successor.
          maximumRise: Math.min(spacing * waterSurfaceGrade, MAXIMUM_WATER_FLOW_RISE_METERS),
        });
      }
    }
  }
  for (let pass = 0; pass < 256; pass += 1) {
    let changed = false;
    for (const { first, second, maximumRise } of waterSurfaceEdges) {
      const delta = relaxedSurfaceHeight[first]! - relaxedSurfaceHeight[second]!;
      if (Math.abs(delta) <= maximumRise + 1e-6) continue;
      const firstRiver = hydrologyKind[first] === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.river;
      const secondRiver = hydrologyKind[second] === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.river;
      if (!firstRiver && !secondRiver) continue;
      const correction = Math.abs(delta) - maximumRise;
      if (firstRiver && secondRiver) {
        const halfCorrection = correction * 0.5;
        relaxedSurfaceHeight[first] =
          relaxedSurfaceHeight[first]! + (delta > 0 ? -halfCorrection : halfCorrection);
        relaxedSurfaceHeight[second] =
          relaxedSurfaceHeight[second]! + (delta > 0 ? halfCorrection : -halfCorrection);
      } else if (firstRiver) {
        relaxedSurfaceHeight[first] =
          relaxedSurfaceHeight[first]! + (delta > 0 ? -correction : correction);
      } else {
        relaxedSurfaceHeight[second] =
          relaxedSurfaceHeight[second]! + (delta > 0 ? correction : -correction);
      }
      changed = true;
    }
    if (!changed) break;
  }
  for (let index = 0; index < sampleCount; index += 1) {
    if (hydrologyKind[index] !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.river) continue;
    const surfaceDelta = relaxedSurfaceHeight[index]! - surfaceHeight[index]!;
    surfaceHeight[index] = relaxedSurfaceHeight[index]!;
    heightField[index] = heightField[index]! + surfaceDelta;
  }
  const authoredFlowX = flowX.slice();
  const authoredFlowZ = flowZ.slice();
  const receivingWaterDistance = createReceivingWaterDistance(hydrologyKind);
  for (let gridZ = 0; gridZ < TERRAIN_ARTIFACT_V2_RESOLUTION; gridZ += 1) {
    for (let gridX = 0; gridX < TERRAIN_ARTIFACT_V2_RESOLUTION; gridX += 1) {
      const index = sampleIndex(gridX, gridZ);
      if (hydrologyKind[index] !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.river) continue;
      const receiverDistance = receivingWaterDistance[index]!;
      if (receiverDistance <= 0) {
        throw new Error(
          `TerrainArtifactV2 river sample ${gridX},${gridZ} cannot reach receiving water.`,
        );
      }
      const authoredLength = Math.max(
        Math.hypot(authoredFlowX[index]!, authoredFlowZ[index]!),
        Number.EPSILON,
      );
      const authoredX = authoredFlowX[index]! / authoredLength;
      const authoredZ = authoredFlowZ[index]! / authoredLength;
      const candidates: Array<
        Readonly<{
          offsetX: number;
          offsetZ: number;
          directionX: number;
          directionZ: number;
          rise: number;
          alignment: number;
        }>
      > = [];
      for (const [offsetX, offsetZ, spacing] of [
        [-1, 0, gridSpacingX],
        [1, 0, gridSpacingX],
        [0, -1, gridSpacingZ],
        [0, 1, gridSpacingZ],
      ] as const) {
        const neighborX = gridX + offsetX;
        const neighborZ = gridZ + offsetZ;
        if (
          neighborX < 0 ||
          neighborX >= TERRAIN_ARTIFACT_V2_RESOLUTION ||
          neighborZ < 0 ||
          neighborZ >= TERRAIN_ARTIFACT_V2_RESOLUTION
        ) {
          continue;
        }
        const neighbor = sampleIndex(neighborX, neighborZ);
        if (
          hydrologyKind[neighbor] === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry ||
          receivingWaterDistance[neighbor]! >= receiverDistance
        ) {
          continue;
        }
        const directionX = (offsetX * gridSpacingX) / spacing;
        const directionZ = (offsetZ * gridSpacingZ) / spacing;
        candidates.push({
          offsetX,
          offsetZ,
          directionX,
          directionZ,
          rise: surfaceHeight[neighbor]! - surfaceHeight[index]!,
          alignment: directionX * authoredX + directionZ * authoredZ,
        });
      }
      const boundedCandidates = candidates.filter(
        ({ rise }) => rise <= MAXIMUM_WATER_FLOW_RISE_METERS + 1e-7,
      );
      boundedCandidates.sort(
        (first, second) =>
          Math.max(-0.2, first.rise) * 5 +
            (1 - first.alignment) * 2 -
            (Math.max(-0.2, second.rise) * 5 + (1 - second.alignment) * 2) ||
          first.offsetZ - second.offsetZ ||
          first.offsetX - second.offsetX,
      );
      const selected = boundedCandidates[0];
      if (!selected) {
        throw new Error(
          `TerrainArtifactV2 river sample ${gridX},${gridZ} has no bounded receiving-water successor.`,
        );
      }
      flowX[index] = selected.directionX;
      flowZ[index] = selected.directionZ;
    }
  }

  const bankWetness = wetness.slice();
  const bankHeights = heightField.slice();
  const halfBankGrade = Math.tan((35 * Math.PI) / 180) * 0.5;
  for (let gridZ = 0; gridZ < TERRAIN_ARTIFACT_V2_RESOLUTION; gridZ += 1) {
    for (let gridX = 0; gridX < TERRAIN_ARTIFACT_V2_RESOLUTION; gridX += 1) {
      const index = sampleIndex(gridX, gridZ);
      if (hydrologyKind[index] !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry) continue;
      let adjacentWaterWetness = 0;
      let dryBankHeight = Number.NEGATIVE_INFINITY;
      for (const [offsetX, offsetZ, spacing] of [
        [-1, 0, gridSpacingX],
        [1, 0, gridSpacingX],
        [0, -1, gridSpacingZ],
        [0, 1, gridSpacingZ],
      ] as const) {
        const neighborX = gridX + offsetX;
        const neighborZ = gridZ + offsetZ;
        if (
          neighborX < 0 ||
          neighborX >= TERRAIN_ARTIFACT_V2_RESOLUTION ||
          neighborZ < 0 ||
          neighborZ >= TERRAIN_ARTIFACT_V2_RESOLUTION
        ) {
          continue;
        }
        const neighbor = sampleIndex(neighborX, neighborZ);
        if (hydrologyKind[neighbor] === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry) continue;
        adjacentWaterWetness = Math.max(adjacentWaterWetness, wetness[neighbor]!);
        const neighborSurface = surfaceHeight[neighbor]!;
        const halfRise = spacing * halfBankGrade;
        bankHeights[neighbor] = Math.max(bankHeights[neighbor]!, neighborSurface - halfRise);
        dryBankHeight = Math.max(dryBankHeight, neighborSurface + halfRise);
      }
      if (adjacentWaterWetness > 0) {
        bankHeights[index] = dryBankHeight;
        bankWetness[index] = Math.max(
          bankWetness[index]!,
          Math.max(48, Math.round(adjacentWaterWetness * 0.65)),
        );
      }
    }
  }
  const boundaryGrade = Math.tan((32 * Math.PI) / 180);
  const boundaryEdges: Array<Readonly<{ first: number; second: number; maximumRise: number }>> = [];
  for (let gridZ = 0; gridZ < TERRAIN_ARTIFACT_V2_RESOLUTION; gridZ += 1) {
    for (let gridX = 0; gridX < TERRAIN_ARTIFACT_V2_RESOLUTION; gridX += 1) {
      const index = sampleIndex(gridX, gridZ);
      for (const [offsetX, offsetZ, spacing] of [
        [1, 0, gridSpacingX],
        [0, 1, gridSpacingZ],
      ] as const) {
        if (gridX + offsetX >= TERRAIN_ARTIFACT_V2_RESOLUTION) continue;
        if (gridZ + offsetZ >= TERRAIN_ARTIFACT_V2_RESOLUTION) continue;
        const neighbor = sampleIndex(gridX + offsetX, gridZ + offsetZ);
        const firstDry = hydrologyKind[index] === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry;
        const secondDry = hydrologyKind[neighbor] === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry;
        if (firstDry === secondDry) continue;
        boundaryEdges.push({
          first: index,
          second: neighbor,
          maximumRise: spacing * boundaryGrade,
        });
      }
    }
  }
  for (let pass = 0; pass < 256; pass += 1) {
    let changed = false;
    for (const { first, second, maximumRise } of boundaryEdges) {
      const delta = bankHeights[first]! - bankHeights[second]!;
      if (Math.abs(delta) <= maximumRise + 1e-6) continue;
      const correction = (Math.abs(delta) - maximumRise) * 0.5;
      if (delta > 0) {
        bankHeights[first] = bankHeights[first]! - correction;
        bankHeights[second] = bankHeights[second]! + correction;
      } else {
        bankHeights[first] = bankHeights[first]! + correction;
        bankHeights[second] = bankHeights[second]! - correction;
      }
      if (hydrologyKind[first] !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry) {
        bankHeights[first] = Math.min(bankHeights[first]!, surfaceHeight[first]! - 0.01);
      }
      if (hydrologyKind[second] !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry) {
        bankHeights[second] = Math.min(bankHeights[second]!, surfaceHeight[second]! - 0.01);
      }
      changed = true;
    }
    if (!changed) break;
  }
  heightField.set(bankHeights);
  wetness.set(bankWetness);

  minimumHeight = Number.POSITIVE_INFINITY;
  maximumHeight = Number.NEGATIVE_INFINITY;
  heightTotal = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const height = heightField[index]!;
    const surface = surfaceHeight[index]!;
    if (Number.isFinite(surface)) waterDepth[index] = Math.max(0, surface - height);
    minimumHeight = Math.min(minimumHeight, height);
    maximumHeight = Math.max(maximumHeight, height);
    heightTotal += height;
  }

  let maximumSlopeDegrees = 0;
  for (let gridZ = 0; gridZ < TERRAIN_ARTIFACT_V2_RESOLUTION; gridZ += 1) {
    for (let gridX = 0; gridX < TERRAIN_ARTIFACT_V2_RESOLUTION; gridX += 1) {
      const index = sampleIndex(gridX, gridZ);
      const land = landMask[index]! / 255;
      const kind = hydrologyKind[index]!;
      const slopeDegrees = sampleSlopeDegrees(heightField, envelope, gridX, gridZ);
      maximumSlopeDegrees = Math.max(maximumSlopeDegrees, slopeDegrees);
      const rock = smoothstep(16, 43, slopeDegrees) * land;
      const shorelineWetness = wetness[index]! / 255;
      const shore = Math.max(
        (1 - Math.abs(land * 2 - 1)) * 1.8,
        shorelineWetness * land * (kind === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry ? 1.65 : 0.5),
      );
      const moderateSlope = smoothstep(7, 24, slopeDegrees) * (1 - rock);
      const localNoise = valueNoise(seed + 0x2d3, gridX / 37, gridZ / 37) * 0.5 + 0.5;
      const rawWeights = [
        land * (1 - rock) * (0.75 - moderateSlope * 0.22),
        land * (1 - rock) * (0.19 + localNoise * 0.13),
        land * (0.11 + moderateSlope * 0.58),
        rock * 1.42,
        shore,
        kind === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.river ? 3.8 : 0,
        kind === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.lake ? 4.1 : 0,
        kind === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.ocean ? 4.4 : 0,
      ];
      encodeNormalizedWeights(materialWeights, index * MATERIAL_CHANNEL_COUNT, rawWeights);
    }
  }

  const checksums = createTerrainArtifactV2BufferChecksums({
    heightField,
    materialWeights,
    landMask,
    hydrologyKind,
    wetness,
    waterDepth,
    flowX,
    flowZ,
    surfaceHeight,
  });
  const allocatedBytes =
    heightField.byteLength +
    materialWeights.byteLength +
    landMask.byteLength +
    waterDepth.byteLength +
    flowX.byteLength +
    flowZ.byteLength +
    wetness.byteLength +
    hydrologyKind.byteLength +
    surfaceHeight.byteLength;

  const chunks = createChunks(envelope);
  const operators = createOperators(envelope, design);
  const metrics = Object.freeze({
    sampleCount,
    allocatedBytes,
    minimumHeight: round(minimumHeight),
    maximumHeight: round(maximumHeight),
    meanHeight: round(heightTotal / sampleCount),
    maximumSlopeDegrees: round(maximumSlopeDegrees),
    drySamples,
    riverSamples,
    lakeSamples,
    oceanSamples,
    operatorCount: 7 as const,
    checksums,
  });
  const metadataChecksum = terrainArtifactV2MetadataChecksum({
    envelope,
    chunkLods: TERRAIN_ARTIFACT_V2_CHUNK_LODS,
    lodDefinitions: TERRAIN_ARTIFACT_V2_LOD_DEFINITIONS,
    chunks,
    operators,
    metrics: {
      sampleCount: metrics.sampleCount,
      allocatedBytes: metrics.allocatedBytes,
      minimumHeight: metrics.minimumHeight,
      maximumHeight: metrics.maximumHeight,
      meanHeight: metrics.meanHeight,
      maximumSlopeDegrees: metrics.maximumSlopeDegrees,
      drySamples: metrics.drySamples,
      riverSamples: metrics.riverSamples,
      lakeSamples: metrics.lakeSamples,
      oceanSamples: metrics.oceanSamples,
      operatorCount: metrics.operatorCount,
    },
  });

  const artifact: TerrainArtifactV2 = Object.freeze({
    schema: TERRAIN_ARTIFACT_V2_SCHEMA,
    key: deriveTerrainArtifactV2Key({
      structureKey: design.structureKey,
      morphologySignature: design.terrain.morphology.signature,
      sourceTerrainKey: plan.terrainKey,
      metadataChecksum,
      combinedChecksum: checksums.combined,
    }),
    generatorRevision: TERRAIN_ARTIFACT_V2_GENERATOR_REVISION,
    sourceTerrainKey: plan.terrainKey,
    morphologySignature: design.terrain.morphology.signature,
    metadataChecksum,
    structureKey: design.structureKey,
    resolution: TERRAIN_ARTIFACT_V2_RESOLUTION,
    envelope,
    chunkLods: TERRAIN_ARTIFACT_V2_CHUNK_LODS,
    lodDefinitions: TERRAIN_ARTIFACT_V2_LOD_DEFINITIONS,
    chunks,
    operators,
    heightField,
    materialWeights,
    landMask,
    waterDepth,
    flow: Object.freeze({ x: flowX, z: flowZ }),
    wetness,
    hydrology: Object.freeze({ kind: hydrologyKind, surfaceHeight }),
    metrics,
  });
  assertTerrainArtifactV2Integrity(artifact);
  return artifact;
}

function worldToGrid(
  artifact: TerrainArtifactV2,
  x: number,
  z: number,
  mode: TerrainArtifactV2SampleMode,
): GridCoordinate | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const rawU = (x - artifact.envelope.minX) / artifact.envelope.width;
  const rawV = (z - artifact.envelope.minZ) / artifact.envelope.depth;
  if (mode === "reject" && (rawU < 0 || rawU > 1 || rawV < 0 || rawV > 1)) return null;
  const u = clamp(rawU, 0, 1);
  const v = clamp(rawV, 0, 1);
  return { gridX: u * SAMPLE_CELLS, gridZ: v * SAMPLE_CELLS, u, v };
}

type TriangleCellSample = Readonly<{
  northWest: number;
  northEast: number;
  southWest: number;
  southEast: number;
  localX: number;
  localZ: number;
  firstTriangle: boolean;
}>;

function triangleCellSample(coordinate: GridCoordinate): TriangleCellSample {
  const minX = Math.min(SAMPLE_CELLS - 1, Math.floor(coordinate.gridX));
  const minZ = Math.min(SAMPLE_CELLS - 1, Math.floor(coordinate.gridZ));
  const maxX = minX + 1;
  const maxZ = minZ + 1;
  const localX = coordinate.gridX - minX;
  const localZ = coordinate.gridZ - minZ;
  return {
    northWest: sampleIndex(minX, minZ),
    northEast: sampleIndex(maxX, minZ),
    southWest: sampleIndex(minX, maxZ),
    southEast: sampleIndex(maxX, maxZ),
    localX,
    localZ,
    firstTriangle: localX + localZ <= 1,
  };
}

function triangleInterpolate(values: Float32Array | Uint8Array, cell: TriangleCellSample): number {
  if (cell.firstTriangle) {
    const northWest = values[cell.northWest]!;
    return (
      northWest +
      (values[cell.northEast]! - northWest) * cell.localX +
      (values[cell.southWest]! - northWest) * cell.localZ
    );
  }
  const southEast = values[cell.southEast]!;
  return (
    southEast +
    (values[cell.southWest]! - southEast) * (1 - cell.localX) +
    (values[cell.northEast]! - southEast) * (1 - cell.localZ)
  );
}

function trianglePlaneNormal(
  heights: Float32Array,
  cell: TriangleCellSample,
  spacingX: number,
  spacingZ: number,
): readonly [number, number, number] {
  const slopeX = cell.firstTriangle
    ? (heights[cell.northEast]! - heights[cell.northWest]!) / spacingX
    : (heights[cell.southEast]! - heights[cell.southWest]!) / spacingX;
  const slopeZ = cell.firstTriangle
    ? (heights[cell.southWest]! - heights[cell.northWest]!) / spacingZ
    : (heights[cell.southEast]! - heights[cell.northEast]!) / spacingZ;
  const length = Math.max(Math.hypot(slopeX, 1, slopeZ), Number.EPSILON);
  return [-slopeX / length, 1 / length, -slopeZ / length] as const;
}

function triangleDominantIndex(cell: TriangleCellSample): number {
  const candidates = cell.firstTriangle
    ? [
        { index: cell.northWest, weight: 1 - cell.localX - cell.localZ },
        { index: cell.northEast, weight: cell.localX },
        { index: cell.southWest, weight: cell.localZ },
      ]
    : [
        { index: cell.southEast, weight: cell.localX + cell.localZ - 1 },
        { index: cell.southWest, weight: 1 - cell.localX },
        { index: cell.northEast, weight: 1 - cell.localZ },
      ];
  candidates.sort((first, second) => second.weight - first.weight || first.index - second.index);
  return candidates[0]!.index;
}

export function sampleTerrainArtifactV2Height(
  artifact: TerrainArtifactV2,
  x: number,
  z: number,
  mode: TerrainArtifactV2SampleMode = "clamp",
): number | null {
  const coordinate = worldToGrid(artifact, x, z, mode);
  return coordinate
    ? triangleInterpolate(artifact.heightField, triangleCellSample(coordinate))
    : null;
}

export function sampleTerrainArtifactV2MaterialWeights(
  artifact: TerrainArtifactV2,
  x: number,
  z: number,
  mode: TerrainArtifactV2SampleMode = "clamp",
): Readonly<Record<TerrainArtifactV2MaterialChannel, number>> | null {
  const coordinate = worldToGrid(artifact, x, z, mode);
  if (!coordinate) return null;
  const nearestX = Math.round(coordinate.gridX);
  const nearestZ = Math.round(coordinate.gridZ);
  const offset = sampleIndex(nearestX, nearestZ) * MATERIAL_CHANNEL_COUNT;
  return Object.freeze(
    Object.fromEntries(
      TERRAIN_ARTIFACT_V2_MATERIAL_CHANNELS.map((channel, index) => [
        channel,
        artifact.materialWeights[offset + index]! / 255,
      ]),
    ) as Record<TerrainArtifactV2MaterialChannel, number>,
  );
}

export function sampleTerrainArtifactV2Collision(
  artifact: TerrainArtifactV2,
  x: number,
  z: number,
  options: TerrainArtifactV2NavigationOptions = {},
  mode: TerrainArtifactV2SampleMode = "reject",
): TerrainArtifactV2CollisionSample | null {
  const coordinate = worldToGrid(artifact, x, z, mode);
  if (!coordinate) return null;
  const cell = triangleCellSample(coordinate);
  const height = triangleInterpolate(artifact.heightField, cell);
  const deltaX = artifact.envelope.width / SAMPLE_CELLS;
  const deltaZ = artifact.envelope.depth / SAMPLE_CELLS;
  const normal = trianglePlaneNormal(artifact.heightField, cell, deltaX, deltaZ);
  const slopeDegrees = (Math.acos(clamp(normal[1], -1, 1)) * 180) / Math.PI;
  const waterCell = [cell.northWest, cell.northEast, cell.southWest, cell.southEast].every(
    (index) => artifact.hydrology.kind[index] !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry,
  );
  const dominantIndex = triangleDominantIndex(cell);
  const kind = waterCell
    ? (artifact.hydrology.kind[dominantIndex]! as TerrainArtifactV2HydrologyKind)
    : TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry;
  const interpolatedSurface = waterCell
    ? triangleInterpolate(artifact.hydrology.surfaceHeight, cell)
    : Number.NaN;
  const depth = Number.isFinite(interpolatedSurface)
    ? Math.max(0, interpolatedSurface - height)
    : 0;
  const landCoverage = triangleInterpolate(artifact.landMask, cell) / 255;
  const maximumSlopeDegrees = options.maximumSlopeDegrees ?? 38;
  const maximumWaterDepth = options.maximumWaterDepth ?? 0.12;
  const minimumLandCoverage = options.minimumLandCoverage ?? 0.56;
  return Object.freeze({
    x,
    z,
    height,
    normal,
    slopeDegrees,
    landCoverage,
    hydrologyKind: kind,
    waterDepth: depth,
    waterSurfaceHeight: Number.isFinite(interpolatedSurface) ? interpolatedSurface : null,
    flow: Object.freeze({
      x: waterCell ? triangleInterpolate(artifact.flow.x, cell) : 0,
      z: waterCell ? triangleInterpolate(artifact.flow.z, cell) : 0,
    }),
    walkable:
      slopeDegrees <= maximumSlopeDegrees &&
      depth <= maximumWaterDepth &&
      landCoverage >= minimumLandCoverage,
  });
}

export function isTerrainArtifactV2Navigable(
  artifact: TerrainArtifactV2,
  x: number,
  z: number,
  options: TerrainArtifactV2NavigationOptions = {},
): boolean {
  return sampleTerrainArtifactV2Collision(artifact, x, z, options, "reject")?.walkable ?? false;
}

export function resolveTerrainArtifactV2Lod(
  lod: TerrainArtifactV2LodId | TerrainArtifactV2LodDefinition,
): TerrainArtifactV2LodDefinition {
  if (typeof lod !== "string") return lod;
  const definition = TERRAIN_ARTIFACT_V2_LOD_DEFINITIONS.find((candidate) => candidate.id === lod);
  if (!definition) throw new Error(`Unknown TerrainArtifactV2 LOD: ${lod}`);
  return definition;
}

function sampleNormalAtIndex(
  artifact: TerrainArtifactV2,
  gridX: number,
  gridZ: number,
): readonly [number, number, number] {
  const leftX = Math.max(0, gridX - 1);
  const rightX = Math.min(SAMPLE_CELLS, gridX + 1);
  const northZ = Math.max(0, gridZ - 1);
  const southZ = Math.min(SAMPLE_CELLS, gridZ + 1);
  const deltaX = ((rightX - leftX) * artifact.envelope.width) / SAMPLE_CELLS;
  const deltaZ = ((southZ - northZ) * artifact.envelope.depth) / SAMPLE_CELLS;
  const normalX =
    (artifact.heightField[sampleIndex(leftX, gridZ)]! -
      artifact.heightField[sampleIndex(rightX, gridZ)]!) /
    Math.max(deltaX, Number.EPSILON);
  const normalZ =
    (artifact.heightField[sampleIndex(gridX, northZ)]! -
      artifact.heightField[sampleIndex(gridX, southZ)]!) /
    Math.max(deltaZ, Number.EPSILON);
  const length = Math.max(Math.hypot(normalX, 1, normalZ), Number.EPSILON);
  return [normalX / length, 1 / length, normalZ / length];
}

function buildTerrainGridMesh(
  artifact: TerrainArtifactV2,
  originX: number,
  originZ: number,
  cellCount: number,
  lod: TerrainArtifactV2LodDefinition,
  requestedLod: TerrainArtifactV2LodId = lod.id,
): TerrainArtifactV2MeshData {
  if (cellCount % lod.sampleStep !== 0) {
    throw new Error("TerrainArtifactV2 grid cells must be divisible by the LOD sample step.");
  }
  const segments = cellCount / lod.sampleStep;
  const vertexResolution = segments + 1;
  const topVertexCount = vertexResolution * vertexResolution;
  const skirtVertexCount = vertexResolution * 4;
  const vertexCount = topVertexCount + skirtVertexCount;
  const topTriangleCount = segments * segments * 2;
  const skirtTriangleCount = segments * 8;
  const triangleCount = topTriangleCount + skirtTriangleCount;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const materialWeights = new Uint8Array(vertexCount * MATERIAL_CHANNEL_COUNT);
  const landCoverage = new Uint8Array(vertexCount);
  const sourceSampleIndices = new Uint32Array(vertexCount);
  const indices = new Uint32Array(triangleCount * 3);
  const edgeSampleIndices = {
    north: new Uint32Array(vertexResolution),
    east: new Uint32Array(vertexResolution),
    south: new Uint32Array(vertexResolution),
    west: new Uint32Array(vertexResolution),
  };

  const writeVertex = (vertex: number, gridX: number, gridZ: number, height: number) => {
    const sourceIndex = sampleIndex(gridX, gridZ);
    const worldX = artifact.envelope.minX + (gridX / SAMPLE_CELLS) * artifact.envelope.width;
    const worldZ = artifact.envelope.minZ + (gridZ / SAMPLE_CELLS) * artifact.envelope.depth;
    const positionOffset = vertex * 3;
    positions[positionOffset] = worldX;
    positions[positionOffset + 1] = height;
    positions[positionOffset + 2] = worldZ;
    const normal = sampleNormalAtIndex(artifact, gridX, gridZ);
    normals[positionOffset] = normal[0];
    normals[positionOffset + 1] = normal[1];
    normals[positionOffset + 2] = normal[2];
    const uvOffset = vertex * 2;
    uvs[uvOffset] = gridX / SAMPLE_CELLS;
    uvs[uvOffset + 1] = gridZ / SAMPLE_CELLS;
    const sourceWeightOffset = sourceIndex * MATERIAL_CHANNEL_COUNT;
    const targetWeightOffset = vertex * MATERIAL_CHANNEL_COUNT;
    materialWeights.set(
      artifact.materialWeights.subarray(
        sourceWeightOffset,
        sourceWeightOffset + MATERIAL_CHANNEL_COUNT,
      ),
      targetWeightOffset,
    );
    landCoverage[vertex] = artifact.landMask[sourceIndex]!;
    sourceSampleIndices[vertex] = sourceIndex;
  };

  for (let localZ = 0; localZ < vertexResolution; localZ += 1) {
    const gridZ = originZ + localZ * lod.sampleStep;
    for (let localX = 0; localX < vertexResolution; localX += 1) {
      const gridX = originX + localX * lod.sampleStep;
      const vertex = localZ * vertexResolution + localX;
      writeVertex(vertex, gridX, gridZ, artifact.heightField[sampleIndex(gridX, gridZ)]!);
    }
  }

  let indexOffset = 0;
  for (let localZ = 0; localZ < segments; localZ += 1) {
    for (let localX = 0; localX < segments; localX += 1) {
      const northWest = localZ * vertexResolution + localX;
      const northEast = northWest + 1;
      const southWest = northWest + vertexResolution;
      const southEast = southWest + 1;
      indices[indexOffset++] = northWest;
      indices[indexOffset++] = southWest;
      indices[indexOffset++] = northEast;
      indices[indexOffset++] = northEast;
      indices[indexOffset++] = southWest;
      indices[indexOffset++] = southEast;
    }
  }

  const edges: ReadonlyArray<
    readonly [keyof typeof edgeSampleIndices, ReadonlyArray<readonly [number, number, number]>]
  > = [
    [
      "north",
      Array.from(
        { length: vertexResolution },
        (_, index) => [index, originX + index * lod.sampleStep, originZ] as const,
      ),
    ],
    [
      "east",
      Array.from(
        { length: vertexResolution },
        (_, index) =>
          [
            index * vertexResolution + segments,
            originX + cellCount,
            originZ + index * lod.sampleStep,
          ] as const,
      ),
    ],
    [
      "south",
      Array.from(
        { length: vertexResolution },
        (_, index) =>
          [
            segments * vertexResolution + (segments - index),
            originX + (segments - index) * lod.sampleStep,
            originZ + cellCount,
          ] as const,
      ),
    ],
    [
      "west",
      Array.from(
        { length: vertexResolution },
        (_, index) =>
          [
            (segments - index) * vertexResolution,
            originX,
            originZ + (segments - index) * lod.sampleStep,
          ] as const,
      ),
    ],
  ];
  let skirtVertex = topVertexCount;
  for (const [edgeName, edge] of edges) {
    const edgeBottomStart = skirtVertex;
    for (let edgeIndex = 0; edgeIndex < edge.length; edgeIndex += 1) {
      const [topVertex, gridX, gridZ] = edge[edgeIndex]!;
      const sourceIndex = sampleIndex(gridX, gridZ);
      edgeSampleIndices[edgeName][edgeIndex] = sourceIndex;
      writeVertex(skirtVertex++, gridX, gridZ, artifact.heightField[sourceIndex]! - lod.skirtDepth);
      if (edgeIndex === 0) continue;
      const previousTop = edge[edgeIndex - 1]![0];
      const currentBottom = edgeBottomStart + edgeIndex;
      const previousBottom = currentBottom - 1;
      indices[indexOffset++] = previousTop;
      indices[indexOffset++] = previousBottom;
      indices[indexOffset++] = topVertex;
      indices[indexOffset++] = topVertex;
      indices[indexOffset++] = previousBottom;
      indices[indexOffset++] = currentBottom;
    }
  }

  return Object.freeze({
    requestedLod,
    effectiveLod: lod.id,
    positions,
    normals,
    uvs,
    materialWeights,
    landCoverage,
    sourceSampleIndices,
    indices,
    vertexCount,
    triangleCount,
    topVertexCount,
    topTriangleCount,
    skirtVertexCount,
    skirtTriangleCount,
    skirtStartVertex: topVertexCount,
    edgeSampleIndices: Object.freeze(edgeSampleIndices),
  });
}

function terrainRegionContainsWater(
  artifact: TerrainArtifactV2,
  originX: number,
  originZ: number,
  cellCount: number,
): boolean {
  for (let gridZ = originZ; gridZ <= originZ + cellCount; gridZ += 1) {
    for (let gridX = originX; gridX <= originX + cellCount; gridX += 1) {
      if (
        artifact.hydrology.kind[sampleIndex(gridX, gridZ)] !==
        TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry
      ) {
        return true;
      }
    }
  }
  return false;
}

function hydrologySafeTerrainLod(
  artifact: TerrainArtifactV2,
  originX: number,
  originZ: number,
  cellCount: number,
  requested: TerrainArtifactV2LodDefinition,
): TerrainArtifactV2LodDefinition {
  if (
    requested.id === "near" ||
    !terrainRegionContainsWater(artifact, originX, originZ, cellCount)
  ) {
    return requested;
  }
  // Until the Phase-2 adaptive shoreline stitcher lands, any chunk sharing the
  // full-resolution water topology remains full-resolution terrain. Coarse
  // planes can otherwise bridge above fine river banks and occlude the water.
  return TERRAIN_ARTIFACT_V2_LOD_DEFINITIONS[0]!;
}

export function createTerrainArtifactV2ChunkMeshData(
  artifact: TerrainArtifactV2,
  chunkX: number,
  chunkZ: number,
  lod: TerrainArtifactV2LodId | TerrainArtifactV2LodDefinition,
): TerrainArtifactV2MeshData {
  if (
    !Number.isInteger(chunkX) ||
    !Number.isInteger(chunkZ) ||
    chunkX < 0 ||
    chunkZ < 0 ||
    chunkX >= TERRAIN_ARTIFACT_V2_CHUNKS_PER_AXIS ||
    chunkZ >= TERRAIN_ARTIFACT_V2_CHUNKS_PER_AXIS
  ) {
    throw new Error("TerrainArtifactV2 chunk coordinates must be integers between 0 and 3.");
  }
  const originX = chunkX * TERRAIN_ARTIFACT_V2_CHUNK_CELLS;
  const originZ = chunkZ * TERRAIN_ARTIFACT_V2_CHUNK_CELLS;
  const requested = resolveTerrainArtifactV2Lod(lod);
  const effective = hydrologySafeTerrainLod(
    artifact,
    originX,
    originZ,
    TERRAIN_ARTIFACT_V2_CHUNK_CELLS,
    requested,
  );
  return buildTerrainGridMesh(
    artifact,
    originX,
    originZ,
    TERRAIN_ARTIFACT_V2_CHUNK_CELLS,
    effective,
    requested.id,
  );
}

/** One-draw preview mesh. Production streaming can consume the chunk builder above. */
export function createTerrainArtifactV2PreviewMeshData(
  artifact: TerrainArtifactV2,
  lod: TerrainArtifactV2LodId | TerrainArtifactV2LodDefinition = "mid",
): TerrainArtifactV2MeshData {
  const requested = resolveTerrainArtifactV2Lod(lod);
  const effective = hydrologySafeTerrainLod(artifact, 0, 0, SAMPLE_CELLS, requested);
  return buildTerrainGridMesh(artifact, 0, 0, SAMPLE_CELLS, effective, requested.id);
}

export function createTerrainArtifactV2WaterMeshData(
  artifact: TerrainArtifactV2,
  lod: TerrainArtifactV2LodId | TerrainArtifactV2LodDefinition = "mid",
): TerrainArtifactV2WaterMeshData {
  resolveTerrainArtifactV2Lod(lod);
  // Water uses one full-resolution topology at every terrain LOD. Sampling only
  // coarse terrain corners fragments narrow rivers and disconnects receiving
  // bodies; a stable water mesh keeps hydrology identical in Orbit and Walk.
  const segments = SAMPLE_CELLS / TERRAIN_ARTIFACT_V2_WATER_TOPOLOGY_SAMPLE_STEP;
  const vertexResolution = segments + 1;
  const vertexCount = vertexResolution * vertexResolution;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const depth = new Float32Array(vertexCount);
  const sampledWetness = new Uint8Array(vertexCount);
  const flow = new Float32Array(vertexCount * 2);
  const sourceSampleIndices = new Uint32Array(vertexCount);
  const indexValues: number[] = [];

  for (let localZ = 0; localZ < vertexResolution; localZ += 1) {
    const gridZ = localZ * TERRAIN_ARTIFACT_V2_WATER_TOPOLOGY_SAMPLE_STEP;
    for (let localX = 0; localX < vertexResolution; localX += 1) {
      const gridX = localX * TERRAIN_ARTIFACT_V2_WATER_TOPOLOGY_SAMPLE_STEP;
      const vertex = localZ * vertexResolution + localX;
      const sourceIndex = sampleIndex(gridX, gridZ);
      const surface = artifact.hydrology.surfaceHeight[sourceIndex]!;
      const positionOffset = vertex * 3;
      positions[positionOffset] =
        artifact.envelope.minX + (gridX / SAMPLE_CELLS) * artifact.envelope.width;
      positions[positionOffset + 1] = Number.isFinite(surface)
        ? surface
        : artifact.heightField[sourceIndex]! + 0.03;
      positions[positionOffset + 2] =
        artifact.envelope.minZ + (gridZ / SAMPLE_CELLS) * artifact.envelope.depth;
      normals[positionOffset + 1] = 1;
      const uvOffset = vertex * 2;
      uvs[uvOffset] = gridX / SAMPLE_CELLS;
      uvs[uvOffset + 1] = gridZ / SAMPLE_CELLS;
      depth[vertex] = artifact.waterDepth[sourceIndex]!;
      sampledWetness[vertex] = artifact.wetness[sourceIndex]!;
      flow[uvOffset] = artifact.flow.x[sourceIndex]!;
      flow[uvOffset + 1] = artifact.flow.z[sourceIndex]!;
      sourceSampleIndices[vertex] = sourceIndex;
    }
  }

  for (let localZ = 0; localZ < segments; localZ += 1) {
    for (let localX = 0; localX < segments; localX += 1) {
      const northWest = localZ * vertexResolution + localX;
      const northEast = northWest + 1;
      const southWest = northWest + vertexResolution;
      const southEast = southWest + 1;
      const sourceVertices = [northWest, northEast, southWest, southEast] as const;
      if (
        sourceVertices.some(
          (vertex) =>
            artifact.hydrology.kind[sourceSampleIndices[vertex]!] ===
            TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry,
        )
      ) {
        continue;
      }
      indexValues.push(northWest, southWest, northEast, northEast, southWest, southEast);
    }
  }

  const indices = Uint32Array.from(indexValues);
  return Object.freeze({
    positions,
    normals,
    uvs,
    depth,
    wetness: sampledWetness,
    flow,
    sourceSampleIndices,
    indices,
    vertexCount,
    triangleCount: indices.length / 3,
  });
}
