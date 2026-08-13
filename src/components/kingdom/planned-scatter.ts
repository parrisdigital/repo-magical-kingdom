import type { KingdomEntity, KingdomSeason, KingdomWorld, Vec3 } from "@/lib/kingdom/types";
import type {
  CorridorRegionMask,
  EllipseRegionMask,
  GrovePalette,
  LandmarkRole,
  WildlifeRole,
  WorldPlan,
} from "@/lib/kingdom/world-plan";
import { REPOSITORY_SCALE_PROFILES } from "@/lib/kingdom/world-identity";

import {
  classifyPlannedTerrainRegion,
  getHamletVisualPlacementMask,
  getPlannedTerrainDefinition,
  samplePlannedTerrainHeight,
} from "./planned-terrain-model";

export type ScatterTransform = Readonly<{
  position: Vec3;
  rotationY: number;
  scale: Vec3;
}>;

export type TerrainPlacementHint = Readonly<{
  maxSlopeDegrees: number;
  estimatedSlopeDegrees: number;
  surfaceHeight: number;
  normal: Vec3;
  terraceRadius: number;
  resampleRadius: number;
}>;

export type PlannedBuilding = Readonly<{
  id: string;
  hamletId: string;
  provinceId: string;
  entityId: string | null;
  assetRole: "plaster-cottage" | "brick-cottage" | "workshop" | "manor";
  arrangement: "courtyard" | "lane";
  footprintRadius: number;
  transform: ScatterTransform;
  terrain: TerrainPlacementHint;
}>;

export type PlannedLandmark = Readonly<{
  id: string;
  hamletId: string | null;
  provinceId: string;
  entityId: string | null;
  assetRole: LandmarkRole;
  footprintRadius: number;
  transform: ScatterTransform;
  terrain: TerrainPlacementHint;
}>;

export type PlannedTree = Readonly<{
  id: string;
  groveId: string;
  assetRole:
    | "common-tree-1"
    | "common-tree-2"
    | "common-tree-3"
    | "pine-1"
    | "pine-2"
    | "twisted-tree-1"
    | "twisted-tree-2"
    | "dead-tree";
  paletteRole: GrovePalette;
  placementRole: "grove-mass" | "edge-tree";
  footprintRadius: number;
  transform: ScatterTransform;
  terrain: TerrainPlacementHint;
}>;

export type GroundCoverMember = Readonly<{
  assetRole: "bush" | "flowering-bush" | "fern" | "grass" | "flower-group" | "mushroom";
  offset: Vec3;
  rotationY: number;
  scale: number;
}>;

export type PlannedGroundCoverCluster = Readonly<{
  id: string;
  groveId: string;
  transition: "grove-edge" | "clearing-edge";
  center: Vec3;
  radius: number;
  members: ReadonlyArray<GroundCoverMember>;
}>;

export type PlannedAmbientDetail = Readonly<{
  id: string;
  microclusterId: string;
  microclusterMemberIndex: number;
  microclusterSize: number;
  groveId: string | null;
  zone: "shore-transition" | "cliff-transition" | "meadow-transition";
  assetRole:
    | "medium-rock-1"
    | "medium-rock-2"
    | "round-rock-path"
    | "bush"
    | "flowering-bush"
    | "fern"
    | "grass"
    | "flower-group";
  footprintRadius: number;
  transform: ScatterTransform;
  terrain: TerrainPlacementHint;
}>;

export type PlannedWildlife = Readonly<{
  id: string;
  zoneId: string;
  habitatGroveId: string;
  assetRole: WildlifeRole;
  behavior: "graze" | "wander" | "rest";
  wanderPath: ReadonlyArray<Vec3>;
  transform: ScatterTransform;
  terrain: TerrainPlacementHint;
}>;

export type PlannedSemanticHitZone = Readonly<{
  id: string;
  provinceId: string;
  entityIds: ReadonlyArray<string>;
  center: Vec3;
  radiusX: number;
  radiusZ: number;
  visible: false;
}>;

export type PlannedScatterAppearance = Readonly<{
  season: KingdomSeason;
  foliageColors: ReadonlyArray<string>;
  floweringColors: ReadonlyArray<string>;
  leafCoverage: number;
  snowCoverage: number;
}>;

export type PlannedGroveRuntimeCapacity = Readonly<{
  groveId: string;
  semanticSuggestedMaxTrees: number;
  runtimeMaxTrees: number;
}>;

export type PlannedAmbientRuntimeSummary = Readonly<{
  targetInstances: number;
  emittedInstances: number;
  omittedMicroclusterIds: ReadonlyArray<string>;
}>;

export type PlannedScatter = Readonly<{
  schema: "repo-planned-scatter/v1";
  topologyKey: string;
  buildings: ReadonlyArray<PlannedBuilding>;
  landmarks: ReadonlyArray<PlannedLandmark>;
  trees: ReadonlyArray<PlannedTree>;
  groundCoverClusters: ReadonlyArray<PlannedGroundCoverCluster>;
  ambientDetails: ReadonlyArray<PlannedAmbientDetail>;
  ambientRuntime: PlannedAmbientRuntimeSummary;
  groveRuntimeCapacities: ReadonlyArray<PlannedGroveRuntimeCapacity>;
  wildlife: ReadonlyArray<PlannedWildlife>;
  semanticHitZones: ReadonlyArray<PlannedSemanticHitZone>;
  appearance: PlannedScatterAppearance;
}>;

type Sample = Readonly<{ x: number; z: number }>;
type Placement = Readonly<{ sample: Sample; radius: number }>;

const TAU = Math.PI * 2;

function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

function random(seed: string): () => number {
  let state = hash(seed) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function distance(first: Sample, second: Sample): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function rotateIntoEllipse(sample: Sample, mask: EllipseRegionMask): Sample {
  const cosine = Math.cos(mask.rotation);
  const sine = Math.sin(mask.rotation);
  const deltaX = sample.x - mask.center.x;
  const deltaZ = sample.z - mask.center.z;
  return {
    x: deltaX * cosine + deltaZ * sine,
    z: -deltaX * sine + deltaZ * cosine,
  };
}

function ellipseContains(mask: EllipseRegionMask, sample: Sample, margin = 0): boolean {
  const local = rotateIntoEllipse(sample, mask);
  const radiusX = mask.radiusX - margin;
  const radiusZ = mask.radiusZ - margin;
  return radiusX > 0 && radiusZ > 0 && (local.x / radiusX) ** 2 + (local.z / radiusZ) ** 2 <= 1;
}

function sampleEllipse(
  mask: EllipseRegionMask,
  rng: () => number,
  radialBand?: [number, number],
): Sample {
  const minimum = radialBand?.[0] ?? 0;
  const maximum = radialBand?.[1] ?? 1;
  const normalizedRadius = Math.sqrt(minimum ** 2 + rng() * (maximum ** 2 - minimum ** 2));
  const angle = rng() * TAU;
  const localX = Math.cos(angle) * mask.radiusX * normalizedRadius;
  const localZ = Math.sin(angle) * mask.radiusZ * normalizedRadius;
  const cosine = Math.cos(mask.rotation);
  const sine = Math.sin(mask.rotation);
  return {
    x: round(mask.center.x + localX * cosine - localZ * sine),
    z: round(mask.center.z + localX * sine + localZ * cosine),
  };
}

function distanceToSegment(subject: Sample, start: Sample, end: Sample): number {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (lengthSquared === 0) return distance(subject, start);
  const projection = Math.min(
    1,
    Math.max(0, ((subject.x - start.x) * deltaX + (subject.z - start.z) * deltaZ) / lengthSquared),
  );
  return Math.hypot(
    subject.x - (start.x + projection * deltaX),
    subject.z - (start.z + projection * deltaZ),
  );
}

function distanceToCorridor(sample: Sample, corridor: CorridorRegionMask): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < corridor.points.length; index += 1) {
    minimum = Math.min(
      minimum,
      distanceToSegment(sample, corridor.points[index - 1]!, corridor.points[index]!),
    );
  }
  return minimum;
}

