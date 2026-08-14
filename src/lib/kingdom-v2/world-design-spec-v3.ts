import { stableDigest, stableHash } from "../kingdom/hash";
import type { FileCategory, KingdomSeason, KingdomWorld } from "../kingdom/types";
import type {
  EllipseRegionMask,
  ForestGroveRegion,
  HamletRole,
  LandmarkRole,
  TerrainZone,
  WildlifeZone,
  WorldPlan,
  WorldPlanEnvelope,
  WorldPlanPoint,
} from "../kingdom/world-plan";
import type { KingdomWorldTheme } from "../kingdom/world-theme";
import {
  assertRepoSemanticGraphV2Integrity,
  type RepoSemanticGraphV2,
  type RepoSemanticRegionNode,
} from "./repo-semantic-graph-v2";

export const WORLD_DESIGN_SPEC_V3_SCHEMA = "repo-world-design/v3" as const;

export type WorldRegionFunction =
  "productive" | "verification" | "knowledge" | "systems" | "garden" | "mixed";

export type WorldDesignRegionV3 = Readonly<{
  id: string;
  semanticNodeId: string;
  provinceId: string;
  label: string;
  function: WorldRegionFunction;
  category: FileCategory;
  hierarchy: "primary" | "satellite" | "ecological";
  center: WorldPlanPoint;
  mask: EllipseRegionMask;
  representedFiles: number;
  magnitude: number;
  heightScaleRange: Readonly<{ min: number; max: number }>;
  hamlet: Readonly<{
    id: string;
    role: HamletRole;
    maxBuildings: number;
    entityIds: ReadonlyArray<string>;
  }> | null;
}>;

export type WorldGeomorphicOperator =
  | "ridge"
  | "basin"
  | "terrace"
  | "river-valley"
  | "cliff"
  | "erosion-channel"
  | "irregular-shoreline";

export type WorldDesignTerrainV3 = Readonly<{
  artifactResolution: 513;
  envelope: WorldPlanEnvelope;
  zones: ReadonlyArray<TerrainZone>;
  morphology: Readonly<{
    signature: string;
    ridgeBearingRadians: number;
    ridgeBranches: number;
    basinCount: number;
    shorelineLobes: number;
    watershedBranches: number;
    coastOpening: "north" | "east" | "south" | "west";
    relief: number;
  }>;
  operators: ReadonlyArray<
    Readonly<{
      kind: WorldGeomorphicOperator;
      weight: number;
      scale: "global" | "regional" | "local";
    }>
  >;
  chunkLods: readonly [129, 65, 33];
  sharedHydrology: true;
}>;

export type WorldDesignEcologyV3 = Readonly<{
  groves: ReadonlyArray<ForestGroveRegion>;
  wildlife: ReadonlyArray<WildlifeZone>;
  densityScale: number;
}>;

export type WorldDesignPoiV3 = Readonly<{
  id: string;
  provinceId: string;
  entityId: string | null;
  role: LandmarkRole;
  position: WorldPlanPoint;
  prominence: number;
}>;

export type WorldDesignRouteIntentV3 = Readonly<{
  id: string;
  fromSemanticNodeId: string;
  toSemanticNodeId: string;
  basis: "repository-route" | "manifest-dependency";
  evidence: string;
}>;

export type WorldDesignSpecV3 = Readonly<{
  schema: typeof WORLD_DESIGN_SPEC_V3_SCHEMA;
  integrityKey: string;
  structureKey: string;
  appearanceKey: string;
  repository: RepoSemanticGraphV2["repository"];
  semanticGraphKey: string;
  sourcePlan: Readonly<{
    schema: WorldPlan["schema"];
    version: WorldPlan["version"];
    topologyKey: string;
    terrainKey: string;
    placementKey: string;
  }>;
  appearance: Readonly<{
    season: KingdomSeason;
    worldTheme: KingdomWorldTheme;
  }>;
  terrain: WorldDesignTerrainV3;
  regions: ReadonlyArray<WorldDesignRegionV3>;
  routes: ReadonlyArray<WorldDesignRouteIntentV3>;
  ecology: WorldDesignEcologyV3;
  pois: ReadonlyArray<WorldDesignPoiV3>;
  mapping: Readonly<{
    directoryToRegion: "implemented";
    fileBytesToHeight: "implemented";
    aggregatesToDensity: "planned";
    categoryAndLanguageToArtRole: "planned";
    dependenciesToRoutes: "explicit-evidence-only";
    pathDepthToHierarchy: "planned";
  }>;
}>;

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function freezeWorldDesignValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((child) => freezeWorldDesignValue(child))) as T;
  }
  if (typeof value === "object" && value !== null) {
    const frozen: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) frozen[key] = freezeWorldDesignValue(child);
    return Object.freeze(frozen) as T;
  }
  return value;
}

