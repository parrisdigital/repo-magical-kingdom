import type { KingdomWorld, Selection } from "@/lib/kingdom/types";
import type { WorldPlan, WorldPlanPoint } from "@/lib/kingdom/world-plan";

import {
  getHamletVisualPlacementMask,
  getPlannedTerrainDefinition,
  queryPlannedWaterDistance,
  samplePlannedTerrainHeight,
  samplePlannedWatershedPoint,
  samplePlannedWaterSurface,
} from "./planned-terrain-model";
import {
  findWalkSpawn,
  isWalkPositionAllowed,
  sampleWalkNavigationHeight,
  walkNavigationGridAllows,
  WALK_EYE_HEIGHT,
  type WalkNavigationGrid,
  type WalkObstacle,
  type WalkPosition,
} from "./kingdom-navigation-model";
import type { PlannedScatter } from "./planned-scatter";
import type { PlannedLandUse } from "./planned-land-use";

export type WalkTargetKind = "building" | "landmark" | "animal";

export type WalkTargetRuntimePosition = {
  x: number;
  y: number;
  z: number;
};

export type WalkTargetPositionUpdater = (x: number, y: number, z: number) => void;

export type WalkTarget = Readonly<{
  id: string;
  label: string;
  detail: string;
  kind: WalkTargetKind;
  x: number;
  y: number;
  z: number;
  /** Mutable render-loop position for a moving animal; static instances omit it. */
  runtimePosition?: WalkTargetRuntimePosition;
  selection: NonNullable<Selection>;
}>;

/** Minimal structured-clone-safe target data required by Walk spawn ranking. */
export type WalkSpawnTarget = Pick<WalkTarget, "id" | "x" | "y" | "z">;

export type WalkSpawnStructure = Readonly<{
  id: string;
  hamletId: string | null;
  x: number;
  y: number;
  z: number;
  radius: number;
  targetId: string;
}>;

export type WalkSettlementPath = Readonly<{
  id: string;
  from: WorldPlanPoint;
  to: WorldPlanPoint;
}>;

export type WalkLocationRegion = Readonly<{
  id: string;
  label: string;
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  rotation: number;
}>;

export type LivingWalkSpawn = Readonly<{
  position: WalkPosition;
  lookTarget: Readonly<{ x: number; y: number; z: number }>;
  waterFocus: WorldPlanPoint | null;
  yawRadians: number;
  locationLabel: string;
  targetId: string;
  structureId: string;
  structureDistance: number;
  pathDistance: number;
  waterDistance: number;
  waterInView: boolean;
  quality: "path-water" | "path" | "fallback";
}>;

export type WalkTargetPrompt = Readonly<{
  id: string;
  label: string;
  detail: string;
  kind: WalkTargetKind;
  distance: number;
}>;

export type WalkCompassHeading = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export type WalkViewStatus = Readonly<{
  heading: WalkCompassHeading;
  locationLabel: string;
  target: WalkTargetPrompt | null;
}>;

export type RepositoryWalkInteraction = Readonly<{
  structures: ReadonlyArray<WalkSpawnStructure>;
  targets: ReadonlyArray<WalkTarget>;
  animalTargetPositions: ReadonlyMap<string, WalkTargetRuntimePosition>;
  animalTargetUpdaters: ReadonlyMap<string, WalkTargetPositionUpdater>;
}>;

export const WALK_ANIMAL_TARGET_HEIGHT = Object.freeze({
  deer: 2.2,
  fox: 1.15,
  stag: 2.65,
});

export const WALK_WILDLIFE_GROUND_OFFSET = 0.06;