function distanceToWater(sample: Sample, plan: WorldPlan): number {
  const terrain = getPlannedTerrainDefinition(plan);
  const courseMask: CorridorRegionMask = {
    shape: "corridor",
    points: terrain.water.course.points,
    width: terrain.water.course.sourceWidth * 1.42,
    feather: 4.8,
  };
  const courseClearance = distanceToCorridor(sample, courseMask) - courseMask.width / 2 - 4.8;
  const lake = terrain.water.lake;
  const normalizedLakeRadius = Math.hypot(
    (sample.x - lake.center.x) / lake.radiusX,
    (sample.z - lake.center.z) / lake.radiusZ,
  );
  const lakeClearance = (normalizedLakeRadius - 1) * Math.min(lake.radiusX, lake.radiusZ) - 4;
  return Math.min(courseClearance, lakeClearance);
}

function footprintSamples(sample: Sample, radius: number): ReadonlyArray<Sample> {
  if (radius <= 0) return [sample];
  return [
    sample,
    ...Array.from({ length: 8 }, (_, index) => {
      const angle = (index / 8) * TAU;
      return {
        x: sample.x + Math.cos(angle) * radius,
        z: sample.z + Math.sin(angle) * radius,
      };
    }),
  ];
}

function isBuildableTerrain(
  sample: Sample,
  plan: WorldPlan,
  maxSlopeDegrees: number,
  footprintRadius = 0,
): boolean {
  return footprintSamples(sample, footprintRadius).every((footprintPoint) => {
    const region = classifyPlannedTerrainRegion(plan, footprintPoint.x, footprintPoint.z);
    return (
      region.inside &&
      region.water === null &&
      region.material !== "shore" &&
      region.material !== "outside" &&
      region.slopeDegrees <= maxSlopeDegrees
    );
  });
}

function clearsHamlets(
  sample: Sample,
  radius: number,
  plan: WorldPlan,
  clearance: number,
): boolean {
  return plan.topology.hamlets.every((hamlet) => {
    const visualMask = getHamletVisualPlacementMask(plan, hamlet);
    return (
      distance(sample, hamlet.mask.center) >=
        radius + Math.max(hamlet.mask.radiusX, hamlet.mask.radiusZ) + clearance &&
      distance(sample, visualMask.center) >=
        radius + Math.max(visualMask.radiusX, visualMask.radiusZ) + clearance
    );
  });
}

function distanceToSettlementPaths(sample: Sample, plan: WorldPlan): number {
  const terraces = [...getPlannedTerrainDefinition(plan).terraces].sort(
    (first, second) => first.center.z - second.center.z || first.id.localeCompare(second.id),
  );
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < terraces.length; index += 1) {
    minimum = Math.min(
      minimum,
      distanceToSegment(sample, terraces[index - 1]!.center, terraces[index]!.center),
    );
  }
  return minimum;
}

