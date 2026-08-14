import type { KingdomEntity, KingdomSeason, KingdomWorld, Vec3 } from "@/lib/kingdom/types";
import {
  interpolateRepositoryComposition,
  interpolateRepositoryCompositionInteger,
} from "@/lib/kingdom/repository-scale";
import type {
  CorridorRegionMask,
  EllipseRegionMask,
  GrovePalette,
  LandmarkRole,
  WildlifeRole,
  WorldPlan,
} from "@/lib/kingdom/world-plan";

import {
  classifyPlannedTerrainRegion,
  getHamletArchitecturePlacementMask,
  getHamletVisualPlacementMask,
  getPlannedTerrainDefinition,
  queryPlannedWaterDistance,
  samplePlannedTerrainHeight,
} from "./planned-terrain-model";
import {
  createRepositoryArchitecturePlan,
  type RepositoryArchitectureStructureInput,
  type RepositoryArchitectureStructurePlan,
} from "./repo-architecture-plan";

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
  arrangement: "courtyard" | "lane" | "garden";
  architecture: RepositoryArchitectureStructurePlan;
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
  architecture: RepositoryArchitectureStructurePlan;
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
  woodlandRole: "dominant" | "satellite";
  densityRole: "core" | "edge";
  footprintRadius: number;
  transform: ScatterTransform;
  terrain: TerrainPlacementHint;
}>;

