import { stableFraction } from "@/lib/kingdom/hash";
import type { WorldPlan } from "@/lib/kingdom/world-plan";

import type { LivingWalkSpawn } from "./kingdom-walk-experience-model";
import {
  createPlannedHamletPathCorridors,
  queryPlannedHamletPathCorridorDistance,
} from "./planned-hamlet-paths";
import type { PlannedLandUse } from "./planned-land-use";
import type { PlannedAmbientDetail, PlannedScatter } from "./planned-scatter";
import { classifyPlannedTerrainRegion, queryPlannedWaterDistance } from "./planned-terrain-model";
import type {
  PlannedMeadowDetail,
  PlannedShoreDetail,
  PlannedVisualEnrichment,
} from "./planned-visual-enrichment";
import type {
  PlannedWalkDetailInstance,
  PlannedWalkDetailKind,
  PlannedWalkDetailPlan,
} from "./planned-walk-detail-model";

export const PLANNED_REGIONAL_EXPERIENCE_SCHEMA = "repo-regional-experience/v1" as const;

export type PlannedRegionalMount = "near" | "far";
export type PlannedRegionalChunkRole = "arrival-edge" | "settlement-yard" | "waterside-overlook";
export type PlannedRegionalAssetRole = "grass" | "flower" | "reed" | "stone" | "fence" | "waylight";

export const PLANNED_REGIONAL_EXPERIENCE_BUDGET = Object.freeze({
  maximumChunks: 3,
  maximumInstances: Object.freeze({ near: 52, far: 28, total: 76 }),
  maximumDrawCalls: Object.freeze({ near: 3, far: 1, total: 4 }),
  maximumTriangles: Object.freeze({ near: 6_000, far: 4_000, total: 9_500 }),
});

export const PLANNED_REGIONAL_ASSET_COSTS: Readonly<
  Record<
    PlannedRegionalAssetRole,
    Readonly<{ sourcePrimitives: number; triangles: number; baseHeight: number }>
  >
> = Object.freeze({
  grass: Object.freeze({ sourcePrimitives: 1, triangles: 24, baseHeight: 0.58 }),
  flower: Object.freeze({ sourcePrimitives: 1, triangles: 78, baseHeight: 0.7 }),
  reed: Object.freeze({ sourcePrimitives: 1, triangles: 24, baseHeight: 1.28 }),
  stone: Object.freeze({ sourcePrimitives: 1, triangles: 144, baseHeight: 0.48 }),
  fence: Object.freeze({ sourcePrimitives: 1, triangles: 40, baseHeight: 1.3 }),
  waylight: Object.freeze({ sourcePrimitives: 1, triangles: 40, baseHeight: 1.48 }),
});

type FlatPoint = Readonly<{ x: number; z: number }>;
type Point3 = Readonly<{ x: number; y: number; z: number }>;

export type PlannedRegionalPlacementValidation = Readonly<{
  terrainSafe: boolean;
  waterClear: boolean;
  structureClear: boolean;
  pathClear: boolean;
  contactAligned: boolean;
  pathEdgeDistance: number;
  waterDistance: number;
  minimumStructureClearance: number;
  slopeDegrees: number;
}>;

export type PlannedRegionalAssetInstance = Readonly<{
  id: string;
  geometryId: string;
  chunkId: string;
  mount: PlannedRegionalMount;
  role: PlannedRegionalAssetRole;
  clusterId: string;
  composition: "edge-band" | "clump" | "landmark";
  position: Point3;
  rotationY: number;
  targetHeight: number;
  priority: number;
  sourceIds: ReadonlyArray<string>;
  validation: PlannedRegionalPlacementValidation;
}>;

export type PlannedRegionalBounds = Readonly<{
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
}>;

export type PlannedRegionalChunk = Readonly<{
  id: string;
  role: PlannedRegionalChunkRole;
  mount: PlannedRegionalMount;
  center: Point3;
  facingRadians: number;
  clearPocketRadius: number;
  instanceIds: ReadonlyArray<string>;
  bounds: PlannedRegionalBounds;
  composition: Readonly<{
    clusterCount: number;
    edgeBandInstanceCount: number;
    clumpInstanceCount: number;
    landmarkInstanceCount: number;
    roleCounts: Readonly<Record<PlannedRegionalAssetRole, number>>;
  }>;
}>;

export type PlannedRegionalMountBudget = Readonly<{
  instances: number;
  drawCalls: number;
  triangles: number;
}>;