const TARGET_DISTANCE_LIMIT = 30;
const TARGET_ANGLE_LIMIT_DEGREES = 8;
const MIN_STRUCTURE_SPAWN_DISTANCE = 8;
const MAX_STRUCTURE_SPAWN_DISTANCE = 22;
const MAX_PATH_SPAWN_DISTANCE = 18;
const MIN_PREFERRED_WATER_DISTANCE = 15;
const MAX_PREFERRED_WATER_DISTANCE = 55;
const WATER_VIEW_ANGLE_DEGREES = 40;
const WATER_SIGHTLINE_TARGET_HEIGHT = 0.12;
const MIN_WATER_SIGHTLINE_CLEARANCE = 0.05;
const MAX_WATER_SIGHTLINE_SCORE_REWARD = 8;
const TAU = Math.PI * 2;
const COMPASS_HEADINGS: ReadonlyArray<WalkCompassHeading> = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
];

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function titleCaseRole(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

/**
 * Builds the shared repository-instance boundary consumed by Walk. Structures
 * retain their exact entity/province selection, while animals truthfully map
 * to the nearest authored semantic habitat and share a mutable render-loop
 * position with the visible actor.
 */
export function createRepositoryWalkInteraction(
  world: KingdomWorld,
  plan: WorldPlan,
  scatter: PlannedScatter,
): RepositoryWalkInteraction {
  const entities = new Map(world.entities.map((entity) => [entity.id, entity]));
  const provinces = new Map(world.provinces.map((province) => [province.id, province]));
  const targets: WalkTarget[] = [];
  const structures: WalkSpawnStructure[] = [];

  for (const structure of [...scatter.buildings, ...scatter.landmarks]) {
    const entity = structure.entityId ? entities.get(structure.entityId) : undefined;
    const province = provinces.get(structure.provinceId);
    const selection: NonNullable<Selection> | null = entity
      ? { kind: "entity", entity }
      : province
        ? { kind: "province", province }
        : null;
    if (!selection) continue;
    const x = structure.transform.position.x;
    const z = structure.transform.position.z;
    const targetId = `structure:${structure.id}`;
    const isLandmark = structure.id.startsWith("landmark-");
    targets.push({
      id: targetId,
      label: entity?.path ?? province?.label ?? titleCaseRole(structure.assetRole),
      detail: entity
        ? `${entity.aggregate ? "Aggregated file group" : "Repository file"} · ${titleCaseRole(structure.assetRole)}`
        : `${titleCaseRole(structure.assetRole)} · repository province`,
      kind: isLandmark ? "landmark" : "building",
      x,
      y: samplePlannedTerrainHeight(plan, x, z) + 2.35,
      z,
      selection,
    });
    structures.push({
      id: structure.id,
      hamletId: structure.hamletId,
      x,
      y: structure.transform.position.y,
      z,
      radius: structure.footprintRadius,
      targetId,
    });
  }

  const animalTargetPositions = new Map<string, WalkTargetRuntimePosition>();
  const animalTargetUpdaters = new Map<string, WalkTargetPositionUpdater>();
  for (const animal of scatter.wildlife) {
    const x = animal.transform.position.x;
    const z = animal.transform.position.z;
    let semanticZone = plan.topology.semanticZones[0];
    let semanticDistance = Number.POSITIVE_INFINITY;
    for (const candidate of plan.topology.semanticZones) {
      const distance = Math.hypot(candidate.hitMask.center.x - x, candidate.hitMask.center.z - z);
      if (
        distance < semanticDistance - 0.000_001 ||
        (Math.abs(distance - semanticDistance) <= 0.000_001 &&
          candidate.id.localeCompare(semanticZone?.id ?? "") < 0)
      ) {
        semanticZone = candidate;
        semanticDistance = distance;
      }
    }
    const province = semanticZone ? provinces.get(semanticZone.provinceId) : undefined;
    if (!province) continue;
    const runtimePosition: WalkTargetRuntimePosition = {
      x,
      y:
        samplePlannedTerrainHeight(plan, x, z) +
        WALK_WILDLIFE_GROUND_OFFSET +
        WALK_ANIMAL_TARGET_HEIGHT[animal.assetRole] * animal.transform.scale.y * 0.58,
      z,
    };
    animalTargetPositions.set(animal.id, runtimePosition);
    animalTargetUpdaters.set(animal.id, (nextX, nextY, nextZ) => {
      runtimePosition.x = nextX;
      runtimePosition.y = nextY;
      runtimePosition.z = nextZ;
    });
    targets.push({
      id: `animal:${animal.id}`,
      label: `${titleCaseRole(animal.behavior)} ${titleCaseRole(animal.assetRole)}`,
      detail: `${province.label} habitat · living repository ecology`,
      kind: "animal",
      x: runtimePosition.x,
      y: runtimePosition.y,
      z: runtimePosition.z,
      runtimePosition,
      selection: { kind: "province", province },
    });
  }

  return { structures, targets, animalTargetPositions, animalTargetUpdaters };
}

function closestPointOnSegment(
  subject: WorldPlanPoint,
  from: WorldPlanPoint,
  to: WorldPlanPoint,
): Readonly<{ x: number; z: number; distance: number }> {
  const deltaX = to.x - from.x;
  const deltaZ = to.z - from.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const progress =
    lengthSquared <= 0.000_001
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((subject.x - from.x) * deltaX + (subject.z - from.z) * deltaZ) / lengthSquared,
          ),
        );
  const x = from.x + deltaX * progress;
  const z = from.z + deltaZ * progress;
  return { x, z, distance: Math.hypot(subject.x - x, subject.z - z) };
}

