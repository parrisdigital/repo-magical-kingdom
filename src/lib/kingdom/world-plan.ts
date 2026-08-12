import { stableDigest, stableFraction, stableHash } from "./hash";
import type { FileCategory, KingdomEntity, KingdomSeason, KingdomWorld, Province } from "./types";

export type WorldPlanPoint = Readonly<{ x: number; z: number }>;

export type WorldPlanEnvelope = Readonly<{
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  center: WorldPlanPoint;
  safeMargin: number;
}>;

export type EllipseRegionMask = Readonly<{
  shape: "ellipse";
  center: WorldPlanPoint;
  radiusX: number;
  radiusZ: number;
  rotation: number;
  feather: number;
}>;

export type CorridorRegionMask = Readonly<{
  shape: "corridor";
  points: ReadonlyArray<WorldPlanPoint>;
  width: number;
  feather: number;
}>;

export type PolygonRegionMask = Readonly<{
  shape: "polygon";
  points: ReadonlyArray<WorldPlanPoint>;
  feather: number;
}>;

export type WorldRegionMask = EllipseRegionMask | CorridorRegionMask | PolygonRegionMask;

export type TerrainZoneKind =
  "lowland" | "meadow" | "rear-escarpment" | "watershed" | "lake" | "shore";

export type TerrainZone = Readonly<{
  id: string;
  kind: TerrainZoneKind;
  mask: WorldRegionMask;
  priority: number;
  elevation: Readonly<{
    base: number;
    relief: number;
    roughness: number;
  }>;
  subtractZoneIds: ReadonlyArray<string>;
}>;

export type HamletRole =
  | "crown-hamlet"
  | "makers-hamlet"
  | "archive-hamlet"
  | "wardens-hamlet"
  | "observatory-hamlet"
  | "garden-hamlet"
  | "crossroads-hamlet"
  | "commons-hamlet";

export type HamletRegion = Readonly<{
  id: string;
  provinceId: string;
  label: string;
  role: HamletRole;
  category: FileCategory;
  mask: EllipseRegionMask;
  maxBuildings: number;
  buildingEntityIds: ReadonlyArray<string>;
  representedFiles: number;
}>;

export type GrovePalette = "broadleaf" | "pine" | "twisted" | "mixed" | "flowering";

export type ForestGroveRegion = Readonly<{
  id: string;
  mask: EllipseRegionMask;
  palette: GrovePalette;
  densityPerHundredSquareUnits: number;
  maxTrees: number;
  exclusions: Readonly<{
    terrainZoneIds: ReadonlyArray<string>;
    hamletIds: ReadonlyArray<string>;
    clearance: number;
  }>;
}>;

export type LandmarkRole =
  | "repository-crown"
  | "forge"
  | "archive"
  | "watchtower"
  | "observatory"
  | "garden-sanctum"
  | "waystone";

export type LandmarkSlot = Readonly<{
  id: string;
  hamletId: string | null;
  provinceId: string;
  entityId: string | null;
  role: LandmarkRole;
  position: WorldPlanPoint;
  footprintRadius: number;
  prominence: number;
}>;

export type ProvinceExpression =
  | "hamlet"
  | "forest"
  | "garden"
  | "shrine"
  | "rock-field"
  | "wildlife"
  | "landform"
  | "selectable-only";

export type ProvinceSemanticZone = Readonly<{
  id: string;
  provinceId: string;
  label: string;
  category: FileCategory;
  expression: ProvinceExpression;
  hitMask: EllipseRegionMask;
  hamletId: string | null;
  entityIds: ReadonlyArray<string>;
  representedFiles: number;
  assetRoles: ReadonlyArray<string>;
  rationale: string;
}>;

export type SemanticMappingPolicy = Readonly<{
  id: "repository-semantics/v1";
  rationale: string;
  buildingRule: string;
  traceabilityRule: string;
}>;

export type WildlifeRole = "deer" | "fox" | "stag";

export type WildlifeZone = Readonly<{
  id: string;
  habitatGroveId: string;
  mask: EllipseRegionMask;
  animal: WildlifeRole;
  behavior: "graze" | "wander" | "rest";
  maxActors: number;
  exclusions: Readonly<{
    terrainZoneIds: ReadonlyArray<string>;
    hamletIds: ReadonlyArray<string>;
  }>;
}>;

export type SurfaceConstraint = Readonly<{
  id: string;
  target: "hamlet" | "landmark" | "forest" | "wildlife";
  allowedTerrainZoneIds: ReadonlyArray<string>;
  excludedTerrainZoneIds: ReadonlyArray<string>;
  maxSlopeDegrees: number;
  elevationRange: Readonly<{ min: number; max: number }>;
  minimumClearance: number;
}>;

export type ScatterLayer = "forest-canopy" | "understory" | "meadow-detail" | "shore-rock";

export type ScatterConstraint = Readonly<{
  id: string;
  layer: ScatterLayer;
  regionIds: ReadonlyArray<string>;
  assetRoles: ReadonlyArray<string>;
  densityPerHundredSquareUnits: number;
  minSpacing: number;
  maxSlopeDegrees: number;
  maxInstances: number;
  excludedTerrainZoneIds: ReadonlyArray<string>;
  excludedHamletIds: ReadonlyArray<string>;
}>;

export type WorldVisualBudgets = Readonly<{
  maxTerrainZones: number;
  maxHamlets: number;
  maxBuildings: number;
  maxGroves: number;
  maxTrees: number;
  maxLandmarks: number;
  maxWildlifeActors: number;
  maxSurfaceScatter: number;
  maxDrawCalls: number;
  maxVisibleTriangles: number;
}>;

export type WorldCameraComposition = Readonly<{
  overview: Readonly<{
    position: Readonly<{ x: number; y: number; z: number }>;
    target: Readonly<{ x: number; y: number; z: number }>;
    fieldOfViewDegrees: number;
    near: number;
    far: number;
  }>;
  entry: Readonly<{
    position: Readonly<{ x: number; y: number; z: number }>;
    target: Readonly<{ x: number; y: number; z: number }>;
    fieldOfViewDegrees: number;
  }>;
  horizonZ: number;
}>;

