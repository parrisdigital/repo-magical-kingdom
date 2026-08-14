import { stableFraction, stableHash } from "@/lib/kingdom/hash";
import type { HamletRegion, WorldPlan, WorldPlanPoint } from "@/lib/kingdom/world-plan";

import type { PlannedBuilding, PlannedLandmark, PlannedScatter } from "./planned-scatter";
import {
  classifyPlannedTerrainRegion,
  getHamletVisualPlacementMask,
  getPlannedTerrainDefinition,
  isInsidePlannedTerrain,
  queryPlannedWaterDistance,
  samplePlannedTerrainHeight,
} from "./planned-terrain-model";
import type { PlannedVisualEnrichment } from "./planned-visual-enrichment";

export const PLANNED_LAND_USE_SCHEMA = "repo-planned-land-use/v1" as const;

export type PlannedDevelopedZoneSignature =
  "civic-square" | "productive-yard" | "garden-orchard" | "frontier-enclosure" | "village-lanes";

export type PlannedLandUsePoint = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type PlannedDevelopedZone = Readonly<{
  id: string;
  hamletId: string;
  provinceId: string;
  label: string;
  signature: PlannedDevelopedZoneSignature;
  center: PlannedLandUsePoint;
  polygon: ReadonlyArray<WorldPlanPoint>;
  radiusX: number;
  radiusZ: number;
  activitySpan: number;
  structureIds: ReadonlyArray<string>;
  representedEntityIds: ReadonlyArray<string>;
  contextInstanceIds: ReadonlyArray<string>;
  terrain: PlannedLandUseTerrainValidation;
}>;

export type PlannedLandUseTerrainValidation = Readonly<{
  valid: boolean;
  maximumSlopeDegrees: number;
  minimumShoreClearance: number;
  sampleCount: number;
}>;

export type PlannedRoadNode = Readonly<{
  id: string;
  kind: "hamlet-entry" | "water-view";
  hamletId: string;
  position: PlannedLandUsePoint;
}>;

export type PlannedRoadSegment = Readonly<{
  id: string;
  fromNodeId: string;
  toNodeId: string;
  width: number;
  points: ReadonlyArray<PlannedLandUsePoint>;
  length: number;
  maximumPointSpacing: number;
  terrain: PlannedLandUseTerrainValidation;
  crossings: ReadonlyArray<PlannedRoadCrossing>;
  pathSafety: Readonly<{
    valid: boolean;
    unsupportedSampleCount: number;
  }>;
  clearsStructures: boolean;
}>;

export type PlannedRoadCrossing = Readonly<{
  id: string;
  kind: "bridge" | "stepped-cut";
  startPointIndex: number;
  endPointIndex: number;
  length: number;
  maximumSlopeDegrees: number;
  waterSampleCount: number;
  shoreSampleCount: number;
  valid: boolean;
}>;

export type PlannedPrimaryRoadNetwork = Readonly<{
  id: string;
  nodes: ReadonlyArray<PlannedRoadNode>;
  segments: ReadonlyArray<PlannedRoadSegment>;
  widthRange: Readonly<{ minimum: 4; maximum: 5 }>;
  connectedHamletIds: ReadonlyArray<string>;
  allHamletsConnected: boolean;
}>;

export type PlannedLandscapeRole = "field" | "orchard" | "garden";

export type PlannedLandscapePolygon = Readonly<{
  id: string;
  hamletId: string;
  zoneId: string;
  role: PlannedLandscapeRole;
  polygon: ReadonlyArray<WorldPlanPoint>;
  center: PlannedLandUsePoint;
  area: number;
  contextInstanceIds: ReadonlyArray<string>;
  terrain: PlannedLandUseTerrainValidation;
  clearsStructures: boolean;
  clearsPrimaryRoad: boolean;
}>;

export type PlannedLandUseAnchorKind = "walk-entry" | "prop" | "habitat" | "poi";

export type PlannedLandUseAnchor = Readonly<{
  id: string;
  zoneId: string;
  hamletId: string;
  kind: PlannedLandUseAnchorKind;
  role:
    | "settlement-threshold"
    | "notice-board"
    | "supply-stack"
    | "orchard-marker"
    | "watch-fire"
    | "wayfinding-post"
    | "field-habitat"
    | "orchard-habitat"
    | "waterside-overlook";
  position: PlannedLandUsePoint;
  facingRadians: number;
  clearanceRadius: number;
  walkAdjacent: boolean;
  waterView: boolean;
  roadSegmentId: string | null;
  sourceInstanceIds: ReadonlyArray<string>;
  terrain: PlannedLandUseTerrainValidation;
  clearsStructures: boolean;
}>;

export type PlannedDevelopedCoverage = Readonly<{
  target: Readonly<{ minimumRatio: 0.12; maximumRatio: 0.18 }>;
  status: "met" | "infeasible";
  visibleLandArea: number;
  developedArea: number;
  developedRatio: number;
  targetMinimumArea: number;
  targetMaximumArea: number;
  shortfallArea: number;
  excessArea: number;
  sampleSpacing: number;
  infeasibilityCodes: ReadonlyArray<
    "DEVELOPED_COVERAGE_BELOW_TARGET" | "DEVELOPED_COVERAGE_ABOVE_TARGET"
  >;
}>;

export type PlannedLandUseBudget = Readonly<{
  maxSurfaceScatter: number;
  occupiedSurfaceInstances: number;
  availableSurfaceInstances: number;
  reservedAnchorInstances: number;
  withinBudget: boolean;
}>;

export type PlannedLandUseValidation = Readonly<{
  allHamletsHaveZones: boolean;
  allHamletsNetworkConnected: boolean;
  allRoadsTerrainSafe: boolean;
  allLandscapeTerrainSafe: boolean;
  allAnchorsTerrainSafe: boolean;
  allRenderableItemsClearStructures: boolean;
  distinctSignatureCount: number;
  requiredDistinctSignatureCount: number;
  hasWalkAdjacentDetailPerHamlet: boolean;
  hasWaterViewPoi: boolean;
  findings: ReadonlyArray<string>;
}>;

export type PlannedLandUse = Readonly<{
  schema: typeof PLANNED_LAND_USE_SCHEMA;
  key: string;
  topologyKey: string;
  placementKey: string;
  zones: ReadonlyArray<PlannedDevelopedZone>;
  primaryRoad: PlannedPrimaryRoadNetwork;
  landscapePolygons: ReadonlyArray<PlannedLandscapePolygon>;
  anchors: ReadonlyArray<PlannedLandUseAnchor>;
  coverage: PlannedDevelopedCoverage;
  budget: PlannedLandUseBudget;
  validation: PlannedLandUseValidation;
}>;

type FlatPoint = Readonly<{ x: number; z: number }>;
type Structure = PlannedBuilding | PlannedLandmark;

const TAU = Math.PI * 2;
const ROAD_MINIMUM_WIDTH = 4;
const ROAD_MAXIMUM_WIDTH = 5;
const ROAD_MAXIMUM_SLOPE = 20;
const LANDSCAPE_MAXIMUM_SLOPE = 18;
const COVERAGE_MINIMUM = 0.12;
const COVERAGE_MAXIMUM = 0.18;
const ROAD_GRID_SPACING = 5;
const COVERAGE_GRID_SPACING = 4;
const LANDSCAPE_MINIMUM_PER_HAMLET = 3;
const LANDSCAPE_MAXIMUM_PER_HAMLET = 12;
const landUseCacheByPlacementKey = new Map<string, PlannedLandUse>();
const MAX_LAND_USE_CACHE_ENTRIES = 16;
type PlanningSampleCaches = Readonly<{
  terrain: Map<
    string,
    Readonly<{
      region: ReturnType<typeof classifyPlannedTerrainRegion>;
      water: ReturnType<typeof queryPlannedWaterDistance>;
    }>
  >;
  inside: Map<string, boolean>;
  water: Map<string, ReturnType<typeof queryPlannedWaterDistance>>;
}>;
let activePlanningCaches: PlanningSampleCaches | null = null;

export function clearPlannedLandUseCacheForTests(): void {
  landUseCacheByPlacementKey.clear();
  activePlanningCaches = null;
}