export function createWalkSettlementPaths(
  landUse: PlannedLandUse,
): ReadonlyArray<WalkSettlementPath> {
  return [...landUse.primaryRoad.segments]
    .sort((first, second) => first.id.localeCompare(second.id))
    .flatMap((segment) =>
      segment.points.slice(1).map((point, edgeIndex) => ({
        id: `${segment.id}:edge:${edgeIndex}`,
        from: {
          x: segment.points[edgeIndex]!.x,
          z: segment.points[edgeIndex]!.z,
        },
        to: { x: point.x, z: point.z },
      })),
    );
}

export function createWalkLocationRegions(plan: WorldPlan): ReadonlyArray<WalkLocationRegion> {
  return plan.topology.hamlets.map((hamlet) => {
    const mask = getHamletVisualPlacementMask(plan, hamlet);
    return {
      id: hamlet.id,
      label: hamlet.label,
      x: mask.center.x,
      z: mask.center.z,
      radiusX: mask.radiusX,
      radiusZ: mask.radiusZ,
      rotation: mask.rotation,
    };
  });
}

export function walkLocationLabel(
  regions: ReadonlyArray<WalkLocationRegion>,
  x: number,
  z: number,
): string {
  let nearest: WalkLocationRegion | null = null;
  let nearestRadius = Number.POSITIVE_INFINITY;
  for (const region of regions) {
    const cosine = Math.cos(region.rotation);
    const sine = Math.sin(region.rotation);
    const deltaX = x - region.x;
    const deltaZ = z - region.z;
    const localX = deltaX * cosine + deltaZ * sine;
    const localZ = -deltaX * sine + deltaZ * cosine;
    const normalizedRadius = Math.hypot(
      localX / Math.max(0.001, region.radiusX),
      localZ / Math.max(0.001, region.radiusZ),
    );
    if (normalizedRadius < nearestRadius) {
      nearest = region;
      nearestRadius = normalizedRadius;
    }
  }
  return nearest && nearestRadius <= 1.35 ? nearest.label : "Repository frontier";
}

export function walkDistanceToSettlementPath(
  paths: ReadonlyArray<WalkSettlementPath>,
  x: number,
  z: number,
): number {
  let nearest = Number.POSITIVE_INFINITY;
  const subject = { x, z };
  for (const path of paths) {
    nearest = Math.min(nearest, closestPointOnSegment(subject, path.from, path.to).distance);
  }
  return nearest;
}