function candidateScore(
  candidate: Sample,
  existing: ReadonlyArray<Placement>,
  radius: number,
): number {
  if (existing.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(
    ...existing.map(
      (placement) => distance(candidate, placement.sample) - placement.radius - radius,
    ),
  );
}

function bestCandidate(
  mask: EllipseRegionMask,
  rng: () => number,
  existing: ReadonlyArray<Placement>,
  radius: number,
  options: Readonly<{
    attempts?: number;
    band?: [number, number];
    accepts?: (sample: Sample) => boolean;
  }> = {},
): Sample | null {
  let best: Sample | null = null;
  let score = Number.NEGATIVE_INFINITY;
  for (let attempt = 0; attempt < (options.attempts ?? 36); attempt += 1) {
    const candidate = sampleEllipse(mask, rng, options.band);
    if (!ellipseContains(mask, candidate, radius) || options.accepts?.(candidate) === false)
      continue;
    const candidateMinimum = candidateScore(candidate, existing, radius);
    if (candidateMinimum > score) {
      best = candidate;
      score = candidateMinimum;
    }
  }
  return best;
}

function requireCandidate(
  description: string,
  mask: EllipseRegionMask,
  rng: () => number,
  existing: ReadonlyArray<Placement>,
  radius: number,
  options: Readonly<{
    attempts?: number;
    band?: [number, number];
    accepts?: (sample: Sample) => boolean;
  }>,
): Sample {
  const candidate = bestCandidate(mask, rng, existing, radius, options);
  if (!candidate) {
    throw new Error(`Unable to place ${description} on valid planned terrain.`);
  }
  return candidate;
}

function terrainHint(
  plan: WorldPlan,
  sample: Sample,
  maxSlopeDegrees: number,
  footprintRadius: number,
): TerrainPlacementHint {
  const region = classifyPlannedTerrainRegion(plan, sample.x, sample.z);
  const sampleDistance = Math.max(0.35, Math.min(1.25, footprintRadius * 0.5));
  const gradientX =
    (samplePlannedTerrainHeight(plan, sample.x + sampleDistance, sample.z) -
      samplePlannedTerrainHeight(plan, sample.x - sampleDistance, sample.z)) /
    (sampleDistance * 2);
  const gradientZ =
    (samplePlannedTerrainHeight(plan, sample.x, sample.z + sampleDistance) -
      samplePlannedTerrainHeight(plan, sample.x, sample.z - sampleDistance)) /
    (sampleDistance * 2);
  const normalLength = Math.hypot(gradientX, 1, gradientZ);
  return {
    maxSlopeDegrees,
    estimatedSlopeDegrees: round(region.slopeDegrees),
    surfaceHeight: round(region.height),
    normal: {
      x: round(-gradientX / normalLength),
      y: round(1 / normalLength),
      z: round(-gradientZ / normalLength),
    },
    terraceRadius: round(footprintRadius + 0.8),
    resampleRadius: round(Math.max(2, footprintRadius * 1.4)),
  };
}

function assetRoleForBuilding(
  entity: KingdomEntity | undefined,
  index: number,
): PlannedBuilding["assetRole"] {
  if (entity?.category === "source") return index === 0 ? "workshop" : "plaster-cottage";
  if (entity?.category === "docs") return index === 0 ? "manor" : "plaster-cottage";
  if (entity?.category === "test") return "brick-cottage";
  return index % 2 === 0 ? "plaster-cottage" : "brick-cottage";
}

function buildingFootprintRadius(role: PlannedBuilding["assetRole"], scale: number): number {
  const baseRadius: Readonly<Record<PlannedBuilding["assetRole"], number>> = {
    "plaster-cottage": 3.4,
    "brick-cottage": 3.4,
    workshop: 4.4,
    manor: 4.6,
  };
  return round(Math.max(3.2, baseRadius[role] * Math.max(0.94, scale)));
}

function hamletPlacementMask(
  plan: WorldPlan,
  hamlet: WorldPlan["topology"]["hamlets"][number],
): EllipseRegionMask {
  return getHamletVisualPlacementMask(plan, hamlet);
}

function landmarkFootprintRadius(role: LandmarkRole): number {
  return role === "repository-crown" || role === "forge" || role === "archive" ? 5.3 : 4.8;
}

type LandmarkAnchor = Readonly<{
  landmark: WorldPlan["topology"]["landmarks"][number];
  hamletId: string;
  sample: Sample;
  footprintRadius: number;
}>;

type BuildingPlacementSpec = Readonly<{
  originalIndex: number;
  entityId: string | null;
  assetRole: PlannedBuilding["assetRole"];
  scale: number;
  footprintRadius: number;
}>;

function deterministicJointBuildingPlacement(
  plan: WorldPlan,
  hamletId: string,
  mask: EllipseRegionMask,
  specs: ReadonlyArray<BuildingPlacementSpec>,
  fixedPlacements: ReadonlyArray<Placement>,
): ReadonlyMap<number, Sample> | null {
  const cosine = Math.cos(mask.rotation);
  const sine = Math.sin(mask.rotation);
  const phase = random(`${plan.placementKey}:${hamletId}:joint-packing`)() * TAU;
  const ringOrder = [0.84, 0.9, 0.78, 0.96, 0.72, 0.66, 0.58] as const;
  const angularSteps = 32;
  const candidates = specs.map((spec) => {
    const result: Sample[] = [];
    const seen = new Set<string>();
    for (const ring of ringOrder) {
      for (let offsetIndex = 0; offsetIndex < angularSteps; offsetIndex += 1) {
        const signedOffset =
          offsetIndex === 0 ? 0 : Math.ceil(offsetIndex / 2) * (offsetIndex % 2 === 1 ? 1 : -1);
        const angle =
          phase +
          (spec.originalIndex / Math.max(1, specs.length)) * TAU +
          (signedOffset / angularSteps) * TAU;
        const localX = Math.cos(angle) * (mask.radiusX - spec.footprintRadius) * ring;
        const localZ = Math.sin(angle) * (mask.radiusZ - spec.footprintRadius) * ring;
        const sample = {
          x: round(mask.center.x + localX * cosine - localZ * sine),
          z: round(mask.center.z + localX * sine + localZ * cosine),
        };
        const key = `${sample.x}:${sample.z}`;
        if (
          seen.has(key) ||
          !ellipseContains(mask, sample, spec.footprintRadius) ||
          !isBuildableTerrain(sample, plan, 8, spec.footprintRadius)
        ) {
          continue;
        }
        seen.add(key);
        result.push(sample);
      }
    }
    return result;
  });
  if (candidates.some((samples) => samples.length === 0)) return null;

  const placements = [...fixedPlacements];
  const selected = new Map<number, Sample>();
  let visitedNodes = 0;
  const maximumNodes = 80_000;
  const search = (specIndex: number): boolean => {
    if (specIndex === specs.length) return true;
    if (visitedNodes >= maximumNodes) return false;
    const spec = specs[specIndex]!;
    for (const sample of candidates[specIndex]!) {
      visitedNodes += 1;
      if (candidateScore(sample, placements, spec.footprintRadius) < 1.5) continue;
      placements.push({ sample, radius: spec.footprintRadius });
      selected.set(spec.originalIndex, sample);
      if (search(specIndex + 1)) return true;
      selected.delete(spec.originalIndex);
      placements.pop();
      if (visitedNodes >= maximumNodes) break;
    }
    return false;
  };
  return search(0) ? selected : null;
}

function createLandmarkAnchors(plan: WorldPlan): ReadonlyArray<LandmarkAnchor> {
  const anchors: LandmarkAnchor[] = [];
  for (const [index, landmark] of plan.topology.landmarks.entries()) {
    const associatedHamlet = plan.topology.hamlets[index % plan.topology.hamlets.length];
    if (!associatedHamlet) continue;
    const footprintRadius = landmarkFootprintRadius(landmark.role);
    const placementMask = hamletPlacementMask(plan, associatedHamlet);
    const existing = anchors.map((anchor) => ({
      sample: anchor.sample,
      radius: anchor.footprintRadius,
    }));
    const center = placementMask.center;
    const sample =
      isBuildableTerrain(center, plan, 6, footprintRadius) &&
      candidateScore(center, existing, footprintRadius) >= 1.5
        ? center
        : requireCandidate(
            `${landmark.id} landmark clearing`,
            placementMask,
            random(`${plan.placementKey}:${landmark.id}:anchor`),
            existing,
            footprintRadius,
            {
              attempts: 220,
              band: [0, 0.48],
              accepts: (candidate) =>
                isBuildableTerrain(candidate, plan, 6, footprintRadius) &&
                candidateScore(candidate, existing, footprintRadius) >= 1.5,
            },
          );
    anchors.push({ landmark, hamletId: associatedHamlet.id, sample, footprintRadius });
  }
  return anchors;
}

function createBuildings(
  world: KingdomWorld,
  plan: WorldPlan,
  landmarkAnchors: ReadonlyArray<LandmarkAnchor>,
): ReadonlyArray<PlannedBuilding> {
  const entities = new Map(world.entities.map((entity) => [entity.id, entity]));
  return plan.topology.hamlets.flatMap((hamlet) => {
    const placementMask = hamletPlacementMask(plan, hamlet);
    const count = hamlet.maxBuildings;
    const rng = random(`${plan.placementKey}:${hamlet.id}:buildings`);
    const placements: Placement[] = landmarkAnchors
      .filter((anchor) => anchor.hamletId === hamlet.id)
      .map((anchor) => ({ sample: anchor.sample, radius: anchor.footprintRadius }));
    const arrangement: PlannedBuilding["arrangement"] =
      placements.length > 0 ? "courtyard" : hash(hamlet.id) % 2 === 0 ? "courtyard" : "lane";
    const specs = Array.from({ length: count }, (_, index) => {
      const entityId =
        hamlet.buildingEntityIds[index % Math.max(1, hamlet.buildingEntityIds.length)] ?? null;
      const entity = entityId ? entities.get(entityId) : undefined;
      const assetRole = assetRoleForBuilding(entity, index);
      const scale = round(0.94 + rng() * 0.12);
      const footprintRadius = buildingFootprintRadius(assetRole, scale);
      return { originalIndex: index, entityId, assetRole, scale, footprintRadius };
    }).sort(
      (first, second) =>
        second.footprintRadius - first.footprintRadius ||
        first.originalIndex - second.originalIndex,
    );
    const greedyBuildings: PlannedBuilding[] = [];
    let failedSpec: BuildingPlacementSpec | null = null;
    for (const spec of specs) {
      const { originalIndex: index, entityId, assetRole, scale, footprintRadius } = spec;
      let sample: Sample;
      if (arrangement === "courtyard") {
        const angle = (index / count) * TAU + (rng() - 0.5) * 0.22;
        const courtyardRadius = Math.max(
          footprintRadius + 1,
          Math.min(placementMask.radiusX, placementMask.radiusZ) - footprintRadius - 0.65,
        );
        sample = {
          x: round(placementMask.center.x + Math.cos(angle) * courtyardRadius),
          z: round(placementMask.center.z + Math.sin(angle) * courtyardRadius),
        };
      } else {
        const row = index % 2 === 0 ? -1 : 1;
        const laneIndex = Math.floor(index / 2) - (Math.ceil(count / 2) - 1) / 2;
        const heading = (rng() - 0.5) * 0.35;
        const along = laneIndex * (footprintRadius * 2 + 1.5);
        const across = row * (footprintRadius + 0.75);
        sample = {
          x: round(placementMask.center.x + Math.cos(heading) * along - Math.sin(heading) * across),
          z: round(placementMask.center.z + Math.sin(heading) * along + Math.cos(heading) * across),
        };
      }
      if (
        !ellipseContains(placementMask, sample, footprintRadius) ||
        candidateScore(sample, placements, footprintRadius) < 1.5 ||
        !isBuildableTerrain(sample, plan, 8, footprintRadius)
      ) {
        const candidate = bestCandidate(placementMask, rng, placements, footprintRadius, {
          attempts: 420,
          band: [0.34, 0.98],
          accepts: (candidate) =>
            isBuildableTerrain(candidate, plan, 8, footprintRadius) &&
            candidateScore(candidate, placements, footprintRadius) >= 1.5,
        });
        if (!candidate) {
          failedSpec = spec;
          break;
        }
        sample = candidate;
      }
      placements.push({ sample, radius: footprintRadius });
      const rotationY =
        arrangement === "courtyard"
          ? Math.atan2(placementMask.center.x - sample.x, placementMask.center.z - sample.z)
          : (index % 2 === 0 ? 0 : Math.PI) + (rng() - 0.5) * 0.22;
      greedyBuildings.push({
        id: `${hamlet.id}-building-${index}`,
        hamletId: hamlet.id,
        provinceId: hamlet.provinceId,
        entityId,
        assetRole,
        arrangement,
        footprintRadius,
        transform: {
          position: { x: sample.x, y: 0, z: sample.z },
          rotationY: round(rotationY),
          scale: { x: scale, y: round(scale * (0.92 + rng() * 0.16)), z: scale },
        },
        terrain: terrainHint(plan, sample, 8, footprintRadius),
      });
    }
    if (!failedSpec) return greedyBuildings;

    const fixedPlacements = landmarkAnchors
      .filter((anchor) => anchor.hamletId === hamlet.id)
      .map((anchor) => ({ sample: anchor.sample, radius: anchor.footprintRadius }));
    const jointSamples = deterministicJointBuildingPlacement(
      plan,
      hamlet.id,
      placementMask,
      specs,
      fixedPlacements,
    );
    if (!jointSamples) {
      throw new Error(
        `Unable to place ${hamlet.id} building ${failedSpec.originalIndex} on valid planned terrain.`,
      );
    }
    return specs.map(({ originalIndex: index, entityId, assetRole, scale, footprintRadius }) => {
      const sample = jointSamples.get(index)!;
      const transformRng = random(`${plan.placementKey}:${hamlet.id}:joint-transform:${index}`);
      const rotationY = Math.atan2(
        placementMask.center.x - sample.x,
        placementMask.center.z - sample.z,
      );
      return {
        id: `${hamlet.id}-building-${index}`,
        hamletId: hamlet.id,
        provinceId: hamlet.provinceId,
        entityId,
        assetRole,
        arrangement: "courtyard",
        footprintRadius,
        transform: {
          position: { x: sample.x, y: 0, z: sample.z },
          rotationY: round(rotationY),
          scale: { x: scale, y: round(scale * (0.92 + transformRng() * 0.16)), z: scale },
        },
        terrain: terrainHint(plan, sample, 8, footprintRadius),
      };
    });
  });
}

function createLandmarks(
  plan: WorldPlan,
  anchors: ReadonlyArray<LandmarkAnchor>,
): ReadonlyArray<PlannedLandmark> {
  return anchors.map(({ landmark, hamletId, sample, footprintRadius }) => {
    const rng = random(`${plan.placementKey}:${landmark.id}:landmark`);
    const scale = round(0.9 + landmark.prominence * 0.35);
    return {
      id: landmark.id,
      hamletId,
      provinceId: landmark.provinceId,
      entityId: landmark.entityId,
      assetRole: landmark.role,
      footprintRadius,
      transform: {
        position: { x: sample.x, y: 0, z: sample.z },
        rotationY: round(rng() * TAU),
        scale: { x: scale, y: round(scale * 1.08), z: scale },
      },
      terrain: terrainHint(plan, sample, 6, footprintRadius),
    };
  });
}

const TREE_ROLES: Readonly<Record<GrovePalette, ReadonlyArray<PlannedTree["assetRole"]>>> = {
  broadleaf: ["common-tree-1", "common-tree-2", "common-tree-3", "twisted-tree-1"],
  pine: ["pine-1", "pine-2", "common-tree-3"],
  twisted: ["twisted-tree-1", "twisted-tree-2", "dead-tree", "common-tree-2"],
  mixed: ["common-tree-1", "common-tree-3", "pine-2", "twisted-tree-2"],
  flowering: ["common-tree-1", "common-tree-2", "twisted-tree-1"],
};

type RuntimeGrove = Readonly<{
  id: string;
  sourceGroveId: string;
  mask: EllipseRegionMask;
  palette: GrovePalette;
  target: number;
  runtimeCapacity: number;
}>;

function baseCanopyBudget(plan: WorldPlan): number {
  const total = plan.topology.visualBudgets.maxTrees;
  // Keep a bounded slice for the later edge-woodland enrichment pass. Dense
  // grove masses and dispersed forest belts are separate compositional jobs;
  // letting the first consume the whole budget erased the second on compact
  // repositories.
  const enrichmentReserve = Math.min(48, Math.max(30, Math.round(total * 0.22)));
  return Math.max(0, total - enrichmentReserve);
}

function validTreeCandidate(candidate: Sample, plan: WorldPlan, footprintRadius: number): boolean {
  const watershed = plan.topology.terrainZones.find(
    (zone) => zone.kind === "watershed" && zone.mask.shape === "corridor",
  )?.mask;
  return (
    distanceToWater(candidate, plan) >= footprintRadius + 4.5 &&
    (watershed?.shape !== "corridor" ||
      distanceToCorridor(candidate, watershed) >= watershed.width / 2 + 4 + footprintRadius) &&
    clearsHamlets(candidate, footprintRadius, plan, 4.5) &&
    distanceToSettlementPaths(candidate, plan) >= footprintRadius + 3.5 &&
    isBuildableTerrain(candidate, plan, 28, footprintRadius)
  );
}

function findRuntimeGroves(plan: WorldPlan): ReadonlyArray<RuntimeGrove> {
  const scaleProfile = REPOSITORY_SCALE_PROFILES[plan.identity.scaleTier];
  const desiredCount = Math.min(scaleProfile.maxGroves, plan.topology.groves.length);
  const groveScale = {
    compact: 1,
    established: 1.08,
    expansive: 1.17,
    vast: 1.26,
  }[plan.identity.scaleTier];
  const envelope = plan.topology.envelope;
  const candidates: Array<Readonly<{ sample: Sample; score: number }>> = [];
  const columns = 10;
  const rows = 9;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const rng = random(`${plan.placementKey}:runtime-grove:${column}:${row}`);
      const sample = {
        x: round(
          envelope.minX +
            envelope.safeMargin * 1.6 +
            ((column + 0.5 + (rng() - 0.5) * 0.48) / columns) *
              (envelope.width - envelope.safeMargin * 3.2),
        ),
        z: round(
          envelope.minZ +
            envelope.depth * 0.18 +
            ((row + 0.5 + (rng() - 0.5) * 0.48) / rows) * (envelope.depth * 0.68),
        ),
      };
      if (!validTreeCandidate(sample, plan, 1.2)) continue;
      const nearestSemantic = Math.min(
        ...plan.topology.groves.map((grove) => distance(sample, grove.mask.center)),
      );
      candidates.push({
        sample,
        score: nearestSemantic + (hash(`${plan.placementKey}:${column}:${row}`) % 1_000) / 1_000,
      });
    }
  }

  const chosen: Sample[] = [];
  while (chosen.length < desiredCount) {
    const next = candidates
      .filter((candidate) =>
        chosen.every((center) => distance(center, candidate.sample) >= 22 * groveScale),
      )
      .sort((first, second) => {
        const firstSemanticDistance = Math.min(
          ...plan.topology.groves.map((grove) => distance(first.sample, grove.mask.center)),
        );
        const secondSemanticDistance = Math.min(
          ...plan.topology.groves.map((grove) => distance(second.sample, grove.mask.center)),
        );
        const firstSpread = chosen.length
          ? Math.min(...chosen.map((center) => distance(center, first.sample)))
          : 0;
        const secondSpread = chosen.length
          ? Math.min(...chosen.map((center) => distance(center, second.sample)))
          : 0;
        return (
          secondSpread - firstSpread ||
          firstSemanticDistance - secondSemanticDistance ||
          first.score - second.score
        );
      })[0];
    if (!next) break;
    chosen.push(next.sample);
  }

  const palettes: ReadonlyArray<GrovePalette> = [
    "flowering",
    "broadleaf",
    "flowering",
    "mixed",
    "flowering",
    "broadleaf",
    "pine",
    "twisted",
  ];
  const globalCanopyBudget = baseCanopyBudget(plan);
  const edgeTreeBudget = Math.min(12, desiredCount + 3);
  const primaryBudget = Math.max(0, globalCanopyBudget - edgeTreeBudget);
  const baseRuntimeCapacity = Math.floor(primaryBudget / Math.max(1, chosen.length));
  const extraRuntimeCapacity = primaryBudget % Math.max(1, chosen.length);
  const availableSemanticGroves = [...plan.topology.groves];
  return chosen.map((center, index) => {
    const semanticIndex = availableSemanticGroves
      .map((grove, candidateIndex) => ({
        candidateIndex,
        distance: distance(center, grove.mask.center),
        id: grove.id,
      }))
      .sort(
        (first, second) => first.distance - second.distance || first.id.localeCompare(second.id),
      )[0]!.candidateIndex;
    const [semantic] = availableSemanticGroves.splice(semanticIndex, 1);
    const rng = random(`${plan.placementKey}:runtime-grove-shape:${index}`);
    const rearDensityBoost =
      center.z <= envelope.center.z - envelope.depth * 0.08 ||
      Math.abs(center.x - envelope.center.x) >= envelope.width * 0.28
        ? 2
        : 0;
    const runtimeCapacity = Math.min(
      30,
      baseRuntimeCapacity + (index < extraRuntimeCapacity ? 1 : 0) + rearDensityBoost,
    );
    return {
      id: semantic!.id,
      sourceGroveId: semantic!.id,
      mask: {
        shape: "ellipse",
        center,
        radiusX: round((13.5 + rng() * 3.5) * groveScale),
        radiusZ: round((12 + rng() * 4) * groveScale),
        rotation: round((rng() - 0.5) * 0.8),
        feather: 3.5,
      },
      palette: palettes[index % palettes.length]!,
      target: Math.max(
        12,
        Math.min(
          runtimeCapacity,
          {
            compact: 17,
            established: 20,
            expansive: 24,
            vast: 27,
          }[plan.identity.scaleTier] +
            rearDensityBoost +
            (hash(`${plan.placementKey}:runtime-grove-count:${index}`) % 5),
        ),
      ),
      runtimeCapacity,
    };
  });
}