function landUseCacheKey(plan: WorldPlan): string {
  return `${plan.placementKey}:${plan.topologyKey}`;
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function distance(first: FlatPoint, second: FlatPoint): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function canonicalTerrainSample(plan: WorldPlan, point: FlatPoint) {
  const terrainCache = activePlanningCaches?.terrain;
  const key = `${point.x}:${point.z}`;
  const cached = terrainCache?.get(key);
  if (cached) return cached;
  const result = {
    region: classifyPlannedTerrainRegion(plan, point.x, point.z),
    water: queryPlannedWaterDistance(plan, point.x, point.z),
  };
  terrainCache?.set(key, result);
  return result;
}

function canonicalWaterSample(plan: WorldPlan, point: FlatPoint) {
  const waterCache = activePlanningCaches?.water;
  const key = `${point.x}:${point.z}`;
  const cached = waterCache?.get(key);
  if (cached) return cached;
  const result = queryPlannedWaterDistance(plan, point.x, point.z);
  waterCache?.set(key, result);
  return result;
}

function canonicalInsideSample(plan: WorldPlan, point: FlatPoint): boolean {
  const insideCache = activePlanningCaches?.inside;
  const key = `${point.x}:${point.z}`;
  const cached = insideCache?.get(key);
  if (cached !== undefined) return cached;
  const result = isInsidePlannedTerrain(plan, point.x, point.z);
  insideCache?.set(key, result);
  return result;
}

function distanceToSegment(subject: FlatPoint, start: FlatPoint, end: FlatPoint): number {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (lengthSquared === 0) return distance(subject, start);
  const progress = Math.min(
    1,
    Math.max(0, ((subject.x - start.x) * deltaX + (subject.z - start.z) * deltaZ) / lengthSquared),
  );
  return Math.hypot(
    subject.x - (start.x + deltaX * progress),
    subject.z - (start.z + deltaZ * progress),
  );
}

function polygonArea(points: ReadonlyArray<WorldPlanPoint>): number {
  let doubledArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    doubledArea += current.x * next.z - next.x * current.z;
  }
  return Math.abs(doubledArea) / 2;
}

function polygonContains(point: FlatPoint, polygon: ReadonlyArray<WorldPlanPoint>): boolean {
  let inside = false;
  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current++
  ) {
    const first = polygon[current]!;
    const second = polygon[previous]!;
    if (
      first.z > point.z !== second.z > point.z &&
      point.x < ((second.x - first.x) * (point.z - first.z)) / (second.z - first.z) + first.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function ellipsePolygon(
  center: FlatPoint,
  radiusX: number,
  radiusZ: number,
  rotation: number,
  segments: number,
  key: string,
): ReadonlyArray<WorldPlanPoint> {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * TAU;
    const irregularity = 0.94 + stableFraction(`${key}:edge:${index}`) * 0.06;
    const localX = Math.cos(angle) * radiusX * irregularity;
    const localZ = Math.sin(angle) * radiusZ * irregularity;
    return {
      x: round(center.x + localX * cosine - localZ * sine),
      z: round(center.z + localX * sine + localZ * cosine),
    };
  });
}

function terrainValidation(
  plan: WorldPlan,
  points: ReadonlyArray<FlatPoint>,
  maximumAllowedSlope: number,
  footprintRadius = 0,
): PlannedLandUseTerrainValidation {
  const samples: FlatPoint[] = [];
  for (const point of points) {
    samples.push(point);
    if (footprintRadius > 0) {
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * TAU;
        samples.push({
          x: point.x + Math.cos(angle) * footprintRadius,
          z: point.z + Math.sin(angle) * footprintRadius,
        });
      }
    }
  }
  let valid = true;
  let maximumSlopeDegrees = 0;
  let minimumShoreClearance = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const { region, water } = canonicalTerrainSample(plan, sample);
    maximumSlopeDegrees = Math.max(maximumSlopeDegrees, region.slopeDegrees);
    minimumShoreClearance = Math.min(minimumShoreClearance, water.shoreDistance);
    if (
      !region.inside ||
      region.water !== null ||
      region.material === "shore" ||
      region.material === "outside" ||
      region.slopeDegrees > maximumAllowedSlope ||
      water.shoreDistance < footprintRadius
    ) {
      valid = false;
    }
  }
  return {
    valid,
    maximumSlopeDegrees: round(maximumSlopeDegrees),
    minimumShoreClearance: round(minimumShoreClearance),
    sampleCount: samples.length,
  };
}

/** Samples the boundary and the complete polygon interior, not only vertices. */
function polygonTerrainValidation(
  plan: WorldPlan,
  polygon: ReadonlyArray<WorldPlanPoint>,
  maximumAllowedSlope: number,
): PlannedLandUseTerrainValidation {
  const samples: FlatPoint[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]!;
    const end = polygon[(index + 1) % polygon.length]!;
    const segmentSamples = Math.max(1, Math.ceil(distance(start, end) / 1.75));
    for (let sampleIndex = 0; sampleIndex < segmentSamples; sampleIndex += 1) {
      const progress = sampleIndex / segmentSamples;
      samples.push({
        x: start.x + (end.x - start.x) * progress,
        z: start.z + (end.z - start.z) * progress,
      });
    }
  }
  const minX = Math.min(...polygon.map((point) => point.x));
  const maxX = Math.max(...polygon.map((point) => point.x));
  const minZ = Math.min(...polygon.map((point) => point.z));
  const maxZ = Math.max(...polygon.map((point) => point.z));
  const interiorSpacing = 2;
  for (let z = minZ + interiorSpacing / 2; z < maxZ; z += interiorSpacing) {
    for (let x = minX + interiorSpacing / 2; x < maxX; x += interiorSpacing) {
      if (polygonContains({ x, z }, polygon)) samples.push({ x, z });
    }
  }
  return terrainValidation(plan, samples, maximumAllowedSlope);
}

function asLandUsePoint(plan: WorldPlan, point: FlatPoint): PlannedLandUsePoint {
  return {
    x: round(point.x),
    y: round(samplePlannedTerrainHeight(plan, point.x, point.z)),
    z: round(point.z),
  };
}

function structureClearance(
  point: FlatPoint,
  radius: number,
  structures: ReadonlyArray<Structure>,
  extra = 0.5,
): boolean {
  return structures.every(
    (structure) =>
      distance(point, structure.transform.position) >= radius + structure.footprintRadius + extra,
  );
}

function roadDistance(
  point: FlatPoint,
  segments: ReadonlyArray<PlannedRoadSegment>,
): Readonly<{ distance: number; segmentId: string | null }> {
  let minimum = Number.POSITIVE_INFINITY;
  let segmentId: string | null = null;
  for (const segment of segments) {
    for (let index = 1; index < segment.points.length; index += 1) {
      const candidate = distanceToSegment(
        point,
        segment.points[index - 1]!,
        segment.points[index]!,
      );
      if (candidate < minimum) {
        minimum = candidate;
        segmentId = segment.id;
      }
    }
  }
  return { distance: minimum, segmentId };
}

function closestIds(
  point: FlatPoint,
  instances: ReadonlyArray<Readonly<{ id: string; point: FlatPoint }>>,
  count: number,
): ReadonlyArray<string> {
  return [...instances]
    .sort(
      (first, second) =>
        distance(point, first.point) - distance(point, second.point) ||
        first.id.localeCompare(second.id),
    )
    .slice(0, count)
    .map((instance) => instance.id);
}

function primarySignature(hamlet: HamletRegion, landmarks: ReadonlyArray<PlannedLandmark>) {
  if (hamlet.role === "commons-hamlet") {
    return "village-lanes" satisfies PlannedDevelopedZoneSignature;
  }
  if (
    hamlet.role === "crown-hamlet" ||
    hamlet.role === "archive-hamlet" ||
    hamlet.role === "observatory-hamlet" ||
    landmarks.some((landmark) => landmark.assetRole === "repository-crown")
  ) {
    return "civic-square" satisfies PlannedDevelopedZoneSignature;
  }
  if (hamlet.role === "makers-hamlet") {
    return "productive-yard" satisfies PlannedDevelopedZoneSignature;
  }
  if (hamlet.role === "garden-hamlet") {
    return "garden-orchard" satisfies PlannedDevelopedZoneSignature;
  }
  if (hamlet.role === "wardens-hamlet") {
    return "frontier-enclosure" satisfies PlannedDevelopedZoneSignature;
  }
  return "village-lanes" satisfies PlannedDevelopedZoneSignature;
}