export type WorldPlanTopology = Readonly<{
  envelope: WorldPlanEnvelope;
  camera: WorldCameraComposition;
  terrainZones: ReadonlyArray<TerrainZone>;
  hamlets: ReadonlyArray<HamletRegion>;
  groves: ReadonlyArray<ForestGroveRegion>;
  landmarks: ReadonlyArray<LandmarkSlot>;
  wildlifeZones: ReadonlyArray<WildlifeZone>;
  semanticMapping: SemanticMappingPolicy;
  semanticZones: ReadonlyArray<ProvinceSemanticZone>;
  surfaceConstraints: ReadonlyArray<SurfaceConstraint>;
  scatterConstraints: ReadonlyArray<ScatterConstraint>;
  visualBudgets: WorldVisualBudgets;
}>;

export type WorldPlanAppearance = Readonly<{
  season: KingdomSeason;
  terrain: Readonly<{
    lowland: string;
    meadow: string;
    escarpment: string;
    shore: string;
    water: string;
  }>;
  foliage: Readonly<{
    broadleaf: ReadonlyArray<string>;
    pine: ReadonlyArray<string>;
    flowering: ReadonlyArray<string>;
    trunk: string;
    leafCoverage: number;
    snowCoverage: number;
  }>;
  architecture: Readonly<{
    plasterTint: string;
    roofTint: string;
    timberTint: string;
    windowGlow: string;
  }>;
  atmosphere: Readonly<{
    sky: string;
    horizon: string;
    fog: string;
    sunlight: string;
    sunlightIntensity: number;
  }>;
}>;

export type WorldPlan = Readonly<{
  schema: "repo-world-plan/v1";
  version: "1.0.0";
  topologyKey: string;
  repository: Readonly<{
    id: number;
    owner: string;
    name: string;
    commitSha: string;
  }>;
  topology: WorldPlanTopology;
  appearance: WorldPlanAppearance;
}>;

type WaterSystem = Readonly<{
  course: CorridorRegionMask;
  lake: EllipseRegionMask;
  side: -1 | 1;
}>;

const WATER_ZONE_IDS = ["water-course", "water-lake"] as const;
const DEFAULT_SAFE_MARGIN = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function point(x: number, z: number): WorldPlanPoint {
  return { x: round(x), z: round(z) };
}

function distance(first: WorldPlanPoint, second: WorldPlanPoint): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function distanceToSegment(
  subject: WorldPlanPoint,
  start: WorldPlanPoint,
  end: WorldPlanPoint,
): number {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (lengthSquared === 0) return distance(subject, start);
  const projection = clamp(
    ((subject.x - start.x) * deltaX + (subject.z - start.z) * deltaZ) / lengthSquared,
    0,
    1,
  );
  return Math.hypot(
    subject.x - (start.x + projection * deltaX),
    subject.z - (start.z + projection * deltaZ),
  );
}

function distanceToCorridor(subject: WorldPlanPoint, corridor: CorridorRegionMask): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < corridor.points.length; index += 1) {
    minimum = Math.min(
      minimum,
      distanceToSegment(subject, corridor.points[index - 1]!, corridor.points[index]!),
    );
  }
  return minimum;
}

function categoryPriority(category: FileCategory): number {
  return {
    source: 6,
    test: 5,
    docs: 4,
    config: 3,
    asset: 2,
    other: 1,
  }[category];
}

function createEnvelope(world: KingdomWorld): WorldPlanEnvelope {
  let maximumAbsoluteX = 0;
  let minimumContentZ = 0;
  let maximumContentZ = 0;

  for (const province of world.provinces) {
    maximumAbsoluteX = Math.max(maximumAbsoluteX, Math.abs(province.position.x) + province.radius);
    minimumContentZ = Math.min(minimumContentZ, province.position.z - province.radius);
    maximumContentZ = Math.max(maximumContentZ, province.position.z + province.radius);
  }
  for (const entity of world.entities) {
    const radius = Math.max(entity.scale.x, entity.scale.z) / 2;
    maximumAbsoluteX = Math.max(maximumAbsoluteX, Math.abs(entity.position.x) + radius);
    minimumContentZ = Math.min(minimumContentZ, entity.position.z - radius);
    maximumContentZ = Math.max(maximumContentZ, entity.position.z + radius);
  }
  for (const route of world.routes) {
    maximumAbsoluteX = Math.max(maximumAbsoluteX, Math.abs(route.from.x), Math.abs(route.to.x));
    minimumContentZ = Math.min(minimumContentZ, route.from.z, route.to.z);
    maximumContentZ = Math.max(maximumContentZ, route.from.z, route.to.z);
  }
  for (const portal of world.portals) {
    maximumAbsoluteX = Math.max(maximumAbsoluteX, Math.abs(portal.position.x) + 8);
    minimumContentZ = Math.min(minimumContentZ, portal.position.z - 8);
    maximumContentZ = Math.max(maximumContentZ, portal.position.z + 8);
  }

  const halfWidth = Math.max(72, Math.ceil(maximumAbsoluteX + 44));
  let minZ = Math.min(-92, Math.floor(minimumContentZ - 38));
  const maxZ = Math.max(68, Math.ceil(maximumContentZ + 30));
  if (maxZ - minZ < 160) minZ = maxZ - 160;

  return {
    minX: -halfWidth,
    maxX: halfWidth,
    minZ,
    maxZ,
    width: halfWidth * 2,
    depth: maxZ - minZ,
    center: point(0, (minZ + maxZ) / 2),
    safeMargin: DEFAULT_SAFE_MARGIN,
  };
}

function hamletRole(province: Province, satellite: boolean): HamletRole {
  if (satellite) return "commons-hamlet";
  if (province.role === "nexus") return "crown-hamlet";
  return {
    source: "makers-hamlet",
    test: "wardens-hamlet",
    docs: "archive-hamlet",
    config: "observatory-hamlet",
    asset: "garden-hamlet",
    other: "crossroads-hamlet",
  }[province.dominantCategory] as HamletRole;
}

function orderEntities(entities: ReadonlyArray<KingdomEntity>): ReadonlyArray<KingdomEntity> {
  return [...entities].sort(
    (first, second) =>
      second.representedFiles - first.representedFiles ||
      second.size - first.size ||
      categoryPriority(second.category) - categoryPriority(first.category) ||
      first.id.localeCompare(second.id),
  );
}

