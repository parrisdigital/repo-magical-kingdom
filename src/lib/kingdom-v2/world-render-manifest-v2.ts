import { stableDigest } from "../kingdom/hash";
import type { WorldPlanPoint } from "../kingdom/world-plan";
import {
  parseCustomAssetCatalogV1,
  type CustomAssetCatalogV1,
} from "../world-assets-v2/custom-asset-catalog-v1";
import type {
  RepoSemanticGraphV2,
  RepoSemanticMagnitude,
  RepoSemanticNode,
} from "./repo-semantic-graph-v2";
import { assertTerrainArtifactV2Integrity, type TerrainArtifactV2 } from "./terrain-artifact-v2";
import { assertWorldDesignSpecV3Integrity, type WorldDesignSpecV3 } from "./world-design-spec-v3";

export const WORLD_RENDER_MANIFEST_V2_SCHEMA = "repo-world-render-manifest/v2" as const;
export const WORLD_RENDERER_V2_REVISION = "repository-worlds-v2-renderer/3" as const;

const CANONICAL_TERRAIN_CHUNKS_PER_AXIS = 4;
const CANONICAL_TERRAIN_CHUNK_COUNT =
  CANONICAL_TERRAIN_CHUNKS_PER_AXIS * CANONICAL_TERRAIN_CHUNKS_PER_AXIS;
const CANONICAL_TERRAIN_LODS = [129, 65, 33] as const;
const INSTANCE_LOD_GROUPS = new Set<WorldRenderInstanceV2["lodGroup"]>([
  "hero",
  "regional",
  "scatter",
]);
const ROAD_SURFACES = new Set<WorldRenderRoadV2["surface"]>(["road", "bridge", "steps"]);
const WILDLIFE_BEHAVIORS = new Set<WorldRenderWildlifeRouteV2["behavior"]>([
  "graze",
  "wander",
  "rest",
]);
const NUMERIC_TOLERANCE = 1e-6;

function immutableSnapshot<T>(value: T): T {
  if (ArrayBuffer.isView(value)) {
    throw new Error("WorldRenderManifestV2 snapshots cannot contain typed-array views.");
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((child) => immutableSnapshot(child))) as T;
  }
  if (typeof value === "object" && value !== null) {
    const clone: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) clone[key] = immutableSnapshot(child);
    return Object.freeze(clone) as T;
  }
  return value;
}

export type WorldRenderTerrainSummaryV2 = Readonly<{
  schema: "repo-terrain-artifact/v2";
  summaryKey: string;
  key: string;
  structureKey: string;
  resolution: 513;
  chunkLods: readonly [129, 65, 33];
  chunks: ReadonlyArray<
    Readonly<{
      id: string;
      bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
      maximumLod: 0 | 1 | 2;
      skirtDepth: number;
    }>
  >;
  heightFieldKey: string;
  materialWeightsKey: string;
  hydrologyKey: string;
}>;

export type WorldRenderInstanceV2 = Readonly<{
  id: string;
  semanticNodeId: string;
  assetId: string;
  role: string;
  position: Readonly<{ x: number; y: number; z: number }>;
  rotationY: number;
  scale: Readonly<{ x: number; y: number; z: number }>;
  semanticHeightScale: number;
  /**
   * Repository-driven assembly intent for architecture. Storeys are assembled
   * from human-scale authored modules; the source mesh itself stays at Y=1.
   */
  architecture: WorldRenderArchitectureProfileV2 | null;
  lodGroup: "hero" | "regional" | "scatter";
  collisionProxyId: string;
}>;

export type WorldRenderArchitectureProfileV2 = Readonly<{
  storeyCount: 1 | 2 | 3 | 4 | 5;
  targetHeightMeters: number;
  prominence: number;
}>;

export type WorldRenderRoadV2 = Readonly<{
  id: string;
  routeIntentId: string;
  width: number;
  points: ReadonlyArray<Readonly<{ x: number; y: number; z: number }>>;
  surface: "road" | "bridge" | "steps";
}>;