function assignSignatures(
  plan: WorldPlan,
  scatter: PlannedScatter,
): ReadonlyMap<string, PlannedDevelopedZoneSignature> {
  const allSignatures: ReadonlyArray<PlannedDevelopedZoneSignature> = [
    "civic-square",
    "productive-yard",
    "garden-orchard",
    "frontier-enclosure",
    "village-lanes",
  ];
  const result = new Map<string, PlannedDevelopedZoneSignature>();
  const used = new Set<PlannedDevelopedZoneSignature>();
  for (const hamlet of plan.topology.hamlets) {
    const landmarks = scatter.landmarks.filter((landmark) => landmark.hamletId === hamlet.id);
    const primary = primarySignature(hamlet, landmarks);
    // Multiple commons share one intentionally modest settlement language;
    // uniqueness is reserved for the two-to-four primary groups.
    if (hamlet.role === "commons-hamlet") {
      result.set(hamlet.id, primary);
      continue;
    }
    if (!used.has(primary)) {
      result.set(hamlet.id, primary);
      used.add(primary);
      continue;
    }
    const fallback = [...allSignatures]
      .filter((signature) => !used.has(signature))
      .sort(
        (first, second) =>
          stableHash(`${plan.placementKey}:${hamlet.id}:${first}`) -
          stableHash(`${plan.placementKey}:${hamlet.id}:${second}`),
      )[0];
    const signature = fallback ?? primary;
    result.set(hamlet.id, signature);
    used.add(signature);
  }
  return result;
}

function collectContextInstances(
  scatter: PlannedScatter,
  enrichment: PlannedVisualEnrichment,
): ReadonlyArray<Readonly<{ id: string; point: FlatPoint }>> {
  return [
    ...scatter.trees.map((tree) => ({ id: tree.id, point: tree.transform.position })),
    ...scatter.wildlife.map((animal) => ({ id: animal.id, point: animal.transform.position })),
    ...scatter.ambientDetails.map((detail) => ({
      id: detail.id,
      point: detail.transform.position,
    })),
    ...scatter.groundCoverClusters.map((cluster) => ({ id: cluster.id, point: cluster.center })),
    ...enrichment.supplementalTrees.map((tree) => ({ id: tree.id, point: tree.position })),
    ...enrichment.cliffFormations.map((rock) => ({ id: rock.id, point: rock.position })),
    ...enrichment.shoreDetails.map((detail) => ({ id: detail.id, point: detail.position })),
    ...enrichment.meadowDetails.map((detail) => ({ id: detail.id, point: detail.position })),
  ];
}

function createZones(
  plan: WorldPlan,
  scatter: PlannedScatter,
  enrichment: PlannedVisualEnrichment,
): ReadonlyArray<PlannedDevelopedZone> {
  const signatures = assignSignatures(plan, scatter);
  const context = collectContextInstances(scatter, enrichment);
  return plan.topology.hamlets.map((hamlet) => {
    const mask = getHamletVisualPlacementMask(plan, hamlet);
    const satellite = hamlet.role === "commons-hamlet";
    const structures = [...scatter.buildings, ...scatter.landmarks].filter(
      (structure) => structure.hamletId === hamlet.id,
    );
    let radiusX = Math.min(mask.radiusX - (satellite ? 2.5 : 0.7), satellite ? 13 : 20.5);
    let radiusZ = Math.min(mask.radiusZ - (satellite ? 2.5 : 0.7), satellite ? 13 : 20.5);
    let polygon = ellipsePolygon(
      mask.center,
      radiusX,
      radiusZ,
      mask.rotation,
      16,
      `${plan.placementKey}:${hamlet.id}:zone`,
    );
    let terrain = polygonTerrainValidation(plan, polygon, 20);
    const minimumZoneRadius = satellite ? 9.25 : 12.25;
    while (!terrain.valid && radiusX > minimumZoneRadius && radiusZ > minimumZoneRadius) {
      radiusX -= 0.75;
      radiusZ -= 0.75;
      polygon = ellipsePolygon(
        mask.center,
        radiusX,
        radiusZ,
        mask.rotation,
        16,
        `${plan.placementKey}:${hamlet.id}:zone`,
      );
      terrain = polygonTerrainValidation(plan, polygon, 20);
    }
    const activitySpan = satellite
      ? 8 + stableFraction(`${plan.placementKey}:${hamlet.id}:activity-span`) * 3
      : 12 + stableFraction(`${plan.placementKey}:${hamlet.id}:activity-span`) * 6;
    return {
      id: `developed-zone:${hamlet.id}`,
      hamletId: hamlet.id,
      provinceId: hamlet.provinceId,
      label: hamlet.label,
      signature: signatures.get(hamlet.id)!,
      center: asLandUsePoint(plan, mask.center),
      polygon,
      radiusX: round(radiusX),
      radiusZ: round(radiusZ),
      activitySpan: round(activitySpan),
      structureIds: structures.map((structure) => structure.id).sort(),
      representedEntityIds: [...hamlet.buildingEntityIds].sort(),
      contextInstanceIds: closestIds(mask.center, context, 6),
      terrain,
    };
  });
}

function findEntryPoint(
  plan: WorldPlan,
  hamlet: HamletRegion,
  structures: ReadonlyArray<Structure>,
): FlatPoint | null {
  const mask = getHamletVisualPlacementMask(plan, hamlet);
  const worldCenter = plan.topology.envelope.center;
  const desired = Math.atan2(worldCenter.z - mask.center.z, worldCenter.x - mask.center.x);
  const candidates: Array<Readonly<{ point: FlatPoint; score: number }>> = [];
  for (const radius of [18, 20, 22, 24, 27, 30, 33, 36]) {
    for (let index = 0; index < 64; index += 1) {
      const angle = (index / 64) * TAU;
      const point = {
        x: round(mask.center.x + Math.cos(angle) * radius),
        z: round(mask.center.z + Math.sin(angle) * radius),
      };
      const terrain = terrainValidation(plan, [point], ROAD_MAXIMUM_SLOPE, 2.75);
      if (!terrain.valid || !structureClearance(point, 2.75, structures)) continue;
      const angleDelta = Math.abs(Math.atan2(Math.sin(angle - desired), Math.cos(angle - desired)));
      candidates.push({
        point,
        score:
          radius +
          angleDelta * 2.2 +
          stableFraction(`${plan.placementKey}:${hamlet.id}:entry:${index}:${radius}`) * 0.2,
      });
    }
  }
  return candidates.sort((first, second) => first.score - second.score)[0]?.point ?? null;
}

class MinimumHeap {
  private values: Array<Readonly<{ id: number; score: number }>> = [];

  push(value: Readonly<{ id: number; score: number }>): void {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent]!.score <= value.score) break;
      this.values[index] = this.values[parent]!;
      index = parent;
    }
    this.values[index] = value;
  }

  pop(): Readonly<{ id: number; score: number }> | undefined {
    const first = this.values[0];
    const last = this.values.pop();
    if (!first || !last || this.values.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.values.length) break;
      const child =
        right < this.values.length && this.values[right]!.score < this.values[left]!.score
          ? right
          : left;
      if (this.values[child]!.score >= last.score) break;
      this.values[index] = this.values[child]!;
      index = child;
    }
    this.values[index] = last;
    return first;
  }

  get size(): number {
    return this.values.length;
  }
}

type Router = Readonly<{
  route: (start: FlatPoint, end: FlatPoint) => ReadonlyArray<FlatPoint> | null;
}>;

type RoadSurfaceKind = "road" | "bridge" | "stepped-cut" | "blocked";

function roadSurfaceKind(
  plan: WorldPlan,
  point: FlatPoint,
  radius: number,
  structures: ReadonlyArray<Structure>,
): RoadSurfaceKind {
  if (!structureClearance(point, radius, structures)) return "blocked";
  const { region, water } = canonicalTerrainSample(plan, point);
  if (!region.inside || region.material === "outside") return "blocked";
  if (region.water !== null || region.material === "shore" || water.shoreDistance < radius) {
    return "bridge";
  }
  if (region.slopeDegrees > ROAD_MAXIMUM_SLOPE) {
    return region.slopeDegrees <= 70 ? "stepped-cut" : "blocked";
  }
  return "road";
}

function coarseRoadSurfaceKind(
  plan: WorldPlan,
  point: FlatPoint,
  radius: number,
  structures: ReadonlyArray<Structure>,
): RoadSurfaceKind {
  if (!structureClearance(point, radius, structures)) return "blocked";
  const { region, water } = canonicalTerrainSample(plan, point);
  if (!region.inside || region.material === "outside") return "blocked";
  if (region.water !== null || region.material === "shore" || water.shoreDistance < radius) {
    return "bridge";
  }
  if (region.slopeDegrees > ROAD_MAXIMUM_SLOPE) {
    return region.slopeDegrees <= 70 ? "stepped-cut" : "blocked";
  }
  return "road";
}