export type PlannedRegionalExperiencePlan = Readonly<{
  schema: typeof PLANNED_REGIONAL_EXPERIENCE_SCHEMA;
  key: string;
  route: Readonly<{
    spawn: Point3;
    settlement: Point3;
    shore: Point3;
    waterFocus: FlatPoint;
    structureId: string;
  }>;
  chunks: ReadonlyArray<PlannedRegionalChunk>;
  instances: ReadonlyArray<PlannedRegionalAssetInstance>;
  mounts: Readonly<Record<PlannedRegionalMount, PlannedRegionalMountBudget>>;
  sourceCoverage: Readonly<{
    landUseIds: ReadonlyArray<string>;
    scatterIds: ReadonlyArray<string>;
    enrichmentIds: ReadonlyArray<string>;
    walkDetailIds: ReadonlyArray<string>;
  }>;
  validation: Readonly<{
    allTerrainSafe: boolean;
    allWaterClear: boolean;
    allStructuresClear: boolean;
    allPathsClear: boolean;
    allContactsAligned: boolean;
    allChunksReadable: boolean;
    withinBudget: boolean;
    findings: ReadonlyArray<string>;
  }>;
}>;

export type PlannedRegionalExperienceInput = Readonly<{
  plan: WorldPlan;
  landUse: PlannedLandUse;
  scatter: PlannedScatter;
  enrichment: PlannedVisualEnrichment;
  livingSpawn: LivingWalkSpawn | null;
  detail: PlannedWalkDetailPlan;
}>;

/** Fail closed before mounting or adding collision for a generated region. */
export function isPlannedRegionalExperienceRenderable(
  regional: PlannedRegionalExperiencePlan | null | undefined,
): regional is PlannedRegionalExperiencePlan {
  return Boolean(
    regional &&
    regional.validation.allTerrainSafe &&
    regional.validation.allWaterClear &&
    regional.validation.allStructuresClear &&
    regional.validation.allPathsClear &&
    regional.validation.allContactsAligned &&
    regional.validation.allChunksReadable &&
    regional.validation.withinBudget &&
    regional.validation.findings.length === 0,
  );
}

type RoadEdge = Readonly<{
  start: FlatPoint;
  end: FlatPoint;
  width: number;
}>;

type StructureClearance = Readonly<{
  id: string;
  x: number;
  z: number;
  radius: number;
}>;

type ChunkDraft = Readonly<{
  id: string;
  role: PlannedRegionalChunkRole;
  mount: PlannedRegionalMount;
  center: Point3;
  facingRadians: number;
  clearPocketRadius: number;
}>;

type PlacementSpec = Readonly<{
  role: PlannedRegionalAssetRole;
  forward: number;
  side: number;
  rotationOffset: number;
  clusterId: string;
  composition: PlannedRegionalAssetInstance["composition"];
  priority: number;
}>;

type ContextSource = Readonly<{
  id: string;
  x: number;
  z: number;
  category: "scatter" | "enrichment";
}>;

const ROLE_CLEARANCE: Readonly<
  Record<
    PlannedRegionalAssetRole,
    Readonly<{ path: number; structure: number; spacing: number; maximumSlope: number }>
  >
> = Object.freeze({
  grass: Object.freeze({ path: 0.28, structure: 0.38, spacing: 0.7, maximumSlope: 20 }),
  flower: Object.freeze({ path: 0.38, structure: 0.48, spacing: 1.2, maximumSlope: 18 }),
  reed: Object.freeze({ path: 0.25, structure: 0.42, spacing: 0.72, maximumSlope: 18 }),
  stone: Object.freeze({ path: 0.42, structure: 0.7, spacing: 1.5, maximumSlope: 28 }),
  fence: Object.freeze({ path: 0.5, structure: 0.82, spacing: 2.1, maximumSlope: 18 }),
  waylight: Object.freeze({ path: 0.18, structure: 0.7, spacing: 2.4, maximumSlope: 18 }),
});

const WALK_DETAIL_KIND_BY_ROLE: Readonly<
  Partial<Record<PlannedRegionalAssetRole, PlannedWalkDetailKind>>
> = Object.freeze({ grass: "grass", flower: "flower", reed: "reed", stone: "stone" });

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function pointDistance(first: FlatPoint, second: FlatPoint): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function closestPointOnEdge(point: FlatPoint, edge: RoadEdge) {
  const deltaX = edge.end.x - edge.start.x;
  const deltaZ = edge.end.z - edge.start.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const progress =
    lengthSquared <= 0.000_001
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((point.x - edge.start.x) * deltaX + (point.z - edge.start.z) * deltaZ) / lengthSquared,
          ),
        );
  const x = edge.start.x + deltaX * progress;
  const z = edge.start.z + deltaZ * progress;
  const distanceX = point.x - x;
  const distanceZ = point.z - z;
  return { x, z, distanceSquared: distanceX * distanceX + distanceZ * distanceZ };
}

function createRoadEdges(landUse: PlannedLandUse): ReadonlyArray<RoadEdge> {
  return landUse.primaryRoad.segments.flatMap((segment) =>
    segment.points.slice(1).map((point, index) => ({
      start: segment.points[index]!,
      end: point,
      width: segment.width,
    })),
  );
}