function createHamlets(
  world: KingdomWorld,
  envelope: WorldPlanEnvelope,
): ReadonlyArray<HamletRegion> {
  const orderedProvinces = [...world.provinces].sort(
    (first, second) =>
      second.representedFiles - first.representedFiles ||
      second.representedBytes - first.representedBytes ||
      categoryPriority(second.dominantCategory) - categoryPriority(first.dominantCategory) ||
      first.id.localeCompare(second.id),
  );
  const directoryProvinces = orderedProvinces.filter((province) => province.role !== "nexus");
  const desiredCount = clamp(Math.ceil(Math.sqrt(Math.max(1, directoryProvinces.length))), 2, 4);
  const selected = directoryProvinces.slice(0, desiredCount);
  const fallbackProvince = selected[0] ?? orderedProvinces[0];
  if (!fallbackProvince) return [];

  const candidates = selected.map((province) => ({
    province,
    satellite: false,
    center: point(province.position.x, province.position.z),
  }));
  while (candidates.length < desiredCount) {
    const index = candidates.length;
    const side = index % 2 === 0 ? -1 : 1;
    const phase = stableFraction(`${world.seed}:satellite:${index}`) - 0.5;
    candidates.push({
      province: fallbackProvince,
      satellite: true,
      center: point(
        clamp(
          fallbackProvince.position.x + side * (30 + Math.abs(phase) * 8),
          envelope.minX + 18,
          envelope.maxX - 18,
        ),
        clamp(fallbackProvince.position.z - 8 + phase * 10, envelope.minZ + 18, envelope.maxZ - 18),
      ),
    });
  }

  const repeatedProvinceCounts = new Map<string, number>();
  for (const candidate of candidates) {
    repeatedProvinceCounts.set(
      candidate.province.id,
      (repeatedProvinceCounts.get(candidate.province.id) ?? 0) + 1,
    );
  }
  const repeatedProvinceIndex = new Map<string, number>();

  const largeRepositoryBuildingBonus =
    world.statistics.files < 128
      ? 0
      : Math.min(6, Math.floor(Math.log2(world.statistics.files / 128 + 1) * 2));
  const targetBuildingCount = Math.round(
    clamp(
      12 +
        Math.floor(Math.log2(Math.max(1, world.statistics.files)) / 2) +
        largeRepositoryBuildingBonus,
      candidates.length * 3,
      Math.min(24, candidates.length * 6),
    ),
  );
  let remainingBuildings = targetBuildingCount;

  return candidates.map((candidate, index) => {
    const nearestDistance = Math.min(
      ...candidates
        .filter((_, otherIndex) => otherIndex !== index)
        .map((other) => distance(candidate.center, other.center)),
    );
    const preferredRadius = candidate.satellite
      ? 7
      : clamp(candidate.province.radius * 0.72 + 2, 7, 15);
    const radius = round(Math.min(preferredRadius, (nearestDistance - 8) / 2));
    const allProvinceEntities = orderEntities(
      world.entities.filter((entity) => entity.provinceId === candidate.province.id),
    );
    const duplicateCount = repeatedProvinceCounts.get(candidate.province.id) ?? 1;
    const duplicateIndex = repeatedProvinceIndex.get(candidate.province.id) ?? 0;
    repeatedProvinceIndex.set(candidate.province.id, duplicateIndex + 1);
    const assignedEntities = allProvinceEntities.filter(
      (_, entityIndex) => entityIndex % duplicateCount === duplicateIndex,
    );
    const remainingHamlets = candidates.length - index;
    const maxBuildings = clamp(Math.ceil(remainingBuildings / remainingHamlets), 3, 6);
    remainingBuildings -= maxBuildings;
    const id = `hamlet-${stableDigest(`${world.seed}:${candidate.province.id}:${index}`).slice(0, 10)}`;

    return {
      id,
      provinceId: candidate.province.id,
      label: candidate.satellite ? `${candidate.province.label} Commons` : candidate.province.label,
      role: hamletRole(candidate.province, candidate.satellite),
      category: candidate.province.dominantCategory,
      mask: {
        shape: "ellipse",
        center: candidate.center,
        radiusX: radius,
        radiusZ: radius,
        rotation: 0,
        feather: 2.5,
      },
      maxBuildings,
      buildingEntityIds: assignedEntities.slice(0, maxBuildings).map((entity) => entity.id),
      representedFiles: candidate.satellite
        ? Math.floor(candidate.province.representedFiles / duplicateCount)
        : candidate.province.representedFiles,
    };
  });
}

function waterCandidate(
  world: KingdomWorld,
  envelope: WorldPlanEnvelope,
  ratio: number,
  waterWidth: number,
): WaterSystem {
  const side = Math.sign(ratio) as -1 | 1;
  const inset = envelope.safeMargin + waterWidth / 2 + 1;
  const baseX = clamp(envelope.width * ratio * 0.5, envelope.minX + inset, envelope.maxX - inset);
  const zRatios = [0.1, 0.32, 0.54, 0.76, 0.94];
  const points = zRatios.map((zRatio, index) => {
    const meander =
      (stableFraction(`${world.seed}:water:${ratio}:${index}`) - 0.5) * envelope.width * 0.055;
    return point(
      clamp(baseX + meander, envelope.minX + inset, envelope.maxX - inset),
      index === zRatios.length - 1
        ? envelope.maxZ - envelope.safeMargin
        : envelope.minZ + envelope.depth * zRatio,
    );
  });
  const course: CorridorRegionMask = {
    shape: "corridor",
    points,
    width: waterWidth,
    feather: 2.4,
  };
  const lakePoint = points[3]!;
  const radiusX = clamp(envelope.width * 0.075, 9, 14);
  const radiusZ = clamp(envelope.depth * 0.085, 11, 17);
  return {
    course,
    lake: {
      shape: "ellipse",
      center: point(
        clamp(
          lakePoint.x,
          envelope.minX + envelope.safeMargin + radiusX,
          envelope.maxX - envelope.safeMargin - radiusX,
        ),
        clamp(
          lakePoint.z,
          envelope.minZ + envelope.safeMargin + radiusZ,
          envelope.maxZ - envelope.safeMargin - radiusZ,
        ),
      ),
      radiusX: round(radiusX),
      radiusZ: round(radiusZ),
      rotation: 0,
      feather: 3.2,
    },
    side,
  };
}