function createRouter(plan: WorldPlan, structures: ReadonlyArray<Structure>): Router {
  const envelope = plan.topology.envelope;
  const columns = Math.floor(envelope.width / ROAD_GRID_SPACING) + 1;
  const rows = Math.floor(envelope.depth / ROAD_GRID_SPACING) + 1;
  const points = new Map<number, FlatPoint>();
  const kinds = new Map<number, RoadSurfaceKind>();
  const traversableEdges = new Map<string, boolean>();
  const pointForId = (id: number): FlatPoint => {
    const cached = points.get(id);
    if (cached) return cached;
    const column = id % columns;
    const row = Math.floor(id / columns);
    const point = {
      x: round(envelope.minX + column * ROAD_GRID_SPACING),
      z: round(envelope.minZ + row * ROAD_GRID_SPACING),
    };
    points.set(id, point);
    return point;
  };
  const idKind = (id: number): RoadSurfaceKind => {
    const cached = kinds.get(id);
    if (cached !== undefined) return cached;
    const point = pointForId(id);
    const kind = coarseRoadSurfaceKind(plan, point, ROAD_MAXIMUM_WIDTH / 2, structures);
    kinds.set(id, kind);
    return kind;
  };
  const lineIsTraversable = (start: FlatPoint, end: FlatPoint): boolean => {
    const segmentLength = distance(start, end);
    const sampleCount =
      segmentLength <= ROAD_GRID_SPACING * Math.SQRT2 + 0.01
        ? 2
        : Math.max(2, Math.ceil(segmentLength / 2.5));
    for (let index = 0; index <= sampleCount; index += 1) {
      const progress = index / sampleCount;
      const point = {
        x: start.x + (end.x - start.x) * progress,
        z: start.z + (end.z - start.z) * progress,
      };
      if (coarseRoadSurfaceKind(plan, point, ROAD_MAXIMUM_WIDTH / 2, structures) === "blocked")
        return false;
    }
    return true;
  };
  const nearestIds = (point: FlatPoint): ReadonlyArray<number> => {
    const baseColumn = Math.round((point.x - envelope.minX) / ROAD_GRID_SPACING);
    const baseRow = Math.round((point.z - envelope.minZ) / ROAD_GRID_SPACING);
    const candidates: number[] = [];
    for (let ring = 0; ring <= 4; ring += 1) {
      for (let rowOffset = -ring; rowOffset <= ring; rowOffset += 1) {
        for (let columnOffset = -ring; columnOffset <= ring; columnOffset += 1) {
          if (ring > 0 && Math.max(Math.abs(rowOffset), Math.abs(columnOffset)) !== ring) continue;
          const column = baseColumn + columnOffset;
          const row = baseRow + rowOffset;
          if (column < 0 || column >= columns || row < 0 || row >= rows) continue;
          const id = row * columns + column;
          if (idKind(id) === "road" && lineIsTraversable(point, pointForId(id)))
            candidates.push(id);
        }
      }
      if (candidates.length > 0) break;
    }
    return candidates.sort(
      (first, second) =>
        distance(point, pointForId(first)) - distance(point, pointForId(second)) || first - second,
    );
  };
  const neighbors = (id: number): ReadonlyArray<number> => {
    const column = id % columns;
    const row = Math.floor(id / columns);
    const result: number[] = [];
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        if (rowOffset === 0 && columnOffset === 0) continue;
        const nextColumn = column + columnOffset;
        const nextRow = row + rowOffset;
        if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) continue;
        const next = nextRow * columns + nextColumn;
        if (idKind(next) === "blocked") continue;
        const edgeKey = id < next ? `${id}:${next}` : `${next}:${id}`;
        let traversable = traversableEdges.get(edgeKey);
        if (traversable === undefined) {
          traversable = lineIsTraversable(pointForId(id), pointForId(next));
          traversableEdges.set(edgeKey, traversable);
        }
        if (traversable) result.push(next);
      }
    }
    return result;
  };

  return {
    route(start, end) {
      const starts = nearestIds(start);
      const goals = nearestIds(end);
      if (starts.length === 0 || goals.length === 0) return null;
      const goalSet = new Set(goals);
      const goal = goals[0]!;
      const open = new MinimumHeap();
      const cameFrom = new Map<number, number>();
      const costs = new Map<number, number>();
      for (const startId of starts.slice(0, 3)) {
        costs.set(startId, 0);
        open.push({ id: startId, score: distance(pointForId(startId), pointForId(goal)) });
      }
      let reached: number | null = null;
      while (open.size > 0) {
        const current = open.pop()!;
        const currentCost = costs.get(current.id);
        if (currentCost === undefined) continue;
        const expected = currentCost + distance(pointForId(current.id), pointForId(goal));
        if (current.score > expected + 0.001) continue;
        if (goalSet.has(current.id)) {
          reached = current.id;
          break;
        }
        for (const next of neighbors(current.id)) {
          const kind = idKind(next);
          const multiplier = kind === "bridge" ? 24 : kind === "stepped-cut" ? 18 : 1;
          const tentative =
            currentCost + distance(pointForId(current.id), pointForId(next)) * multiplier;
          if (tentative >= (costs.get(next) ?? Number.POSITIVE_INFINITY)) continue;
          cameFrom.set(next, current.id);
          costs.set(next, tentative);
          open.push({ id: next, score: tentative + distance(pointForId(next), pointForId(goal)) });
        }
      }
      if (reached === null) return null;
      const ids = [reached];
      while (cameFrom.has(ids[0]!)) ids.unshift(cameFrom.get(ids[0]!)!);
      return [start, ...ids.map(pointForId), end];
    },
  };
}

function roadSegment(
  plan: WorldPlan,
  structures: ReadonlyArray<Structure>,
  from: PlannedRoadNode,
  to: PlannedRoadNode,
  points: ReadonlyArray<FlatPoint>,
): PlannedRoadSegment {
  const width = round(
    ROAD_MINIMUM_WIDTH +
      stableFraction(`${plan.placementKey}:road:${from.id}:${to.id}:width`) *
        (ROAD_MAXIMUM_WIDTH - ROAD_MINIMUM_WIDTH),
  );
  const dense: FlatPoint[] = [points[0]!];
  let length = 0;
  let maximumPointSpacing = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const segmentLength = distance(start, end);
    length += segmentLength;
    const sampleCount = Math.max(1, Math.ceil(segmentLength / 1.8));
    for (let sampleIndex = 1; sampleIndex <= sampleCount; sampleIndex += 1) {
      const progress = sampleIndex / sampleCount;
      dense.push({
        x: round(start.x + (end.x - start.x) * progress),
        z: round(start.z + (end.z - start.z) * progress),
      });
    }
    maximumPointSpacing = Math.max(maximumPointSpacing, segmentLength / sampleCount);
  }
  const surfaceKinds = dense.map((point) => roadSurfaceKind(plan, point, width / 2, structures));
  const crossings: PlannedRoadCrossing[] = [];
  let crossingStart = -1;
  let crossingKind: Extract<RoadSurfaceKind, "bridge" | "stepped-cut"> | null = null;
  const finishCrossing = (endPointIndex: number) => {
    if (crossingStart < 0 || crossingKind === null) return;
    const crossingPoints = dense.slice(crossingStart, endPointIndex + 1);
    const regions = crossingPoints.map((point) =>
      classifyPlannedTerrainRegion(plan, point.x, point.z),
    );
    const waterDistances = crossingPoints.map((point) => canonicalWaterSample(plan, point));
    const crossingLength = crossingPoints
      .slice(1)
      .reduce((total, point, index) => total + distance(crossingPoints[index]!, point), 0);
    const maximumSlopeDegrees = Math.max(...regions.map((region) => region.slopeDegrees));
    const waterSampleCount = regions.filter((region) => region.water !== null).length;
    // A dry centerline can still require a bridge when the authored 4–5 unit
    // road footprint reaches the shore. Keep validation aligned with the same
    // footprint rule used to classify the crossing above.
    const shoreSampleCount = regions.filter(
      (region, index) =>
        region.material === "shore" || waterDistances[index]!.shoreDistance < width / 2,
    ).length;
    const valid =
      crossingPoints.every((point) => structureClearance(point, width / 2, structures)) &&
      (crossingKind === "bridge"
        ? crossingLength <= 42 && waterSampleCount + shoreSampleCount > 0
        : crossingLength <= 24 &&
          waterSampleCount === 0 &&
          shoreSampleCount === 0 &&
          maximumSlopeDegrees <= 70);
    crossings.push({
      id: `road-crossing:${from.id}:${to.id}:${crossings.length}`,
      kind: crossingKind,
      startPointIndex: crossingStart,
      endPointIndex,
      length: round(crossingLength),
      maximumSlopeDegrees: round(maximumSlopeDegrees),
      waterSampleCount,
      shoreSampleCount,
      valid,
    });
    crossingStart = -1;
    crossingKind = null;
  };
  for (let index = 0; index < surfaceKinds.length; index += 1) {
    const kind = surfaceKinds[index]!;
    if (kind !== "bridge" && kind !== "stepped-cut") {
      finishCrossing(index - 1);
      continue;
    }
    if (crossingKind !== null && crossingKind !== kind) finishCrossing(index - 1);
    if (crossingStart < 0) crossingStart = index;
    crossingKind = kind;
  }
  finishCrossing(dense.length - 1);
  const roadPoints = dense.filter((_, index) => surfaceKinds[index] === "road");
  const unsupportedSampleCount = surfaceKinds.filter((kind) => kind === "blocked").length;
  const terrain = terrainValidation(plan, roadPoints, ROAD_MAXIMUM_SLOPE);
  return {
    id: `primary-road:${from.id}:${to.id}`,
    fromNodeId: from.id,
    toNodeId: to.id,
    width,
    points: dense.map((point) => asLandUsePoint(plan, point)),
    length: round(length),
    maximumPointSpacing: round(maximumPointSpacing),
    terrain,
    crossings,
    pathSafety: {
      valid:
        unsupportedSampleCount === 0 &&
        terrain.valid &&
        crossings.every((crossing) => crossing.valid),
      unsupportedSampleCount,
    },
    clearsStructures: dense.every((point) => structureClearance(point, width / 2, structures)),
  };
}