function createTrees(plan: WorldPlan): ReadonlyArray<PlannedTree> {
  const canopyBudget = baseCanopyBudget(plan);
  const trees: PlannedTree[] = [];
  let remainingBudget = canopyBudget;
  const runtimeGroves = findRuntimeGroves(plan);
  const globalPlacements: Placement[] = [];
  for (const [groveIndex, grove] of runtimeGroves.entries()) {
    const rng = random(`${plan.placementKey}:${grove.id}:trees`);
    const target = Math.min(grove.target, grove.runtimeCapacity, 30, remainingBudget);
    const placements: Placement[] = [];
    const roles = TREE_ROLES[grove.palette];
    const clearingAngle = rng() * TAU;
    const clearingCenter = {
      x: grove.mask.center.x + Math.cos(clearingAngle) * grove.mask.radiusX * 0.18,
      z: grove.mask.center.z + Math.sin(clearingAngle) * grove.mask.radiusZ * 0.18,
    };
    const clearingRadius = Math.min(grove.mask.radiusX, grove.mask.radiusZ) * 0.22;
    for (let index = 0; index < target; index += 1) {
      const footprintRadius = round(0.64 + rng() * 0.2);
      const sample = bestCandidate(grove.mask, rng, placements, footprintRadius, {
        attempts: 72,
        accepts: (candidate) =>
          distance(candidate, clearingCenter) >= clearingRadius + footprintRadius &&
          validTreeCandidate(candidate, plan, footprintRadius),
      });
      if (!sample || candidateScore(sample, placements, footprintRadius) < 0.18) continue;
      placements.push({ sample, radius: footprintRadius });
      globalPlacements.push({ sample, radius: footprintRadius });
      const role = roles[(index + groveIndex) % roles.length]!;
      const scale = round(0.82 + rng() * 0.52);
      trees.push({
        id: `${grove.id}-tree-${index}`,
        groveId: grove.id,
        assetRole: role,
        paletteRole: grove.palette,
        placementRole: "grove-mass",
        footprintRadius,
        transform: {
          position: { x: sample.x, y: 0, z: sample.z },
          rotationY: round(rng() * TAU),
          scale: { x: scale, y: round(scale * (0.9 + rng() * 0.25)), z: scale },
        },
        terrain: terrainHint(plan, sample, 28, footprintRadius),
      });
    }
    remainingBudget -= placements.length;
  }

  const edgeTarget = Math.min(12, runtimeGroves.length + 3, Math.max(0, remainingBudget));
  const edgeRoles: ReadonlyArray<PlannedTree["assetRole"]> = [
    "twisted-tree-1",
    "pine-2",
    "common-tree-3",
    "dead-tree",
    "common-tree-2",
    "twisted-tree-2",
  ];
  for (let index = 0; index < edgeTarget; index += 1) {
    const grove = runtimeGroves[index % runtimeGroves.length];
    if (!grove) break;
    const rng = random(`${plan.placementKey}:edge-tree:${index}`);
    const footprintRadius = round(0.64 + rng() * 0.18);
    const edgeMask: EllipseRegionMask = {
      ...grove.mask,
      radiusX: round(grove.mask.radiusX + 10),
      radiusZ: round(grove.mask.radiusZ + 10),
    };
    const sample = bestCandidate(edgeMask, rng, globalPlacements, footprintRadius, {
      attempts: 96,
      band: [0.68, 0.94],
      accepts: (candidate) => validTreeCandidate(candidate, plan, footprintRadius),
    });
    if (!sample) continue;
    globalPlacements.push({ sample, radius: footprintRadius });
    const scale = round(0.78 + rng() * 0.34);
    trees.push({
      id: `${grove.id}-edge-${index}`,
      groveId: grove.id,
      assetRole: edgeRoles[index % edgeRoles.length]!,
      paletteRole: grove.palette,
      placementRole: "edge-tree",
      footprintRadius,
      transform: {
        position: { x: sample.x, y: 0, z: sample.z },
        rotationY: round(rng() * TAU),
        scale: { x: scale, y: round(scale * (0.94 + rng() * 0.2)), z: scale },
      },
      terrain: terrainHint(plan, sample, 28, footprintRadius),
    });
  }
  return trees;
}