function nearestRoadEdge(point: FlatPoint, edges: ReadonlyArray<RoadEdge>) {
  let best: Readonly<{ edge: RoadEdge; x: number; z: number; distanceSquared: number }> | undefined;
  for (const edge of edges) {
    const closest = closestPointOnEdge(point, edge);
    const candidate = { edge, ...closest };
    if (!best || candidate.distanceSquared < best.distanceSquared) best = candidate;
  }
  if (!best) return undefined;
  const distance = Math.sqrt(best.distanceSquared);
  return { ...best, distance, edgeDistance: distance - best.edge.width / 2 };
}

function heightPoint(plan: WorldPlan, point: FlatPoint): Point3 {
  return { x: point.x, y: classifyPlannedTerrainRegion(plan, point.x, point.z).height, z: point.z };
}

function facing(from: FlatPoint, to: FlatPoint): number {
  return Math.atan2(to.z - from.z, to.x - from.x);
}

function localPoint(chunk: ChunkDraft, forward: number, side: number): FlatPoint {
  const cosine = Math.cos(chunk.facingRadians);
  const sine = Math.sin(chunk.facingRadians);
  return {
    x: chunk.center.x + cosine * forward - sine * side,
    z: chunk.center.z + sine * forward + cosine * side,
  };
}

function arrivalSpecs(): ReadonlyArray<PlacementSpec> {
  const specs: PlacementSpec[] = [];
  const stations = [-11, -8, -5, 5, 8, 11];
  for (const [stationIndex, forward] of stations.entries()) {
    for (const sideSign of [-1, 1] as const) {
      const clusterId = `edge-${sideSign < 0 ? "left" : "right"}-${stationIndex}`;
      specs.push({
        role: "grass",
        forward,
        side: sideSign * (3.8 + (stationIndex % 2) * 0.6),
        rotationOffset: sideSign * 0.18,
        clusterId,
        composition: "edge-band",
        priority: 0,
      });
      if (stationIndex % 2 === 0) {
        specs.push({
          role: "grass",
          forward: forward + sideSign * 0.75,
          side: sideSign * 5.1,
          rotationOffset: -sideSign * 0.28,
          clusterId,
          composition: "clump",
          priority: 1,
        });
      }
      if ((stationIndex + Number(sideSign > 0)) % 3 === 0) {
        specs.push({
          role: "flower",
          forward: forward - sideSign * 0.55,
          side: sideSign * 5.8,
          rotationOffset: sideSign * 0.34,
          clusterId,
          composition: "clump",
          priority: 0,
        });
      }
    }
  }
  for (const [index, forward] of [-10, 9].entries()) {
    specs.push({
      role: "stone",
      forward,
      side: index === 0 ? -6.2 : 6.2,
      rotationOffset: 0.45 + index,
      clusterId: `edge-stone-${index}`,
      composition: "landmark",
      priority: 0,
    });
  }
  return specs;
}

function settlementSpecs(clearPocketRadius: number): ReadonlyArray<PlacementSpec> {
  const specs: PlacementSpec[] = [];
  const fenceRadius = clearPocketRadius + 1.65;
  const fenceAngles = [0.72, 1.42, 2.12, Math.PI, 4.16, 4.86, 5.56];
  for (const [index, angle] of fenceAngles.entries()) {
    specs.push({
      role: "fence",
      forward: Math.cos(angle) * fenceRadius,
      side: Math.sin(angle) * fenceRadius,
      rotationOffset: angle + Math.PI / 2,
      clusterId: "yard-fence",
      composition: "landmark",
      priority: index % 2,
    });
  }
  for (const [index, angle] of [-0.34, 0.34].entries()) {
    specs.push({
      role: "waylight",
      forward: Math.cos(angle) * (fenceRadius + 0.35),
      side: Math.sin(angle) * (fenceRadius + 0.35),
      rotationOffset: angle + Math.PI / 2,
      clusterId: "yard-gate",
      composition: "landmark",
      priority: index,
    });
  }
  const clumpRadius = fenceRadius + 2.4;
  for (const [clusterIndex, angle] of [0.9, 2.25, 3.75, 5.1].entries()) {
    const clusterId = `yard-clump-${clusterIndex}`;
    const forward = Math.cos(angle) * clumpRadius;
    const side = Math.sin(angle) * clumpRadius;
    specs.push(
      {
        role: "grass",
        forward,
        side,
        rotationOffset: angle,
        clusterId,
        composition: "clump",
        priority: 0,
      },
      {
        role: "grass",
        forward: forward + Math.cos(angle + 0.8) * 1.1,
        side: side + Math.sin(angle + 0.8) * 1.1,
        rotationOffset: angle + 0.55,
        clusterId,
        composition: "clump",
        priority: 1,
      },
      {
        role: "flower",
        forward: forward + Math.cos(angle - 0.7) * 1.35,
        side: side + Math.sin(angle - 0.7) * 1.35,
        rotationOffset: angle - 0.42,
        clusterId,
        composition: "clump",
        priority: 0,
      },
    );
  }
  for (const [index, angle] of [1.72, 4.55].entries()) {
    specs.push({
      role: "stone",
      forward: Math.cos(angle) * (clumpRadius + 0.8),
      side: Math.sin(angle) * (clumpRadius + 0.8),
      rotationOffset: angle,
      clusterId: `yard-stone-${index}`,
      composition: "landmark",
      priority: 0,
    });
  }
  return specs;
}