function createRoadNetwork(
  plan: WorldPlan,
  scatter: PlannedScatter,
  zones: ReadonlyArray<PlannedDevelopedZone>,
): Readonly<{ network: PlannedPrimaryRoadNetwork; router: Router }> {
  const structures = [...scatter.buildings, ...scatter.landmarks];
  const router = createRouter(plan, structures);
  const nodes = zones.flatMap((zone) => {
    const hamlet = plan.topology.hamlets.find((candidate) => candidate.id === zone.hamletId)!;
    const point = findEntryPoint(plan, hamlet, structures);
    return point
      ? [
          {
            id: `road-node:${hamlet.id}`,
            kind: "hamlet-entry" as const,
            hamletId: hamlet.id,
            position: asLandUsePoint(plan, point),
          },
        ]
      : [];
  });
  const segments: PlannedRoadSegment[] = [];
  const connected = new Set<string>();
  if (nodes[0]) connected.add(nodes[0].id);
  while (connected.size > 0 && connected.size < nodes.length) {
    const candidates = nodes
      .filter((node) => !connected.has(node.id))
      .flatMap((to) =>
        nodes
          .filter((from) => connected.has(from.id))
          .map((from) => ({ from, to, distance: distance(from.position, to.position) })),
      )
      .sort(
        (first, second) =>
          first.distance - second.distance ||
          `${first.from.id}:${first.to.id}`.localeCompare(`${second.from.id}:${second.to.id}`),
      );
    let added = false;
    for (const candidate of candidates) {
      const route = router.route(candidate.from.position, candidate.to.position);
      if (!route) continue;
      const segment = roadSegment(plan, structures, candidate.from, candidate.to, route);
      if (!segment.terrain.valid || !segment.pathSafety.valid || !segment.clearsStructures)
        continue;
      segments.push(segment);
      connected.add(candidate.to.id);
      added = true;
      break;
    }
    if (!added) break;
  }
  const connectedHamletIds = nodes
    .filter((node) => connected.has(node.id))
    .map((node) => node.hamletId)
    .sort();
  return {
    network: {
      id: `primary-road-network:${plan.placementKey}`,
      nodes,
      segments,
      widthRange: { minimum: 4, maximum: 5 },
      connectedHamletIds,
      allHamletsConnected:
        nodes.length === plan.topology.hamlets.length && connected.size === nodes.length,
    },
    router,
  };
}

function landscapeRoles(
  signature: PlannedDevelopedZoneSignature,
): ReadonlyArray<PlannedLandscapeRole> {
  switch (signature) {
    case "civic-square":
      return ["garden", "field", "orchard"];
    case "productive-yard":
      return ["field", "garden", "field", "orchard"];
    case "garden-orchard":
      return ["orchard", "garden", "orchard", "field"];
    case "frontier-enclosure":
      return ["field", "orchard", "field", "garden"];
    case "village-lanes":
      return ["garden", "field", "orchard", "garden"];
  }
}

function createLandscapeCandidate(
  plan: WorldPlan,
  zone: PlannedDevelopedZone,
  role: PlannedLandscapeRole,
  index: number,
  structures: ReadonlyArray<Structure>,
  roads: ReadonlyArray<PlannedRoadSegment>,
  accepted: ReadonlyArray<PlannedLandscapePolygon>,
  context: ReadonlyArray<Readonly<{ id: string; point: FlatPoint }>>,
): PlannedLandscapePolygon | null {
  const key = `${plan.placementKey}:${zone.hamletId}:${role}:${index}`;
  const visibleScale = Math.sqrt(
    Math.max(1, (plan.topology.envelope.width * plan.topology.envelope.depth) / 65_000),
  );
  const landscapeScale = Math.min(1.42, 1 + (visibleScale - 1) * 0.3);
  const radiusX = (8 + stableFraction(`${key}:radius-x`) * 5) * landscapeScale;
  const radiusZ = (6.5 + stableFraction(`${key}:radius-z`) * 4) * landscapeScale;
  const conservativeRadius = Math.max(radiusX, radiusZ);
  const startAngle = stableFraction(`${key}:angle`) * TAU;
  const radialOffsets = [27, 33, 39, 45, 51, 58, 66, 74, 83].map(
    (offset) => offset * Math.min(1.18, 1 + (visibleScale - 1) * 0.1),
  );
  for (const radialOffset of radialOffsets) {
    for (let turn = 0; turn < 48; turn += 1) {
      const angle = startAngle + (turn / 48) * TAU;
      const center = {
        x: round(zone.center.x + Math.cos(angle) * radialOffset),
        z: round(zone.center.z + Math.sin(angle) * radialOffset),
      };
      const polygon = ellipsePolygon(center, radiusX, radiusZ, angle * 0.35, 12, key);
      const clearsStructures = structureClearance(center, conservativeRadius, structures, 1.2);
      const road = roadDistance(center, roads);
      const roadWidth = roads.find((segment) => segment.id === road.segmentId)?.width ?? 0;
      const clearsPrimaryRoad = road.distance >= conservativeRadius + roadWidth / 2 + 1;
      const clearsLandscape = accepted.every(
        (candidate) =>
          distance(center, candidate.center) >=
          conservativeRadius +
            Math.max(...candidate.polygon.map((point) => distance(candidate.center, point))) +
            0.5,
      );
      if (!clearsStructures || !clearsPrimaryRoad || !clearsLandscape) continue;
      if (!terrainValidation(plan, [center], LANDSCAPE_MAXIMUM_SLOPE).valid) continue;
      const quickTerrain = terrainValidation(plan, [center, ...polygon], LANDSCAPE_MAXIMUM_SLOPE);
      if (!quickTerrain.valid) continue;
      const terrain = polygonTerrainValidation(plan, polygon, LANDSCAPE_MAXIMUM_SLOPE);
      if (!terrain.valid) continue;
      return {
        id: `landscape:${zone.hamletId}:${role}:${index}`,
        hamletId: zone.hamletId,
        zoneId: zone.id,
        role,
        polygon,
        center: asLandUsePoint(plan, center),
        area: round(polygonArea(polygon)),
        contextInstanceIds: closestIds(center, context, 4),
        terrain,
        clearsStructures,
        clearsPrimaryRoad,
      };
    }
  }
  return null;
}

function estimateVisibleLandArea(plan: WorldPlan, spacing: number): number {
  const envelope = plan.topology.envelope;
  let area = 0;
  for (let z = envelope.minZ + spacing / 2; z < envelope.maxZ; z += spacing) {
    const row = Math.round((z - (envelope.minZ + spacing / 2)) / spacing);
    const offset = row % 2 === 0 ? 0 : spacing;
    for (let x = envelope.minX + spacing + offset; x < envelope.maxX; x += spacing * 2) {
      if (!canonicalInsideSample(plan, { x, z })) continue;
      if (canonicalWaterSample(plan, { x, z }).signedDistance >= 0) {
        area += spacing * spacing * 2;
      }
    }
  }
  return area;
}