function worldDesignIntegrityKey(design: Omit<WorldDesignSpecV3, "integrityKey">): string {
  return `world-design-integrity-v3:${stableDigest(JSON.stringify(design))}`;
}

type WorldDesignStructuralProjectionV3 = Pick<
  WorldDesignSpecV3,
  | "repository"
  | "semanticGraphKey"
  | "sourcePlan"
  | "terrain"
  | "regions"
  | "routes"
  | "ecology"
  | "pois"
  | "mapping"
>;

function worldDesignStructuralProjection(
  design: WorldDesignStructuralProjectionV3,
): WorldDesignStructuralProjectionV3 {
  return {
    repository: design.repository,
    semanticGraphKey: design.semanticGraphKey,
    sourcePlan: design.sourcePlan,
    terrain: design.terrain,
    regions: design.regions,
    routes: design.routes,
    ecology: design.ecology,
    pois: design.pois,
    mapping: design.mapping,
  };
}

function worldDesignStructureKey(design: WorldDesignStructuralProjectionV3): string {
  return `world-design-v3:${stableDigest(JSON.stringify(worldDesignStructuralProjection(design)))}`;
}

function assertDesignEnvelope(envelope: WorldPlanEnvelope): void {
  const values = [
    envelope.minX,
    envelope.maxX,
    envelope.minZ,
    envelope.maxZ,
    envelope.width,
    envelope.depth,
    envelope.center.x,
    envelope.center.z,
    envelope.safeMargin ?? 0,
  ];
  const tolerance = Math.max(0.001, Math.max(envelope.width, envelope.depth) * 1e-8);
  if (
    !values.every(Number.isFinite) ||
    envelope.width <= 0 ||
    envelope.depth <= 0 ||
    Math.abs(envelope.width - (envelope.maxX - envelope.minX)) > tolerance ||
    Math.abs(envelope.depth - (envelope.maxZ - envelope.minZ)) > tolerance ||
    Math.abs(envelope.center.x - (envelope.minX + envelope.maxX) * 0.5) > tolerance ||
    Math.abs(envelope.center.z - (envelope.minZ + envelope.maxZ) * 0.5) > tolerance ||
    (envelope.safeMargin ?? 0) < 0 ||
    (envelope.safeMargin ?? 0) > Math.min(envelope.width, envelope.depth) * 0.5
  ) {
    throw new Error("WorldDesignSpecV3 has an incoherent terrain envelope.");
  }
}

/** Validates immutable design identity at manifest and future cache boundaries. */
export function assertWorldDesignSpecV3Integrity(
  design: WorldDesignSpecV3,
  graph?: RepoSemanticGraphV2,
): asserts design is WorldDesignSpecV3 {
  if (design.schema !== WORLD_DESIGN_SPEC_V3_SCHEMA) {
    throw new Error("WorldDesignSpecV3 has an unsupported schema.");
  }
  if (graph) {
    assertRepoSemanticGraphV2Integrity(graph);
    if (
      design.semanticGraphKey !== graph.key ||
      JSON.stringify(design.repository) !== JSON.stringify(graph.repository)
    ) {
      throw new Error("WorldDesignSpecV3 does not match its semantic graph identity.");
    }
  }
  if (
    design.terrain.artifactResolution !== 513 ||
    JSON.stringify(design.terrain.chunkLods) !== JSON.stringify([129, 65, 33]) ||
    design.terrain.sharedHydrology !== true
  ) {
    throw new Error("WorldDesignSpecV3 terrain contract is not canonical.");
  }
  assertDesignEnvelope(design.terrain.envelope);
  if (graph) {
    const graphNodeIds = new Set(graph.nodes.map(({ id }) => id));
    if (
      design.regions.some(({ semanticNodeId }) => !graphNodeIds.has(semanticNodeId)) ||
      design.routes.some(
        ({ fromSemanticNodeId, toSemanticNodeId }) =>
          !graphNodeIds.has(fromSemanticNodeId) || !graphNodeIds.has(toSemanticNodeId),
      )
    ) {
      throw new Error("WorldDesignSpecV3 references semantic nodes outside its graph.");
    }
  }
  if (design.structureKey !== worldDesignStructureKey(design)) {
    throw new Error("WorldDesignSpecV3 structure key does not match its structural content.");
  }
  const expectedAppearanceKey = `world-appearance-v3:${stableDigest(
    `${design.structureKey.replace(/^world-design-v3:/u, "")}:${design.appearance.worldTheme}:${design.appearance.season}`,
  )}`;
  if (design.appearanceKey !== expectedAppearanceKey) {
    throw new Error("WorldDesignSpecV3 appearance key does not match its appearance contract.");
  }
  const { integrityKey, ...identity } = design;
  if (integrityKey !== worldDesignIntegrityKey(identity)) {
    throw new Error("WorldDesignSpecV3 integrity key does not match its structural content.");
  }
}