function createGroundCover(
  plan: WorldPlan,
  trees: ReadonlyArray<PlannedTree>,
): ReadonlyArray<PlannedGroundCoverCluster> {
  const budget = plan.topology.visualBudgets.maxSurfaceScatter;
  const clusters: PlannedGroundCoverCluster[] = [];
  let usedMembers = 0;
  const groupedTrees = new Map<string, PlannedTree[]>();
  for (const tree of trees.filter((candidate) => candidate.placementRole === "grove-mass")) {
    const group = groupedTrees.get(tree.groveId) ?? [];
    group.push(tree);
    groupedTrees.set(tree.groveId, group);
  }
  for (const [groveId, groveTrees] of groupedTrees) {
    if (groveTrees.length === 0) continue;
    const palette = groveTrees[0]!.paletteRole;
    const center = {
      x:
        groveTrees.reduce((total, tree) => total + tree.transform.position.x, 0) /
        groveTrees.length,
      z:
        groveTrees.reduce((total, tree) => total + tree.transform.position.z, 0) /
        groveTrees.length,
    };
    const radiusX = Math.max(
      8,
      ...groveTrees.map((tree) => Math.abs(tree.transform.position.x - center.x) + 2.5),
    );
    const radiusZ = Math.max(
      8,
      ...groveTrees.map((tree) => Math.abs(tree.transform.position.z - center.z) + 2.5),
    );
    const groveMask: EllipseRegionMask = {
      shape: "ellipse",
      center,
      radiusX,
      radiusZ,
      rotation: 0,
      feather: 3.5,
    };
    const rng = random(`${plan.placementKey}:${groveId}:ground-cover:v2`);
    const clusterCount = 2;
    for (let index = 0; index < clusterCount; index += 1) {
      const memberCount = Math.min(12, 8 + (hash(`${groveId}:cluster:${index}`) % 5));
      if (usedMembers + memberCount > budget) break;
      const transition = index % 3 === 0 ? "clearing-edge" : "grove-edge";
      const clusterCenter = requireCandidate(
        `${groveId} transition ground cover`,
        groveMask,
        rng,
        [],
        0.35,
        {
          attempts: 72,
          band: transition === "grove-edge" ? [0.72, 0.94] : [0.34, 0.62],
          accepts: (candidate) =>
            distanceToWater(candidate, plan) >= 4 &&
            clearsHamlets(candidate, 1.8, plan, 3) &&
            distanceToSettlementPaths(candidate, plan) >= 2.5 &&
            isBuildableTerrain(candidate, plan, 32, 0.35),
        },
      );
      const radius = round(1.7 + rng() * 1.1);
      const members: GroundCoverMember[] = [];
      const memberRoles: ReadonlyArray<GroundCoverMember["assetRole"]> =
        palette === "flowering"
          ? ["flowering-bush", "flower-group", "grass", "fern"]
          : ["bush", "fern", "grass", "mushroom", "flower-group"];
      for (let memberIndex = 0; memberIndex < memberCount; memberIndex += 1) {
        let offset: Sample | null = null;
        for (let attempt = 0; attempt < 40; attempt += 1) {
          const radial = Math.sqrt(rng()) * radius;
          const angle = rng() * TAU;
          const candidateOffset = {
            x: round(Math.cos(angle) * radial),
            z: round(Math.sin(angle) * radial),
          };
          const absolute = {
            x: clusterCenter.x + candidateOffset.x,
            z: clusterCenter.z + candidateOffset.z,
          };
          if (
            isBuildableTerrain(absolute, plan, 32, 0.18) &&
            distanceToWater(absolute, plan) >= 2 &&
            clearsHamlets(absolute, 0.3, plan, 2) &&
            distanceToSettlementPaths(absolute, plan) >= 1.5
          ) {
            offset = candidateOffset;
            break;
          }
        }
        if (!offset) {
          throw new Error(`Unable to place ${groveId} ground-cover member on valid terrain.`);
        }
        members.push({
          assetRole: memberRoles[(memberIndex + hash(`${groveId}:${index}`)) % memberRoles.length]!,
          offset: { x: offset.x, y: 0, z: offset.z },
          rotationY: round(rng() * TAU),
          scale: round(0.72 + rng() * 0.52),
        });
      }
      clusters.push({
        id: `${groveId}-ground-${index}`,
        groveId,
        transition,
        center: { x: clusterCenter.x, y: 0, z: clusterCenter.z },
        radius,
        members,
      });
      usedMembers += memberCount;
    }
  }
  return clusters;
}