function watersideSpecs(): ReadonlyArray<PlacementSpec> {
  const specs: PlacementSpec[] = [];
  const stations = [-10, -7, -4, 4, 7, 10];
  for (const [stationIndex, forward] of stations.entries()) {
    const clusterId = `shore-clump-${stationIndex}`;
    specs.push(
      {
        role: "reed",
        forward,
        side: -0.65,
        rotationOffset: stationIndex * 0.31,
        clusterId,
        composition: "edge-band",
        priority: 0,
      },
      {
        role: "reed",
        forward: forward + (stationIndex % 2 === 0 ? 0.72 : -0.72),
        side: -1.65,
        rotationOffset: -stationIndex * 0.22,
        clusterId,
        composition: "clump",
        priority: 1,
      },
    );
    if (stationIndex % 2 === 0) {
      specs.push({
        role: "stone",
        forward: forward - 0.4,
        side: -3.05,
        rotationOffset: stationIndex * 0.48,
        clusterId,
        composition: "landmark",
        priority: 0,
      });
    }
  }
  for (const [index, forward] of [-6.2, 6.2].entries()) {
    specs.push({
      role: "fence",
      forward,
      side: -5.2,
      rotationOffset: 0,
      clusterId: "shore-overlook",
      composition: "landmark",
      priority: index,
    });
  }
  specs.push({
    role: "waylight",
    forward: 3.6,
    side: -5.1,
    rotationOffset: 0,
    clusterId: "shore-overlook",
    composition: "landmark",
    priority: 0,
  });
  return specs;
}

function roleForAmbient(detail: PlannedAmbientDetail): PlannedRegionalAssetRole | null {
  if (detail.assetRole === "grass") return "grass";
  if (detail.assetRole === "flower-group" || detail.assetRole === "flowering-bush") return "flower";
  if (detail.assetRole === "fern") return "reed";
  if (detail.assetRole.includes("rock")) return "stone";
  return null;
}

function roleForEnrichment(
  detail: PlannedMeadowDetail | PlannedShoreDetail,
): PlannedRegionalAssetRole | null {
  if (detail.assetRole === "grass") return "grass";
  if (detail.assetRole === "flower-group" || detail.assetRole === "flowering-bush") return "flower";
  if (detail.assetRole === "fern") return "reed";
  if (detail.assetRole === "round-rock-path") return "stone";
  return null;
}

function nearestWalkDetail(
  pools: ReadonlyMap<PlannedWalkDetailKind, ReadonlyArray<PlannedWalkDetailInstance>>,
  role: PlannedRegionalAssetRole,
  point: FlatPoint,
): PlannedWalkDetailInstance | undefined {
  const kind = WALK_DETAIL_KIND_BY_ROLE[role];
  if (!kind) return undefined;
  let nearest: PlannedWalkDetailInstance | undefined;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const instance of pools.get(kind) ?? []) {
    const deltaX = instance.x - point.x;
    const deltaZ = instance.z - point.z;
    const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
    if (
      distanceSquared < nearestDistanceSquared - 0.000_000_000_001 ||
      (Math.abs(distanceSquared - nearestDistanceSquared) <= 0.000_000_000_001 &&
        instance.id.localeCompare(nearest?.id ?? "") < 0)
    ) {
      nearest = instance;
      nearestDistanceSquared = distanceSquared;
    }
  }
  return nearest;
}

function nearestContextSource(
  sources: ReadonlyArray<ContextSource>,
  point: FlatPoint,
): ContextSource | undefined {
  let nearest: ContextSource | undefined;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const source of sources) {
    const deltaX = source.x - point.x;
    const deltaZ = source.z - point.z;
    const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
    if (
      distanceSquared < nearestDistanceSquared - 0.000_000_000_001 ||
      (Math.abs(distanceSquared - nearestDistanceSquared) <= 0.000_000_000_001 &&
        source.id.localeCompare(nearest?.id ?? "") < 0)
    ) {
      nearest = source;
      nearestDistanceSquared = distanceSquared;
    }
  }
  return nearest;
}

function minimumStructureClearance(
  structures: ReadonlyArray<StructureClearance>,
  point: FlatPoint,
): number {
  let clearance = Number.POSITIVE_INFINITY;
  for (const structure of structures) {
    clearance = Math.min(clearance, pointDistance(point, structure) - structure.radius);
  }
  return clearance;
}

