import { stableFraction } from "@/lib/kingdom/hash";
import type { WorldPlan } from "@/lib/kingdom/world-plan";

import {
  createWalkNavigationGrid,
  type WalkNavigationGrid,
  type WalkObstacle,
} from "./kingdom-navigation-model";
import {
  createWalkSettlementPaths,
  findLivingWalkSpawn,
  walkDistanceToSettlementPath,
  type LivingWalkSpawn,
  type WalkSpawnStructure,
  type WalkSpawnTarget,
} from "./kingdom-walk-experience-model";
import type { PlannedLandUse } from "./planned-land-use";
import {
  classifyPlannedTerrainRegion,
  isInsidePlannedTerrain,
  queryPlannedWaterDistance,
} from "./planned-terrain-model";

export type PlannedWalkDetailKind = "grass" | "flower" | "reed" | "stone";

export type PlannedWalkDetailInstance = Readonly<{
  id: string;
  kind: PlannedWalkDetailKind;
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
  colorVariant: number;
}>;

export type PlannedWalkDetailPlan = Readonly<{
  schema: "repo-walk-detail/v1";
  key: string;
  spawn: Readonly<{ x: number; y: number; z: number }>;
  waterFocus: Readonly<{ x: number; z: number }> | null;
  instances: ReadonlyArray<PlannedWalkDetailInstance>;
  counts: Readonly<Record<PlannedWalkDetailKind, number>>;
}>;

type Candidate = Readonly<{ x: number; z: number; order: number; priority: number }>;

export type PlannedWalkDetailRuntime = Readonly<{
  navigationGrid: WalkNavigationGrid;
  livingSpawn: LivingWalkSpawn | null;
}>;

const TARGET_COUNTS: Readonly<Record<PlannedWalkDetailKind, number>> = {
  grass: 1_600,
  flower: 180,
  reed: 260,
  stone: 140,
};

const MIN_SPACING: Readonly<Record<PlannedWalkDetailKind, number>> = {
  grass: 0.72,
  flower: 1.65,
  reed: 0.86,
  stone: 2.25,
};

function ellipseCandidates(
  key: string,
  centerX: number,
  centerZ: number,
  radiusX: number,
  radiusZ: number,
  columns: number,
  rows: number,
  orderOffset: number,
  priority: number,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const id = `${key}:${row}:${column}`;
      const normalizedX = ((column + 0.5) / columns) * 2 - 1;
      const normalizedZ = ((row + 0.5) / rows) * 2 - 1;
      const jitterX = (stableFraction(`${id}:jitter-x`) - 0.5) * (2 / columns);
      const jitterZ = (stableFraction(`${id}:jitter-z`) - 0.5) * (2 / rows);
      const xUnit = normalizedX + jitterX;
      const zUnit = normalizedZ + jitterZ;
      if (xUnit * xUnit + zUnit * zUnit > 1) continue;
      candidates.push({
        x: centerX + xUnit * radiusX,
        z: centerZ + zUnit * radiusZ,
        order: orderOffset + row * columns + column,
        priority,
      });
    }
  }
  return candidates;
}

function obstacleClear(
  obstacles: ReadonlyArray<WalkObstacle>,
  x: number,
  z: number,
  clearance: number,
): boolean {
  return obstacles.every(
    (obstacle) => Math.hypot(x - obstacle.x, z - obstacle.z) >= obstacle.radius + clearance,
  );
}

function separated(
  accepted: ReadonlyArray<PlannedWalkDetailInstance>,
  kind: PlannedWalkDetailKind,
  x: number,
  z: number,
): boolean {
  const spacing = MIN_SPACING[kind];
  return accepted.every(
    (instance) => instance.kind !== kind || Math.hypot(instance.x - x, instance.z - z) >= spacing,
  );
}

function chooseKind(
  material: ReturnType<typeof classifyPlannedTerrainRegion>["material"],
  slopeDegrees: number,
  waterDistance: number,
  pathDistance: number,
  selector: number,
): PlannedWalkDetailKind | null {
  if (waterDistance >= 0.45 && waterDistance <= 4.6 && slopeDegrees <= 18) {
    return selector > 0.42 ? "reed" : "stone";
  }
  if (material === "shore" && waterDistance <= 8 && slopeDegrees <= 24) {
    return selector > 0.58 ? "stone" : "grass";
  }
  if (material === "cliff-stone" || material === "scree") {
    return slopeDegrees <= 30 && selector > 0.7 ? "stone" : null;
  }
  if (material !== "low-meadow" && material !== "high-meadow" && material !== "settlement-soil") {
    return null;
  }
  if (slopeDegrees > 27 || pathDistance < 1.35) return null;
  if (pathDistance <= 10 && selector > 0.82) return "flower";
  return "grass";
}

/**
 * Builds a dense but bounded close-range detail field around the canonical Walk
 * entry, its settlement route, and the visible-water focus. It never changes
 * topology or collision; every transform is derived from the same immutable
 * plan and exact terrain queries as navigation.
 */