function waterClearance(water: WaterSystem, hamlets: ReadonlyArray<HamletRegion>): number {
  return Math.min(
    ...hamlets.flatMap((hamlet) => {
      const hamletRadius = Math.max(hamlet.mask.radiusX, hamlet.mask.radiusZ);
      return [
        distanceToCorridor(hamlet.mask.center, water.course) -
          hamletRadius -
          water.course.width / 2,
        distance(hamlet.mask.center, water.lake.center) -
          hamletRadius -
          Math.max(water.lake.radiusX, water.lake.radiusZ),
      ];
    }),
  );
}

function createWaterSystem(
  world: KingdomWorld,
  envelope: WorldPlanEnvelope,
  hamlets: ReadonlyArray<HamletRegion>,
): WaterSystem {
  const waterWidth = round(clamp(envelope.width * 0.036, 5, 8));
  const candidates = [0.7, -0.7, 0.56, -0.56].map((ratio) =>
    waterCandidate(world, envelope, ratio, waterWidth),
  );
  return candidates.sort(
    (first, second) =>
      waterClearance(second, hamlets) - waterClearance(first, hamlets) || second.side - first.side,
  )[0]!;
}

function createTerrainZones(
  world: KingdomWorld,
  envelope: WorldPlanEnvelope,
  hamlets: ReadonlyArray<HamletRegion>,
): Readonly<{ zones: ReadonlyArray<TerrainZone>; water: WaterSystem }> {
  const water = createWaterSystem(world, envelope, hamlets);
  const inset = envelope.safeMargin * 0.65;
  const rearDepth = clamp(envelope.depth * 0.18, 24, 40);
  const rearFrontZ = Math.min(-18, envelope.minZ + inset + rearDepth);
  const meadowCenterX = -water.side * envelope.width * 0.12;
  const frontMeadowCenterX = -water.side * envelope.width * 0.18;

  const zones: ReadonlyArray<TerrainZone> = [
    {
      id: "terrain-lowland",
      kind: "lowland",
      mask: {
        shape: "polygon",
        points: [
          point(envelope.minX + inset, envelope.minZ + inset),
          point(envelope.maxX - inset, envelope.minZ + inset),
          point(envelope.maxX - inset, envelope.maxZ - inset),
          point(envelope.minX + inset, envelope.maxZ - inset),
        ],
        feather: 7,
      },
      priority: 0,
      elevation: { base: 0, relief: 2.8, roughness: 0.28 },
      subtractZoneIds: [],
    },
    {
      id: "terrain-meadow-mid",
      kind: "meadow",
      mask: {
        shape: "ellipse",
        center: point(meadowCenterX, envelope.minZ + envelope.depth * 0.49),
        radiusX: round(envelope.width * 0.24),
        radiusZ: round(envelope.depth * 0.2),
        rotation: 0,
        feather: 8,
      },
      priority: 1,
      elevation: { base: 0.4, relief: 1.4, roughness: 0.18 },
      subtractZoneIds: [...WATER_ZONE_IDS],
    },
    {
      id: "terrain-meadow-front",
      kind: "meadow",
      mask: {
        shape: "ellipse",
        center: point(frontMeadowCenterX, envelope.minZ + envelope.depth * 0.78),
        radiusX: round(envelope.width * 0.18),
        radiusZ: round(envelope.depth * 0.14),
        rotation: 0,
        feather: 7,
      },
      priority: 1,
      elevation: { base: 0.2, relief: 1.1, roughness: 0.14 },
      subtractZoneIds: [...WATER_ZONE_IDS],
    },
    {
      id: "terrain-rear-escarpment",
      kind: "rear-escarpment",
      mask: {
        shape: "polygon",
        points: [
          point(envelope.minX + inset, envelope.minZ + inset),
          point(envelope.maxX - inset, envelope.minZ + inset),
          point(envelope.maxX - inset, rearFrontZ),
          point(envelope.minX + inset, rearFrontZ),
        ],
        feather: 10,
      },
      priority: 2,
      elevation: { base: 15, relief: 24, roughness: 0.62 },
      subtractZoneIds: ["water-course"],
    },
    {
      id: "water-course",
      kind: "watershed",
      mask: water.course,
      priority: 5,
      elevation: { base: -1.5, relief: 0.35, roughness: 0.05 },
      subtractZoneIds: [],
    },
    {
      id: "water-lake",
      kind: "lake",
      mask: water.lake,
      priority: 6,
      elevation: { base: -1.7, relief: 0.2, roughness: 0.03 },
      subtractZoneIds: [],
    },
    {
      id: "shore-course",
      kind: "shore",
      mask: {
        ...water.course,
        width: round(water.course.width + 7),
        feather: 4,
      },
      priority: 4,
      elevation: { base: -0.6, relief: 0.45, roughness: 0.12 },
      subtractZoneIds: ["water-course", "water-lake"],
    },
    {
      id: "shore-lake",
      kind: "shore",
      mask: {
        ...water.lake,
        radiusX: round(water.lake.radiusX + 5),
        radiusZ: round(water.lake.radiusZ + 5),
        feather: 4.5,
      },
      priority: 4,
      elevation: { base: -0.5, relief: 0.4, roughness: 0.1 },
      subtractZoneIds: ["water-course", "water-lake"],
    },
  ];

  return { zones, water };
}

function grovePalette(category: FileCategory, index: number): GrovePalette {
  const categoryPalette: Record<FileCategory, GrovePalette> = {
    source: "broadleaf",
    test: "pine",
    docs: "twisted",
    config: "pine",
    asset: "flowering",
    other: "mixed",
  };
  if (index % 4 === 3) return "mixed";
  return categoryPalette[category];
}

function circleClearsWater(
  center: WorldPlanPoint,
  radius: number,
  water: WaterSystem,
  clearance: number,
): boolean {
  return (
    distanceToCorridor(center, water.course) >= radius + water.course.width / 2 + clearance &&
    distance(center, water.lake.center) >=
      radius + Math.max(water.lake.radiusX, water.lake.radiusZ) + clearance
  );
}

function circleClearsHamlets(
  center: WorldPlanPoint,
  radius: number,
  hamlets: ReadonlyArray<HamletRegion>,
  clearance: number,
): boolean {
  return hamlets.every(
    (hamlet) =>
      distance(center, hamlet.mask.center) >=
      radius + Math.max(hamlet.mask.radiusX, hamlet.mask.radiusZ) + clearance,
  );
}