function nearestWaterFocus(plan: WorldPlan, x: number, z: number): WorldPlanPoint {
  const definition = getPlannedTerrainDefinition(plan);
  const subject = { x, z };
  let nearest = {
    x: definition.water.lake.center.x,
    z: definition.water.lake.center.z,
    distance: Number.POSITIVE_INFINITY,
  };
  for (const shorePoint of definition.water.lake.perimeter) {
    // Aim slightly inside the shoreline so the view contains a readable
    // water surface instead of terminating on the bank itself.
    const candidateX = shorePoint.x * 0.8 + definition.water.lake.center.x * 0.2;
    const candidateZ = shorePoint.z * 0.8 + definition.water.lake.center.z * 0.2;
    const distance = Math.hypot(x - candidateX, z - candidateZ);
    if (distance < nearest.distance) nearest = { x: candidateX, z: candidateZ, distance };
  }
  const coursePoints = definition.water.course.points;
  for (let index = 1; index < coursePoints.length; index += 1) {
    const candidate = closestPointOnSegment(
      subject,
      coursePoints[index - 1]!,
      coursePoints[index]!,
    );
    if (candidate.distance < nearest.distance) nearest = candidate;
  }
  return { x: nearest.x, z: nearest.z };
}

function createWaterFocusCandidates(plan: WorldPlan): ReadonlyArray<WorldPlanPoint> {
  const definition = getPlannedTerrainDefinition(plan);
  const candidates: WorldPlanPoint[] = [definition.water.lake.center];
  for (const shorePoint of definition.water.lake.perimeter) {
    for (const shoreWeight of [0.75, 0.55, 0.35]) {
      candidates.push({
        x: shorePoint.x * shoreWeight + definition.water.lake.center.x * (1 - shoreWeight),
        z: shorePoint.z * shoreWeight + definition.water.lake.center.z * (1 - shoreWeight),
      });
    }
  }
  // Sample the rendered watershed contract rather than only its sparse source
  // control points. Lateral samples keep the chosen focus visibly inside the
  // water surface while allowing a robust view past either bank of a meander.
  const courseSamples = 96;
  for (let index = 0; index <= courseSamples; index += 1) {
    const crossSection = samplePlannedWatershedPoint(plan, index / courseSamples);
    const bankInset = crossSection.width * 0.4;
    candidates.push(
      { x: crossSection.x, z: crossSection.z },
      {
        x: crossSection.x + crossSection.normalX * bankInset,
        z: crossSection.z + crossSection.normalZ * bankInset,
      },
      {
        x: crossSection.x - crossSection.normalX * bankInset,
        z: crossSection.z - crossSection.normalZ * bankInset,
      },
    );
  }
  return candidates;
}

function visibleWaterFocus(
  plan: WorldPlan,
  origin: WalkPosition,
  repositoryTarget: WorldPlanPoint,
  waterFocusCandidates: ReadonlyArray<WorldPlanPoint>,
): Readonly<{ point: WorldPlanPoint; clearance: number }> | null {
  const nearest = nearestWaterFocus(plan, origin.x, origin.z);
  const nearestDistance = Math.hypot(nearest.x - origin.x, nearest.z - origin.z);
  const nearestClearance = walkWaterSightlineClearance(plan, origin, nearest);
  let best: WorldPlanPoint | null = null;
  let bestClearance = Number.NEGATIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;
  if (
    nearestDistance >= MIN_PREFERRED_WATER_DISTANCE &&
    nearestDistance <= MAX_PREFERRED_WATER_DISTANCE &&
    angleBetweenDirections(origin, repositoryTarget, nearest) <= WATER_VIEW_ANGLE_DEGREES &&
    nearestClearance >= MIN_WATER_SIGHTLINE_CLEARANCE
  ) {
    best = nearest;
    bestClearance = nearestClearance;
    bestDistance = nearestDistance;
  }
  for (const candidate of waterFocusCandidates) {
    if (samplePlannedWaterSurface(plan, candidate.x, candidate.z) === null) continue;
    const distance = Math.hypot(candidate.x - origin.x, candidate.z - origin.z);
    if (
      distance < MIN_PREFERRED_WATER_DISTANCE ||
      distance > MAX_PREFERRED_WATER_DISTANCE ||
      angleBetweenDirections(origin, repositoryTarget, candidate) > WATER_VIEW_ANGLE_DEGREES
    ) {
      continue;
    }
    const clearance = walkWaterSightlineClearance(plan, origin, candidate);
    if (clearance < MIN_WATER_SIGHTLINE_CLEARANCE) continue;
    if (
      clearance > bestClearance + 0.000_001 ||
      (Math.abs(clearance - bestClearance) <= 0.000_001 && distance < bestDistance)
    ) {
      best = candidate;
      bestClearance = clearance;
      bestDistance = distance;
    }
  }
  return best ? { point: best, clearance: bestClearance } : null;
}