export function createPlannedWalkDetailPlan(
  plan: WorldPlan,
  landUse: PlannedLandUse,
  obstacles: ReadonlyArray<WalkObstacle>,
  structures: ReadonlyArray<WalkSpawnStructure>,
  targets: ReadonlyArray<WalkSpawnTarget>,
  runtime?: PlannedWalkDetailRuntime,
): PlannedWalkDetailPlan {
  const navigationGrid =
    runtime?.navigationGrid ?? createWalkNavigationGrid(plan, obstacles, landUse);
  const livingSpawn = runtime
    ? runtime.livingSpawn
    : findLivingWalkSpawn(plan, obstacles, structures, targets, landUse, navigationGrid);
  const fallback = plan.topology.hamlets[0]?.mask.center ?? plan.topology.envelope.center;
  const spawn = livingSpawn?.position ?? {
    x: fallback.x,
    y: classifyPlannedTerrainRegion(plan, fallback.x, fallback.z).height + 2.35,
    z: fallback.z,
  };
  const waterFocus = livingSpawn?.waterFocus ?? null;
  const structure = structures.find((candidate) => candidate.id === livingSpawn?.structureId);
  const focusX = structure ? (spawn.x + structure.x) * 0.5 : spawn.x;
  const focusZ = structure ? (spawn.z + structure.z) * 0.5 : spawn.z;
  const key = `${plan.placementKey}:walk-detail`;
  const candidates = ellipseCandidates(key, focusX, focusZ, 50, 44, 48, 42, 0, 0);
  if (waterFocus) {
    candidates.push(
      ...ellipseCandidates(`${key}:water`, waterFocus.x, waterFocus.z, 24, 20, 28, 24, 10_000, 0),
    );
  }
  for (
    let segmentIndex = 0;
    segmentIndex < landUse.primaryRoad.segments.length;
    segmentIndex += 1
  ) {
    const segment = landUse.primaryRoad.segments[segmentIndex]!;
    const sampleCount = Math.min(4, Math.max(2, Math.ceil(segment.points.length / 8)));
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const pointIndex = Math.round(
        (sampleIndex / Math.max(1, sampleCount - 1)) * (segment.points.length - 1),
      );
      const point = segment.points[pointIndex];
      if (!point) continue;
      candidates.push(
        ...ellipseCandidates(
          `${key}:road:${segment.id}:${sampleIndex}`,
          point.x,
          point.z,
          21,
          16,
          20,
          16,
          20_000 + segmentIndex * 10_000 + sampleIndex * 500,
          1,
        ),
      );
    }
  }
  candidates.sort(
    (first, second) =>
      first.priority - second.priority ||
      stableFraction(`${key}:${first.priority}:${first.order}:order`) -
        stableFraction(`${key}:${second.priority}:${second.order}:order`) ||
      first.order - second.order,
  );

  const paths = createWalkSettlementPaths(landUse);
  const counts: Record<PlannedWalkDetailKind, number> = {
    grass: 0,
    flower: 0,
    reed: 0,
    stone: 0,
  };
  const instances: PlannedWalkDetailInstance[] = [];
  for (const candidate of candidates) {
    if (
      counts.grass >= TARGET_COUNTS.grass &&
      counts.flower >= TARGET_COUNTS.flower &&
      counts.reed >= TARGET_COUNTS.reed &&
      counts.stone >= TARGET_COUNTS.stone
    ) {
      break;
    }
    if (!isInsidePlannedTerrain(plan, candidate.x, candidate.z)) continue;
    const region = classifyPlannedTerrainRegion(plan, candidate.x, candidate.z);
    if (!region.inside || region.water !== null) continue;
    const waterDistance = queryPlannedWaterDistance(plan, candidate.x, candidate.z).signedDistance;
    const pathDistance = walkDistanceToSettlementPath(paths, candidate.x, candidate.z);
    const selector = stableFraction(`${key}:${candidate.order}:kind`);
    const kind = chooseKind(
      region.material,
      region.slopeDegrees,
      waterDistance,
      pathDistance,
      selector,
    );
    if (!kind || counts[kind] >= TARGET_COUNTS[kind]) continue;
    const clearance = kind === "stone" ? 0.85 : kind === "reed" ? 0.48 : 0.42;
    if (!obstacleClear(obstacles, candidate.x, candidate.z, clearance)) continue;
    if (!separated(instances, kind, candidate.x, candidate.z)) continue;
    const index = counts[kind];
    instances.push({
      id: `${kind}:${candidate.order}`,
      kind,
      x: candidate.x,
      y: region.height + (kind === "stone" ? 0.08 : 0.015),
      z: candidate.z,
      rotation: stableFraction(`${key}:${candidate.order}:rotation`) * Math.PI * 2,
      scale:
        (kind === "grass" ? 0.78 : kind === "flower" ? 0.66 : kind === "reed" ? 0.9 : 0.48) *
        (0.72 + stableFraction(`${key}:${candidate.order}:scale`) * 0.56),
      colorVariant: Math.min(2, Math.floor(stableFraction(`${key}:${candidate.order}:color`) * 3)),
    });
    counts[kind] = index + 1;
  }

  return {
    schema: "repo-walk-detail/v1",
    key,
    spawn,
    waterFocus,
    instances,
    counts,
  };
}