function createGroves(
  world: KingdomWorld,
  envelope: WorldPlanEnvelope,
  hamlets: ReadonlyArray<HamletRegion>,
  water: WaterSystem,
  maxTrees: number,
): ReadonlyArray<ForestGroveRegion> {
  const desiredCount = clamp(3 + Math.floor(world.provinces.length / 4), 3, 7);
  const rearLimit = envelope.minZ + clamp(envelope.depth * 0.18, 24, 40) + 7;
  const candidates = Array.from({ length: 56 }, (_, index) => {
    const column = index % 8;
    const row = Math.floor(index / 8);
    const cellWidth = (envelope.width - envelope.safeMargin * 4) / 8;
    const cellDepth = (envelope.maxZ - rearLimit - envelope.safeMargin * 2) / 7;
    const xJitter = stableFraction(`${world.seed}:grove-x:${index}`) - 0.5;
    const zJitter = stableFraction(`${world.seed}:grove-z:${index}`) - 0.5;
    return {
      index,
      center: point(
        envelope.minX + envelope.safeMargin * 2 + cellWidth * (column + 0.5 + xJitter * 0.42),
        rearLimit + envelope.safeMargin + cellDepth * (row + 0.5 + zJitter * 0.42),
      ),
      order: stableHash(`${world.seed}:grove-order:${index}`),
    };
  }).sort((first, second) => first.order - second.order || first.index - second.index);

  const chosen: Array<Readonly<{ center: WorldPlanPoint; radius: number; sourceIndex: number }>> =
    [];
  for (const candidate of candidates) {
    if (chosen.length >= desiredCount) break;
    const preferredRadius = round(
      7.5 + stableFraction(`${world.seed}:grove-radius:${candidate.index}`) * 3.5,
    );
    const radii = [preferredRadius, 7, 5.8];
    const radius = radii.find(
      (candidateRadius) =>
        candidate.center.x - candidateRadius >= envelope.minX + envelope.safeMargin &&
        candidate.center.x + candidateRadius <= envelope.maxX - envelope.safeMargin &&
        candidate.center.z - candidateRadius >= rearLimit &&
        candidate.center.z + candidateRadius <= envelope.maxZ - envelope.safeMargin &&
        circleClearsWater(candidate.center, candidateRadius, water, 4) &&
        circleClearsHamlets(candidate.center, candidateRadius, hamlets, 4) &&
        chosen.every(
          (grove) => distance(candidate.center, grove.center) >= candidateRadius + grove.radius + 3,
        ),
    );
    if (radius !== undefined) {
      chosen.push({ center: candidate.center, radius, sourceIndex: candidate.index });
    }
  }

  const semanticCategories = [...world.statistics.categories]
    .sort(
      (first, second) =>
        second.files - first.files ||
        second.bytes - first.bytes ||
        categoryPriority(second.category) - categoryPriority(first.category),
    )
    .map((entry) => entry.category);
  if (semanticCategories.length === 0) semanticCategories.push("other");
  const treeShare = chosen.length === 0 ? 0 : Math.floor(maxTrees / chosen.length);

  return chosen.map((candidate, index) => {
    const category = semanticCategories[index % semanticCategories.length]!;
    const radiusX = round(
      candidate.radius *
        (0.92 + stableFraction(`${world.seed}:grove-rx:${candidate.sourceIndex}`) * 0.08),
    );
    const radiusZ = round(
      candidate.radius *
        (0.82 + stableFraction(`${world.seed}:grove-rz:${candidate.sourceIndex}`) * 0.18),
    );
    return {
      id: `grove-${stableDigest(`${world.seed}:${candidate.sourceIndex}`).slice(0, 10)}`,
      mask: {
        shape: "ellipse",
        center: candidate.center,
        radiusX,
        radiusZ,
        rotation: round(
          (stableFraction(`${world.seed}:grove-rotation:${candidate.sourceIndex}`) - 0.5) * 0.7,
        ),
        feather: 3.5,
      },
      palette: grovePalette(category, index),
      densityPerHundredSquareUnits: round(
        1.4 + stableFraction(`${world.seed}:grove-density:${candidate.sourceIndex}`) * 1.1,
      ),
      maxTrees: Math.min(treeShare, Math.max(12, Math.round(Math.PI * radiusX * radiusZ * 0.075))),
      exclusions: {
        terrainZoneIds: [...WATER_ZONE_IDS],
        hamletIds: hamlets.map((hamlet) => hamlet.id),
        clearance: 4,
      },
    };
  });
}

function landmarkRole(hamlet: HamletRegion): LandmarkRole {
  if (hamlet.role === "crown-hamlet") return "repository-crown";
  return {
    source: "forge",
    test: "watchtower",
    docs: "archive",
    config: "observatory",
    asset: "garden-sanctum",
    other: "waystone",
  }[hamlet.category] as LandmarkRole;
}

function createLandmarks(
  world: KingdomWorld,
  hamlets: ReadonlyArray<HamletRegion>,
): ReadonlyArray<LandmarkSlot> {
  const entities = new Map(world.entities.map((entity) => [entity.id, entity]));
  const largestRepositoryCount = Math.max(1, ...hamlets.map((hamlet) => hamlet.representedFiles));
  const nexus = world.provinces.find((province) => province.role === "nexus");
  const desiredCount = clamp(1 + Math.floor(world.provinces.length / 5), 1, 3);
  const crown: ReadonlyArray<LandmarkSlot> = nexus
    ? [
        {
          id: `landmark-${stableDigest(`${world.seed}:repository-crown`).slice(0, 10)}`,
          hamletId: null,
          provinceId: nexus.id,
          entityId:
            orderEntities(world.entities.filter((entity) => entity.provinceId === nexus.id))[0]
              ?.id ?? null,
          role: "repository-crown",
          position: point(nexus.position.x, nexus.position.z),
          footprintRadius: round(clamp(nexus.radius * 0.2, 2.4, 4.2)),
          prominence: 1,
        },
      ]
    : [];
  const regional = hamlets.slice(0, Math.max(0, desiredCount - crown.length)).map((hamlet) => {
    const entity = orderEntities(
      hamlet.buildingEntityIds.flatMap((entityId) => {
        const found = entities.get(entityId);
        return found ? [found] : [];
      }),
    )[0];
    return {
      id: `landmark-${hamlet.id.slice("hamlet-".length)}`,
      hamletId: hamlet.id,
      provinceId: hamlet.provinceId,
      entityId: entity?.id ?? null,
      role: landmarkRole(hamlet),
      position: hamlet.mask.center,
      footprintRadius: round(clamp(hamlet.mask.radiusX * 0.24, 2.2, 4.2)),
      prominence: round(0.55 + (hamlet.representedFiles / largestRepositoryCount) * 0.45),
    };
  });
  return [...crown, ...regional];
}