function roleTerrainSafe(
  role: PlannedRegionalAssetRole,
  region: ReturnType<typeof classifyPlannedTerrainRegion>,
  waterDistance: number,
): boolean {
  if (!region.inside || region.water !== null || region.material === "outside") return false;
  if (region.slopeDegrees > ROLE_CLEARANCE[role].maximumSlope) return false;
  if (role === "reed") return waterDistance >= 0.2 && waterDistance <= 5.4;
  if (role === "grass" || role === "flower") {
    return (
      region.material === "low-meadow" ||
      region.material === "high-meadow" ||
      region.material === "settlement-soil" ||
      region.material === "shore"
    );
  }
  return region.material !== "lake-bed" && region.material !== "river-bed";
}

function separatedFromInstances(
  instances: ReadonlyArray<PlannedRegionalAssetInstance>,
  role: PlannedRegionalAssetRole,
  point: FlatPoint,
): boolean {
  const spacing = ROLE_CLEARANCE[role].spacing;
  const spacingSquared = (spacing - 0.000_1) ** 2;
  return instances.every(
    (instance) =>
      instance.role !== role ||
      (point.x - instance.position.x) ** 2 + (point.z - instance.position.z) ** 2 >= spacingSquared,
  );
}

function candidateOffsets(
  role: PlannedRegionalAssetRole,
): ReadonlyArray<readonly [number, number]> {
  if (role === "reed")
    return [
      [0, 0],
      [0.35, -0.55],
      [-0.42, -1.05],
    ];
  if (role === "fence" || role === "waylight")
    return [
      [0, 0],
      [0.45, 0.7],
      [-0.45, -0.7],
    ];
  return [
    [0, 0],
    [0.42, 0.48],
    [-0.5, -0.42],
  ];
}

function mountBudget(
  instances: ReadonlyArray<PlannedRegionalAssetInstance>,
  mount: PlannedRegionalMount,
): PlannedRegionalMountBudget {
  const hasMergedGeometry = instances.some((instance) => instance.role !== "fence");
  const hasShippedFence = instances.some((instance) => instance.role === "fence");
  const drawCalls =
    mount === "far"
      ? Number(instances.length > 0)
      : Number(hasMergedGeometry) + Number(hasShippedFence);
  const triangles = instances.reduce(
    (total, instance) => total + PLANNED_REGIONAL_ASSET_COSTS[instance.role].triangles,
    0,
  );
  return { instances: instances.length, drawCalls, triangles };
}

function emptyRoleCounts(): Record<PlannedRegionalAssetRole, number> {
  return { grass: 0, flower: 0, reed: 0, stone: 0, fence: 0, waylight: 0 };
}

function createBounds(
  center: Point3,
  instances: ReadonlyArray<PlannedRegionalAssetInstance>,
): PlannedRegionalBounds {
  const xs = instances.map((instance) => instance.position.x);
  const zs = instances.map((instance) => instance.position.z);
  const minX = xs.length > 0 ? Math.min(...xs) : center.x;
  const maxX = xs.length > 0 ? Math.max(...xs) : center.x;
  const minZ = zs.length > 0 ? Math.min(...zs) : center.z;
  const maxZ = zs.length > 0 ? Math.max(...zs) : center.z;
  return {
    minX: round(minX),
    maxX: round(maxX),
    minZ: round(minZ),
    maxZ: round(maxZ),
    width: round(maxX - minX),
    depth: round(maxZ - minZ),
  };
}

function createChunk(
  draft: ChunkDraft,
  instances: ReadonlyArray<PlannedRegionalAssetInstance>,
): PlannedRegionalChunk {
  const roleCounts = emptyRoleCounts();
  const clusterIds = new Set<string>();
  let edgeBandInstanceCount = 0;
  let clumpInstanceCount = 0;
  let landmarkInstanceCount = 0;
  for (const instance of instances) {
    roleCounts[instance.role] += 1;
    clusterIds.add(instance.clusterId);
    if (instance.composition === "edge-band") edgeBandInstanceCount += 1;
    else if (instance.composition === "clump") clumpInstanceCount += 1;
    else landmarkInstanceCount += 1;
  }
  return {
    ...draft,
    instanceIds: instances.map((instance) => instance.id),
    bounds: createBounds(draft.center, instances),
    composition: {
      clusterCount: clusterIds.size,
      edgeBandInstanceCount,
      clumpInstanceCount,
      landmarkInstanceCount,
      roleCounts,
    },
  };
}

function chunkReadable(chunk: PlannedRegionalChunk): boolean {
  if (chunk.role === "arrival-edge") {
    return (
      chunk.instanceIds.length >= 12 &&
      chunk.composition.clusterCount >= 6 &&
      chunk.composition.edgeBandInstanceCount >= 8 &&
      Math.max(chunk.bounds.width, chunk.bounds.depth) >= 18
    );
  }
  if (chunk.role === "settlement-yard") {
    return (
      chunk.instanceIds.length >= 12 &&
      chunk.composition.clusterCount >= 4 &&
      chunk.composition.landmarkInstanceCount >= 5 &&
      chunk.composition.roleCounts.fence + chunk.composition.roleCounts.waylight >= 4
    );
  }
  return (
    chunk.instanceIds.length >= 10 &&
    chunk.composition.clusterCount >= 4 &&
    chunk.composition.roleCounts.reed >= 6 &&
    chunk.composition.landmarkInstanceCount >= 3 &&
    Math.max(chunk.bounds.width, chunk.bounds.depth) >= 16
  );
}