export function walkWaterSightlineClearance(
  plan: WorldPlan,
  origin: WalkPosition,
  waterFocus: WorldPlanPoint,
): number {
  const waterHeight = samplePlannedWaterSurface(plan, waterFocus.x, waterFocus.z);
  if (waterHeight === null) return Number.NEGATIVE_INFINITY;
  const sampleCount = Math.max(
    12,
    Math.ceil(Math.hypot(waterFocus.x - origin.x, waterFocus.z - origin.z) / 2),
  );
  let minimumClearance = Number.POSITIVE_INFINITY;
  for (let step = 1; step < sampleCount; step += 1) {
    const progress = step / sampleCount;
    const x = origin.x + (waterFocus.x - origin.x) * progress;
    const z = origin.z + (waterFocus.z - origin.z) * progress;
    const sightlineY =
      origin.y + (waterHeight + WATER_SIGHTLINE_TARGET_HEIGHT - origin.y) * progress;
    minimumClearance = Math.min(
      minimumClearance,
      sightlineY - samplePlannedTerrainHeight(plan, x, z),
    );
  }
  return minimumClearance;
}

/**
 * Proves that the rendered eye-to-water ray clears terrain by a small positive
 * margin. The endpoint already aims above the water plane, so terrain is not
 * artificially raised a second time during the comparison.
 */
export function walkWaterSightlineIsClear(
  plan: WorldPlan,
  origin: WalkPosition,
  waterFocus: WorldPlanPoint,
): boolean {
  return walkWaterSightlineClearance(plan, origin, waterFocus) >= MIN_WATER_SIGHTLINE_CLEARANCE;
}

function angleBetweenDirections(
  origin: WorldPlanPoint,
  first: WorldPlanPoint,
  second: WorldPlanPoint,
): number {
  const firstX = first.x - origin.x;
  const firstZ = first.z - origin.z;
  const secondX = second.x - origin.x;
  const secondZ = second.z - origin.z;
  const denominator = Math.hypot(firstX, firstZ) * Math.hypot(secondX, secondZ);
  if (denominator < 0.000_001) return 0;
  const cosine = Math.min(1, Math.max(-1, (firstX * secondX + firstZ * secondZ) / denominator));
  return Math.acos(cosine) * (180 / Math.PI);
}

function candidatePosition(
  plan: WorldPlan,
  obstacles: ReadonlyArray<WalkObstacle>,
  grid: WalkNavigationGrid | undefined,
  x: number,
  z: number,
): WalkPosition | null {
  if (grid) {
    if (!walkNavigationGridAllows(grid, x, z)) return null;
  } else if (!isWalkPositionAllowed(plan, obstacles, x, z)) {
    return null;
  }
  const height = grid
    ? sampleWalkNavigationHeight(grid, x, z)
    : samplePlannedTerrainHeight(plan, x, z);
  return { x, y: height + WALK_EYE_HEIGHT, z };
}

type RankedSpawn = LivingWalkSpawn & Readonly<{ score: number }>;

/**
 * Selects a path-side, lived-in entry point from immutable repository
 * topology. Appearance and season are intentionally never read.
 */