function pointIsDeveloped(
  point: FlatPoint,
  zones: ReadonlyArray<PlannedDevelopedZone>,
  roads: ReadonlyArray<PlannedRoadSegment>,
  landscapes: ReadonlyArray<PlannedLandscapePolygon>,
): boolean {
  if (zones.some((zone) => polygonContains(point, zone.polygon))) return true;
  if (landscapes.some((landscape) => polygonContains(point, landscape.polygon))) return true;
  return roads.some((road) => {
    for (let index = 1; index < road.points.length; index += 1) {
      if (
        distanceToSegment(point, road.points[index - 1]!, road.points[index]!) <=
        road.width / 2
      ) {
        return true;
      }
    }
    return false;
  });
}

function estimateDevelopedArea(
  plan: WorldPlan,
  zones: ReadonlyArray<PlannedDevelopedZone>,
  roads: ReadonlyArray<PlannedRoadSegment>,
  landscapes: ReadonlyArray<PlannedLandscapePolygon>,
  spacing: number,
): number {
  const envelope = plan.topology.envelope;
  let area = 0;
  for (let z = envelope.minZ + spacing / 2; z < envelope.maxZ; z += spacing) {
    const row = Math.round((z - (envelope.minZ + spacing / 2)) / spacing);
    const offset = row % 2 === 0 ? 0 : spacing;
    for (let x = envelope.minX + spacing + offset; x < envelope.maxX; x += spacing * 2) {
      if (
        canonicalInsideSample(plan, { x, z }) &&
        canonicalWaterSample(plan, { x, z }).signedDistance >= 0 &&
        pointIsDeveloped({ x, z }, zones, roads, landscapes)
      ) {
        area += spacing * spacing * 2;
      }
    }
  }
  return area;
}

function developedAreaByLandscapePrefix(
  plan: WorldPlan,
  zones: ReadonlyArray<PlannedDevelopedZone>,
  roads: ReadonlyArray<PlannedRoadSegment>,
  landscapes: ReadonlyArray<PlannedLandscapePolygon>,
  spacing: number,
): ReadonlyArray<number> {
  const envelope = plan.topology.envelope;
  let baseArea = 0;
  const firstLandscapeArea = landscapes.map(() => 0);
  const cellArea = spacing * spacing * 2;
  for (let z = envelope.minZ + spacing / 2; z < envelope.maxZ; z += spacing) {
    const row = Math.round((z - (envelope.minZ + spacing / 2)) / spacing);
    const offset = row % 2 === 0 ? 0 : spacing;
    for (let x = envelope.minX + spacing + offset; x < envelope.maxX; x += spacing * 2) {
      const point = { x, z };
      if (
        !canonicalInsideSample(plan, point) ||
        canonicalWaterSample(plan, point).signedDistance < 0
      ) {
        continue;
      }
      if (pointIsDeveloped(point, zones, roads, [])) {
        baseArea += cellArea;
        continue;
      }
      const landscapeIndex = landscapes.findIndex((landscape) =>
        polygonContains(point, landscape.polygon),
      );
      if (landscapeIndex >= 0) firstLandscapeArea[landscapeIndex]! += cellArea;
    }
  }
  const result = [baseArea];
  for (const addition of firstLandscapeArea) {
    result.push(result[result.length - 1]! + addition);
  }
  return result;
}

function selectLandscapeCoveragePrefix(
  plan: WorldPlan,
  zones: ReadonlyArray<PlannedDevelopedZone>,
  roads: ReadonlyArray<PlannedRoadSegment>,
  landscapes: ReadonlyArray<PlannedLandscapePolygon>,
  visibleLandArea: number,
): ReadonlyArray<PlannedLandscapePolygon> {
  if (landscapes.length === 0 || visibleLandArea <= 0) return landscapes;
  const requiredIndices = [
    ...zones.map((zone) =>
      landscapes.findIndex((landscape) => landscape.hamletId === zone.hamletId),
    ),
    ...(["field", "orchard", "garden"] as const).map((role) =>
      landscapes.findIndex((landscape) => landscape.role === role),
    ),
  ];
  const requiredPrefixLength = requiredIndices.reduce(
    (maximum, index) => (index < 0 ? maximum : Math.max(maximum, index + 1)),
    0,
  );
  const areaByPrefix = developedAreaByLandscapePrefix(
    plan,
    zones,
    roads,
    landscapes,
    COVERAGE_GRID_SPACING,
  );
  const desiredRatio = (COVERAGE_MINIMUM + COVERAGE_MAXIMUM) / 2;
  const candidates = areaByPrefix
    .map((area, count) => ({ count, ratio: area / visibleLandArea }))
    .filter(({ count }) => count >= requiredPrefixLength);
  const feasible = candidates.filter(
    ({ ratio }) => ratio >= COVERAGE_MINIMUM && ratio <= COVERAGE_MAXIMUM,
  );
  const selectionPool = feasible.length > 0 ? feasible : candidates;
  const selected = selectionPool.sort(
    (first, second) =>
      Math.abs(first.ratio - desiredRatio) - Math.abs(second.ratio - desiredRatio) ||
      first.count - second.count,
  )[0];
  return selected ? landscapes.slice(0, selected.count) : landscapes;
}

function createLandscapePolygons(
  plan: WorldPlan,
  scatter: PlannedScatter,
  enrichment: PlannedVisualEnrichment,
  zones: ReadonlyArray<PlannedDevelopedZone>,
  roads: ReadonlyArray<PlannedRoadSegment>,
  visibleLandArea: number,
): ReadonlyArray<PlannedLandscapePolygon> {
  const structures = [...scatter.buildings, ...scatter.landmarks];
  const context = collectContextInstances(scatter, enrichment);
  const accepted: PlannedLandscapePolygon[] = [];
  const zoneArea = zones.reduce((total, zone) => total + polygonArea(zone.polygon), 0);
  const roadArea = roads.reduce((total, segment) => total + segment.length * segment.width, 0);
  const targetLandscapeArea = Math.max(
    0,
    visibleLandArea * ((COVERAGE_MINIMUM + COVERAGE_MAXIMUM) / 2) - zoneArea - roadArea,
  );
  const averageBaseLandscapeArea = 255;
  const targetPerHamlet = Math.ceil(
    targetLandscapeArea / Math.max(1, zones.length * averageBaseLandscapeArea),
  );
  const maximumPerHamlet = Math.min(
    LANDSCAPE_MAXIMUM_PER_HAMLET,
    Math.max(LANDSCAPE_MINIMUM_PER_HAMLET, targetPerHamlet + 2),
  );
  for (let roundIndex = 0; roundIndex < maximumPerHamlet; roundIndex += 1) {
    for (const zone of zones) {
      if (zone.signature === "village-lanes") {
        const hamlet = plan.topology.hamlets.find((candidate) => candidate.id === zone.hamletId);
        if (hamlet?.role === "commons-hamlet" && roundIndex >= 2) continue;
      }
      const roles = landscapeRoles(zone.signature);
      const role = roles[roundIndex % roles.length]!;
      const candidate = createLandscapeCandidate(
        plan,
        zone,
        role,
        roundIndex,
        structures,
        roads,
        accepted,
        context,
      );
      if (candidate) {
        accepted.push(candidate);
      }
    }
    const everyHamletRepresented = zones.every((zone) =>
      accepted.some((landscape) => landscape.hamletId === zone.hamletId),
    );
    const everyRoleRepresented = (["field", "orchard", "garden"] as const).every((role) =>
      accepted.some((landscape) => landscape.role === role),
    );
    const nominalDevelopedArea =
      zoneArea + roadArea + accepted.reduce((total, landscape) => total + landscape.area, 0);
    if (
      everyHamletRepresented &&
      everyRoleRepresented &&
      nominalDevelopedArea >= visibleLandArea * 0.16
    ) {
      break;
    }
  }
  return selectLandscapeCoveragePrefix(plan, zones, roads, accepted, visibleLandArea);
}