export type WorldRenderWildlifeRouteV2 = Readonly<{
  id: string;
  habitatId: string;
  animalRole: string;
  points: ReadonlyArray<Readonly<{ x: number; y: number; z: number }>>;
  behavior: "graze" | "wander" | "rest";
}>;

export type WorldRenderNavigationV2 = Readonly<{
  terrainArtifactKey: string;
  collisionRevision: string;
  walkEntry: Readonly<{
    position: Readonly<{ x: number; y: number; z: number }>;
    target: Readonly<{ x: number; y: number; z: number }>;
  }>;
  waterRouteId: string | null;
}>;

export type WorldRenderManifestV2 = Readonly<{
  schema: typeof WORLD_RENDER_MANIFEST_V2_SCHEMA;
  rendererRevision: typeof WORLD_RENDERER_V2_REVISION;
  key: string;
  structureKey: string;
  appearanceKey: string;
  repository: WorldDesignSpecV3["repository"];
  designKey: string;
  assetCatalog: Readonly<{
    id: CustomAssetCatalogV1["id"];
    schemaVersion: CustomAssetCatalogV1["schemaVersion"];
    digest: string;
  }>;
  terrain: WorldRenderTerrainSummaryV2;
  instances: ReadonlyArray<WorldRenderInstanceV2>;
  roads: ReadonlyArray<WorldRenderRoadV2>;
  wildlifeRoutes: ReadonlyArray<WorldRenderWildlifeRouteV2>;
  navigation: WorldRenderNavigationV2;
  provenance: ReadonlyArray<
    Readonly<{
      instanceId: string;
      semanticNodeId: string;
      sourceUrl: string;
    }>
  >;
  budgets: Readonly<{
    status: "unmeasured";
    targets: Readonly<{
      orbit: Readonly<{ maximumDrawCalls: 200; maximumVisibleTriangles: 2_000_000 }>;
      walk: Readonly<{ maximumDrawCalls: 220; maximumVisibleTriangles: 3_000_000 }>;
    }>;
  }>;
}>;

export type CreateWorldRenderManifestV2Input = Readonly<{
  design: WorldDesignSpecV3;
  graph: RepoSemanticGraphV2;
  terrain: WorldRenderTerrainSummaryV2;
  assetCatalog: CustomAssetCatalogV1;
  instances: ReadonlyArray<WorldRenderInstanceV2>;
  roads: ReadonlyArray<WorldRenderRoadV2>;
  wildlifeRoutes: ReadonlyArray<WorldRenderWildlifeRouteV2>;
  navigation: WorldRenderNavigationV2;
}>;

export type DeriveWorldRenderCollisionRevisionV2Input = Readonly<{
  assetCatalog: CustomAssetCatalogV1;
  placementKey: string;
  instances: ReadonlyArray<WorldRenderInstanceV2>;
  roads: ReadonlyArray<WorldRenderRoadV2>;
}>;

function assertUniqueIds(label: string, values: ReadonlyArray<Readonly<{ id: string }>>): void {
  const ids = new Set<string>();
  for (const value of values) {
    if (value.id.trim().length === 0) throw new Error(`${label} requires a non-empty id.`);
    if (ids.has(value.id)) throw new Error(`Duplicate ${label} id: ${value.id}`);
    ids.add(value.id);
  }
}

function assertNonEmpty(label: string, value: string): void {
  if (value.trim().length === 0) throw new Error(`${label} must not be empty.`);
}

function assertFinitePoint(
  label: string,
  point: Readonly<{ x: number; y: number; z: number }>,
): void {
  if (![point.x, point.y, point.z].every(Number.isFinite)) {
    throw new Error(`${label} has a non-finite position.`);
  }
}

function approximatelyEqual(first: number, second: number, span: number): boolean {
  return Math.abs(first - second) <= Math.max(NUMERIC_TOLERANCE, Math.abs(span) * 1e-8);
}