function createAmbientDetails(
  plan: WorldPlan,
  trees: ReadonlyArray<PlannedTree>,
  groundCoverClusters: ReadonlyArray<PlannedGroundCoverCluster>,
  structures: ReadonlyArray<PlannedBuilding | PlannedLandmark>,
): Readonly<{
  details: ReadonlyArray<PlannedAmbientDetail>;
  omittedMicroclusterIds: ReadonlyArray<string>;
  targetInstances: number;
}> {
  const usedSurfaceInstances = groundCoverClusters.reduce(
    (total, cluster) => total + cluster.members.length,
    0,
  );
  const detailBudget = Math.min(
    44,
    Math.max(0, plan.topology.visualBudgets.maxSurfaceScatter - usedSurfaceInstances),
  );
  const envelope = plan.topology.envelope;
  const details: PlannedAmbientDetail[] = [];
  const omittedMicroclusterIds: string[] = [];
  const clusterCenters: Placement[] = [];
  const detailPlacements: Placement[] = [];
  const treePlacements: Placement[] = trees.map((tree) => ({
    sample: tree.transform.position,
    radius: tree.footprintRadius,
  }));
  const structurePlacements: Placement[] = structures.map((structure) => ({
    sample: structure.transform.position,
    radius: structure.footprintRadius,
  }));
  const roles: Readonly<
    Record<PlannedAmbientDetail["zone"], ReadonlyArray<PlannedAmbientDetail["assetRole"]>>
  > = {
    "shore-transition": ["medium-rock-1", "round-rock-path", "fern", "grass"],
    "cliff-transition": ["medium-rock-2", "medium-rock-1", "round-rock-path", "bush"],
    "meadow-transition": ["flowering-bush", "flower-group", "bush", "fern", "grass"],
  };
  const zoneClusters: ReadonlyArray<
    Readonly<{ zone: PlannedAmbientDetail["zone"]; memberCounts: ReadonlyArray<number> }>
  > = [
    { zone: "cliff-transition", memberCounts: [4, 3, 4, 3] },
    { zone: "shore-transition", memberCounts: [3, 3, 3, 3] },
    { zone: "meadow-transition", memberCounts: [4, 3, 4, 3, 4] },
  ];
  if (
    zoneClusters.reduce((total, zone) => total + zone.memberCounts.reduce((a, b) => a + b, 0), 0) >
    detailBudget
  ) {
    throw new Error("The ambient transition plan exceeds the surface-scatter budget.");
  }

  function zoneCandidate(
    zone: PlannedAmbientDetail["zone"],
    rng: () => number,
    clusterIndex: number,
  ): Sample {
    if (zone === "shore-transition") {
      const lake = getPlannedTerrainDefinition(plan).water.lake;
      const angle = rng() * TAU;
      const radial = 1.07 + rng() * 0.38;
      return {
        x: round(lake.center.x + Math.cos(angle) * lake.radiusX * radial),
        z: round(lake.center.z + Math.sin(angle) * lake.radiusZ * radial),
      };
    }
    if (zone === "cliff-transition") {
      return {
        x: round(
          envelope.minX +
            envelope.safeMargin * 1.25 +
            ((clusterIndex + 0.2 + rng() * 0.62) / 4) *
              (envelope.width - envelope.safeMargin * 2.5),
        ),
        z: round(envelope.minZ + envelope.depth * (0.15 + rng() * 0.19)),
      };
    }
    const hamlet = plan.topology.hamlets[clusterIndex % plan.topology.hamlets.length]!;
    const visualMask = getHamletVisualPlacementMask(plan, hamlet);
    const angle = rng() * TAU;
    const radial = Math.max(visualMask.radiusX, visualMask.radiusZ) + 4.5 + rng() * 6;
    return {
      x: round(visualMask.center.x + Math.cos(angle) * radial),
      z: round(visualMask.center.z + Math.sin(angle) * radial),
    };
  }

  function validAmbientSample(
    zone: PlannedAmbientDetail["zone"],
    sample: Sample,
    footprintRadius: number,
    localPlacements: ReadonlyArray<Placement>,
  ): boolean {
    const region = classifyPlannedTerrainRegion(plan, sample.x, sample.z);
    const waterDistance = distanceToWater(sample, plan);
    const matchesZone =
      zone === "shore-transition"
        ? waterDistance >= 1.2 && waterDistance <= 12 && region.slopeDegrees <= 24
        : zone === "cliff-transition"
          ? sample.z <= envelope.minZ + envelope.depth * 0.35 &&
            region.height >= 3.5 &&
            region.slopeDegrees >= 3 &&
            region.slopeDegrees <= 32
          : sample.z >= envelope.minZ + envelope.depth * 0.24 &&
            region.slopeDegrees <= 18 &&
            waterDistance >= 6;
    return (
      matchesZone &&
      region.inside &&
      region.water === null &&
      region.material !== "shore" &&
      clearsHamlets(sample, footprintRadius, plan, 1.25) &&
      distanceToSettlementPaths(sample, plan) >= footprintRadius + 1.4 &&
      candidateScore(sample, structurePlacements, footprintRadius) >= 1.2 &&
      candidateScore(sample, treePlacements, footprintRadius) >= 0.55 &&
      candidateScore(sample, detailPlacements, footprintRadius) >= 0.8 &&
      candidateScore(sample, localPlacements, footprintRadius) >= 0.18 &&
      isBuildableTerrain(sample, plan, 32, footprintRadius)
    );
  }

  for (const { zone, memberCounts } of zoneClusters) {
    const rng = random(`${plan.placementKey}:ambient:${zone}:microclusters`);
    for (const [clusterIndex, memberCount] of memberCounts.entries()) {
      const clusterId = `ambient-${zone}-cluster-${clusterIndex}`;
      let members: PlannedAmbientDetail[] | null = null;
      let acceptedCenter: Sample | null = null;
      for (let centerAttempt = 0; centerAttempt < 96 && !members; centerAttempt += 1) {
        const center = zoneCandidate(zone, rng, clusterIndex);
        if (candidateScore(center, clusterCenters, 3.2) < 5.5) continue;
        const localPlacements: Placement[] = [];
        const candidates: PlannedAmbientDetail[] = [];
        for (let memberIndex = 0; memberIndex < memberCount; memberIndex += 1) {
          let accepted: PlannedAmbientDetail | null = null;
          for (let memberAttempt = 0; memberAttempt < 28 && !accepted; memberAttempt += 1) {
            const angle =
              (memberIndex / memberCount) * TAU +
              (rng() - 0.5) * (memberAttempt === 0 ? 0.45 : 1.2);
            const radial = memberIndex === 0 ? rng() * 0.45 : 1.35 + rng() * 2.35;
            const sample = {
              x: round(center.x + Math.cos(angle) * radial),
              z: round(center.z + Math.sin(angle) * radial),
            };
            const role = roles[zone][(clusterIndex + memberIndex) % roles[zone].length]!;
            const isRock = role.includes("rock");
            const footprintRadius = round(isRock ? 0.85 + rng() * 0.42 : 0.5 + rng() * 0.3);
            if (!validAmbientSample(zone, sample, footprintRadius, localPlacements)) continue;
            const scale = round(isRock ? 1.1 + rng() * 0.72 : 0.95 + rng() * 0.55);
            accepted = {
              id: `${clusterId}-member-${memberIndex}`,
              microclusterId: clusterId,
              microclusterMemberIndex: memberIndex,
              microclusterSize: memberCount,
              groveId: null,
              zone,
              assetRole: role,
              footprintRadius,
              transform: {
                position: { x: sample.x, y: 0, z: sample.z },
                rotationY: round(rng() * TAU),
                scale: { x: scale, y: round(scale * (0.82 + rng() * 0.3)), z: scale },
              },
              terrain: terrainHint(plan, sample, 32, footprintRadius),
            };
            localPlacements.push({ sample, radius: footprintRadius });
          }
          if (!accepted) break;
          candidates.push(accepted);
        }
        if (candidates.length === memberCount) {
          members = candidates;
          acceptedCenter = center;
        }
      }
      if (!members || !acceptedCenter) {
        omittedMicroclusterIds.push(clusterId);
        continue;
      }
      clusterCenters.push({ sample: acceptedCenter, radius: 3.2 });
      for (const member of members) {
        details.push(member);
        detailPlacements.push({
          sample: member.transform.position,
          radius: member.footprintRadius,
        });
      }
    }
  }
  return { details, omittedMicroclusterIds, targetInstances: detailBudget };
}