function createWildlifeZones(
  world: KingdomWorld,
  groves: ReadonlyArray<ForestGroveRegion>,
  hamlets: ReadonlyArray<HamletRegion>,
  maxActors: number,
): ReadonlyArray<WildlifeZone> {
  const desiredCount = Math.min(3, groves.length);
  const baseActorCount = desiredCount === 0 ? 0 : Math.floor(maxActors / desiredCount);
  const extraActors = desiredCount === 0 ? 0 : maxActors % desiredCount;
  const actorCounts = Array.from(
    { length: desiredCount },
    (_, index) => baseActorCount + (index < extraActors ? 1 : 0),
  );
  const roles: ReadonlyArray<WildlifeRole> = ["deer", "fox", "stag"];
  const behaviors: ReadonlyArray<WildlifeZone["behavior"]> = ["graze", "wander", "rest"];
  const offset = Math.floor(stableFraction(`${world.seed}:wildlife`) * roles.length);
  return groves.slice(0, desiredCount).map((grove, index) => ({
    id: `wildlife-${grove.id.slice("grove-".length)}`,
    habitatGroveId: grove.id,
    mask: {
      ...grove.mask,
      radiusX: round(grove.mask.radiusX * 0.62),
      radiusZ: round(grove.mask.radiusZ * 0.62),
      feather: 2,
    },
    animal: roles[(index + offset) % roles.length]!,
    behavior: behaviors[index % behaviors.length]!,
    maxActors: actorCounts[index]!,
    exclusions: {
      terrainZoneIds: [...WATER_ZONE_IDS],
      hamletIds: hamlets.map((hamlet) => hamlet.id),
    },
  }));
}

function createVisualBudgets(
  world: KingdomWorld,
  hamlets: ReadonlyArray<HamletRegion>,
): WorldVisualBudgets {
  const complexity = Math.sqrt(Math.max(1, world.statistics.files));
  const largeRepositoryActorBonus =
    world.statistics.files < 128
      ? 0
      : Math.min(4, Math.floor(Math.log2(world.statistics.files / 128 + 1) * 1.5));
  return {
    maxTerrainZones: 10,
    maxHamlets: 4,
    maxBuildings: hamlets.reduce((total, hamlet) => total + hamlet.maxBuildings, 0),
    maxGroves: 7,
    maxTrees: Math.round(clamp(90 + world.provinces.length * 10 + complexity * 5, 120, 240)),
    maxLandmarks: 6,
    maxWildlifeActors: Math.round(
      clamp(4 + world.provinces.length / 4 + largeRepositoryActorBonus, 4, 12),
    ),
    maxSurfaceScatter: Math.round(clamp(210 + complexity * 7, 240, 360)),
    maxDrawCalls: 150,
    maxVisibleTriangles: 750_000,
  };
}

function unbuiltProvinceExpression(province: Province, seed: string): ProvinceExpression {
  if (province.role === "nexus") return "shrine";
  const variants: Readonly<Record<FileCategory, ReadonlyArray<ProvinceExpression>>> = {
    source: ["landform", "forest"],
    test: ["wildlife", "rock-field"],
    docs: ["shrine", "garden"],
    config: ["rock-field", "landform"],
    asset: ["garden", "forest"],
    other: ["forest", "selectable-only"],
  };
  const choices = variants[province.dominantCategory];
  const index = stableHash(`${seed}:expression:${province.id}`) % choices.length;
  return choices[index]!;
}

function expressionAssetRoles(expression: ProvinceExpression): ReadonlyArray<string> {
  return {
    hamlet: ["medieval-architecture"],
    forest: ["common-tree", "pine", "understory"],
    garden: ["flower-group", "flowering-bush", "grass"],
    shrine: ["waystone", "medium-rock", "mushroom"],
    "rock-field": ["medium-rock", "round-rock-path"],
    wildlife: ["deer", "fox", "stag"],
    landform: ["terrain-relief", "medium-rock", "dead-tree"],
    "selectable-only": [],
  }[expression];
}

function expressionRationale(expression: ProvinceExpression, province: Province): string {
  if (expression === "hamlet") {
    return `${province.label} is one of the strongest top-level repository areas, so it receives a compact aggregated building cluster.`;
  }
  return `${province.label} remains fully selectable but uses ${expression} scenery instead of one building per file.`;
}

function createSemanticZones(
  world: KingdomWorld,
  hamlets: ReadonlyArray<HamletRegion>,
): ReadonlyArray<ProvinceSemanticZone> {
  const hamletsByProvince = new Map(hamlets.map((hamlet) => [hamlet.provinceId, hamlet]));
  return [...world.provinces]
    .sort((first, second) => first.id.localeCompare(second.id))
    .map((province) => {
      const hamlet = hamletsByProvince.get(province.id);
      const expression = hamlet ? "hamlet" : unbuiltProvinceExpression(province, world.seed);
      return {
        id: `semantic-${stableDigest(`${world.seed}:${province.id}`).slice(0, 10)}`,
        provinceId: province.id,
        label: province.label,
        category: province.dominantCategory,
        expression,
        hitMask: {
          shape: "ellipse",
          center: point(province.position.x, province.position.z),
          radiusX: round(Math.max(5, province.radius)),
          radiusZ: round(Math.max(5, province.radius)),
          rotation: 0,
          feather: 1,
        },
        hamletId: hamlet?.id ?? null,
        entityIds: world.entities
          .filter((entity) => entity.provinceId === province.id)
          .map((entity) => entity.id)
          .sort(),
        representedFiles: province.representedFiles,
        assetRoles: expressionAssetRoles(expression),
        rationale: expressionRationale(expression, province),
      };
    });
}