function assertCanonicalTerrainSummary(
  terrain: WorldRenderTerrainSummaryV2,
  envelope: WorldDesignSpecV3["terrain"]["envelope"],
): void {
  if (terrain.schema !== "repo-terrain-artifact/v2" || terrain.resolution !== 513) {
    throw new Error("TerrainArtifactV2 must use the canonical v2 schema and 513 resolution.");
  }
  if (
    terrain.chunkLods.length !== CANONICAL_TERRAIN_LODS.length ||
    terrain.chunkLods.some((value, index) => value !== CANONICAL_TERRAIN_LODS[index])
  ) {
    throw new Error("TerrainArtifactV2 must expose canonical [129, 65, 33] chunk LODs.");
  }
  if (terrain.chunks.length !== CANONICAL_TERRAIN_CHUNK_COUNT) {
    throw new Error("TerrainArtifactV2 must expose the canonical 16-chunk 4x4 grid.");
  }
  for (const [label, value] of [
    ["terrain summary key", terrain.summaryKey],
    ["terrain key", terrain.key],
    ["terrain structure key", terrain.structureKey],
    ["height-field key", terrain.heightFieldKey],
    ["material-weights key", terrain.materialWeightsKey],
    ["hydrology key", terrain.hydrologyKey],
  ] as const) {
    assertNonEmpty(label, value);
  }
  assertUniqueIds("terrain chunk", terrain.chunks);

  const expectedX = Array.from(
    { length: CANONICAL_TERRAIN_CHUNKS_PER_AXIS + 1 },
    (_, index) => envelope.minX + (envelope.width * index) / CANONICAL_TERRAIN_CHUNKS_PER_AXIS,
  );
  const expectedZ = Array.from(
    { length: CANONICAL_TERRAIN_CHUNKS_PER_AXIS + 1 },
    (_, index) => envelope.minZ + (envelope.depth * index) / CANONICAL_TERRAIN_CHUNKS_PER_AXIS,
  );
  const occupiedCells = new Set<string>();

  for (const chunk of terrain.chunks) {
    const bounds = chunk.bounds;
    if (
      ![bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ, chunk.skirtDepth].every(Number.isFinite)
    ) {
      throw new Error(`Terrain chunk ${chunk.id} has non-finite bounds or skirt depth.`);
    }
    if (bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ || chunk.skirtDepth <= 0) {
      throw new Error(`Terrain chunk ${chunk.id} has invalid bounds or skirt depth.`);
    }
    if (chunk.maximumLod !== 2) {
      throw new Error(`Terrain chunk ${chunk.id} must expose all three canonical LODs.`);
    }

    const chunkX = Array.from(
      { length: CANONICAL_TERRAIN_CHUNKS_PER_AXIS },
      (_, index) => index,
    ).find(
      (index) =>
        approximatelyEqual(bounds.minX, expectedX[index]!, envelope.width) &&
        approximatelyEqual(bounds.maxX, expectedX[index + 1]!, envelope.width),
    );
    const chunkZ = Array.from(
      { length: CANONICAL_TERRAIN_CHUNKS_PER_AXIS },
      (_, index) => index,
    ).find(
      (index) =>
        approximatelyEqual(bounds.minZ, expectedZ[index]!, envelope.depth) &&
        approximatelyEqual(bounds.maxZ, expectedZ[index + 1]!, envelope.depth),
    );
    if (chunkX === undefined || chunkZ === undefined) {
      throw new Error(
        `Terrain chunk ${chunk.id} does not align with the contiguous canonical 4x4 coverage.`,
      );
    }
    const cellId = `${chunkX}:${chunkZ}`;
    if (occupiedCells.has(cellId)) {
      throw new Error(`TerrainArtifactV2 has duplicate coverage for canonical cell ${cellId}.`);
    }
    occupiedCells.add(cellId);
  }

  if (occupiedCells.size !== CANONICAL_TERRAIN_CHUNK_COUNT) {
    throw new Error("TerrainArtifactV2 does not provide contiguous 4x4 envelope coverage.");
  }
  const expectedBufferKeys = {
    heightFieldKey: new RegExp(`^terrain-height-v2:${terrain.key}:[a-f0-9]{8}$`, "u"),
    materialWeightsKey: new RegExp(`^terrain-materials-v2:${terrain.key}:[a-f0-9]{8}$`, "u"),
    hydrologyKey: new RegExp(`^terrain-hydrology-v2:${terrain.key}:[a-f0-9]{8}$`, "u"),
  } as const;
  for (const [field, pattern] of Object.entries(expectedBufferKeys) as ReadonlyArray<
    readonly [keyof typeof expectedBufferKeys, RegExp]
  >) {
    if (!pattern.test(terrain[field])) {
      throw new Error(`TerrainArtifactV2 ${field} is not namespaced to its artifact identity.`);
    }
  }
  const { summaryKey, ...summaryIdentity } = terrain;
  const expectedSummaryKey = `terrain-summary-v2:${stableDigest(JSON.stringify(summaryIdentity))}`;
  if (summaryKey !== expectedSummaryKey) {
    throw new Error("TerrainArtifactV2 summary key does not match its canonical content.");
  }
}