function createWaterView(
  plan: WorldPlan,
  scatter: PlannedScatter,
  network: PlannedPrimaryRoadNetwork,
  router: Router,
): Readonly<{
  node: PlannedRoadNode;
  segment: PlannedRoadSegment;
  zoneId: string;
} | null> {
  const structures = [...scatter.buildings, ...scatter.landmarks];
  const lake = getPlannedTerrainDefinition(plan).water.lake;
  const candidates: Array<Readonly<{ point: FlatPoint; shoreDistance: number; score: number }>> =
    [];
  for (const [index, perimeter] of lake.perimeter.entries()) {
    const deltaX = perimeter.x - lake.center.x;
    const deltaZ = perimeter.z - lake.center.z;
    const length = Math.max(0.001, Math.hypot(deltaX, deltaZ));
    for (const offset of [7, 9, 12, 15]) {
      const point = {
        x: round(perimeter.x + (deltaX / length) * offset),
        z: round(perimeter.z + (deltaZ / length) * offset),
      };
      const water = queryPlannedWaterDistance(plan, point.x, point.z);
      if (
        !terrainValidation(plan, [point], LANDSCAPE_MAXIMUM_SLOPE, 1.25).valid ||
        !structureClearance(point, 1.25, structures) ||
        water.signedDistance < 4 ||
        water.signedDistance > 18
      ) {
        continue;
      }
      candidates.push({
        point,
        shoreDistance: water.shoreDistance,
        score:
          Math.min(...network.nodes.map((node) => distance(point, node.position))) +
          Math.abs(water.signedDistance - 8) * 0.5 +
          stableFraction(`${plan.placementKey}:water-view:${index}:${offset}`),
      });
    }
  }
  candidates.sort((first, second) => first.score - second.score);
  for (const candidate of candidates.slice(0, 24)) {
    const from = [...network.nodes].sort(
      (first, second) =>
        distance(candidate.point, first.position) - distance(candidate.point, second.position),
    )[0];
    if (!from) continue;
    const route = router.route(from.position, candidate.point);
    if (!route) continue;
    const node: PlannedRoadNode = {
      id: `road-node:water-view:${from.hamletId}`,
      kind: "water-view",
      hamletId: from.hamletId,
      position: asLandUsePoint(plan, candidate.point),
    };
    const segment = roadSegment(plan, structures, from, node, route);
    if (!segment.terrain.valid || !segment.pathSafety.valid || !segment.clearsStructures) continue;
    return {
      node,
      segment,
      zoneId: `developed-zone:${from.hamletId}`,
    };
  }
  return null;
}

function anchorRole(signature: PlannedDevelopedZoneSignature): PlannedLandUseAnchor["role"] {
  switch (signature) {
    case "civic-square":
      return "notice-board";
    case "productive-yard":
      return "supply-stack";
    case "garden-orchard":
      return "orchard-marker";
    case "frontier-enclosure":
      return "watch-fire";
    case "village-lanes":
      return "wayfinding-post";
  }
}

function findWalkDetailPoint(
  plan: WorldPlan,
  node: PlannedRoadNode,
  structures: ReadonlyArray<Structure>,
  key: string,
): FlatPoint | null {
  const startAngle = stableFraction(key) * TAU;
  for (const radius of [3.5, 4.5, 5.5, 6.5]) {
    for (let index = 0; index < 32; index += 1) {
      const angle = startAngle + (index / 32) * TAU;
      const point = {
        x: round(node.position.x + Math.cos(angle) * radius),
        z: round(node.position.z + Math.sin(angle) * radius),
      };
      if (
        terrainValidation(plan, [point], LANDSCAPE_MAXIMUM_SLOPE, 1.1).valid &&
        structureClearance(point, 1.1, structures)
      ) {
        return point;
      }
    }
  }
  return null;
}

function createAnchors(
  plan: WorldPlan,
  scatter: PlannedScatter,
  zones: ReadonlyArray<PlannedDevelopedZone>,
  network: PlannedPrimaryRoadNetwork,
  landscapes: ReadonlyArray<PlannedLandscapePolygon>,
  waterView: ReturnType<typeof createWaterView>,
): ReadonlyArray<PlannedLandUseAnchor> {
  const structures = [...scatter.buildings, ...scatter.landmarks];
  const result: PlannedLandUseAnchor[] = [];
  for (const zone of zones) {
    const node = network.nodes.find(
      (candidate) => candidate.kind === "hamlet-entry" && candidate.hamletId === zone.hamletId,
    );
    if (!node) continue;
    const road = network.segments.find(
      (segment) => segment.fromNodeId === node.id || segment.toNodeId === node.id,
    );
    result.push({
      id: `land-use-anchor:${zone.hamletId}:walk-entry`,
      zoneId: zone.id,
      hamletId: zone.hamletId,
      kind: "walk-entry",
      role: "settlement-threshold",
      position: node.position,
      facingRadians: round(
        Math.atan2(zone.center.z - node.position.z, zone.center.x - node.position.x),
      ),
      clearanceRadius: 1,
      walkAdjacent: true,
      waterView: false,
      roadSegmentId: road?.id ?? null,
      sourceInstanceIds: zone.structureIds,
      terrain: terrainValidation(plan, [node.position], LANDSCAPE_MAXIMUM_SLOPE, 1),
      clearsStructures: structureClearance(node.position, 1, structures),
    });
    const detailPoint = findWalkDetailPoint(
      plan,
      node,
      structures,
      `${plan.placementKey}:${zone.hamletId}:walk-detail`,
    );
    if (detailPoint) {
      const nearestRoad = roadDistance(detailPoint, network.segments);
      result.push({
        id: `land-use-anchor:${zone.hamletId}:signature-prop`,
        zoneId: zone.id,
        hamletId: zone.hamletId,
        kind: "prop",
        role: anchorRole(zone.signature),
        position: asLandUsePoint(plan, detailPoint),
        facingRadians: round(
          Math.atan2(node.position.z - detailPoint.z, node.position.x - detailPoint.x),
        ),
        clearanceRadius: 1.1,
        walkAdjacent: nearestRoad.distance <= 7,
        waterView: false,
        roadSegmentId: nearestRoad.segmentId,
        sourceInstanceIds: zone.contextInstanceIds.slice(0, 3),
        terrain: terrainValidation(plan, [detailPoint], LANDSCAPE_MAXIMUM_SLOPE, 1.1),
        clearsStructures: structureClearance(detailPoint, 1.1, structures),
      });
    }
    const habitat = landscapes.find((landscape) => landscape.hamletId === zone.hamletId);
    if (habitat) {
      const nearestRoad = roadDistance(habitat.center, network.segments);
      result.push({
        id: `land-use-anchor:${zone.hamletId}:habitat`,
        zoneId: zone.id,
        hamletId: zone.hamletId,
        kind: "habitat",
        role: habitat.role === "orchard" ? "orchard-habitat" : "field-habitat",
        position: habitat.center,
        facingRadians: round(stableFraction(`${habitat.id}:facing`) * TAU),
        clearanceRadius: 1.25,
        walkAdjacent: nearestRoad.distance <= 12,
        waterView: false,
        roadSegmentId: nearestRoad.distance <= 12 ? nearestRoad.segmentId : null,
        sourceInstanceIds: habitat.contextInstanceIds,
        terrain: terrainValidation(plan, [habitat.center], LANDSCAPE_MAXIMUM_SLOPE, 1.25),
        clearsStructures: structureClearance(habitat.center, 1.25, structures),
      });
    }
  }
  if (waterView) {
    const target = getPlannedTerrainDefinition(plan).water.lake.center;
    const point = waterView.node.position;
    result.push({
      id: `land-use-anchor:${waterView.node.hamletId}:water-view`,
      zoneId: waterView.zoneId,
      hamletId: waterView.node.hamletId,
      kind: "poi",
      role: "waterside-overlook",
      position: point,
      facingRadians: round(Math.atan2(target.z - point.z, target.x - point.x)),
      clearanceRadius: 1.25,
      walkAdjacent: true,
      waterView: true,
      roadSegmentId: waterView.segment.id,
      sourceInstanceIds: [],
      terrain: terrainValidation(plan, [point], LANDSCAPE_MAXIMUM_SLOPE, 1.25),
      clearsStructures: structureClearance(point, 1.25, structures),
    });
  }
  return result;
}