function createSurfaceConstraints(
  hamlets: ReadonlyArray<HamletRegion>,
): ReadonlyArray<SurfaceConstraint> {
  const excludedWater = [...WATER_ZONE_IDS];
  return [
    {
      id: "surface-hamlet-foundations",
      target: "hamlet",
      allowedTerrainZoneIds: ["terrain-lowland", "terrain-meadow-mid", "terrain-meadow-front"],
      excludedTerrainZoneIds: excludedWater,
      maxSlopeDegrees: 8,
      elevationRange: { min: -0.2, max: 5 },
      minimumClearance: 2,
    },
    {
      id: "surface-landmark-plinths",
      target: "landmark",
      allowedTerrainZoneIds: ["terrain-lowland", "terrain-meadow-mid", "terrain-meadow-front"],
      excludedTerrainZoneIds: excludedWater,
      maxSlopeDegrees: 6,
      elevationRange: { min: -0.2, max: 6 },
      minimumClearance: 1.5,
    },
    {
      id: "surface-grove-rooting",
      target: "forest",
      allowedTerrainZoneIds: ["terrain-lowland", "terrain-meadow-mid", "terrain-meadow-front"],
      excludedTerrainZoneIds: excludedWater,
      maxSlopeDegrees: 28,
      elevationRange: { min: -0.1, max: 18 },
      minimumClearance: 4,
    },
    {
      id: "surface-wildlife-footing",
      target: "wildlife",
      allowedTerrainZoneIds: ["terrain-lowland", "terrain-meadow-mid", "terrain-meadow-front"],
      excludedTerrainZoneIds: excludedWater,
      maxSlopeDegrees: 18,
      elevationRange: { min: -0.1, max: 12 },
      minimumClearance: Math.max(3, Math.min(6, hamlets.length + 1)),
    },
  ];
}

function paletteAssets(palette: GrovePalette): ReadonlyArray<string> {
  return {
    broadleaf: ["common-tree", "twisted-tree"],
    pine: ["pine", "common-tree"],
    twisted: ["twisted-tree", "dead-tree", "common-tree"],
    mixed: ["common-tree", "pine", "twisted-tree"],
    flowering: ["common-tree", "flowering-bush"],
  }[palette];
}

function createScatterConstraints(
  groves: ReadonlyArray<ForestGroveRegion>,
  hamlets: ReadonlyArray<HamletRegion>,
  budgets: WorldVisualBudgets,
): ReadonlyArray<ScatterConstraint> {
  const hamletIds = hamlets.map((hamlet) => hamlet.id);
  const excludedWater = [...WATER_ZONE_IDS];
  const treeAssets = [...new Set(groves.flatMap((grove) => paletteAssets(grove.palette)))];
  const canopyInstances = groves.reduce((total, grove) => total + grove.maxTrees, 0);
  const understoryInstances = Math.min(120, groves.length * 18);
  const meadowInstances = Math.min(96, Math.floor(budgets.maxSurfaceScatter * 0.3));
  const shoreInstances = Math.min(
    48,
    budgets.maxSurfaceScatter - understoryInstances - meadowInstances,
  );
  return [
    {
      id: "scatter-forest-canopy",
      layer: "forest-canopy",
      regionIds: groves.map((grove) => grove.id),
      assetRoles: treeAssets,
      densityPerHundredSquareUnits: 2.1,
      minSpacing: 3.4,
      maxSlopeDegrees: 28,
      maxInstances: Math.min(budgets.maxTrees, canopyInstances),
      excludedTerrainZoneIds: excludedWater,
      excludedHamletIds: hamletIds,
    },
    {
      id: "scatter-understory",
      layer: "understory",
      regionIds: groves.map((grove) => grove.id),
      assetRoles: ["bush", "fern", "grass", "mushroom"],
      densityPerHundredSquareUnits: 5.4,
      minSpacing: 1.2,
      maxSlopeDegrees: 32,
      maxInstances: understoryInstances,
      excludedTerrainZoneIds: excludedWater,
      excludedHamletIds: hamletIds,
    },
    {
      id: "scatter-meadow-detail",
      layer: "meadow-detail",
      regionIds: ["terrain-meadow-mid", "terrain-meadow-front"],
      assetRoles: ["grass", "flower-group", "fern"],
      densityPerHundredSquareUnits: 4.2,
      minSpacing: 1.35,
      maxSlopeDegrees: 16,
      maxInstances: meadowInstances,
      excludedTerrainZoneIds: excludedWater,
      excludedHamletIds: hamletIds,
    },
    {
      id: "scatter-shore-rock",
      layer: "shore-rock",
      regionIds: ["shore-course", "shore-lake"],
      assetRoles: ["medium-rock", "round-rock-path"],
      densityPerHundredSquareUnits: 1.5,
      minSpacing: 2.4,
      maxSlopeDegrees: 22,
      maxInstances: Math.max(0, shoreInstances),
      excludedTerrainZoneIds: [...WATER_ZONE_IDS],
      excludedHamletIds: hamletIds,
    },
  ];
}

function createCamera(
  envelope: WorldPlanEnvelope,
  hamlets: ReadonlyArray<HamletRegion>,
  worldHeight: number,
): WorldCameraComposition {
  const nexus = hamlets.find((hamlet) => hamlet.role === "crown-hamlet") ?? hamlets[0];
  const entryTarget = nexus?.mask.center ?? point(0, 18);
  const diagonal = Math.hypot(envelope.width, envelope.depth);
  const overviewTargetZ = envelope.center.z + envelope.depth * 0.05;
  return {
    overview: {
      position: {
        x: round(envelope.width * 0.44),
        y: round(Math.max(82, diagonal * 0.56, worldHeight * 2.2)),
        z: round(envelope.maxZ + envelope.depth * 0.44),
      },
      target: { x: 0, y: round(worldHeight * 0.08), z: round(overviewTargetZ) },
      fieldOfViewDegrees: 38,
      near: 0.1,
      far: round(Math.max(600, diagonal * 5)),
    },
    entry: {
      position: {
        x: round(entryTarget.x + 9),
        y: 6.2,
        z: round(clamp(entryTarget.z + 15, envelope.minZ + 8, envelope.maxZ - 5)),
      },
      target: { x: entryTarget.x, y: 3.4, z: entryTarget.z },
      fieldOfViewDegrees: 46,
    },
    horizonZ: round(envelope.minZ + clamp(envelope.depth * 0.18, 24, 40)),
  };
}