/**
 * Converts the worker-owned typed-array terrain artifact into the immutable
 * reference record stored in WorldRenderManifestV2. Large buffers remain in
 * the artifact cache rather than being duplicated into the render manifest.
 */
export function createWorldRenderTerrainSummaryV2(
  artifact: TerrainArtifactV2,
): WorldRenderTerrainSummaryV2 {
  assertTerrainArtifactV2Integrity(artifact);
  const farLod = artifact.lodDefinitions.find((lod) => lod.id === "far");
  if (!farLod) throw new Error("TerrainArtifactV2 is missing its far LOD definition.");
  const summaryIdentity = {
    schema: artifact.schema,
    key: artifact.key,
    structureKey: artifact.structureKey,
    resolution: artifact.resolution,
    chunkLods: artifact.chunkLods,
    chunks: artifact.chunks.map((chunk) => ({
      id: chunk.id,
      bounds: {
        minX: chunk.worldMinX,
        maxX: chunk.worldMaxX,
        minZ: chunk.worldMinZ,
        maxZ: chunk.worldMaxZ,
      },
      maximumLod: chunk.maximumLod,
      skirtDepth: farLod.skirtDepth,
    })),
    heightFieldKey: `terrain-height-v2:${artifact.key}:${artifact.metrics.checksums.height}`,
    materialWeightsKey: `terrain-materials-v2:${artifact.key}:${artifact.metrics.checksums.materialWeights}`,
    hydrologyKey: `terrain-hydrology-v2:${artifact.key}:${artifact.metrics.checksums.hydrology}`,
  };
  const summary: WorldRenderTerrainSummaryV2 = {
    ...summaryIdentity,
    summaryKey: `terrain-summary-v2:${stableDigest(JSON.stringify(summaryIdentity))}`,
  };
  assertCanonicalTerrainSummary(summary, artifact.envelope);
  return immutableSnapshot(summary);
}

function semanticNodeById(graph: RepoSemanticGraphV2): ReadonlyMap<string, RepoSemanticNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function sourceUrl(node: RepoSemanticNode): string {
  return node.sourceUrl;
}