export function findLivingWalkSpawn(
  plan: WorldPlan,
  obstacles: ReadonlyArray<WalkObstacle>,
  structures: ReadonlyArray<WalkSpawnStructure>,
  targets: ReadonlyArray<WalkSpawnTarget>,
  landUse: PlannedLandUse,
  grid?: WalkNavigationGrid,
): LivingWalkSpawn | null {
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const paths = createWalkSettlementPaths(landUse);
  const orderedStructures = [...structures].sort((first, second) =>
    first.id.localeCompare(second.id),
  );
  const waterFocusCandidates = createWaterFocusCandidates(plan);
  const radii = [8, 10.5, 13, 16, 19, 22] as const;
  let best: RankedSpawn | null = null;

  for (const structure of orderedStructures) {
    const target = targetById.get(structure.targetId);
    if (!target) continue;
    const phase =
      (stableHash(`${plan.placementKey}:${structure.id}:walk-entry`) / 0x1_0000_0000) * TAU;
    for (const radius of radii) {
      for (let angleIndex = 0; angleIndex < 24; angleIndex += 1) {
        const angle = phase + (angleIndex / 24) * TAU;
        const x = structure.x + Math.cos(angle) * radius;
        const z = structure.z + Math.sin(angle) * radius;
        const position = candidatePosition(plan, obstacles, grid, x, z);
        if (!position) continue;
        const structureDistance =
          Math.round(Math.hypot(x - structure.x, z - structure.z) * 1_000_000) / 1_000_000;
        if (
          structureDistance < MIN_STRUCTURE_SPAWN_DISTANCE - 0.001 ||
          structureDistance > MAX_STRUCTURE_SPAWN_DISTANCE + 0.001
        ) {
          continue;
        }
        const pathDistance = walkDistanceToSettlementPath(paths, x, z);
        if (pathDistance > MAX_PATH_SPAWN_DISTANCE) continue;
        const waterDistance = queryPlannedWaterDistance(plan, x, z).signedDistance;
        const waterDistanceInRange =
          waterDistance >= MIN_PREFERRED_WATER_DISTANCE &&
          waterDistance <= MAX_PREFERRED_WATER_DISTANCE;
        const baseScore =
          pathDistance * 3 + Math.abs(structureDistance - 13) + angleIndex * 0.000_1;
        if (best?.waterInView && baseScore - MAX_WATER_SIGHTLINE_SCORE_REWARD >= best.score) {
          continue;
        }
        const visibleWater = waterDistanceInRange
          ? visibleWaterFocus(plan, position, target, waterFocusCandidates)
          : null;
        const waterInView = visibleWater !== null;
        const waterPenalty =
          waterDistance < MIN_PREFERRED_WATER_DISTANCE
            ? MIN_PREFERRED_WATER_DISTANCE - waterDistance
            : waterDistance > MAX_PREFERRED_WATER_DISTANCE
              ? waterDistance - MAX_PREFERRED_WATER_DISTANCE
              : 0;
        const sightlineReward = visibleWater
          ? Math.min(visibleWater.clearance, 1) * MAX_WATER_SIGHTLINE_SCORE_REWARD
          : 0;
        const score = (waterInView ? 0 : 1_000) + waterPenalty * 8 + baseScore - sightlineReward;
        if (best && score >= best.score) continue;
        best = {
          position,
          lookTarget: { x: target.x, y: target.y, z: target.z },
          waterFocus: visibleWater?.point ?? null,
          yawRadians: Math.atan2(position.x - target.x, position.z - target.z),
          locationLabel:
            plan.topology.hamlets.find((hamlet) => hamlet.id === structure.hamletId)?.label ??
            "Repository frontier",
          targetId: target.id,
          structureId: structure.id,
          structureDistance,
          pathDistance,
          waterDistance,
          waterInView,
          quality: waterInView ? "path-water" : "path",
          score,
        };
      }
    }
  }

  if (best) {
    return {
      position: best.position,
      lookTarget: best.lookTarget,
      waterFocus: best.waterFocus,
      yawRadians: best.yawRadians,
      locationLabel: best.locationLabel,
      targetId: best.targetId,
      structureId: best.structureId,
      structureDistance: best.structureDistance,
      pathDistance: best.pathDistance,
      waterDistance: best.waterDistance,
      waterInView: best.waterInView,
      quality: best.quality,
    };
  }

  const fallback = findWalkSpawn(plan, obstacles, landUse, grid);
  const fallbackTarget = targets[0];
  if (!fallback || !fallbackTarget) return null;
  return {
    position: fallback,
    lookTarget: { x: fallbackTarget.x, y: fallbackTarget.y, z: fallbackTarget.z },
    waterFocus: null,
    yawRadians: Math.atan2(fallback.x - fallbackTarget.x, fallback.z - fallbackTarget.z),
    locationLabel: "Repository frontier",
    targetId: fallbackTarget.id,
    structureId: structures[0]?.id ?? "fallback",
    structureDistance: structures[0]
      ? Math.hypot(fallback.x - structures[0].x, fallback.z - structures[0].z)
      : Number.POSITIVE_INFINITY,
    pathDistance: walkDistanceToSettlementPath(paths, fallback.x, fallback.z),
    waterDistance: queryPlannedWaterDistance(plan, fallback.x, fallback.z).signedDistance,
    waterInView: false,
    quality: "fallback",
  };
}