const APPEARANCE_BY_SEASON: Readonly<Record<KingdomSeason, Omit<WorldPlanAppearance, "season">>> = {
  spring: {
    terrain: {
      lowland: "#6f8f57",
      meadow: "#89ad68",
      escarpment: "#65715d",
      shore: "#b7a77b",
      water: "#5d9cad",
    },
    foliage: {
      broadleaf: ["#477b45", "#68a459", "#93bf72"],
      pine: ["#345f46", "#497958"],
      flowering: ["#f0afbd", "#f6d6dc", "#8fbd68"],
      trunk: "#705742",
      leafCoverage: 0.92,
      snowCoverage: 0,
    },
    architecture: {
      plasterTint: "#f0e3ca",
      roofTint: "#a95f4e",
      timberTint: "#684637",
      windowGlow: "#ffd39a",
    },
    atmosphere: {
      sky: "#bcd9e8",
      horizon: "#f0dbc2",
      fog: "#c8d7c8",
      sunlight: "#ffe2ae",
      sunlightIntensity: 1.15,
    },
  },
  summer: {
    terrain: {
      lowland: "#547a42",
      meadow: "#76a54e",
      escarpment: "#596856",
      shore: "#bca873",
      water: "#4b91aa",
    },
    foliage: {
      broadleaf: ["#326b38", "#4e8b43", "#79aa4e"],
      pine: ["#28543c", "#3d6b4a"],
      flowering: ["#e89e72", "#f4d36c", "#6fa542"],
      trunk: "#674b35",
      leafCoverage: 1,
      snowCoverage: 0,
    },
    architecture: {
      plasterTint: "#ead8ba",
      roofTint: "#9d503f",
      timberTint: "#5e402f",
      windowGlow: "#ffc875",
    },
    atmosphere: {
      sky: "#8dc9e8",
      horizon: "#f3d49e",
      fog: "#b6cbb1",
      sunlight: "#ffd28a",
      sunlightIntensity: 1.3,
    },
  },
  autumn: {
    terrain: {
      lowland: "#7b7542",
      meadow: "#a08b4e",
      escarpment: "#675c50",
      shore: "#b59a68",
      water: "#587e8f",
    },
    foliage: {
      broadleaf: ["#a64f2d", "#c97832", "#d5a145"],
      pine: ["#315a43", "#496d45"],
      flowering: ["#b85e3a", "#dfa04a", "#8b7c3d"],
      trunk: "#604534",
      leafCoverage: 0.78,
      snowCoverage: 0,
    },
    architecture: {
      plasterTint: "#dfc9a9",
      roofTint: "#843f35",
      timberTint: "#53382e",
      windowGlow: "#ffbd70",
    },
    atmosphere: {
      sky: "#a9b8c1",
      horizon: "#e3b17d",
      fog: "#b8ab91",
      sunlight: "#efb46f",
      sunlightIntensity: 1.02,
    },
  },
  winter: {
    terrain: {
      lowland: "#d6ddd9",
      meadow: "#e6e9e5",
      escarpment: "#7b8588",
      shore: "#c8c5b8",
      water: "#6e95a5",
    },
    foliage: {
      broadleaf: ["#6a7068", "#81867b", "#9da49b"],
      pine: ["#2f5448", "#48675a"],
      flowering: ["#bbc5be", "#dbe0dc", "#738779"],
      trunk: "#544b45",
      leafCoverage: 0.24,
      snowCoverage: 0.82,
    },
    architecture: {
      plasterTint: "#e4e2dc",
      roofTint: "#744b46",
      timberTint: "#493d38",
      windowGlow: "#ffc986",
    },
    atmosphere: {
      sky: "#aebfcb",
      horizon: "#dce2e4",
      fog: "#cbd2d4",
      sunlight: "#d8e1e7",
      sunlightIntensity: 0.82,
    },
  },
};

function createTopologyKey(world: KingdomWorld, topology: WorldPlanTopology): string {
  return stableDigest(
    [
      "repo-world-plan/v1",
      world.source.repositoryId,
      world.source.commitSha,
      world.seed,
      stableDigest(JSON.stringify(topology)),
    ].join(":"),
  );
}

/**
 * Converts compiler output into a deterministic, renderer-agnostic scene plan.
 * Repository semantics choose spatial roles; the selected season is isolated in
 * `appearance`, so changing seasons cannot move terrain, settlements, or actors.
 */
export function createWorldPlan(world: KingdomWorld): WorldPlan {
  const envelope = createEnvelope(world);
  const hamlets = createHamlets(world, envelope);
  const { zones: terrainZones, water } = createTerrainZones(world, envelope, hamlets);
  const visualBudgets = createVisualBudgets(world, hamlets);
  const groves = createGroves(world, envelope, hamlets, water, visualBudgets.maxTrees);
  const landmarks = createLandmarks(world, hamlets);
  const wildlifeZones = createWildlifeZones(
    world,
    groves,
    hamlets,
    visualBudgets.maxWildlifeActors,
  );
  const seasonalAppearance = APPEARANCE_BY_SEASON[world.season];
  const semanticZones = createSemanticZones(world, hamlets);
  const topology: WorldPlanTopology = {
    envelope,
    camera: createCamera(envelope, hamlets, world.bounds.height),
    terrainZones,
    hamlets,
    groves,
    landmarks,
    wildlifeZones,
    semanticMapping: {
      id: "repository-semantics/v1",
      rationale:
        "Repository structure chooses spatial roles, while scenery expresses most code areas without turning every file or folder into a house.",
      buildingRule:
        world.statistics.files >= 128
          ? "Only two to four strongest top-level directory provinces become hamlets; each is aggregated into three to six buildings, with twelve to twenty-four buildings total depending on repository scale."
          : "Only two to four strongest top-level directory provinces become hamlets; each is aggregated into three to six buildings, with twelve to twenty buildings total.",
      traceabilityRule:
        "Every province has a semantic hit zone containing all of its entity IDs, including provinces represented only by nature, landform, or invisible selection coverage.",
    },
    semanticZones,
    surfaceConstraints: createSurfaceConstraints(hamlets),
    scatterConstraints: createScatterConstraints(groves, hamlets, visualBudgets),
    visualBudgets,
  };

  return {
    schema: "repo-world-plan/v1",
    version: "1.0.0",
    topologyKey: createTopologyKey(world, topology),
    repository: {
      id: world.source.repositoryId,
      owner: world.source.owner,
      name: world.source.repository,
      commitSha: world.source.commitSha,
    },
    topology,
    appearance: {
      season: world.season,
      ...seasonalAppearance,
    },
  };
}