function regionFunction(category: FileCategory): WorldRegionFunction {
  switch (category) {
    case "source":
      return "productive";
    case "test":
      return "verification";
    case "docs":
      return "knowledge";
    case "config":
      return "systems";
    case "asset":
      return "garden";
    default:
      return "mixed";
  }
}

function regionHeightRange(
  graph: RepoSemanticGraphV2,
  provinceId: string,
): Readonly<{ min: number; max: number }> {
  const scales = graph.nodes
    .filter((node) => node.kind === "entity" && node.provinceId === provinceId)
    .map((node) => node.magnitude.heightScale);
  return {
    min: round(Math.min(...scales, 0.75)),
    max: round(Math.max(...scales, 0.75)),
  };
}

function terrainOperators(plan: WorldPlan): WorldDesignTerrainV3["operators"] {
  const progress = plan.topology.repositoryScale.logarithmicProgress;
  const ridgeWeight = round(0.72 + progress * 0.2);
  const basinWeight = round(0.55 + Math.abs(plan.topology.geography.lake.center.x) * 0.3);
  return [
    { kind: "ridge", weight: ridgeWeight, scale: "global" },
    { kind: "basin", weight: basinWeight, scale: "global" },
    {
      kind: "terrace",
      weight: round(0.48 + plan.topology.hamlets.length * 0.055),
      scale: "regional",
    },
    { kind: "river-valley", weight: 1, scale: "global" },
    { kind: "cliff", weight: round(0.58 + progress * 0.24), scale: "regional" },
    { kind: "erosion-channel", weight: round(0.62 + progress * 0.18), scale: "local" },
    { kind: "irregular-shoreline", weight: 1, scale: "local" },
  ];
}

function terrainMorphology(
  graph: RepoSemanticGraphV2,
  plan: WorldPlan,
): WorldDesignTerrainV3["morphology"] {
  const seed = stableHash(`${graph.key}:terrain-morphology-v3`);
  const regions = graph.nodes.filter((node) => node.kind === "region");
  const dependencyEdges = graph.edges.filter((edge) => edge.kind === "dependency").length;
  const sourceRegions = regions.filter((region) => region.category === "source").length;
  const testRegions = regions.filter((region) => region.category === "test").length;
  const progress = plan.topology.repositoryScale.logarithmicProgress;
  const coastOpenings = ["north", "east", "south", "west"] as const;
  const morphology = {
    ridgeBearingRadians: round(((seed & 0xffff) / 0xffff) * Math.PI * 2),
    ridgeBranches: Math.min(5, 1 + ((seed >>> 16) % 3) + Math.floor(progress * 2)),
    basinCount: Math.min(5, 1 + ((seed >>> 20) % 2) + Math.floor(regions.length / 7)),
    shorelineLobes: 5 + ((seed >>> 12) % 7),
    watershedBranches: Math.min(
      6,
      1 + ((seed >>> 8) % 2) + Math.floor(dependencyEdges / 4) + Math.floor(sourceRegions / 6),
    ),
    coastOpening: coastOpenings[(seed >>> 4) % coastOpenings.length]!,
    relief: round(Math.min(1, 0.46 + progress * 0.34 + Math.min(0.12, testRegions * 0.012))),
  };
  return {
    signature: `terrain-morphology-v3:${stableDigest(JSON.stringify(morphology))}`,
    ...morphology,
  };
}

function assertCompatibleInputs(
  world: KingdomWorld,
  plan: WorldPlan,
  graph: RepoSemanticGraphV2,
): void {
  const identity = `${world.source.repositoryId}:${world.source.commitSha}`;
  if (`${plan.repository.id}:${plan.repository.commitSha}` !== identity) {
    throw new Error("WorldDesignSpecV3 received a plan from a different repository revision.");
  }
  if (`${graph.repository.id}:${graph.repository.commitSha}` !== identity) {
    throw new Error("WorldDesignSpecV3 received a semantic graph from a different revision.");
  }
  if (plan.worldTheme !== world.worldTheme) {
    throw new Error("WorldDesignSpecV3 received a source plan from a different world theme.");
  }
}