function assertFiniteTransform(instance: WorldRenderInstanceV2): void {
  assertFinitePoint(`Render instance ${instance.id}`, instance.position);
  const values = [instance.rotationY, instance.scale.x, instance.scale.y, instance.scale.z];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Render instance ${instance.id} has a non-finite transform.`);
  }
  if (!Number.isFinite(instance.semanticHeightScale) || instance.semanticHeightScale <= 0) {
    throw new Error(`Render instance ${instance.id} requires a positive semantic height scale.`);
  }
  if (instance.scale.x <= 0 || instance.scale.y <= 0 || instance.scale.z <= 0) {
    throw new Error(`Render instance ${instance.id} requires positive scale.`);
  }
  if (!INSTANCE_LOD_GROUPS.has(instance.lodGroup)) {
    throw new Error(`Render instance ${instance.id} has an unsupported LOD group.`);
  }
  assertNonEmpty(`Render instance ${instance.id} role`, instance.role);
}

function expectedHeightScale(node: RepoSemanticNode): number {
  return node.kind === "entity" ? node.magnitude.heightScale : 1;
}

function roundArchitectureMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Converts file magnitude into a modular architectural assembly target. This
 * preserves the monotonic repository signal without anisotropically stretching
 * authored doors, windows, roof pitches, or material texel density.
 */
export function deriveWorldRenderArchitectureProfileV2(
  magnitude: RepoSemanticMagnitude,
): WorldRenderArchitectureProfileV2 {
  if (
    !Number.isFinite(magnitude.normalized) ||
    magnitude.normalized < 0 ||
    magnitude.normalized > 1
  ) {
    throw new Error("Architecture magnitude must be normalized between zero and one.");
  }
  const storeyCount = Math.min(
    5,
    Math.max(1, 1 + Math.floor(magnitude.normalized * 5)),
  ) as WorldRenderArchitectureProfileV2["storeyCount"];
  return Object.freeze({
    storeyCount,
    targetHeightMeters: roundArchitectureMetric(
      4.8 + (storeyCount - 1) * 3.15 + magnitude.normalized * 0.7,
    ),
    prominence: roundArchitectureMetric(magnitude.normalized),
  });
}

function assertArchitectureProfile(
  instance: WorldRenderInstanceV2,
  node: RepoSemanticNode,
  family: CustomAssetFamilyV1,
): void {
  if (family.kind !== "hero-building") {
    if (instance.architecture !== null) {
      throw new Error(
        `Render instance ${instance.id} may only carry architecture assembly metadata for a building asset.`,
      );
    }
    return;
  }
  if (node.kind !== "entity") {
    throw new Error(`Building instance ${instance.id} must reference a repository entity.`);
  }
  if (instance.architecture === null) {
    throw new Error(`Building instance ${instance.id} requires architecture assembly metadata.`);
  }
  const expected = deriveWorldRenderArchitectureProfileV2(node.magnitude);
  if (
    instance.architecture.storeyCount !== expected.storeyCount ||
    Math.abs(instance.architecture.targetHeightMeters - expected.targetHeightMeters) >
      NUMERIC_TOLERANCE ||
    Math.abs(instance.architecture.prominence - expected.prominence) > NUMERIC_TOLERANCE
  ) {
    throw new Error(
      `Building instance ${instance.id} architecture assembly does not match repository magnitude.`,
    );
  }
  if (Math.abs(instance.scale.y - 1) > NUMERIC_TOLERANCE) {
    throw new Error(
      `Building instance ${instance.id} must preserve authored Y scale and express height through modular storeys.`,
    );
  }
}

type CustomAssetFamilyV1 = CustomAssetCatalogV1["families"][number];

type CustomAssetIndexesV1 = Readonly<{
  catalog: CustomAssetCatalogV1;
  familyById: ReadonlyMap<string, CustomAssetFamilyV1>;
  animalFamilyIds: ReadonlySet<string>;
  digest: string;
}>;

function indexCustomAssetCatalog(input: CustomAssetCatalogV1): CustomAssetIndexesV1 {
  // Parse again at this trust boundary so a cast or deserialized value cannot
  // bypass the original-only, URI, LOD, pivot, and KTX2 catalog contract.
  const catalog = parseCustomAssetCatalogV1(input);
  const familyById = new Map<string, CustomAssetFamilyV1>();
  const animalFamilyIds = new Set<string>();
  const canonicalSlots = ["lod0", "lod1", "lod2"] as const;

  for (const family of catalog.families) {
    const lodUris = new Set<string>();
    for (const [index, lod] of family.lods.entries()) {
      if (lod.slot !== canonicalSlots[index]) {
        throw new Error(`Custom asset family ${family.id} does not expose canonical LOD0/1/2.`);
      }
      if (lodUris.has(lod.uri)) {
        throw new Error(`Custom asset family ${family.id} has a duplicate LOD URI.`);
      }
      lodUris.add(lod.uri);
    }
    const collisionNames = family.collision.nodes.map((node) => node.name);
    if (new Set(collisionNames).size !== collisionNames.length) {
      throw new Error(`Custom asset family ${family.id} has duplicate collision proxy ids.`);
    }
    familyById.set(family.id, family);
    if (family.kind === "animal") animalFamilyIds.add(family.id);
  }

  return {
    catalog,
    familyById,
    animalFamilyIds,
    digest: `custom-asset-catalog-v1:${stableDigest(JSON.stringify(catalog))}`,
  };
}

function collisionRevisionFromIndexedCatalog(
  assets: CustomAssetIndexesV1,
  placementKey: string,
  instances: ReadonlyArray<WorldRenderInstanceV2>,
  roads: ReadonlyArray<WorldRenderRoadV2>,
): string {
  assertNonEmpty("World placement key", placementKey);
  assertUniqueIds("render instance", instances);
  const collisionSet = [...instances]
    .sort((first, second) => first.id.localeCompare(second.id))
    .map((instance) => {
      assertFiniteTransform(instance);
      const family = assets.familyById.get(instance.assetId);
      if (!family) {
        throw new Error(
          `Render instance ${instance.id} references missing custom asset ${instance.assetId}.`,
        );
      }
      if (!family.collision.nodes.some((proxy) => proxy.name === instance.collisionProxyId)) {
        throw new Error(
          `Render instance ${instance.id} collision proxy does not belong to custom asset ${family.id}.`,
        );
      }
      return {
        id: instance.id,
        semanticNodeId: instance.semanticNodeId,
        assetId: family.id,
        collisionProxyId: instance.collisionProxyId,
        position: instance.position,
        rotationY: instance.rotationY,
        scale: instance.scale,
        architecture: instance.architecture,
      };
    });
  assertUniqueIds("road", roads);
  const roadCollisionSet = [...roads]
    .sort((first, second) => first.id.localeCompare(second.id))
    .map((road) => {
      if (
        !Number.isFinite(road.width) ||
        road.width <= 0 ||
        road.points.length < 2 ||
        !ROAD_SURFACES.has(road.surface) ||
        road.routeIntentId.trim().length === 0
      ) {
        throw new Error(`Road ${road.id} has invalid collision geometry.`);
      }
      road.points.forEach((point, index) =>
        assertFinitePoint(`Road ${road.id} collision point ${index}`, point),
      );
      return {
        id: road.id,
        routeIntentId: road.routeIntentId,
        width: road.width,
        points: road.points,
        surface: road.surface,
      };
    });
  return `collision-revision-v2:${stableDigest(
    JSON.stringify({
      placementKey,
      assetCatalog: {
        id: assets.catalog.id,
        schemaVersion: assets.catalog.schemaVersion,
        digest: assets.digest,
      },
      collisionSet,
      roadCollisionSet,
    }),
  )}`;
}

/**
 * Pins collision/navigation data to the authored catalog and deterministic
 * placement set. Callers may transport the revision, but cannot invent it.
 */
export function deriveWorldRenderCollisionRevisionV2({
  assetCatalog,
  placementKey,
  instances,
  roads,
}: DeriveWorldRenderCollisionRevisionV2Input): string {
  return collisionRevisionFromIndexedCatalog(
    indexCustomAssetCatalog(assetCatalog),
    placementKey,
    immutableSnapshot(instances),
    immutableSnapshot(roads),
  );
}

function assertRoads(design: WorldDesignSpecV3, roads: ReadonlyArray<WorldRenderRoadV2>): void {
  const routeIntentIds = new Set(design.routes.map((route) => route.id));
  for (const road of roads) {
    if (!routeIntentIds.has(road.routeIntentId)) {
      throw new Error(`Road ${road.id} does not reference a WorldDesignSpecV3 route intent.`);
    }
    if (!Number.isFinite(road.width) || road.width <= 0 || road.points.length < 2) {
      throw new Error(`Road ${road.id} requires positive width and at least two points.`);
    }
    if (!ROAD_SURFACES.has(road.surface)) {
      throw new Error(`Road ${road.id} has an unsupported surface.`);
    }
    road.points.forEach((point, index) =>
      assertFinitePoint(`Road ${road.id} point ${index}`, point),
    );
  }
}

function assertWildlifeRoutes(
  design: WorldDesignSpecV3,
  assets: CustomAssetIndexesV1,
  routes: ReadonlyArray<WorldRenderWildlifeRouteV2>,
): void {
  const habitatIds = new Set([
    ...design.regions.map((region) => region.id),
    ...design.ecology.groves.map((grove) => grove.id),
    ...design.ecology.wildlife.map((habitat) => habitat.id),
  ]);
  for (const route of routes) {
    if (route.points.length < 2) {
      throw new Error(`Wildlife route ${route.id} requires at least two points.`);
    }
    if (!habitatIds.has(route.habitatId)) {
      throw new Error(
        `Wildlife route ${route.id} does not reference a WorldDesignSpecV3 region or ecology habitat.`,
      );
    }
    if (!assets.animalFamilyIds.has(route.animalRole)) {
      throw new Error(
        `Wildlife route ${route.id} does not reference an animal family in CustomAssetCatalogV1.`,
      );
    }
    if (!WILDLIFE_BEHAVIORS.has(route.behavior)) {
      throw new Error(`Wildlife route ${route.id} has an unsupported behavior.`);
    }
    route.points.forEach((point, index) =>
      assertFinitePoint(`Wildlife route ${route.id} point ${index}`, point),
    );
  }
}

function assertNavigation(
  terrain: WorldRenderTerrainSummaryV2,
  roads: ReadonlyArray<WorldRenderRoadV2>,
  navigation: WorldRenderNavigationV2,
  expectedCollisionRevision: string,
): void {
  if (navigation.terrainArtifactKey !== terrain.key) {
    throw new Error("Navigation must reference the same TerrainArtifactV2 rendered by the scene.");
  }
  if (navigation.collisionRevision !== expectedCollisionRevision) {
    throw new Error(
      "Navigation collision revision must equal the catalog-placement-and-road-derived collision revision.",
    );
  }
  assertFinitePoint("Navigation walk entry", navigation.walkEntry.position);
  assertFinitePoint("Navigation walk target", navigation.walkEntry.target);
  if (navigation.waterRouteId !== null && typeof navigation.waterRouteId !== "string") {
    throw new Error("Navigation water route must be a road id or null.");
  }
  if (
    navigation.waterRouteId !== null &&
    !roads.some((road) => road.id === navigation.waterRouteId)
  ) {
    throw new Error("Navigation water route must reference a road in this render manifest.");
  }
}

/**
 * Finalizes the worker-produced Worlds V2 manifest. It is fail-closed: missing
 * custom assets, semantic provenance, terrain identity, or navigation parity
 * are errors rather than reasons to show the legacy low-poly fallback.
 */
export function createWorldRenderManifestV2({
  design,
  graph,
  terrain,
  assetCatalog,
  instances,
  roads,
  wildlifeRoutes,
  navigation,
}: CreateWorldRenderManifestV2Input): WorldRenderManifestV2 {
  assertWorldDesignSpecV3Integrity(design, graph);
  if (design.semanticGraphKey !== graph.key) {
    throw new Error("WorldRenderManifestV2 received a semantic graph that does not match design.");
  }
  const manifestTerrain = immutableSnapshot(terrain);
  const manifestInstances = immutableSnapshot(instances);
  const manifestRoads = immutableSnapshot(roads);
  const manifestWildlifeRoutes = immutableSnapshot(wildlifeRoutes);
  const manifestNavigation = immutableSnapshot(navigation);

  if (manifestTerrain.structureKey !== design.structureKey) {
    throw new Error("TerrainArtifactV2 does not match the world design structure key.");
  }
  assertCanonicalTerrainSummary(manifestTerrain, design.terrain.envelope);
  const assets = indexCustomAssetCatalog(assetCatalog);
  assertUniqueIds("render instance", manifestInstances);
  assertUniqueIds("road", manifestRoads);
  assertUniqueIds("wildlife route", manifestWildlifeRoutes);
  assertRoads(design, manifestRoads);
  assertWildlifeRoutes(design, assets, manifestWildlifeRoutes);

  const nodes = semanticNodeById(graph);
  const provenance: WorldRenderManifestV2["provenance"][number][] = [];
  for (const instance of manifestInstances) {
    assertFiniteTransform(instance);
    const node = nodes.get(instance.semanticNodeId);
    if (!node) {
      throw new Error(`Render instance ${instance.id} has no repository semantic node.`);
    }
    const family = assets.familyById.get(instance.assetId);
    if (!family) {
      throw new Error(
        `Render instance ${instance.id} references missing custom asset ${instance.assetId}.`,
      );
    }
    if (!family.collision.nodes.some((proxy) => proxy.name === instance.collisionProxyId)) {
      throw new Error(
        `Render instance ${instance.id} collision proxy does not belong to custom asset ${family.id}.`,
      );
    }
    const expected = expectedHeightScale(node);
    if (Math.abs(instance.semanticHeightScale - expected) > NUMERIC_TOLERANCE) {
      throw new Error(
        `Render instance ${instance.id} height scale ${instance.semanticHeightScale} does not match repository magnitude ${expected}.`,
      );
    }
    assertArchitectureProfile(instance, node, family);
    provenance.push({
      instanceId: instance.id,
      semanticNodeId: node.id,
      sourceUrl: sourceUrl(node),
    });
  }
  const expectedCollisionRevision = collisionRevisionFromIndexedCatalog(
    assets,
    design.sourcePlan.placementKey,
    manifestInstances,
    manifestRoads,
  );
  assertNavigation(manifestTerrain, manifestRoads, manifestNavigation, expectedCollisionRevision);

  const assetCatalogIdentity: WorldRenderManifestV2["assetCatalog"] = {
    id: assets.catalog.id,
    schemaVersion: assets.catalog.schemaVersion,
    digest: assets.digest,
  };
  const budgets: WorldRenderManifestV2["budgets"] = {
    status: "unmeasured",
    targets: {
      orbit: { maximumDrawCalls: 200, maximumVisibleTriangles: 2_000_000 },
      walk: { maximumDrawCalls: 220, maximumVisibleTriangles: 3_000_000 },
    },
  };

  const digest = stableDigest(
    JSON.stringify({
      structureKey: design.structureKey,
      appearanceKey: design.appearanceKey,
      rendererRevision: WORLD_RENDERER_V2_REVISION,
      assetCatalog: assetCatalogIdentity,
      terrain: manifestTerrain,
      instances: manifestInstances,
      roads: manifestRoads,
      wildlifeRoutes: manifestWildlifeRoutes,
      navigation: manifestNavigation,
      budgets,
    }),
  );

  return immutableSnapshot({
    schema: WORLD_RENDER_MANIFEST_V2_SCHEMA,
    rendererRevision: WORLD_RENDERER_V2_REVISION,
    key: `world-render-manifest-v2:${digest}`,
    structureKey: design.structureKey,
    appearanceKey: design.appearanceKey,
    repository: design.repository,
    designKey: design.structureKey,
    assetCatalog: assetCatalogIdentity,
    terrain: manifestTerrain,
    instances: manifestInstances,
    roads: manifestRoads,
    wildlifeRoutes: manifestWildlifeRoutes,
    navigation: manifestNavigation,
    provenance,
    budgets,
  });
}

export function worldRenderManifestPoint(
  point: WorldPlanPoint,
  height: number,
): Readonly<{ x: number; y: number; z: number }> {
  return { x: point.x, y: height, z: point.z };
}