/** Returns the existing target reference, avoiding allocation in the frame loop. */
export function acquireWalkTarget(
  originX: number,
  originY: number,
  originZ: number,
  forwardX: number,
  forwardY: number,
  forwardZ: number,
  targets: ReadonlyArray<WalkTarget>,
  maximumDistance = TARGET_DISTANCE_LIMIT,
  maximumAngleDegrees = TARGET_ANGLE_LIMIT_DEGREES,
): WalkTarget | null {
  const forwardLength = Math.hypot(forwardX, forwardY, forwardZ);
  if (forwardLength < 0.000_001) return null;
  const minimumCosine = Math.cos((maximumAngleDegrees * Math.PI) / 180);
  let best: WalkTarget | null = null;
  let bestCosine = minimumCosine;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const targetX = target.runtimePosition?.x ?? target.x;
    const targetY = target.runtimePosition?.y ?? target.y;
    const targetZ = target.runtimePosition?.z ?? target.z;
    const deltaX = targetX - originX;
    const deltaY = targetY - originY;
    const deltaZ = targetZ - originZ;
    const distance = Math.hypot(deltaX, deltaY, deltaZ);
    if (distance < 0.001 || distance > maximumDistance) continue;
    const cosine =
      (deltaX * forwardX + deltaY * forwardY + deltaZ * forwardZ) / distance / forwardLength;
    if (cosine < minimumCosine) continue;
    if (
      cosine > bestCosine + 0.000_001 ||
      (Math.abs(cosine - bestCosine) <= 0.000_001 && distance < bestDistance)
    ) {
      best = target;
      bestCosine = cosine;
      bestDistance = distance;
    }
  }
  return best;
}

export function createWalkTargetPrompt(
  target: WalkTarget,
  x: number,
  y: number,
  z: number,
): WalkTargetPrompt {
  const targetX = target.runtimePosition?.x ?? target.x;
  const targetY = target.runtimePosition?.y ?? target.y;
  const targetZ = target.runtimePosition?.z ?? target.z;
  return {
    id: target.id,
    label: target.label,
    detail: target.detail,
    kind: target.kind,
    distance: Math.round(Math.hypot(targetX - x, targetY - y, targetZ - z)),
  };
}

export function walkCompassHeading(forwardX: number, forwardZ: number): WalkCompassHeading {
  if (Math.hypot(forwardX, forwardZ) < 0.000_001) return "N";
  const angle = Math.atan2(forwardX, -forwardZ);
  return COMPASS_HEADINGS[Math.round(angle / (Math.PI / 4) + 8) % 8]!;
}

export const WALK_EXPERIENCE_GATES = Object.freeze({
  targetDistance: TARGET_DISTANCE_LIMIT,
  targetAngleDegrees: TARGET_ANGLE_LIMIT_DEGREES,
  minimumStructureDistance: MIN_STRUCTURE_SPAWN_DISTANCE,
  maximumStructureDistance: MAX_STRUCTURE_SPAWN_DISTANCE,
  maximumPathDistance: MAX_PATH_SPAWN_DISTANCE,
  minimumPreferredWaterDistance: MIN_PREFERRED_WATER_DISTANCE,
  maximumPreferredWaterDistance: MAX_PREFERRED_WATER_DISTANCE,
  waterViewAngleDegrees: WATER_VIEW_ANGLE_DEGREES,
  minimumWaterSightlineClearance: MIN_WATER_SIGHTLINE_CLEARANCE,
});