function designRegion(
  graph: RepoSemanticGraphV2,
  plan: WorldPlan,
  semanticRegion: RepoSemanticRegionNode,
): WorldDesignRegionV3 {
  const hamlet = plan.topology.hamlets.find(
    (candidate) => candidate.provinceId === semanticRegion.provinceId,
  );
  const semanticZone = plan.topology.semanticZones.find(
    (candidate) => candidate.provinceId === semanticRegion.provinceId,
  );
  const mask = hamlet?.terrainMask ?? hamlet?.mask ?? semanticZone?.hitMask;
  if (!mask) {
    throw new Error(`Region ${semanticRegion.provinceId} has no renderer-independent design mask.`);
  }
  return {
    id: `design-region:${semanticRegion.provinceId}`,
    semanticNodeId: semanticRegion.id,
    provinceId: semanticRegion.provinceId,
    label: semanticRegion.label,
    function: regionFunction(semanticRegion.category),
    category: semanticRegion.category,
    hierarchy: hamlet ? (hamlet.role === "commons-hamlet" ? "satellite" : "primary") : "ecological",
    center: mask.center,
    mask,
    representedFiles: semanticRegion.magnitude.representedFiles,
    magnitude: semanticRegion.magnitude.normalized,
    heightScaleRange: regionHeightRange(graph, semanticRegion.provinceId),
    hamlet: hamlet
      ? {
          id: hamlet.id,
          role: hamlet.role,
          maxBuildings: hamlet.maxBuildings,
          entityIds: hamlet.buildingEntityIds,
        }
      : null,
  };
}

/**
 * Converts repository evidence plus the existing deterministic plan into the
 * renderer-independent Worlds V2 design contract.
 */
export function createWorldDesignSpecV3(
  world: KingdomWorld,
  plan: WorldPlan,
  graph: RepoSemanticGraphV2,
): WorldDesignSpecV3 {
  assertCompatibleInputs(world, plan, graph);
  const semanticRegions = graph.nodes.filter(
    (node): node is RepoSemanticRegionNode => node.kind === "region",
  );
  const regions = semanticRegions.map((region) => designRegion(graph, plan, region));
  const routes: WorldDesignRouteIntentV3[] = graph.edges
    .filter((edge) => edge.kind === "route" || edge.kind === "dependency")
    .map((edge) => ({
      id: `design-route:${edge.id}`,
      fromSemanticNodeId: edge.from,
      toSemanticNodeId: edge.to,
      basis: edge.kind === "dependency" ? "manifest-dependency" : "repository-route",
      evidence: edge.evidence.reference,
    }));
  const operators = terrainOperators(plan);
  const morphology = terrainMorphology(graph, plan);
  const structuralDesign = {
    repository: graph.repository,
    semanticGraphKey: graph.key,
    sourcePlan: {
      schema: plan.schema,
      version: plan.version,
      topologyKey: plan.topologyKey,
      terrainKey: plan.terrainKey,
      placementKey: plan.placementKey,
    },
    terrain: {
      artifactResolution: 513,
      envelope: plan.topology.envelope,
      zones: plan.topology.terrainZones,
      morphology,
      operators,
      chunkLods: [129, 65, 33],
      sharedHydrology: true,
    },
    regions,
    routes,
    ecology: {
      groves: plan.topology.groves,
      wildlife: plan.topology.wildlifeZones,
      densityScale: plan.identity.signals.woodlandDensity,
    },
    pois: plan.topology.landmarks.map((landmark) => ({
      id: landmark.id,
      provinceId: landmark.provinceId,
      entityId: landmark.entityId,
      role: landmark.role,
      position: landmark.position,
      prominence: landmark.prominence,
    })),
    mapping: {
      directoryToRegion: "implemented",
      fileBytesToHeight: "implemented",
      aggregatesToDensity: "planned",
      categoryAndLanguageToArtRole: "planned",
      dependenciesToRoutes: "explicit-evidence-only",
      pathDepthToHierarchy: "planned",
    },
  } as const satisfies WorldDesignStructuralProjectionV3;
  const structureKey = worldDesignStructureKey(structuralDesign);
  const appearanceDigest = stableDigest(
    `${structureKey.replace(/^world-design-v3:/u, "")}:${world.worldTheme}:${world.season}`,
  );

  const designWithoutIntegrity = {
    schema: WORLD_DESIGN_SPEC_V3_SCHEMA,
    structureKey,
    appearanceKey: `world-appearance-v3:${appearanceDigest}`,
    ...structuralDesign,
    appearance: {
      season: world.season,
      worldTheme: world.worldTheme,
    },
  } as const;
  const design: WorldDesignSpecV3 = {
    ...designWithoutIntegrity,
    integrityKey: worldDesignIntegrityKey(designWithoutIntegrity),
  };
  assertWorldDesignSpecV3Integrity(design, graph);
  return freezeWorldDesignValue(design);
}