function coverageReport(
  plan: WorldPlan,
  zones: ReadonlyArray<PlannedDevelopedZone>,
  roads: ReadonlyArray<PlannedRoadSegment>,
  landscapes: ReadonlyArray<PlannedLandscapePolygon>,
  visibleLandArea: number,
): PlannedDevelopedCoverage {
  const developedArea = estimateDevelopedArea(
    plan,
    zones,
    roads,
    landscapes,
    COVERAGE_GRID_SPACING,
  );
  const developedRatio = visibleLandArea === 0 ? 0 : developedArea / visibleLandArea;
  const targetMinimumArea = visibleLandArea * COVERAGE_MINIMUM;
  const targetMaximumArea = visibleLandArea * COVERAGE_MAXIMUM;
  const infeasibilityCodes: PlannedDevelopedCoverage["infeasibilityCodes"][number][] = [];
  if (developedRatio < COVERAGE_MINIMUM) {
    infeasibilityCodes.push("DEVELOPED_COVERAGE_BELOW_TARGET");
  }
  if (developedRatio > COVERAGE_MAXIMUM) {
    infeasibilityCodes.push("DEVELOPED_COVERAGE_ABOVE_TARGET");
  }
  return {
    target: { minimumRatio: 0.12, maximumRatio: 0.18 },
    status: infeasibilityCodes.length === 0 ? "met" : "infeasible",
    visibleLandArea: round(visibleLandArea),
    developedArea: round(developedArea),
    developedRatio: round(developedRatio),
    targetMinimumArea: round(targetMinimumArea),
    targetMaximumArea: round(targetMaximumArea),
    shortfallArea: round(Math.max(0, targetMinimumArea - developedArea)),
    excessArea: round(Math.max(0, developedArea - targetMaximumArea)),
    sampleSpacing: COVERAGE_GRID_SPACING,
    infeasibilityCodes,
  };
}

function budgetReport(
  plan: WorldPlan,
  scatter: PlannedScatter,
  enrichment: PlannedVisualEnrichment,
  anchors: ReadonlyArray<PlannedLandUseAnchor>,
): PlannedLandUseBudget {
  const occupiedSurfaceInstances =
    scatter.ambientDetails.length +
    scatter.groundCoverClusters.reduce((total, cluster) => total + cluster.members.length, 0) +
    enrichment.cliffFormations.length +
    enrichment.shoreDetails.length +
    enrichment.meadowDetails.length;
  const availableSurfaceInstances = Math.max(
    0,
    plan.topology.visualBudgets.maxSurfaceScatter - occupiedSurfaceInstances,
  );
  return {
    maxSurfaceScatter: plan.topology.visualBudgets.maxSurfaceScatter,
    occupiedSurfaceInstances,
    availableSurfaceInstances,
    reservedAnchorInstances: anchors.length,
    withinBudget: anchors.length <= availableSurfaceInstances,
  };
}

function validationReport(
  plan: WorldPlan,
  zones: ReadonlyArray<PlannedDevelopedZone>,
  network: PlannedPrimaryRoadNetwork,
  landscapes: ReadonlyArray<PlannedLandscapePolygon>,
  anchors: ReadonlyArray<PlannedLandUseAnchor>,
  budget: PlannedLandUseBudget,
  coverage: PlannedDevelopedCoverage,
): PlannedLandUseValidation {
  const distinctSignatureCount = new Set(zones.map((zone) => zone.signature)).size;
  const requiredDistinctSignatureCount = Math.min(4, plan.topology.hamlets.length);
  const findings: string[] = [];
  if (zones.length !== plan.topology.hamlets.length) findings.push("HAMLET_ZONE_MISSING");
  if (!network.allHamletsConnected) findings.push("HAMLET_NETWORK_DISCONNECTED");
  if (
    network.segments.some(
      (road) => !road.terrain.valid || !road.pathSafety.valid || !road.clearsStructures,
    )
  ) {
    findings.push("PRIMARY_ROAD_UNSAFE");
  }
  if (
    landscapes.some(
      (landscape) =>
        !landscape.terrain.valid || !landscape.clearsStructures || !landscape.clearsPrimaryRoad,
    )
  ) {
    findings.push("LANDSCAPE_POLYGON_UNSAFE");
  }
  if (anchors.some((anchor) => !anchor.terrain.valid || !anchor.clearsStructures)) {
    findings.push("LAND_USE_ANCHOR_UNSAFE");
  }
  if (distinctSignatureCount < requiredDistinctSignatureCount) {
    findings.push("REGIONAL_SIGNATURES_TOO_SIMILAR");
  }
  if (
    plan.topology.hamlets.some(
      (hamlet) =>
        !anchors.some(
          (anchor) =>
            anchor.hamletId === hamlet.id && anchor.kind === "prop" && anchor.walkAdjacent,
        ),
    )
  ) {
    findings.push("WALK_DETAIL_MISSING");
  }
  if (!anchors.some((anchor) => anchor.waterView && anchor.walkAdjacent)) {
    findings.push("WATER_VIEW_POI_MISSING");
  }
  if (!budget.withinBudget) findings.push("SURFACE_INSTANCE_BUDGET_EXCEEDED");
  if (coverage.status === "infeasible") findings.push(...coverage.infeasibilityCodes);
  return {
    allHamletsHaveZones: zones.length === plan.topology.hamlets.length,
    allHamletsNetworkConnected: network.allHamletsConnected,
    allRoadsTerrainSafe: network.segments.every(
      (road) => road.terrain.valid && road.pathSafety.valid,
    ),
    allLandscapeTerrainSafe: landscapes.every((landscape) => landscape.terrain.valid),
    allAnchorsTerrainSafe: anchors.every((anchor) => anchor.terrain.valid),
    allRenderableItemsClearStructures:
      network.segments.every((road) => road.clearsStructures) &&
      landscapes.every((landscape) => landscape.clearsStructures && landscape.clearsPrimaryRoad) &&
      anchors.every((anchor) => anchor.clearsStructures),
    distinctSignatureCount,
    requiredDistinctSignatureCount,
    hasWalkAdjacentDetailPerHamlet: plan.topology.hamlets.every((hamlet) =>
      anchors.some(
        (anchor) => anchor.hamletId === hamlet.id && anchor.kind === "prop" && anchor.walkAdjacent,
      ),
    ),
    hasWaterViewPoi: anchors.some((anchor) => anchor.waterView && anchor.walkAdjacent),
    findings,
  };
}

/**
 * Creates the season-invariant land-use layer shared by Orbit and Walk. The
 * result is pure metadata: consumers render the same semantic zones, routes,
 * polygons, and instance anchors without re-planning repository geography.
 */
export function createPlannedLandUse(
  plan: WorldPlan,
  scatter: PlannedScatter,
  enrichment: PlannedVisualEnrichment,
): PlannedLandUse {
  const cacheKey = landUseCacheKey(plan);
  const cached = landUseCacheByPlacementKey.get(cacheKey);
  if (cached) return cached;
  activePlanningCaches = {
    terrain: new Map(),
    inside: new Map(),
    water: new Map(),
  };
  try {
    const zones = createZones(plan, scatter, enrichment);
    const roadResult = createRoadNetwork(plan, scatter, zones);
    const waterView = createWaterView(plan, scatter, roadResult.network, roadResult.router);
    const primaryRoad: PlannedPrimaryRoadNetwork = waterView
      ? {
          ...roadResult.network,
          nodes: [...roadResult.network.nodes, waterView.node],
          segments: [...roadResult.network.segments, waterView.segment],
        }
      : roadResult.network;
    const visibleLandArea = estimateVisibleLandArea(plan, COVERAGE_GRID_SPACING);
    const landscapePolygons = createLandscapePolygons(
      plan,
      scatter,
      enrichment,
      zones,
      primaryRoad.segments,
      visibleLandArea,
    );
    const anchors = createAnchors(plan, scatter, zones, primaryRoad, landscapePolygons, waterView);
    const coverage = coverageReport(
      plan,
      zones,
      primaryRoad.segments,
      landscapePolygons,
      visibleLandArea,
    );
    const budget = budgetReport(plan, scatter, enrichment, anchors);
    const result: PlannedLandUse = {
      schema: PLANNED_LAND_USE_SCHEMA,
      key: `${PLANNED_LAND_USE_SCHEMA}:${cacheKey}`,
      topologyKey: plan.topologyKey,
      placementKey: plan.placementKey,
      zones,
      primaryRoad,
      landscapePolygons,
      anchors,
      coverage,
      budget,
      validation: validationReport(
        plan,
        zones,
        primaryRoad,
        landscapePolygons,
        anchors,
        budget,
        coverage,
      ),
    };
    if (landUseCacheByPlacementKey.size >= MAX_LAND_USE_CACHE_ENTRIES) {
      const oldestKey = landUseCacheByPlacementKey.keys().next().value;
      if (oldestKey !== undefined) landUseCacheByPlacementKey.delete(oldestKey);
    }
    landUseCacheByPlacementKey.set(cacheKey, result);
    return result;
  } finally {
    // Canonical query caches are build-scoped and never retained with the
    // result cache. A vast world can visit thousands of sub-grid samples.
    activePlanningCaches = null;
  }
}