function createWildlife(
  plan: WorldPlan,
  trees: ReadonlyArray<PlannedTree>,
): ReadonlyArray<PlannedWildlife> {
  return plan.topology.wildlifeZones.flatMap((zone) => {
    const habitatTrees = trees.filter((tree) => tree.groveId === zone.habitatGroveId);
    if (habitatTrees.length === 0) return [];
    const center = {
      x:
        habitatTrees.reduce((total, tree) => total + tree.transform.position.x, 0) /
        habitatTrees.length,
      z:
        habitatTrees.reduce((total, tree) => total + tree.transform.position.z, 0) /
        habitatTrees.length,
    };
    const habitatMask: EllipseRegionMask = {
      shape: "ellipse",
      center,
      radiusX: Math.min(
        20,
        Math.max(
          6,
          Math.max(...habitatTrees.map((tree) => Math.abs(tree.transform.position.x - center.x))) +
            4,
        ),
      ),
      radiusZ: Math.min(
        20,
        Math.max(
          6,
          Math.max(...habitatTrees.map((tree) => Math.abs(tree.transform.position.z - center.z))) +
            4,
        ),
      ),
      rotation: 0,
      feather: 2,
    };
    const rng = random(`${plan.placementKey}:${zone.id}:wildlife`);
    const placements: Placement[] = [];
    return Array.from({ length: zone.maxActors }, (_, index): PlannedWildlife | null => {
      const sample = bestCandidate(habitatMask, rng, placements, 0.8, {
        attempts: 96,
        accepts: (candidate) =>
          distanceToWater(candidate, plan) >= 3 &&
          clearsHamlets(candidate, 0.8, plan, 4) &&
          isBuildableTerrain(candidate, plan, 18, 0.5),
      });
      if (!sample) return null;
      placements.push({ sample, radius: 0.8 });
      const scale = round(0.86 + rng() * 0.22);
      const wanderPath: Vec3[] = [{ x: sample.x, y: 0, z: sample.z }];
      if (zone.behavior === "wander") {
        const maximumStep = Math.max(4.5, Math.min(zone.mask.radiusX, zone.mask.radiusZ) * 0.62);
        for (let waypointIndex = 0; waypointIndex < 3; waypointIndex += 1) {
          const previous = wanderPath.at(-1)!;
          let waypoint: Sample | null = null;
          // Sample around the animal's current location instead of throwing
          // darts across the whole habitat ellipse. This produces a real,
          // locally connected walk even in large irregular worlds where only
          // one side of a grove may be clear of water or a settlement.
          for (let attempt = 0; attempt < 128 && !waypoint; attempt += 1) {
            const angle = rng() * TAU;
            const step = 1.1 + rng() * (maximumStep - 1.1);
            const candidate = {
              x: round(previous.x + Math.cos(angle) * step),
              z: round(previous.z + Math.sin(angle) * step),
            };
            const segmentIsValid = [0.25, 0.5, 0.75, 1].every((progress) => {
              const sampleAlongSegment = {
                x: previous.x + (candidate.x - previous.x) * progress,
                z: previous.z + (candidate.z - previous.z) * progress,
              };
              return (
                ellipseContains(habitatMask, sampleAlongSegment, 0.8) &&
                distanceToWater(sampleAlongSegment, plan) >= 3 &&
                clearsHamlets(sampleAlongSegment, 0.8, plan, 4) &&
                isBuildableTerrain(sampleAlongSegment, plan, 18, 0.8)
              );
            });
            if (segmentIsValid) waypoint = candidate;
          }
          if (!waypoint) break;
          wanderPath.push({ x: waypoint.x, y: 0, z: waypoint.z });
        }
      }
      return {
        id: `${zone.id}-actor-${index}`,
        zoneId: zone.id,
        habitatGroveId: zone.habitatGroveId,
        assetRole: zone.animal,
        behavior: zone.behavior,
        wanderPath,
        transform: {
          position: { x: sample.x, y: 0, z: sample.z },
          rotationY: round(rng() * TAU),
          scale: { x: scale, y: scale, z: scale },
        },
        terrain: terrainHint(plan, sample, 18, 0.8),
      };
    }).filter((animal): animal is PlannedWildlife => animal !== null);
  });
}