export type PlannedCanopyClearing = Readonly<{
  id: string;
  groveId: string;
  woodlandRole: "dominant";
  center: Vec3;
  radius: number;
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

export type PlannedLandmarkRuntimeSummary = Readonly<{
  targetInstances: number;
  emittedInstances: number;
  omittedLandmarkIds: ReadonlyArray<string>;
}>;

export type PlannedScatter = Readonly<{
  schema: "repo-planned-scatter/v1";
  topologyKey: string;
  buildings: ReadonlyArray<PlannedBuilding>;
  landmarks: ReadonlyArray<PlannedLandmark>;
  landmarkRuntime: PlannedLandmarkRuntimeSummary;
  trees: ReadonlyArray<PlannedTree>;
  canopyClearings: ReadonlyArray<PlannedCanopyClearing>;
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
  return queryPlannedWaterDistance(plan, sample.x, sample.z).shoreDistance;
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

function hamletPlacementMask(
  plan: WorldPlan,
  hamlet: WorldPlan["topology"]["hamlets"][number],
): EllipseRegionMask {
  return getHamletArchitecturePlacementMask(plan, hamlet);
}

type LandmarkPlacementSeed = Readonly<{
  landmark: WorldPlan["topology"]["landmarks"][number];
  hamletId: string;
  scale: number;
  scaleY: number;
}>;

type LandmarkPlacementSpec = LandmarkPlacementSeed &
  Readonly<{
    architecture: RepositoryArchitectureStructurePlan;
    footprintRadius: number;
  }>;

type LandmarkAnchor = Readonly<{
  spec: LandmarkPlacementSpec;
  sample: Sample;
  footprintRadius: number;
}>;

type LandmarkAnchorRuntime = Readonly<{
  anchors: ReadonlyArray<LandmarkAnchor>;
  omittedLandmarkIds: ReadonlyArray<string>;
}>;

type BuildingPlacementSeed = Readonly<{
  id: string;
  originalIndex: number;
  entityId: string | null;
  assetRole: PlannedBuilding["assetRole"];
  scale: number;
  scaleY: number;
}>;

export const REPOSITORY_BUILDING_MAGNITUDE_SCALE = Object.freeze({
  minimum: 0.78,
  neutral: 1,
  maximum: 1.35,
});

type RepositoryMagnitudeDomain = Readonly<{
  minimum: number;
  maximum: number;
  signal: "compiled-height" | "file-size";
}>;

type RepositoryMagnitudeProfile = Readonly<{
  direct: RepositoryMagnitudeDomain | null;
  aggregate: RepositoryMagnitudeDomain | null;
}>;

function quantile(values: ReadonlyArray<number>, fraction: number): number {
  if (values.length === 0) return 0;
  const position = (values.length - 1) * fraction;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = values[lowerIndex]!;
  const upper = values[upperIndex]!;
  return lower + (upper - lower) * (position - lowerIndex);
}

function magnitudeDomain(entities: ReadonlyArray<KingdomEntity>): RepositoryMagnitudeDomain | null {
  if (entities.length === 0) return null;
  const compiledHeights = entities.map((entity) => entity.scale.y).sort((a, b) => a - b);
  const heightMinimum = quantile(compiledHeights, 0.1);
  const heightMaximum = quantile(compiledHeights, 0.9);
  const useCompiledHeight = heightMaximum - heightMinimum >= 0.05;
  const values = useCompiledHeight
    ? compiledHeights
    : entities.map((entity) => Math.log2(entity.size + 1)).sort((a, b) => a - b);
  return {
    minimum: quantile(values, 0.1),
    maximum: quantile(values, 0.9),
    signal: useCompiledHeight ? "compiled-height" : "file-size",
  };
}

function createRepositoryMagnitudeProfile(
  entities: ReadonlyArray<KingdomEntity>,
): RepositoryMagnitudeProfile {
  return {
    direct: magnitudeDomain(entities.filter((entity) => !entity.aggregate)),
    aggregate: magnitudeDomain(entities.filter((entity) => entity.aggregate)),
  };
}

/**
 * Converts compiler-owned file magnitude into a small, monotonic architecture
 * scale. Direct files and aggregates use separate robust domains so a huge
 * aggregate cannot flatten all explicit files to the same visible height.
 */
function repositoryBuildingMagnitudeScale(
  entity: KingdomEntity | undefined,
  profile: RepositoryMagnitudeProfile,
): number {
  if (!entity) return REPOSITORY_BUILDING_MAGNITUDE_SCALE.neutral;
  const domain = entity.aggregate ? profile.aggregate : profile.direct;
  if (!domain || domain.maximum - domain.minimum < 0.000_001) {
    return REPOSITORY_BUILDING_MAGNITUDE_SCALE.neutral;
  }
  const signal = domain.signal === "compiled-height" ? entity.scale.y : Math.log2(entity.size + 1);
  const normalized = Math.max(
    0,
    Math.min(1, (signal - domain.minimum) / (domain.maximum - domain.minimum)),
  );
  const eased = normalized * normalized * (3 - 2 * normalized);
  return round(
    REPOSITORY_BUILDING_MAGNITUDE_SCALE.minimum +
      eased *
        (REPOSITORY_BUILDING_MAGNITUDE_SCALE.maximum - REPOSITORY_BUILDING_MAGNITUDE_SCALE.minimum),
  );
}

type BuildingPlacementSpec = BuildingPlacementSeed &
  Readonly<{
    architecture: RepositoryArchitectureStructurePlan;
    footprintRadius: number;
  }>;

type HamletBuildingPlacementSeed = Readonly<{
  hamlet: WorldPlan["topology"]["hamlets"][number];
  placementMask: EllipseRegionMask;
  count: number;
  rng: () => number;
  useCompoundTemplates: boolean;
  arrangement: PlannedBuilding["arrangement"];
  heading: number;
  specs: ReadonlyArray<BuildingPlacementSeed>;
}>;

function createLandmarkPlacementSeeds(plan: WorldPlan): ReadonlyArray<LandmarkPlacementSeed> {
  return plan.topology.landmarks.flatMap((landmark, index) => {
    const associatedHamlet = plan.topology.hamlets[index % plan.topology.hamlets.length];
    if (!associatedHamlet) return [];
    const scale = round(0.9 + landmark.prominence * 0.35);
    return [{ landmark, hamletId: associatedHamlet.id, scale, scaleY: round(scale * 1.08) }];
  });
}

function createBuildingPlacementSeeds(
  world: KingdomWorld,
  plan: WorldPlan,
  landmarkHamletIds: ReadonlySet<string>,
): ReadonlyArray<HamletBuildingPlacementSeed> {
  const entities = new Map(world.entities.map((entity) => [entity.id, entity]));
  const magnitudeProfile = createRepositoryMagnitudeProfile(world.entities);
  return plan.topology.hamlets.map((hamlet) => {
    const placementMask = hamletPlacementMask(plan, hamlet);
    const count = hamlet.maxBuildings;
    const rng = random(`${plan.placementKey}:${hamlet.id}:buildings`);
    const hasLandmark = landmarkHamletIds.has(hamlet.id);
    const useCompoundTemplates = plan.composition.compoundSettlements;
    const arrangement: PlannedBuilding["arrangement"] = useCompoundTemplates
      ? /maker|crossroads/.test(hamlet.role)
        ? "lane"
        : /garden|archive/.test(hamlet.role)
          ? "garden"
          : hasLandmark
            ? "courtyard"
            : hash(hamlet.id) % 2 === 0
              ? "courtyard"
              : "lane"
      : hasLandmark
        ? "courtyard"
        : hash(hamlet.id) % 2 === 0
          ? "courtyard"
          : "lane";
    const heading = useCompoundTemplates
      ? Math.atan2(
          plan.topology.envelope.center.x - placementMask.center.x,
          plan.topology.envelope.center.z - placementMask.center.z,
        ) +
        (rng() - 0.5) * 0.36
      : 0;
    const specs = Array.from({ length: count }, (_, index): BuildingPlacementSeed => {
      const entityId =
        hamlet.buildingEntityIds[index % Math.max(1, hamlet.buildingEntityIds.length)] ?? null;
      const entity = entityId ? entities.get(entityId) : undefined;
      const assetRole = assetRoleForBuilding(entity, index);
      const scale = round(0.94 + rng() * 0.12);
      const scaleY = repositoryBuildingMagnitudeScale(entity, magnitudeProfile);
      return {
        id: `${hamlet.id}-building-${index}`,
        originalIndex: index,
        entityId,
        assetRole,
        scale,
        scaleY,
      };
    });
    return {
      hamlet,
      placementMask,
      count,
      rng,
      useCompoundTemplates,
      arrangement,
      heading,
      specs,
    };
  });
}

function architectureInputs(
  buildingSeeds: ReadonlyArray<HamletBuildingPlacementSeed>,
  landmarkSeeds: ReadonlyArray<LandmarkPlacementSeed>,
): ReadonlyArray<RepositoryArchitectureStructureInput> {
  return [
    ...buildingSeeds.flatMap(({ hamlet, arrangement, specs }) =>
      specs.map((spec) => ({
        id: spec.id,
        hamletId: hamlet.id,
        assetRole: spec.assetRole,
        arrangement,
        landmark: false,
        sourceHorizontalScale: spec.scale,
        sourceMagnitudeScale: spec.scaleY,
      })),
    ),
    ...landmarkSeeds.map(({ landmark, hamletId, scale, scaleY }) => ({
      id: landmark.id,
      hamletId,
      assetRole: landmark.role,
      arrangement: "landmark" as const,
      landmark: true,
      sourceHorizontalScale: scale,
      sourceMagnitudeScale: scaleY,
    })),
  ];
}

function architectureByStructureId(
  plans: ReadonlyArray<RepositoryArchitectureStructurePlan>,
): ReadonlyMap<string, RepositoryArchitectureStructurePlan> {
  return new Map(plans.map((plan) => [plan.structureId, plan]));
}

function requireArchitecture(
  plans: ReadonlyMap<string, RepositoryArchitectureStructurePlan>,
  structureId: string,
): RepositoryArchitectureStructurePlan {
  const architecture = plans.get(structureId);
  if (!architecture) throw new Error(`Missing architecture plan for ${structureId}.`);
  return architecture;
}

type HydratedHamletBuildingPlacement = Omit<HamletBuildingPlacementSeed, "specs"> &
  Readonly<{
    specs: ReadonlyArray<BuildingPlacementSpec>;
  }>;

function hydrateBuildingPlacements(
  seeds: ReadonlyArray<HamletBuildingPlacementSeed>,
  architectures: ReadonlyMap<string, RepositoryArchitectureStructurePlan>,
): ReadonlyArray<HydratedHamletBuildingPlacement> {
  return seeds.map((seed) => ({
    ...seed,
    specs: seed.specs
      .map((spec) => {
        const architecture = requireArchitecture(architectures, spec.id);
        return {
          ...spec,
          architecture,
          footprintRadius: architecture.footprintRadius,
        };
      })
      .sort(
        (first, second) =>
          second.footprintRadius - first.footprintRadius ||
          first.originalIndex - second.originalIndex,
      ),
  }));
}

function hydrateLandmarkPlacements(
  seeds: ReadonlyArray<LandmarkPlacementSeed>,
  architectures: ReadonlyMap<string, RepositoryArchitectureStructurePlan>,
): ReadonlyArray<LandmarkPlacementSpec> {
  return seeds.map((seed) => {
    const architecture = requireArchitecture(architectures, seed.landmark.id);
    return { ...seed, architecture, footprintRadius: architecture.footprintRadius };
  });
}

function deterministicJointBuildingPlacement(
  plan: WorldPlan,
  hamletId: string,
  mask: EllipseRegionMask,
  specs: ReadonlyArray<BuildingPlacementSpec>,
  fixedPlacements: ReadonlyArray<Placement>,
  maximumNodes = 80_000,
): ReadonlyMap<number, Sample> | null {
  const cosine = Math.cos(mask.rotation);
  const sine = Math.sin(mask.rotation);
  const phase = random(`${plan.placementKey}:${hamletId}:joint-packing`)() * TAU;
  const centralAnchor = [...fixedPlacements].sort(
    (first, second) => distance(first.sample, mask.center) - distance(second.sample, mask.center),
  )[0];
  const centralAnchorRadius = centralAnchor?.radius ?? 0;
  const packingCenter = centralAnchor?.sample ?? mask.center;
  const ringOrder = plan.composition.compoundSettlements
    ? ([0.88, 0.92, 0.84, 0.96, 0.8, 0.76, 0.98, 0.72] as const)
    : ([0.84, 0.9, 0.78, 0.96, 0.72, 0.66, 0.58] as const);
  const angularSteps = 32;
  const candidates = specs.map((spec) => {
    const result: Sample[] = [];
    const seen = new Set<string>();
    for (const ring of ringOrder) {
      for (let offsetIndex = 0; offsetIndex < angularSteps; offsetIndex += 1) {
        const signedOffset =
          offsetIndex === 0 ? 0 : Math.ceil(offsetIndex / 2) * (offsetIndex % 2 === 1 ? 1 : -1);
        const pairCount = Math.ceil(specs.length / 2);
        const unpairedLast = specs.length % 2 === 1 && spec.originalIndex === specs.length - 1;
        const partnerIndex =
          spec.originalIndex % 2 === 0 ? spec.originalIndex + 1 : spec.originalIndex - 1;
        const partner = specs.find((candidate) => candidate.originalIndex === partnerIndex);
        const ownAnchorDistance = centralAnchorRadius + spec.footprintRadius + 1.5;
        const partnerAnchorDistance = partner
          ? centralAnchorRadius + partner.footprintRadius + 1.5
          : ownAnchorDistance;
        const pairGap = partner ? spec.footprintRadius + partner.footprintRadius + 1.7 : 0;
        const pairAngle = partner
          ? Math.acos(
              Math.max(
                -1,
                Math.min(
                  1,
                  (ownAnchorDistance ** 2 + partnerAnchorDistance ** 2 - pairGap ** 2) /
                    (2 * ownAnchorDistance * partnerAnchorDistance),
                ),
              ),
            )
          : 0;
        const pairedSlot =
          (Math.floor(spec.originalIndex / 2) / Math.max(1, pairCount)) * TAU +
          (unpairedLast ? 0 : spec.originalIndex % 2 === 0 ? -pairAngle / 2 : pairAngle / 2);
        const angle =
          phase +
          (centralAnchorRadius > 0
            ? pairedSlot
            : (spec.originalIndex / Math.max(1, specs.length)) * TAU) +
          (signedOffset / angularSteps) * TAU;
        const anchoredRadius =
          centralAnchorRadius > 0
            ? centralAnchorRadius + spec.footprintRadius + 1.5 + Math.abs(ring - 0.88) * 5
            : null;
        const localX =
          Math.cos(angle) * (anchoredRadius ?? (mask.radiusX - spec.footprintRadius) * ring);
        const localZ =
          Math.sin(angle) * (anchoredRadius ?? (mask.radiusZ - spec.footprintRadius) * ring);
        const sample = {
          x: round(packingCenter.x + localX * cosine - localZ * sine),
          z: round(packingCenter.z + localX * sine + localZ * cosine),
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
  const search = (remainingSpecIndexes: ReadonlyArray<number>): boolean => {
    if (remainingSpecIndexes.length === 0) return true;
    if (visitedNodes >= maximumNodes) return false;
    const next = remainingSpecIndexes
      .map((specIndex) => ({
        specIndex,
        viable: candidates[specIndex]!.filter(
          (sample) => candidateScore(sample, placements, specs[specIndex]!.footprintRadius) >= 1.5,
        ),
      }))
      .sort(
        (first, second) =>
          first.viable.length - second.viable.length || first.specIndex - second.specIndex,
      )[0]!;
    if (next.viable.length === 0) return false;
    const spec = specs[next.specIndex]!;
    const nextRemaining = remainingSpecIndexes.filter((specIndex) => specIndex !== next.specIndex);
    for (const sample of next.viable) {
      visitedNodes += 1;
      placements.push({ sample, radius: spec.footprintRadius });
      selected.set(spec.originalIndex, sample);
      if (search(nextRemaining)) return true;
      selected.delete(spec.originalIndex);
      placements.pop();
      if (visitedNodes >= maximumNodes) break;
    }
    return false;
  };
  return search(specs.map((_, index) => index)) ? selected : null;
}

function createLandmarkAnchors(
  plan: WorldPlan,
  specs: ReadonlyArray<LandmarkPlacementSpec>,
  hamletPlacements: ReadonlyArray<HydratedHamletBuildingPlacement>,
): LandmarkAnchorRuntime {
  const anchors: LandmarkAnchor[] = [];
  const omittedLandmarkIds: string[] = [];
  for (const spec of specs) {
    const { landmark, hamletId, footprintRadius } = spec;
    const associatedHamlet = plan.topology.hamlets.find((hamlet) => hamlet.id === hamletId);
    if (!associatedHamlet) throw new Error(`Missing landmark hamlet ${hamletId}.`);
    const placementMask = hamletPlacementMask(plan, associatedHamlet);
    const existing = anchors.map((anchor) => ({
      sample: anchor.sample,
      radius: anchor.footprintRadius,
    }));
    const center = placementMask.center;
    const hamletPlacement = hamletPlacements.find((placement) => placement.hamlet.id === hamletId);
    const anchorRng = random(`${plan.placementKey}:${landmark.id}:anchor`);
    const candidates = [
      center,
      ...Array.from({ length: 220 }, () => sampleEllipse(placementMask, anchorRng, [0, 0.48])),
    ];
    const seen = new Set<string>();
    const sample = candidates.find((candidate) => {
      const key = `${candidate.x}:${candidate.z}`;
      if (seen.has(key)) return false;
      seen.add(key);
      if (
        !ellipseContains(placementMask, candidate, footprintRadius) ||
        !isBuildableTerrain(candidate, plan, 6, footprintRadius) ||
        candidateScore(candidate, existing, footprintRadius) < 1.5
      ) {
        return false;
      }
      if (!hamletPlacement) return true;
      return (
        deterministicJointBuildingPlacement(
          plan,
          hamletId,
          placementMask,
          hamletPlacement.specs,
          [{ sample: candidate, radius: footprintRadius }],
          3_000,
        ) !== null
      );
    });
    if (!sample) {
      // Keep every terrain and packing gate strict. A planned landmark is a
      // degradable visual; repository semantics remain in the plan and hit zone.
      omittedLandmarkIds.push(landmark.id);
      continue;
    }
    anchors.push({ spec, sample, footprintRadius });
  }
  return {
    anchors,
    omittedLandmarkIds: omittedLandmarkIds.sort((first, second) => first.localeCompare(second)),
  };
}

function createBuildings(
  plan: WorldPlan,
  hamletPlacements: ReadonlyArray<HydratedHamletBuildingPlacement>,
  landmarkAnchors: ReadonlyArray<LandmarkAnchor>,
): ReadonlyArray<PlannedBuilding> {
  return hamletPlacements.flatMap(
    ({ hamlet, placementMask, count, rng, useCompoundTemplates, arrangement, heading, specs }) => {
      const satellite = hamlet.role === "commons-hamlet";
      const placements: Placement[] = landmarkAnchors
        .filter((anchor) => anchor.spec.hamletId === hamlet.id)
        .map((anchor) => ({ sample: anchor.sample, radius: anchor.footprintRadius }));
      const centralAnchorRadius = Math.max(0, ...placements.map((placement) => placement.radius));
      const maximumBuildingRadius = Math.max(...specs.map((spec) => spec.footprintRadius));
      const compoundAlong = Math.max(10.35, maximumBuildingRadius * 2 + 1.52);
      const compoundAcross = Math.max(5.05, maximumBuildingRadius + 0.72);
      if (centralAnchorRadius > 0) {
        const jointSamples = deterministicJointBuildingPlacement(
          plan,
          hamlet.id,
          placementMask,
          specs,
          placements,
        );
        if (!jointSamples) {
          throw new Error(`Unable to pack architecture-aware compound ${hamlet.id}.`);
        }
        const courtyardCenter = placements[0]!.sample;
        return specs.map((spec) => {
          const sample = jointSamples.get(spec.originalIndex)!;
          return {
            id: spec.id,
            hamletId: hamlet.id,
            provinceId: hamlet.provinceId,
            entityId: spec.entityId,
            assetRole: spec.assetRole,
            arrangement,
            architecture: spec.architecture,
            footprintRadius: spec.footprintRadius,
            transform: {
              position: { x: sample.x, y: 0, z: sample.z },
              rotationY: round(
                Math.atan2(courtyardCenter.x - sample.x, courtyardCenter.z - sample.z),
              ),
              scale: { x: spec.scale, y: spec.scaleY, z: spec.scale },
            },
            terrain: terrainHint(plan, sample, 8, spec.footprintRadius),
          };
        });
      }
      const greedyBuildings: PlannedBuilding[] = [];
      let failedSpec: BuildingPlacementSpec | null = null;
      for (const spec of specs) {
        const {
          id,
          originalIndex: index,
          entityId,
          assetRole,
          scale,
          scaleY,
          architecture,
          footprintRadius,
        } = spec;
        let sample: Sample;
        if (arrangement === "courtyard") {
          const angle = (index / count) * TAU + (rng() - 0.5) * (useCompoundTemplates ? 0.1 : 0.22);
          const courtyardRadius = Math.max(
            footprintRadius + 1,
            useCompoundTemplates
              ? Math.min(
                  Math.max(satellite ? 9.5 : 11.45, centralAnchorRadius + footprintRadius + 1.5),
                  Math.min(placementMask.radiusX, placementMask.radiusZ) - footprintRadius - 0.65,
                )
              : Math.min(placementMask.radiusX, placementMask.radiusZ) - footprintRadius - 0.65,
          );
          sample = {
            x: round(placementMask.center.x + Math.cos(angle) * courtyardRadius),
            z: round(placementMask.center.z + Math.sin(angle) * courtyardRadius),
          };
        } else if (arrangement === "lane") {
          const row = index % 2 === 0 ? -1 : 1;
          const laneIndex = Math.floor(index / 2) - (Math.ceil(count / 2) - 1) / 2;
          const laneHeading = useCompoundTemplates ? heading : (rng() - 0.5) * 0.35;
          const along =
            laneIndex * (useCompoundTemplates ? compoundAlong : footprintRadius * 2 + 1.5);
          const across = row * (useCompoundTemplates ? compoundAcross : footprintRadius + 0.75);
          sample = {
            x: round(
              placementMask.center.x +
                Math.cos(laneHeading) * along -
                Math.sin(laneHeading) * across,
            ),
            z: round(
              placementMask.center.z +
                Math.sin(laneHeading) * along +
                Math.cos(laneHeading) * across,
            ),
          };
        } else {
          const row = index % 2 === 0 ? -1 : 1;
          const column = Math.floor(index / 2) - (Math.ceil(count / 2) - 1) / 2;
          const along = column * compoundAlong;
          const across = row * (column === 0 ? compoundAcross + 4.3 : compoundAcross + 0.8);
          sample = {
            x: round(
              placementMask.center.x + Math.cos(heading) * along - Math.sin(heading) * across,
            ),
            z: round(
              placementMask.center.z + Math.sin(heading) * along + Math.cos(heading) * across,
            ),
          };
        }
        if (
          !ellipseContains(placementMask, sample, footprintRadius) ||
          candidateScore(sample, placements, footprintRadius) < 1.5 ||
          !isBuildableTerrain(sample, plan, 8, footprintRadius)
        ) {
          const accepts = (candidate: Sample) =>
            ellipseContains(placementMask, candidate, footprintRadius) &&
            isBuildableTerrain(candidate, plan, 8, footprintRadius) &&
            candidateScore(candidate, placements, footprintRadius) >= 1.5;
          const candidate =
            (useCompoundTemplates
              ? bestCandidate(
                  {
                    shape: "ellipse",
                    center: sample,
                    radiusX: footprintRadius + 3.8,
                    radiusZ: footprintRadius + 3.8,
                    rotation: heading,
                    feather: 1,
                  },
                  rng,
                  placements,
                  footprintRadius,
                  {
                    attempts: 180,
                    band: [0, 0.98],
                    accepts,
                  },
                )
              : null) ??
            bestCandidate(placementMask, rng, placements, footprintRadius, {
              attempts: 420,
              band: [0.34, 0.98],
              accepts,
            });
          if (!candidate) {
            failedSpec = spec;
            break;
          }
          sample = candidate;
        }
        placements.push({ sample, radius: footprintRadius });
        const rotationY = !useCompoundTemplates
          ? arrangement === "courtyard"
            ? Math.atan2(placementMask.center.x - sample.x, placementMask.center.z - sample.z)
            : (index % 2 === 0 ? 0 : Math.PI) + (rng() - 0.5) * 0.22
          : arrangement === "courtyard"
            ? Math.atan2(placementMask.center.x - sample.x, placementMask.center.z - sample.z)
            : arrangement === "lane"
              ? heading + (index % 2 === 0 ? Math.PI / 2 : -Math.PI / 2) + (rng() - 0.5) * 0.16
              : heading + Math.PI + (index % 2 === 0 ? -0.24 : 0.24) + (rng() - 0.5) * 0.12;
        // Preserve the original per-building PRNG cadence while scaleY comes
        // from its own stable seed and is therefore available before packing.
        rng();
        greedyBuildings.push({
          id,
          hamletId: hamlet.id,
          provinceId: hamlet.provinceId,
          entityId,
          assetRole,
          arrangement: useCompoundTemplates ? arrangement : "courtyard",
          architecture,
          footprintRadius,
          transform: {
            position: { x: sample.x, y: 0, z: sample.z },
            rotationY: round(rotationY),
            scale: { x: scale, y: scaleY, z: scale },
          },
          terrain: terrainHint(plan, sample, 8, footprintRadius),
        });
      }
      if (!failedSpec) return greedyBuildings;

      const fixedPlacements = landmarkAnchors
        .filter((anchor) => anchor.spec.hamletId === hamlet.id)
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
      return specs.map(
        ({
          id,
          originalIndex: index,
          entityId,
          assetRole,
          scale,
          scaleY,
          architecture,
          footprintRadius,
        }) => {
          const sample = jointSamples.get(index)!;
          const rotationY = Math.atan2(
            placementMask.center.x - sample.x,
            placementMask.center.z - sample.z,
          );
          return {
            id,
            hamletId: hamlet.id,
            provinceId: hamlet.provinceId,
            entityId,
            assetRole,
            arrangement,
            architecture,
            footprintRadius,
            transform: {
              position: { x: sample.x, y: 0, z: sample.z },
              rotationY: round(rotationY),
              scale: { x: scale, y: scaleY, z: scale },
            },
            terrain: terrainHint(plan, sample, 8, footprintRadius),
          };
        },
      );
    },
  );
}

function createLandmarks(
  plan: WorldPlan,
  anchors: ReadonlyArray<LandmarkAnchor>,
): ReadonlyArray<PlannedLandmark> {
  return anchors.map(({ spec, sample, footprintRadius }) => {
    const { landmark, hamletId, scale, scaleY, architecture } = spec;
    const rng = random(`${plan.placementKey}:${landmark.id}:landmark`);
    return {
      id: landmark.id,
      hamletId,
      provinceId: landmark.provinceId,
      entityId: landmark.entityId,
      assetRole: landmark.role,
      architecture,
      footprintRadius,
      transform: {
        position: { x: sample.x, y: 0, z: sample.z },
        rotationY: round(rng() * TAU),
        scale: { x: scale, y: scaleY, z: scale },
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
  woodlandRole: "dominant" | "satellite";
  clearing: PlannedCanopyClearing | null;
  target: number;
  runtimeCapacity: number;
}>;

function baseCanopyBudget(plan: WorldPlan): number {
  const total = plan.topology.visualBudgets.maxTrees;
  // Keep a bounded slice for the later edge-woodland enrichment pass. Dense
  // grove masses and dispersed forest belts are separate compositional jobs;
  // letting the first consume the whole budget erased the second on compact
  // repositories.
  const compactReserve = Math.min(48, Math.max(30, Math.round(total * 0.22)));
  const maximumReserve = Math.min(80, Math.max(62, Math.round(total * 0.34)));
  const enrichmentReserve = Math.round(
    interpolateRepositoryComposition(plan.topology.repositoryScale, compactReserve, maximumReserve),
  );
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

function validTreeConnection(start: Sample, end: Sample, plan: WorldPlan): boolean {
  const steps = Math.max(2, Math.ceil(distance(start, end) / 5.5));
  for (let step = 1; step < steps; step += 1) {
    const progress = step / steps;
    if (
      !validTreeCandidate(
        {
          x: round(start.x + (end.x - start.x) * progress),
          z: round(start.z + (end.z - start.z) * progress),
        },
        plan,
        1.2,
      )
    ) {
      return false;
    }
  }
  return true;
}

function farthestCandidatePair(
  component: ReadonlyArray<number>,
  candidates: ReadonlyArray<Readonly<{ sample: Sample }>>,
): readonly [number, number] {
  let pair: readonly [number, number] = [component[0]!, component[0]!];
  let span = -1;
  for (const [position, first] of component.entries()) {
    for (let next = position + 1; next < component.length; next += 1) {
      const second = component[next]!;
      const candidateSpan = distance(candidates[first]!.sample, candidates[second]!.sample);
      if (
        candidateSpan > span ||
        (candidateSpan === span &&
          hash(`woodland-span:${first}:${second}`) < hash(`woodland-span:${pair[0]}:${pair[1]}`))
      ) {
        span = candidateSpan;
        pair = [first, second];
      }
    }
  }
  return pair;
}

function candidatePath(
  component: ReadonlyArray<number>,
  start: number,
  end: number,
  candidates: ReadonlyArray<Readonly<{ sample: Sample }>>,
  plan: WorldPlan,
  maximumStep: number,
): ReadonlyArray<number> {
  const allowed = new Set(component);
  const pending = [start];
  const reached = new Set([start]);
  const previous = new Map<number, number>();
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (current === end) break;
    const neighbors = component
      .filter(
        (candidate) =>
          !reached.has(candidate) &&
          allowed.has(candidate) &&
          distance(candidates[current]!.sample, candidates[candidate]!.sample) <= maximumStep &&
          validTreeConnection(candidates[current]!.sample, candidates[candidate]!.sample, plan),
      )
      .sort(
        (first, second) =>
          distance(candidates[first]!.sample, candidates[end]!.sample) -
            distance(candidates[second]!.sample, candidates[end]!.sample) ||
          hash(`${plan.composition.key}:woodland-path:${first}`) -
            hash(`${plan.composition.key}:woodland-path:${second}`),
      );
    for (const neighbor of neighbors) {
      reached.add(neighbor);
      previous.set(neighbor, current);
      pending.push(neighbor);
    }
  }
  if (!reached.has(end)) return [start];
  const path = [end];
  while (path[0] !== start) path.unshift(previous.get(path[0]!)!);
  return path;
}

function spacedPathSelection(
  path: ReadonlyArray<number>,
  target: number,
  candidates: ReadonlyArray<Readonly<{ sample: Sample }>>,
  minimumSpacing: number,
): ReadonlyArray<number> {
  if (path.length <= target) return path;
  const cumulative = [0];
  for (let index = 1; index < path.length; index += 1) {
    cumulative.push(
      cumulative[index - 1]! +
        distance(candidates[path[index - 1]!]!.sample, candidates[path[index]!]!.sample),
    );
  }
  const total = cumulative.at(-1)!;
  const selected: number[] = [];
  for (let slot = 0; slot < target; slot += 1) {
    const desired = (slot / Math.max(1, target - 1)) * total;
    const candidate = [...path].sort((first, second) => {
      const firstIndex = path.indexOf(first);
      const secondIndex = path.indexOf(second);
      return (
        Math.abs(cumulative[firstIndex]! - desired) -
          Math.abs(cumulative[secondIndex]! - desired) || firstIndex - secondIndex
      );
    })[0]!;
    if (
      !selected.includes(candidate) &&
      selected.every(
        (existing) =>
          distance(candidates[existing]!.sample, candidates[candidate]!.sample) >= minimumSpacing,
      )
    ) {
      selected.push(candidate);
    }
  }
  if (!selected.includes(path.at(-1)!)) {
    const last = path.at(-1)!;
    const replace = selected.length - 1;
    if (
      replace >= 0 &&
      selected
        .slice(0, replace)
        .every(
          (existing) =>
            distance(candidates[existing]!.sample, candidates[last]!.sample) >= minimumSpacing,
        )
    ) {
      selected[replace] = last;
    }
  }
  return selected;
}

function findRuntimeGroves(plan: WorldPlan): ReadonlyArray<RuntimeGrove> {
  const desiredCount = Math.min(plan.topology.visualBudgets.maxGroves, plan.topology.groves.length);
  const groveScale = interpolateRepositoryComposition(plan.topology.repositoryScale, 1, 1.26);
  const connectedWoodland = plan.composition.connectedWoodland;
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
  let dominantGroveCount = 0;
  const minimumGroveSpacing = 22 * groveScale;
  if (connectedWoodland) {
    const maximumMassConnection = interpolateRepositoryComposition(
      plan.topology.repositoryScale,
      36,
      58,
    );
    const remaining = new Set(candidates.map((_, index) => index));
    const components: number[][] = [];
    while (remaining.size > 0) {
      const start = remaining.values().next().value!;
      remaining.delete(start);
      const pending = [start];
      const component: number[] = [];
      while (pending.length > 0) {
        const current = pending.pop()!;
        component.push(current);
        for (const candidateIndex of [...remaining]) {
          const step = distance(candidates[current]!.sample, candidates[candidateIndex]!.sample);
          if (
            step > maximumMassConnection ||
            !validTreeConnection(
              candidates[current]!.sample,
              candidates[candidateIndex]!.sample,
              plan,
            )
          ) {
            continue;
          }
          remaining.delete(candidateIndex);
          pending.push(candidateIndex);
        }
      }
      components.push(component);
    }
    components.sort(
      (first, second) =>
        second.length - first.length ||
        Math.min(...first.map((index) => candidates[index]!.score)) -
          Math.min(...second.map((index) => candidates[index]!.score)),
    );
    const dominantPool = components[0] ?? [];
    const dominantTarget = Math.min(Math.max(3, Math.ceil(desiredCount * 0.62)), desiredCount - 2);
    const mainTarget = Math.min(dominantTarget, dominantPool.length);
    const [pathStart, pathEnd] = farthestCandidatePair(dominantPool, candidates);
    const dominantPath = candidatePath(
      dominantPool,
      pathStart,
      pathEnd,
      candidates,
      plan,
      maximumMassConnection,
    );
    const dominantIndices = [
      ...spacedPathSelection(dominantPath, mainTarget, candidates, minimumGroveSpacing * 0.82),
    ];

    const mainCenter = {
      x:
        dominantIndices.reduce((total, index) => total + candidates[index]!.sample.x, 0) /
        Math.max(1, dominantIndices.length),
      z:
        dominantIndices.reduce((total, index) => total + candidates[index]!.sample.z, 0) /
        Math.max(1, dominantIndices.length),
    };
    const side = Math.sign(mainCenter.x - envelope.center.x) || 1;
    const extensionScore = (index: number): number => {
      const first = candidates[dominantIndices[0]!]!.sample;
      const last = candidates[dominantIndices.at(-1)!]!.sample;
      const scoreFromEndpoint = (endpoint: Sample, other: Sample) => {
        const axisX = endpoint.x - other.x;
        const axisZ = endpoint.z - other.z;
        const axisLength = Math.max(1, Math.hypot(axisX, axisZ));
        const deltaX = candidates[index]!.sample.x - endpoint.x;
        const deltaZ = candidates[index]!.sample.z - endpoint.z;
        const projection = (deltaX * axisX + deltaZ * axisZ) / axisLength;
        const perpendicular = Math.abs(deltaX * axisZ - deltaZ * axisX) / axisLength;
        return projection - perpendicular * 0.72;
      };
      return Math.max(scoreFromEndpoint(first, last), scoreFromEndpoint(last, first));
    };
    const extensionComponents = components.slice(1).map((component, componentIndex) => ({
      component,
      componentIndex: componentIndex + 1,
      sameSide: component.filter(
        (index) =>
          Math.sign(candidates[index]!.sample.x - envelope.center.x) === side ||
          Math.abs(candidates[index]!.sample.x - envelope.center.x) <= envelope.width * 0.08,
      ),
    }));
    const hasSameSideExtension = extensionComponents.some(({ sameSide }) => sameSide.length > 0);
    const extension = extensionComponents
      .filter(({ sameSide }) => !hasSameSideExtension || sameSide.length > 0)
      .map(({ component, componentIndex, sameSide }) => {
        const pool = sameSide.length > 0 ? sameSide : component;
        const index = [...pool].sort((first, second) => {
          const firstScore = extensionScore(first);
          const secondScore = extensionScore(second);
          return (
            secondScore - firstScore ||
            candidates[first]!.score - candidates[second]!.score ||
            first - second
          );
        })[0]!;
        return {
          componentIndex,
          index,
          continuation: extensionScore(index),
          span: Math.max(
            ...dominantIndices.map((main) =>
              distance(candidates[index]!.sample, candidates[main]!.sample),
            ),
          ),
        };
      })
      .sort(
        (first, second) =>
          second.continuation - first.continuation ||
          second.span - first.span ||
          first.componentIndex - second.componentIndex ||
          first.index - second.index,
      )[0];

    let extensionComponentIndex = -1;
    if (extension && dominantIndices.length < dominantTarget) {
      extensionComponentIndex = extension.componentIndex;
      if (
        distance(candidates[dominantIndices[0]!]!.sample, candidates[extension.index]!.sample) <
        distance(candidates[dominantIndices.at(-1)!]!.sample, candidates[extension.index]!.sample)
      ) {
        dominantIndices.reverse();
      }
      dominantIndices.push(extension.index);
    }
    dominantGroveCount = dominantIndices.length;
    chosen.push(...dominantIndices.map((index) => candidates[index]!.sample));

    const satelliteComponents = components
      .map((component, componentIndex) => ({ component, componentIndex }))
      .filter(
        ({ componentIndex }) => componentIndex !== 0 && componentIndex !== extensionComponentIndex,
      );
    for (const { component } of satelliteComponents) {
      if (chosen.length >= desiredCount) break;
      const index = [...component].sort((first, second) => {
        const firstDistance = Math.min(
          ...chosen.map((center) => distance(center, candidates[first]!.sample)),
        );
        const secondDistance = Math.min(
          ...chosen.map((center) => distance(center, candidates[second]!.sample)),
        );
        return (
          secondDistance - firstDistance ||
          candidates[first]!.score - candidates[second]!.score ||
          first - second
        );
      })[0]!;
      const sample = candidates[index]!.sample;
      if (chosen.every((center) => distance(center, sample) >= 58)) chosen.push(sample);
    }
  }
  while (chosen.length < desiredCount) {
    const next = candidates
      .filter((candidate) =>
        chosen.every((center) => distance(center, candidate.sample) >= minimumGroveSpacing),
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
  if (!connectedWoodland) dominantGroveCount = chosen.length;

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
  const satelliteCount = Math.max(0, chosen.length - dominantGroveCount);
  const satelliteBudget =
    connectedWoodland && satelliteCount > 0
      ? Math.round(
          primaryBudget *
            interpolateRepositoryComposition(plan.topology.repositoryScale, 0.22, 0.31),
        )
      : 0;
  const dominantBudget = primaryBudget - satelliteBudget;
  const clearingIndices = new Set(
    connectedWoodland && dominantGroveCount >= 3
      ? [0, Math.floor((dominantGroveCount - 1) / 2), dominantGroveCount - 1]
      : [],
  );
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
    const woodlandRole = index < dominantGroveCount ? "dominant" : "satellite";
    const rearDensityBoost =
      center.z <= envelope.center.z - envelope.depth * 0.08 ||
      Math.abs(center.x - envelope.center.x) >= envelope.width * 0.28
        ? 2
        : 0;
    const roleIndex = woodlandRole === "dominant" ? index : index - dominantGroveCount;
    const roleCount = woodlandRole === "dominant" ? dominantGroveCount : satelliteCount;
    const roleBudget = woodlandRole === "dominant" ? dominantBudget : satelliteBudget;
    const runtimeCapacity = connectedWoodland
      ? Math.min(
          30,
          Math.floor(roleBudget / Math.max(1, roleCount)) +
            (roleIndex < roleBudget % Math.max(1, roleCount) ? 1 : 0),
        )
      : Math.min(
          30,
          baseRuntimeCapacity + (index < extraRuntimeCapacity ? 1 : 0) + rearDensityBoost,
        );
    const previous = index > 0 && index < dominantGroveCount ? chosen[index - 1] : null;
    const next = index + 1 < dominantGroveCount ? chosen[index + 1] : null;
    const tangent =
      woodlandRole === "dominant" && (previous || next)
        ? Math.atan2(
            (next ?? center).z - (previous ?? center).z,
            (next ?? center).x - (previous ?? center).x,
          )
        : (rng() - 0.5) * 0.8;
    const mask: EllipseRegionMask = {
      shape: "ellipse",
      center,
      radiusX:
        woodlandRole === "dominant"
          ? round(20.5 + rng() * 4.5)
          : round((12.5 + rng() * 3.2) * groveScale),
      radiusZ:
        woodlandRole === "dominant"
          ? round(7.5 + rng() * 2.8)
          : round((10.5 + rng() * 3.4) * groveScale),
      rotation: round(tangent + (rng() - 0.5) * (woodlandRole === "dominant" ? 0.24 : 0.8)),
      feather: 3.5,
    };
    const clearingRng = random(
      connectedWoodland
        ? `${plan.placementKey}:runtime-grove-clearing:${index}`
        : `${plan.placementKey}:${semantic!.id}:trees`,
    );
    const legacyClearingAngle = clearingRng() * TAU;
    const clearingRadius = connectedWoodland
      ? round(5.2 + clearingRng() * 2.6)
      : round(Math.min(mask.radiusX, mask.radiusZ) * 0.22);
    const clearingOffset = (clearingRng() - 0.5) * mask.radiusX * 0.24;
    const shouldClear = connectedWoodland
      ? clearingIndices.has(index)
      : woodlandRole === "dominant";
    const clearingCenter = (() => {
      if (!connectedWoodland) {
        return {
          x: round(mask.center.x + Math.cos(legacyClearingAngle) * mask.radiusX * 0.18),
          y: 0,
          z: round(mask.center.z + Math.sin(legacyClearingAngle) * mask.radiusZ * 0.18),
        };
      }
      const maximumOffset = Math.max(0, mask.radiusX - clearingRadius - 1.5);
      const offsets = [
        0,
        ...[-0.72, -0.48, -0.24, 0, 0.24, 0.48, 0.72].map((fraction) =>
          Math.max(
            -maximumOffset,
            Math.min(maximumOffset, clearingOffset + maximumOffset * fraction),
          ),
        ),
      ];
      const candidates = offsets.map((offset) => {
        const center = {
          x: round(mask.center.x + Math.cos(mask.rotation) * offset),
          y: 0,
          z: round(mask.center.z + Math.sin(mask.rotation) * offset),
        };
        const region = classifyPlannedTerrainRegion(plan, center.x, center.z);
        const waterMargin = distanceToWater(center, plan) - clearingRadius - 4.5;
        const pathMargin = distanceToSettlementPaths(center, plan) - clearingRadius - 3.5;
        return {
          center,
          safe:
            region.inside &&
            region.water === null &&
            region.material !== "shore" &&
            region.material !== "outside" &&
            region.slopeDegrees <= 28 &&
            waterMargin >= 0 &&
            pathMargin >= 0,
          score: Math.min(waterMargin, pathMargin),
        };
      });
      return candidates.sort(
        (first, second) => Number(second.safe) - Number(first.safe) || second.score - first.score,
      )[0]!.center;
    })();
    const clearing = shouldClear
      ? {
          id: `${semantic!.id}-clearing`,
          groveId: semantic!.id,
          woodlandRole: "dominant" as const,
          center: clearingCenter,
          radius: clearingRadius,
        }
      : null;
    return {
      id: semantic!.id,
      sourceGroveId: semantic!.id,
      mask,
      palette: palettes[index % palettes.length]!,
      woodlandRole,
      clearing,
      target: connectedWoodland
        ? runtimeCapacity
        : Math.max(
            12,
            Math.min(
              runtimeCapacity,
              interpolateRepositoryCompositionInteger(plan.topology.repositoryScale, 17, 27) +
                rearDensityBoost +
                (hash(`${plan.placementKey}:runtime-grove-count:${index}`) % 5),
            ),
          ),
      runtimeCapacity,
    };
  });
}

type PlannedCanopy = Readonly<{
  trees: ReadonlyArray<PlannedTree>;
  clearings: ReadonlyArray<PlannedCanopyClearing>;
}>;

function createTrees(plan: WorldPlan): PlannedCanopy {
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
    for (let index = 0; index < target; index += 1) {
      const footprintRadius = round(0.64 + rng() * 0.2);
      const sample = bestCandidate(grove.mask, rng, placements, footprintRadius, {
        attempts: interpolateRepositoryCompositionInteger(plan.topology.repositoryScale, 72, 144),
        accepts: (candidate) =>
          (grove.clearing === null ||
            distance(candidate, grove.clearing.center) >=
              grove.clearing.radius + footprintRadius) &&
          validTreeCandidate(candidate, plan, footprintRadius),
      });
      if (!sample || candidateScore(sample, placements, footprintRadius) < 0.18) continue;
      placements.push({ sample, radius: footprintRadius });
      globalPlacements.push({ sample, radius: footprintRadius });
      const role = roles[(index + groveIndex) % roles.length]!;
      const scale = round(0.82 + rng() * 0.52);
      const local = rotateIntoEllipse(sample, grove.mask);
      const normalizedRadius = Math.hypot(
        local.x / grove.mask.radiusX,
        local.z / grove.mask.radiusZ,
      );
      trees.push({
        id: `${grove.id}-tree-${index}`,
        groveId: grove.id,
        assetRole: role,
        paletteRole: grove.palette,
        placementRole: "grove-mass",
        woodlandRole: grove.woodlandRole,
        densityRole: normalizedRadius <= 0.64 ? "core" : "edge",
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
      woodlandRole: grove.woodlandRole,
      densityRole: "edge",
      footprintRadius,
      transform: {
        position: { x: sample.x, y: 0, z: sample.z },
        rotationY: round(rng() * TAU),
        scale: { x: scale, y: round(scale * (0.94 + rng() * 0.2)), z: scale },
      },
      terrain: terrainHint(plan, sample, 28, footprintRadius),
    });
  }
  return {
    trees,
    clearings: runtimeGroves.flatMap((grove) => (grove.clearing ? [grove.clearing] : [])),
  };
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
      const behavior: PlannedWildlife["behavior"] =
        plan.composition.connectedWoodland && zone.behavior !== "wander" && index === 0
          ? "wander"
          : zone.behavior;
      const wanderPath: Vec3[] = [{ x: sample.x, y: 0, z: sample.z }];
      if (behavior === "wander") {
        const maximumStep = Math.max(
          5.15,
          Math.min(8.5, Math.min(habitatMask.radiusX, habitatMask.radiusZ) * 0.64),
        );
        const minimumStep = Math.min(
          interpolateRepositoryComposition(plan.topology.repositoryScale, 2.4, 4.8),
          maximumStep * 0.88,
        );
        for (let waypointIndex = 0; waypointIndex < 3; waypointIndex += 1) {
          const previous = wanderPath.at(-1)!;
          let waypoint: Sample | null = null;
          // Sample around the animal's current location instead of throwing
          // darts across the whole habitat ellipse. This produces a real,
          // locally connected walk even in large irregular worlds where only
          // one side of a grove may be clear of water or a settlement.
          for (let attempt = 0; attempt < 128 && !waypoint; attempt += 1) {
            const angle = rng() * TAU;
            const step = minimumStep + rng() * Math.max(0.1, maximumStep - minimumStep);
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
        behavior,
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
  const landmarkSeeds = createLandmarkPlacementSeeds(plan);
  const buildingSeeds = createBuildingPlacementSeeds(
    world,
    plan,
    new Set(landmarkSeeds.map((seed) => seed.hamletId)),
  );
  const architectures = architectureByStructureId(
    createRepositoryArchitecturePlan(plan, architectureInputs(buildingSeeds, landmarkSeeds)),
  );
  const landmarkPlacements = hydrateLandmarkPlacements(landmarkSeeds, architectures);
  const buildingPlacements = hydrateBuildingPlacements(buildingSeeds, architectures);
  const landmarkAnchorRuntime = createLandmarkAnchors(plan, landmarkPlacements, buildingPlacements);
  const landmarkAnchors = landmarkAnchorRuntime.anchors;
  const buildings = createBuildings(plan, buildingPlacements, landmarkAnchors);
  const landmarks = createLandmarks(plan, landmarkAnchors);
  const canopy = createTrees(plan);
  const trees = canopy.trees;
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
    landmarkRuntime: {
      targetInstances: plan.topology.landmarks.length,
      emittedInstances: landmarks.length,
      omittedLandmarkIds: landmarkAnchorRuntime.omittedLandmarkIds,
    },
    trees,
    canopyClearings: canopy.clearings,
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