/**
 * Pure, fixed-candidate regional composition. It consumes the already-prepared
 * Walk spawn/detail and never builds a navigation grid or scans a terrain
 * lattice, so the same input/output can move into the existing Walk worker.
 */
export function createPlannedRegionalExperiencePlan({
  plan,
  landUse,
  scatter,
  enrichment,
  livingSpawn,
  detail,
}: PlannedRegionalExperienceInput): PlannedRegionalExperiencePlan | null {
  if (!livingSpawn || !livingSpawn.waterFocus || !detail.waterFocus) return null;
  if (landUse.topologyKey !== plan.topologyKey) {
    throw new Error("Regional experience requires land use from the same world plan.");
  }
  if (
    Math.hypot(detail.spawn.x - livingSpawn.position.x, detail.spawn.z - livingSpawn.position.z) >
      0.01 ||
    Math.hypot(
      detail.waterFocus.x - livingSpawn.waterFocus.x,
      detail.waterFocus.z - livingSpawn.waterFocus.z,
    ) > 0.01
  ) {
    throw new Error("Regional experience requires the prepared detail and living spawn to agree.");
  }

  const structures = [...scatter.buildings, ...scatter.landmarks];
  const targetStructure = structures.find((structure) => structure.id === livingSpawn.structureId);
  if (!targetStructure) return null;
  const roadEdges = createRoadEdges(landUse);
  const settlementPoint = targetStructure.transform.position;
  const shoreCandidates = [
    ...detail.instances
      .filter((instance) => instance.kind === "reed" || instance.kind === "stone")
      .map((instance) => ({ id: instance.id, x: instance.x, z: instance.z })),
    ...enrichment.shoreDetails.map((instance) => ({
      id: instance.id,
      x: instance.position.x,
      z: instance.position.z,
    })),
  ];
  const shoreSource = [...shoreCandidates].sort(
    (first, second) =>
      pointDistance(first, livingSpawn.waterFocus!) -
        pointDistance(second, livingSpawn.waterFocus!) || first.id.localeCompare(second.id),
  )[0];
  if (!shoreSource) return null;

  const arrivalRoad = nearestRoadEdge(livingSpawn.position, roadEdges);
  const settlementRoad = nearestRoadEdge(settlementPoint, roadEdges);
  const arrivalCenter = heightPoint(
    plan,
    arrivalRoad ? { x: arrivalRoad.x, z: arrivalRoad.z } : livingSpawn.position,
  );
  const settlementCenter = heightPoint(plan, settlementPoint);
  const shoreCenter = heightPoint(plan, shoreSource);
  const settlementRoadPoint = settlementRoad
    ? { x: settlementRoad.x, z: settlementRoad.z }
    : livingSpawn.position;
  const waterDirection = facing(shoreCenter, livingSpawn.waterFocus);
  const chunkDrafts: ReadonlyArray<ChunkDraft> = [
    {
      id: `${plan.placementKey}:regional:arrival-edge`,
      role: "arrival-edge",
      mount: "near",
      center: arrivalCenter,
      facingRadians: facing(arrivalCenter, settlementCenter),
      clearPocketRadius: 3,
    },
    {
      id: `${plan.placementKey}:regional:settlement-yard`,
      role: "settlement-yard",
      mount: "near",
      center: settlementCenter,
      facingRadians: facing(settlementCenter, settlementRoadPoint),
      clearPocketRadius: targetStructure.footprintRadius + 0.9,
    },
    {
      id: `${plan.placementKey}:regional:waterside-overlook`,
      role: "waterside-overlook",
      mount: "far",
      center: shoreCenter,
      facingRadians: waterDirection - Math.PI / 2,
      clearPocketRadius: 2.8,
    },
  ];
  const specsByChunk = new Map(
    chunkDrafts.map((chunk) => [
      chunk.id,
      chunk.role === "arrival-edge"
        ? arrivalSpecs()
        : chunk.role === "settlement-yard"
          ? settlementSpecs(chunk.clearPocketRadius)
          : watersideSpecs(),
    ]),
  );
  const localPathQueryBounds = chunkDrafts.flatMap((chunk) =>
    (specsByChunk.get(chunk.id) ?? [])
      .flatMap((spec) =>
        candidateOffsets(spec.role).map((offset) =>
          localPoint(chunk, spec.forward + offset[0], spec.side + offset[1]),
        ),
      )
      .map((point) => ({ minX: point.x, maxX: point.x, minZ: point.z, maxZ: point.z })),
  );
  const localPathCorridors = createPlannedHamletPathCorridors(plan, scatter, {
    queryBounds: localPathQueryBounds,
    clearance: Math.max(...Object.values(ROLE_CLEARANCE).map((clearance) => clearance.path)),
  });

  const clearanceSources: StructureClearance[] = [
    ...structures.map((structure) => ({
      id: structure.id,
      x: structure.transform.position.x,
      z: structure.transform.position.z,
      radius: structure.footprintRadius,
    })),
    ...landUse.anchors.map((anchor) => ({
      id: anchor.id,
      x: anchor.position.x,
      z: anchor.position.z,
      radius: anchor.clearanceRadius,
    })),
  ];
  const walkDetailPools = new Map<PlannedWalkDetailKind, ReadonlyArray<PlannedWalkDetailInstance>>(
    (["grass", "flower", "reed", "stone"] as const).map((kind) => [
      kind,
      detail.instances.filter((instance) => instance.kind === kind),
    ]),
  );
  const contextSources: ContextSource[] = [
    ...scatter.ambientDetails.flatMap((source) =>
      roleForAmbient(source)
        ? [
            {
              id: source.id,
              x: source.transform.position.x,
              z: source.transform.position.z,
              category: "scatter" as const,
            },
          ]
        : [],
    ),
    ...[...enrichment.meadowDetails, ...enrichment.shoreDetails].flatMap((source) =>
      roleForEnrichment(source)
        ? [
            {
              id: source.id,
              x: source.position.x,
              z: source.position.z,
              category: "enrichment" as const,
            },
          ]
        : [],
    ),
  ];
  const nearestLandUseAnchor = [...landUse.anchors].sort(
    (first, second) =>
      pointDistance(first.position, settlementCenter) -
        pointDistance(second.position, settlementCenter) || first.id.localeCompare(second.id),
  )[0];
  const sourceCoverage = {
    landUse: new Set<string>([
      landUse.primaryRoad.id,
      ...(nearestLandUseAnchor ? [nearestLandUseAnchor.id] : []),
    ]),
    scatter: new Set<string>([targetStructure.id]),
    enrichment: new Set<string>(),
    walkDetail: new Set<string>(),
  };
  const instances: PlannedRegionalAssetInstance[] = [];
  const instancesByChunk = new Map<string, PlannedRegionalAssetInstance[]>();

  for (const chunk of chunkDrafts) {
    const specs = specsByChunk.get(chunk.id) ?? [];
    const chunkInstances: PlannedRegionalAssetInstance[] = [];
    for (const [specIndex, spec] of specs.entries()) {
      for (const offset of candidateOffsets(spec.role)) {
        const point = localPoint(chunk, spec.forward + offset[0], spec.side + offset[1]);
        const road = nearestRoadEdge(point, roadEdges);
        const primaryRoadEdgeDistance = road?.edgeDistance ?? Number.POSITIVE_INFINITY;
        const localPathEdgeDistance = queryPlannedHamletPathCorridorDistance(
          point,
          localPathCorridors,
        ).distance;
        const pathEdgeDistance = Math.min(primaryRoadEdgeDistance, localPathEdgeDistance);
        const structureClearance = minimumStructureClearance(clearanceSources, point);
        const clearance = ROLE_CLEARANCE[spec.role];
        if (
          pathEdgeDistance < clearance.path ||
          structureClearance < clearance.structure ||
          !separatedFromInstances(chunkInstances, spec.role, point)
        ) {
          continue;
        }
        const region = classifyPlannedTerrainRegion(plan, point.x, point.z);
        const waterDistance = queryPlannedWaterDistance(plan, point.x, point.z).signedDistance;
        const terrainSafe = roleTerrainSafe(spec.role, region, waterDistance);
        const waterClear = region.water === null && waterDistance >= 0.2;
        const structureClear = structureClearance >= clearance.structure;
        const pathClear = pathEdgeDistance >= clearance.path;
        const contactY = region.height + 0.035;
        const contactAligned = Number.isFinite(contactY);
        if (!terrainSafe || !waterClear || !structureClear || !pathClear || !contactAligned) {
          continue;
        }

        const detailSource = nearestWalkDetail(walkDetailPools, spec.role, point);
        const contextSource = nearestContextSource(contextSources, point);
        const sourceIds = [
          detailSource?.id,
          contextSource?.id,
          chunk.role === "settlement-yard" ? nearestLandUseAnchor?.id : undefined,
          chunk.role === "settlement-yard" ? targetStructure.id : undefined,
        ].filter(
          (value, index, values): value is string =>
            Boolean(value) && values.indexOf(value) === index,
        );
        if (detailSource) sourceCoverage.walkDetail.add(detailSource.id);
        if (contextSource?.category === "scatter") sourceCoverage.scatter.add(contextSource.id);
        if (contextSource?.category === "enrichment")
          sourceCoverage.enrichment.add(contextSource.id);
        const variationKey = `${plan.placementKey}:${chunk.role}:${spec.role}:${specIndex}`;
        const sourceScale =
          detailSource?.scale ?? 0.82 + stableFraction(`${variationKey}:scale`) * 0.36;
        const targetHeight =
          PLANNED_REGIONAL_ASSET_COSTS[spec.role].baseHeight *
          Math.min(1.26, Math.max(0.72, sourceScale));
        const id = `${chunk.id}:${spec.role}:${specIndex}`;
        const instance: PlannedRegionalAssetInstance = {
          id,
          geometryId: `${plan.placementKey}:${chunk.role}:${spec.clusterId}:${spec.role}:${specIndex}`,
          chunkId: chunk.id,
          mount: chunk.mount,
          role: spec.role,
          clusterId: `${chunk.id}:${spec.clusterId}`,
          composition: spec.composition,
          position: { x: round(point.x), y: round(contactY), z: round(point.z) },
          rotationY: round(
            chunk.facingRadians +
              spec.rotationOffset +
              (detailSource?.rotation ?? stableFraction(`${variationKey}:rotation`) * Math.PI * 2) *
                0.18,
          ),
          targetHeight: round(targetHeight),
          priority: spec.priority,
          sourceIds,
          validation: {
            terrainSafe,
            waterClear,
            structureClear,
            pathClear,
            contactAligned,
            pathEdgeDistance: round(pathEdgeDistance),
            waterDistance: round(waterDistance),
            minimumStructureClearance: round(structureClearance),
            slopeDegrees: round(region.slopeDegrees),
          },
        };
        chunkInstances.push(instance);
        instances.push(instance);
        break;
      }
    }
    instancesByChunk.set(chunk.id, chunkInstances);
  }

  const chunks = chunkDrafts.map((chunk) =>
    createChunk(chunk, instancesByChunk.get(chunk.id) ?? []),
  );
  const nearBudget = mountBudget(
    instances.filter((instance) => instance.mount === "near"),
    "near",
  );
  const farBudget = mountBudget(
    instances.filter((instance) => instance.mount === "far"),
    "far",
  );
  const totalBudget = {
    instances: nearBudget.instances + farBudget.instances,
    drawCalls: nearBudget.drawCalls + farBudget.drawCalls,
    triangles: nearBudget.triangles + farBudget.triangles,
  };
  const withinBudget =
    chunks.length <= PLANNED_REGIONAL_EXPERIENCE_BUDGET.maximumChunks &&
    nearBudget.instances <= PLANNED_REGIONAL_EXPERIENCE_BUDGET.maximumInstances.near &&
    farBudget.instances <= PLANNED_REGIONAL_EXPERIENCE_BUDGET.maximumInstances.far &&
    totalBudget.instances <= PLANNED_REGIONAL_EXPERIENCE_BUDGET.maximumInstances.total &&
    nearBudget.drawCalls <= PLANNED_REGIONAL_EXPERIENCE_BUDGET.maximumDrawCalls.near &&
    farBudget.drawCalls <= PLANNED_REGIONAL_EXPERIENCE_BUDGET.maximumDrawCalls.far &&
    totalBudget.drawCalls <= PLANNED_REGIONAL_EXPERIENCE_BUDGET.maximumDrawCalls.total &&
    nearBudget.triangles <= PLANNED_REGIONAL_EXPERIENCE_BUDGET.maximumTriangles.near &&
    farBudget.triangles <= PLANNED_REGIONAL_EXPERIENCE_BUDGET.maximumTriangles.far &&
    totalBudget.triangles <= PLANNED_REGIONAL_EXPERIENCE_BUDGET.maximumTriangles.total;
  const validation = {
    allTerrainSafe: instances.every((instance) => instance.validation.terrainSafe),
    allWaterClear: instances.every((instance) => instance.validation.waterClear),
    allStructuresClear: instances.every((instance) => instance.validation.structureClear),
    allPathsClear: instances.every((instance) => instance.validation.pathClear),
    allContactsAligned: instances.every((instance) => instance.validation.contactAligned),
    allChunksReadable: chunks.every(chunkReadable),
    withinBudget,
  };
  const findings = Object.entries(validation)
    .filter(([, valid]) => !valid)
    .map(([name]) => name);

  return {
    schema: PLANNED_REGIONAL_EXPERIENCE_SCHEMA,
    key: `${plan.placementKey}:regional-experience`,
    route: {
      spawn: livingSpawn.position,
      settlement: settlementCenter,
      shore: shoreCenter,
      waterFocus: livingSpawn.waterFocus,
      structureId: targetStructure.id,
    },
    chunks,
    instances,
    mounts: { near: nearBudget, far: farBudget },
    sourceCoverage: {
      landUseIds: [...sourceCoverage.landUse].sort(),
      scatterIds: [...sourceCoverage.scatter].sort(),
      enrichmentIds: [...sourceCoverage.enrichment].sort(),
      walkDetailIds: [...sourceCoverage.walkDetail].sort(),
    },
    validation: { ...validation, findings },
  };
}