function createSemanticHitZones(plan: WorldPlan): ReadonlyArray<PlannedSemanticHitZone> {
  return plan.topology.semanticZones.map((zone) => ({
    id: zone.id,
    provinceId: zone.provinceId,
    entityIds: zone.entityIds,
    center: { x: zone.hitMask.center.x, y: 0, z: zone.hitMask.center.z },
    radiusX: zone.hitMask.radiusX,
    radiusZ: zone.hitMask.radiusZ,
    visible: false,
  }));
}

type PlannedScatterTopology = Omit<PlannedScatter, "appearance">;

const scatterTopologyCache = new Map<string, PlannedScatterTopology>();
const MAX_SCATTER_CACHE_ENTRIES = 12;

/** Clears memoized topology so tests can exercise fresh deterministic generation. */
export function clearPlannedScatterTopologyCacheForTests(): void {
  scatterTopologyCache.clear();
}

function scatterCacheKey(world: KingdomWorld, plan: WorldPlan): string {
  return `${world.source.repositoryId}:${world.source.commitSha}:${plan.topologyKey}`;
}

function createScatterTopology(world: KingdomWorld, plan: WorldPlan): PlannedScatterTopology {
  const landmarkAnchors = createLandmarkAnchors(plan);
  const buildings = createBuildings(world, plan, landmarkAnchors);
  const landmarks = createLandmarks(plan, landmarkAnchors);
  const trees = createTrees(plan);
  const groundCoverClusters = createGroundCover(plan, trees);
  const ambient = createAmbientDetails(plan, trees, groundCoverClusters, [
    ...buildings,
    ...landmarks,
  ]);
  const treeCountsByGrove = new Map<string, number>();
  for (const tree of trees) {
    treeCountsByGrove.set(tree.groveId, (treeCountsByGrove.get(tree.groveId) ?? 0) + 1);
  }
  return {
    schema: "repo-planned-scatter/v1",
    topologyKey: `scatter-${plan.topologyKey}`,
    buildings,
    landmarks,
    trees,
    groundCoverClusters,
    ambientDetails: ambient.details,
    ambientRuntime: {
      targetInstances: ambient.targetInstances,
      emittedInstances: ambient.details.length,
      omittedMicroclusterIds: ambient.omittedMicroclusterIds,
    },
    groveRuntimeCapacities: plan.topology.groves.map((grove) => ({
      groveId: grove.id,
      semanticSuggestedMaxTrees: grove.maxTrees,
      runtimeMaxTrees: treeCountsByGrove.get(grove.id) ?? 0,
    })),
    wildlife: createWildlife(plan, trees),
    semanticHitZones: createSemanticHitZones(plan),
  };
}

/** Pure, deterministic translation from semantic plan to renderer-ready instances. */
export function createPlannedScatter(world: KingdomWorld, plan: WorldPlan): PlannedScatter {
  if (
    plan.repository.id !== world.source.repositoryId ||
    plan.repository.commitSha !== world.source.commitSha
  ) {
    throw new Error("World and plan must describe the same immutable repository revision.");
  }
  const cacheKey = scatterCacheKey(world, plan);
  let topology = scatterTopologyCache.get(cacheKey);
  if (!topology) {
    topology = createScatterTopology(world, plan);
    if (scatterTopologyCache.size >= MAX_SCATTER_CACHE_ENTRIES) {
      const oldestKey = scatterTopologyCache.keys().next().value;
      if (oldestKey !== undefined) scatterTopologyCache.delete(oldestKey);
    }
    scatterTopologyCache.set(cacheKey, topology);
  }
  return {
    ...topology,
    appearance: {
      season: plan.appearance.season,
      foliageColors: [...plan.appearance.foliage.broadleaf, ...plan.appearance.foliage.pine],
      floweringColors: plan.appearance.foliage.flowering,
      leafCoverage: plan.appearance.foliage.leafCoverage,
      snowCoverage: plan.appearance.foliage.snowCoverage,
    },
  };
}
