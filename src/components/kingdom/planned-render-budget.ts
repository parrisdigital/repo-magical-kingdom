import {
  getKenneySeasonalPalette,
  kenneySeasonalAssetReferenceUrl,
} from "@/lib/assets/kenney-seasonal";
import { quaterniusAssetUrl } from "@/lib/assets/quaternius";
import { stableFraction, stableHash } from "@/lib/kingdom/hash";
import type { KingdomSeason, KingdomWorld } from "@/lib/kingdom/types";
import type { WorldPlan, WorldPlanPoint } from "@/lib/kingdom/world-plan";

import type { PlannedLandUse } from "./planned-land-use";
import { createPlannedLandUseAssetInstances } from "./planned-land-use-layer";
import { createPlannedLifePlan, isPlannedLifeKindVisible } from "./planned-life-model";
import { PLANNED_REGIONAL_RENDER_LIMITS } from "./planned-regional-experience-layer";
import {
  PLANNED_REGIONAL_ASSET_COSTS,
  type PlannedRegionalAssetRole,
  type PlannedRegionalMount,
} from "./planned-regional-experience-model";
import type { PlannedScatter } from "./planned-scatter";
import {
  createPlannedHamletPathBatch,
  disposePlannedHamletPathBatch,
} from "./planned-hamlet-paths";
import {
  PLANNED_TREE_LOD_CONTRACT,
  plannedTreeLodFamilyFor,
  plannedTreeLodMode,
  plannedTreeLodPaletteFor,
  type PlannedTreeLodPalette,
} from "./planned-tree-lod";
import {
  PLANNED_THEME_LOD_CONTRACT,
  plannedThemeTreeTrianglesPerInstance,
} from "./planned-theme-lod";
import {
  buildPlannedTerrainGeometry,
  buildPlannedWaterGeometry,
  classifyPlannedTerrainRegion,
  getHamletVisualPlacementMask,
  getPlannedTerrainDefinition,
  samplePlannedTerrainHeight,
} from "./planned-terrain-model";
import type { PlannedVisualEnrichment } from "./planned-visual-enrichment";
import { createPlannedWorldThemeLayer } from "./planned-world-theme-model";
import {
  PLANNED_WALK_WILDLIFE_LOD_CONTRACT,
  type PlannedWalkWildlifeLodRole,
} from "./planned-wildlife-lod";
import {
  ARCHITECTURE_RECIPES,
  createRepositoryAssetVocabulary,
  type ArchitectureRecipe,
  type ArchitectureRecipeId,
  type GroundCompoundProp,
  type MedievalModuleRole,
  type RepositoryCompoundIdentity,
} from "./repo-asset-vocabulary";

export const PLANNED_SCENE_RENDER_BUDGET_SCHEMA = "planned-scene-render-budget/v1" as const;

export const PLANNED_SCENE_DESKTOP_ARCHITECTURE_TARGET = Object.freeze({
  maximumMainPassDrawCalls: 150,
  maximumVisibleTriangles: 750_000,
});

export type PlannedRenderQuality = "low" | "high";

export type ShippedGltfRenderStats = Readonly<{
  sourcePrimitives: number;
  triangles: number;
}>;

/**
 * Source-primitive and indexed-triangle counts read from the exact optimized
 * GLBs under public/assets/world. A test re-reads every binary so renderer
 * estimates cannot silently drift when an asset is replaced.
 */
export const SHIPPED_GLTF_RENDER_STATS: Readonly<Record<string, ShippedGltfRenderStats>> = {
  "/assets/world/kenney/holiday/rocks-small.glb": { sourcePrimitives: 1, triangles: 330 },
  "/assets/world/kenney/holiday/snow-flat-large.glb": { sourcePrimitives: 1, triangles: 108 },
  "/assets/world/kenney/holiday/snow-flat.glb": { sourcePrimitives: 1, triangles: 168 },
  "/assets/world/kenney/holiday/snow-pile.glb": { sourcePrimitives: 1, triangles: 132 },
  "/assets/world/kenney/holiday/tree-snow-a.glb": { sourcePrimitives: 1, triangles: 378 },
  "/assets/world/kenney/holiday/tree-snow-b.glb": { sourcePrimitives: 1, triangles: 374 },
  "/assets/world/kenney/holiday/tree-snow-c.glb": { sourcePrimitives: 1, triangles: 234 },
  "/assets/world/kenney/nature/crop_carrot.glb": { sourcePrimitives: 2, triangles: 148 },
  "/assets/world/kenney/nature/crop_melon.glb": { sourcePrimitives: 3, triangles: 236 },
  "/assets/world/kenney/nature/crop_pumpkin.glb": { sourcePrimitives: 2, triangles: 120 },
  "/assets/world/kenney/nature/crops_wheatStageB.glb": { sourcePrimitives: 2, triangles: 360 },
  "/assets/world/kenney/nature/flower_purpleA.glb": { sourcePrimitives: 2, triangles: 76 },
  "/assets/world/kenney/nature/grass_large.glb": { sourcePrimitives: 1, triangles: 224 },
  "/assets/world/kenney/nature/mushroom_redGroup.glb": { sourcePrimitives: 2, triangles: 144 },
  "/assets/world/kenney/nature/tree_blocks.glb": { sourcePrimitives: 2, triangles: 132 },
  "/assets/world/kenney/nature/tree_blocks_fall.glb": { sourcePrimitives: 2, triangles: 264 },
  "/assets/world/kenney/nature/tree_cone.glb": { sourcePrimitives: 2, triangles: 132 },
  "/assets/world/kenney/nature/tree_cone_fall.glb": { sourcePrimitives: 2, triangles: 132 },
  "/assets/world/kenney/nature/tree_default.glb": { sourcePrimitives: 2, triangles: 114 },
  "/assets/world/kenney/nature/tree_default_fall.glb": { sourcePrimitives: 2, triangles: 228 },
  "/assets/world/kenney/nature/tree_detailed.glb": { sourcePrimitives: 3, triangles: 402 },
  "/assets/world/kenney/nature/tree_detailed_fall.glb": { sourcePrimitives: 3, triangles: 402 },
  "/assets/world/kenney/nature/tree_fat.glb": { sourcePrimitives: 2, triangles: 50 },
  "/assets/world/kenney/nature/tree_fat_fall.glb": { sourcePrimitives: 2, triangles: 50 },
  "/assets/world/kenney/nature/tree_oak.glb": { sourcePrimitives: 2, triangles: 196 },
  "/assets/world/kenney/nature/tree_oak_fall.glb": { sourcePrimitives: 2, triangles: 196 },
  "/assets/world/quaternius/animals/Deer.glb": { sourcePrimitives: 7, triangles: 2_098 },
  "/assets/world/quaternius/animals/Fox.glb": { sourcePrimitives: 5, triangles: 1_848 },
  "/assets/world/quaternius/animals/Stag.glb": { sourcePrimitives: 6, triangles: 3_670 },
  "/assets/world/quaternius/medieval/Balcony_Cross_Straight.glb": {
    sourcePrimitives: 1,
    triangles: 132,
  },
  "/assets/world/quaternius/medieval/Corner_Exterior_Brick.glb": {
    sourcePrimitives: 1,
    triangles: 3_102,
  },
  "/assets/world/quaternius/medieval/Corner_Exterior_Wood.glb": {
    sourcePrimitives: 1,
    triangles: 12,
  },
  "/assets/world/quaternius/medieval/DoorFrame_Round_Brick.glb": {
    sourcePrimitives: 1,
    triangles: 2_046,
  },
  "/assets/world/quaternius/medieval/Door_1_Round.glb": { sourcePrimitives: 2, triangles: 470 },
  "/assets/world/quaternius/medieval/Prop_Chimney.glb": { sourcePrimitives: 2, triangles: 618 },
  "/assets/world/quaternius/medieval/Prop_Vine1.glb": { sourcePrimitives: 1, triangles: 82 },
  "/assets/world/quaternius/medieval/Prop_Wagon.glb": { sourcePrimitives: 1, triangles: 1_672 },
  "/assets/world/quaternius/medieval/Prop_WoodenFence_Single.glb": {
    sourcePrimitives: 1,
    triangles: 40,
  },
  "/assets/world/quaternius/medieval/Roof_RoundTiles_4x4.glb": {
    sourcePrimitives: 2,
    triangles: 1_996,
  },
  "/assets/world/quaternius/medieval/Roof_RoundTiles_6x8.glb": {
    sourcePrimitives: 2,
    triangles: 3_796,
  },
  "/assets/world/quaternius/medieval/Roof_RoundTiles_8x8.glb": {
    sourcePrimitives: 2,
    triangles: 3_888,
  },
  "/assets/world/quaternius/medieval/Roof_Tower_RoundTiles.glb": {
    sourcePrimitives: 4,
    triangles: 4_024,
  },
  "/assets/world/quaternius/medieval/Stairs_Exterior_Straight.glb": {
    sourcePrimitives: 2,
    triangles: 62,
  },
  "/assets/world/quaternius/medieval/Wall_Plaster_Door_Round.glb": {
    sourcePrimitives: 3,
    triangles: 137,
  },
  "/assets/world/quaternius/medieval/Wall_Plaster_Straight.glb": {
    sourcePrimitives: 2,
    triangles: 86,
  },
  "/assets/world/quaternius/medieval/Wall_Plaster_Window_Wide_Round.glb": {
    sourcePrimitives: 3,
    triangles: 124,
  },
  "/assets/world/quaternius/medieval/Wall_UnevenBrick_Door_Round.glb": {
    sourcePrimitives: 3,
    triangles: 136,
  },
  "/assets/world/quaternius/medieval/Wall_UnevenBrick_Straight.glb": {
    sourcePrimitives: 3,
    triangles: 56,
  },
  "/assets/world/quaternius/medieval/Wall_UnevenBrick_Window_Wide_Round.glb": {
    sourcePrimitives: 3,
    triangles: 116,
  },
  "/assets/world/quaternius/medieval/WindowShutters_Wide_Round_Open.glb": {
    sourcePrimitives: 1,
    triangles: 136,
  },
  "/assets/world/quaternius/medieval/Window_Wide_Round1.glb": {
    sourcePrimitives: 2,
    triangles: 354,
  },
  "/assets/world/quaternius/nature/Bush_Common.glb": { sourcePrimitives: 1, triangles: 900 },
  "/assets/world/quaternius/nature/Bush_Common_Flowers.glb": {
    sourcePrimitives: 2,
    triangles: 1_368,
  },
  "/assets/world/quaternius/nature/CommonTree_1.glb": { sourcePrimitives: 2, triangles: 6_265 },
  "/assets/world/quaternius/nature/CommonTree_2.glb": { sourcePrimitives: 2, triangles: 5_648 },
  "/assets/world/quaternius/nature/CommonTree_3.glb": { sourcePrimitives: 2, triangles: 3_505 },
  "/assets/world/quaternius/nature/DeadTree_1.glb": { sourcePrimitives: 1, triangles: 6_169 },
  "/assets/world/quaternius/nature/Fern_1.glb": { sourcePrimitives: 1, triangles: 288 },
  "/assets/world/quaternius/nature/Flower_3_Group.glb": { sourcePrimitives: 2, triangles: 755 },
  "/assets/world/quaternius/nature/Flower_4_Group.glb": { sourcePrimitives: 2, triangles: 1_690 },
  "/assets/world/quaternius/nature/Grass_Common_Short.glb": {
    sourcePrimitives: 1,
    triangles: 155,
  },
  "/assets/world/quaternius/nature/Mushroom_Common.glb": { sourcePrimitives: 1, triangles: 880 },
  "/assets/world/quaternius/nature/Pine_1.glb": { sourcePrimitives: 2, triangles: 3_947 },
  "/assets/world/quaternius/nature/Pine_2.glb": { sourcePrimitives: 2, triangles: 3_648 },
  "/assets/world/quaternius/nature/RockPath_Round_Small_1.glb": {
    sourcePrimitives: 1,
    triangles: 998,
  },
  "/assets/world/quaternius/nature/Rock_Medium_1.glb": { sourcePrimitives: 1, triangles: 342 },
  "/assets/world/quaternius/nature/Rock_Medium_2.glb": { sourcePrimitives: 1, triangles: 244 },
  "/assets/world/quaternius/nature/TwistedTree_1.glb": { sourcePrimitives: 2, triangles: 9_564 },
  "/assets/world/quaternius/nature/TwistedTree_2.glb": { sourcePrimitives: 2, triangles: 9_134 },
};

export type PlannedRenderConsumer = Readonly<{
  id: string;
  label: string;
  kind: "procedural" | "batched-assets" | "unbatched-assets" | "interaction" | "points";
  logicalItems: number;
  assetInstances: number;
  assetSourceBatches: number;
  lowerBoundDrawCalls: number;
  lowerBoundTriangles: number;
  mainPassDrawCalls: number;
  visibleTriangles: number;
  shadowPassDrawCalls: number;
  shadowTriangles: number;
}>;

export type PlannedRenderBudgetViolation = Readonly<{
  metric: "mainPassDrawCalls" | "visibleTriangles";
  actual: number;
  maximum: number;
  overBy: number;
}>;

export type PlannedRenderBudgetEstimate = Readonly<{
  schema: typeof PLANNED_SCENE_RENDER_BUDGET_SCHEMA;
  topologyKey: string;
  quality: PlannedRenderQuality;
  accounting: Readonly<{
    passScope: "main-color-plus-directional-shadow";
    source: "renderer-source-estimate";
    loadingFallbackIncluded: false;
    selectionMarkerIncluded: boolean;
    pointsCountAsDrawCallsButNotTriangles: true;
    note: string;
  }>;
  budget: Readonly<{
    maximumMainPassDrawCalls: number;
    maximumVisibleTriangles: number;
  }>;
  lowerBound: Readonly<{
    mainPassDrawCalls: number;
    visibleTriangles: number;
  }>;
  estimated: Readonly<{
    mainPassDrawCalls: number;
    visibleTriangles: number;
    shadowPassDrawCalls: number;
    shadowTriangles: number;
    wholeFrameDrawCalls: number;
    wholeFrameTriangles: number;
  }>;
  projectedAfterBoundedBatching: Readonly<{
    mainPassDrawCalls: number;
    visibleTriangles: number;
    withinBudget: boolean;
    changes: ReadonlyArray<string>;
  }>;
  triangleReductionPlan: Readonly<{
    consumerId: "vegetation.trees";
    currentInstances: number;
    currentTriangles: number;
    maximumOverviewTrianglesPerInstance: 400;
    projectedConsumerTriangles: number;
    projectedWholeSceneTriangles: number;
    requiredReduction: number;
    withinBudget: boolean;
    note: string;
  }>;
  withinBudget: boolean;
  violations: ReadonlyArray<PlannedRenderBudgetViolation>;
  consumers: ReadonlyArray<PlannedRenderConsumer>;
}>;

export type PlannedRenderBudgetInput = Readonly<{
  world: KingdomWorld;
  plan: WorldPlan;
  scatter: PlannedScatter;
  enrichment: PlannedVisualEnrichment;
  landUse: PlannedLandUse;
  quality?: PlannedRenderQuality;
  navigationMode?: "orbit" | "walk";
  selectionMarkerActive?: boolean;
}>;

export class PlannedRenderBudgetExceededError extends RangeError {
  readonly estimate: PlannedRenderBudgetEstimate;

  constructor(estimate: PlannedRenderBudgetEstimate) {
    super(
      `Planned scene exceeds desktop renderer budget: ${estimate.violations
        .map((violation) => `${violation.metric} ${violation.actual}/${violation.maximum}`)
        .join(", ")}.`,
    );
    this.name = "PlannedRenderBudgetExceededError";
    this.estimate = estimate;
  }
}

type AssetInstances = ReadonlyArray<string>;

function assetStats(url: string): ShippedGltfRenderStats {
  const stats = SHIPPED_GLTF_RENDER_STATS[url];
  if (!stats) throw new Error(`Missing shipped GLB renderer stats for ${url}.`);
  return stats;
}

function proceduralConsumer(
  id: string,
  label: string,
  drawCalls: number,
  triangles: number,
  kind: PlannedRenderConsumer["kind"] = "procedural",
  shadow = false,
): PlannedRenderConsumer {
  return {
    id,
    label,
    kind,
    logicalItems: drawCalls,
    assetInstances: 0,
    assetSourceBatches: 0,
    lowerBoundDrawCalls: drawCalls,
    lowerBoundTriangles: triangles,
    mainPassDrawCalls: drawCalls,
    visibleTriangles: triangles,
    shadowPassDrawCalls: shadow ? drawCalls : 0,
    shadowTriangles: shadow ? triangles : 0,
  };
}

function regionalExperienceConsumer(
  quality: PlannedRenderQuality,
  mount: PlannedRegionalMount,
): PlannedRenderConsumer {
  const limits = PLANNED_REGIONAL_RENDER_LIMITS[quality][mount];
  const triangles = (Object.keys(limits) as PlannedRegionalAssetRole[]).reduce(
    (total, role) => total + limits[role] * PLANNED_REGIONAL_ASSET_COSTS[role].triangles,
    0,
  );
  const drawCalls = mount === "far" ? 1 : 2;
  return proceduralConsumer(
    `regional-experience.${mount}`,
    `${mount === "near" ? "Near" : "Far"} route-conditioned regional dressing ceiling`,
    drawCalls,
    triangles,
    "procedural",
    mount === "near",
  );
}

function batchedProceduralConsumer(
  id: string,
  label: string,
  logicalItems: number,
  triangles: number,
  shadow = false,
): PlannedRenderConsumer {
  const drawCalls = logicalItems > 0 ? 1 : 0;
  return {
    id,
    label,
    kind: "procedural",
    logicalItems,
    assetInstances: 0,
    assetSourceBatches: 0,
    lowerBoundDrawCalls: drawCalls,
    lowerBoundTriangles: triangles,
    mainPassDrawCalls: drawCalls,
    visibleTriangles: triangles,
    shadowPassDrawCalls: shadow ? drawCalls : 0,
    shadowTriangles: shadow ? triangles : 0,
  };
}

function assetConsumer(
  id: string,
  label: string,
  instances: AssetInstances,
  batching: "by-url" | "individual",
  castShadow: boolean,
): PlannedRenderConsumer {
  const groups = new Map<string, number>();
  for (const url of instances) groups.set(url, (groups.get(url) ?? 0) + 1);
  const lowerBoundDrawCalls = batching === "by-url" ? groups.size : instances.length;
  const mainPassDrawCalls =
    batching === "by-url"
      ? [...groups.keys()].reduce((total, url) => total + assetStats(url).sourcePrimitives, 0)
      : instances.reduce((total, url) => total + assetStats(url).sourcePrimitives, 0);
  const visibleTriangles = instances.reduce((total, url) => total + assetStats(url).triangles, 0);
  return {
    id,
    label,
    kind: batching === "by-url" ? "batched-assets" : "unbatched-assets",
    logicalItems: batching === "by-url" ? groups.size : instances.length,
    assetInstances: instances.length,
    assetSourceBatches: groups.size,
    lowerBoundDrawCalls,
    lowerBoundTriangles: 0,
    mainPassDrawCalls,
    visibleTriangles,
    shadowPassDrawCalls: castShadow ? mainPassDrawCalls : 0,
    shadowTriangles: castShadow ? visibleTriangles : 0,
  };
}

function sum<T>(items: ReadonlyArray<T>, value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}

function mapInstances(groups: ReadonlyMap<string, number>): string[] {
  return [...groups.entries()].flatMap(([url, count]) => Array.from({ length: count }, () => url));
}

function addUrlCount(groups: Map<string, number>, url: string, count = 1): void {
  groups.set(url, (groups.get(url) ?? 0) + count);
}

const MODULE_URLS: Readonly<Record<MedievalModuleRole, string>> = {
  plasterWall: quaterniusAssetUrl("medieval", "Wall_Plaster_Straight"),
  plasterDoor: quaterniusAssetUrl("medieval", "Wall_Plaster_Door_Round"),
  plasterWindow: quaterniusAssetUrl("medieval", "Wall_Plaster_Window_Wide_Round"),
  brickWall: quaterniusAssetUrl("medieval", "Wall_UnevenBrick_Straight"),
  brickDoor: quaterniusAssetUrl("medieval", "Wall_UnevenBrick_Door_Round"),
  brickWindow: quaterniusAssetUrl("medieval", "Wall_UnevenBrick_Window_Wide_Round"),
  brickCorner: quaterniusAssetUrl("medieval", "Corner_Exterior_Brick"),
  woodCorner: quaterniusAssetUrl("medieval", "Corner_Exterior_Wood"),
  brickDoorframe: quaterniusAssetUrl("medieval", "DoorFrame_Round_Brick"),
  standaloneDoor: quaterniusAssetUrl("medieval", "Door_1_Round"),
  standaloneWindow: quaterniusAssetUrl("medieval", "Window_Wide_Round1"),
  shutters: quaterniusAssetUrl("medieval", "WindowShutters_Wide_Round_Open"),
  roofSmall: quaterniusAssetUrl("medieval", "Roof_RoundTiles_4x4"),
  roofWide: quaterniusAssetUrl("medieval", "Roof_RoundTiles_6x8"),
  roofLarge: quaterniusAssetUrl("medieval", "Roof_RoundTiles_8x8"),
  roofTower: quaterniusAssetUrl("medieval", "Roof_Tower_RoundTiles"),
  chimney: quaterniusAssetUrl("medieval", "Prop_Chimney"),
  wagon: quaterniusAssetUrl("medieval", "Prop_Wagon"),
  fence: quaterniusAssetUrl("medieval", "Prop_WoodenFence_Single"),
  vine: quaterniusAssetUrl("medieval", "Prop_Vine1"),
  stairs: quaterniusAssetUrl("medieval", "Stairs_Exterior_Straight"),
  balcony: quaterniusAssetUrl("medieval", "Balcony_Cross_Straight"),
};

const GROUND_URLS = {
  bush: quaterniusAssetUrl("nature", "Bush_Common"),
  "flowering-bush": quaterniusAssetUrl("nature", "Bush_Common_Flowers"),
  fern: quaterniusAssetUrl("nature", "Fern_1"),
  grass: quaterniusAssetUrl("nature", "Grass_Common_Short"),
  "flower-group": quaterniusAssetUrl("nature", "Flower_3_Group"),
  mushroom: quaterniusAssetUrl("nature", "Mushroom_Common"),
} as const;

const AMBIENT_URLS = {
  "medium-rock-1": quaterniusAssetUrl("nature", "Rock_Medium_1"),
  "medium-rock-2": quaterniusAssetUrl("nature", "Rock_Medium_2"),
  "round-rock-path": quaterniusAssetUrl("nature", "RockPath_Round_Small_1"),
  bush: GROUND_URLS.bush,
  "flowering-bush": GROUND_URLS["flowering-bush"],
  fern: GROUND_URLS.fern,
  grass: GROUND_URLS.grass,
  "flower-group": GROUND_URLS["flower-group"],
} as const;

const ANIMAL_URLS = {
  deer: quaterniusAssetUrl("animals", "Deer"),
  fox: quaterniusAssetUrl("animals", "Fox"),
  stag: quaterniusAssetUrl("animals", "Stag"),
} as const;

const COMPOUND_PROP_FOOTPRINT_RADIUS: Readonly<Record<GroundCompoundProp, number>> = {
  fence: 1.05,
  stairs: 1.5,
  wagon: 3.35,
};

const TERRAIN_QUALITY_OPTIONS = {
  low: {
    segmentsX: 68,
    segmentsZ: 78,
    courseSegments: 42,
    courseCrossSegments: 3,
    lakeRingCount: 6,
  },
  high: {
    segmentsX: 112,
    segmentsZ: 128,
    courseSegments: 76,
    courseCrossSegments: 5,
    lakeRingCount: 10,
  },
} as const;

function isValidStructure(
  structure: PlannedScatter["buildings"][number] | PlannedScatter["landmarks"][number],
  plan: WorldPlan,
): boolean {
  const region = classifyPlannedTerrainRegion(
    plan,
    structure.transform.position.x,
    structure.transform.position.z,
  );
  return (
    region.inside &&
    region.water === null &&
    region.material !== "shore" &&
    region.slopeDegrees <= structure.terrain.maxSlopeDegrees
  );
}

function addRecipeInstances(
  groups: Map<string, number>,
  recipe: ArchitectureRecipe,
  options: Readonly<{
    compound: RepositoryCompoundIdentity;
    hero: boolean;
    enchanted: boolean;
  }>,
): void {
  for (let story = 0; story < recipe.stories; story += 1) {
    const layeredPortal = story === 0 && recipe.layeredPortal;
    const layeredWindow = story === 0 && recipe.layeredWindow;
    const frontLeft = layeredPortal
      ? recipe.wall
      : story === 0
        ? recipe.integratedDoor
        : recipe.integratedWindow;
    const frontRight = layeredWindow ? recipe.wall : recipe.integratedWindow;
    const pieces: ReadonlyArray<MedievalModuleRole> = [
      frontLeft,
      frontRight,
      recipe.integratedWindow,
      recipe.wall,
      recipe.integratedWindow,
      recipe.wall,
      recipe.integratedWindow,
      recipe.wall,
    ];
    for (const role of pieces) addUrlCount(groups, MODULE_URLS[role]);
    if (layeredPortal) {
      addUrlCount(groups, MODULE_URLS.brickDoorframe);
      addUrlCount(groups, MODULE_URLS.standaloneDoor);
    }
    if (layeredWindow) {
      addUrlCount(groups, MODULE_URLS.standaloneWindow);
      if (recipe.shutters) addUrlCount(groups, MODULE_URLS.shutters);
    }
    if (recipe.corner && story === 0) addUrlCount(groups, MODULE_URLS[recipe.corner], 2);
  }
  addUrlCount(groups, MODULE_URLS[recipe.roof]);
  if (recipe.chimney) addUrlCount(groups, MODULE_URLS.chimney);
  if (recipe.stairs) addUrlCount(groups, MODULE_URLS.stairs);
  if (recipe.balcony) addUrlCount(groups, MODULE_URLS.balcony);
  if (recipe.vine) addUrlCount(groups, MODULE_URLS.vine);
  if (options.enchanted) addUrlCount(groups, MODULE_URLS.vine);
  if (!options.hero || recipe.annex === "none") return;
  const annexRecipeId: ArchitectureRecipeId =
    recipe.annex === "tower-wing"
      ? "stone-observatory"
      : recipe.annex === "brick-wing"
        ? "brick-corner-workshop"
        : "plaster-shutter-cottage";
  addRecipeInstances(groups, ARCHITECTURE_RECIPES[annexRecipeId], {
    compound: options.compound,
    hero: false,
    enchanted: options.enchanted,
  });
}

type PlannedStructure = PlannedScatter["buildings"][number] | PlannedScatter["landmarks"][number];

type HamletCompound = Readonly<{
  hamletId: string;
  identity: RepositoryCompoundIdentity;
  center: WorldPlanPoint;
  radiusX: number;
  radiusZ: number;
  rotation: number;
}>;

function createHamletCompounds(
  plan: WorldPlan,
  scatter: PlannedScatter,
): ReadonlyMap<string, HamletCompound> {
  const identities = new Map<string, RepositoryCompoundIdentity>();
  for (const structure of [...scatter.buildings, ...scatter.landmarks]) {
    if (structure.hamletId === null) continue;
    const identity = structure.architecture.compoundIdentity;
    const existing = identities.get(structure.hamletId);
    if (existing !== undefined && existing !== identity) {
      throw new Error(`Conflicting planned compound identities for ${structure.hamletId}.`);
    }
    identities.set(structure.hamletId, identity);
  }
  const compounds = new Map<string, HamletCompound>();
  for (const hamlet of plan.topology.hamlets) {
    const identity = identities.get(hamlet.id);
    if (identity === undefined)
      throw new Error(`Missing planned compound identity for ${hamlet.id}.`);
    const mask = getHamletVisualPlacementMask(plan, hamlet);
    const jitter =
      (stableFraction(`${plan.topologyKey}:${hamlet.id}:compound-orientation`) - 0.5) * 0.42;
    compounds.set(hamlet.id, {
      hamletId: hamlet.id,
      identity,
      center: mask.center,
      radiusX: mask.radiusX,
      radiusZ: mask.radiusZ,
      rotation: mask.rotation + jitter,
    });
  }
  return compounds;
}

function compoundPoint(compound: HamletCompound, localX: number, localZ: number): WorldPlanPoint {
  const cosine = Math.cos(compound.rotation);
  const sine = Math.sin(compound.rotation);
  return {
    x: compound.center.x + localX * cosine + localZ * sine,
    z: compound.center.z - localX * sine + localZ * cosine,
  };
}

function validCompoundPropFootprint(
  plan: WorldPlan,
  point: WorldPlanPoint,
  radius: number,
  structures: ReadonlyArray<PlannedStructure>,
): boolean {
  const samples = Array.from({ length: 9 }, (_, index) => {
    if (index === 0) return point;
    const angle = ((index - 1) / 8) * Math.PI * 2;
    return { x: point.x + Math.cos(angle) * radius, z: point.z + Math.sin(angle) * radius };
  });
  if (
    samples.some((sample) => {
      const region = classifyPlannedTerrainRegion(plan, sample.x, sample.z);
      return (
        !region.inside ||
        region.water !== null ||
        region.material === "shore" ||
        region.slopeDegrees > 18
      );
    })
  ) {
    return false;
  }
  return structures.every(
    (structure) =>
      Math.hypot(
        point.x - structure.transform.position.x,
        point.z - structure.transform.position.z,
      ) >=
      radius + structure.footprintRadius + 0.35,
  );
}

function maybeAddCompoundProp(
  groups: Map<string, number>,
  plan: WorldPlan,
  compound: HamletCompound,
  structures: ReadonlyArray<PlannedStructure>,
  role: GroundCompoundProp,
  localX: number,
  localZ: number,
  scale: number,
): void {
  const point = compoundPoint(compound, localX, localZ);
  if (
    validCompoundPropFootprint(
      plan,
      point,
      COMPOUND_PROP_FOOTPRINT_RADIUS[role] * scale,
      structures,
    )
  ) {
    addUrlCount(groups, MODULE_URLS[role]);
  }
}

function addCompoundGroundInstances(
  groups: Map<string, number>,
  plan: WorldPlan,
  compound: HamletCompound,
  structures: ReadonlyArray<PlannedStructure>,
  vocabulary: ReturnType<typeof createRepositoryAssetVocabulary>,
): void {
  const side = Math.min(compound.radiusX, compound.radiusZ);
  const back = side * (compound.identity === "productive" ? -0.54 : -0.48);
  const fencePoints: ReadonlyArray<readonly [number, number]> =
    compound.identity === "civic"
      ? [
          [-5.4, back],
          [-1.8, back],
          [1.8, back],
          [5.4, back],
          [-5.8, back + 3.2],
          [5.8, back + 3.2],
        ]
      : compound.identity === "productive"
        ? [
            [-5.4, back],
            [-1.8, back],
            [1.8, back],
            [5.4, back],
            [-5.8, back + 3.2],
            [-5.8, back + 6.4],
          ]
        : [
            [-4.6, back],
            [-1.4, back],
            [1.8, back],
            [5, back],
            [5.4, back + 3],
          ];
  for (const [localX, localZ] of fencePoints) {
    maybeAddCompoundProp(groups, plan, compound, structures, "fence", localX, localZ, 1.04);
  }
  const propPoints: ReadonlyArray<readonly [number, number]> =
    compound.identity === "productive"
      ? [
          [4.7, 1.8],
          [1.6, 4.4],
        ]
      : compound.identity === "village"
        ? [
            [-4.2, 2.8],
            [3.8, 3.7],
          ]
        : [
            [0, 4.6],
            [-4.1, 2.4],
          ];
  for (const [index, role] of vocabulary.compoundPropPriority[compound.identity]
    .slice(0, 2)
    .entries()) {
    const point = propPoints[index]!;
    const scale = role === "wagon" ? (index === 0 ? 0.9 : 0.78) : role === "stairs" ? 0.7 : 1;
    maybeAddCompoundProp(groups, plan, compound, structures, role, point[0], point[1], scale);
  }
}

function architectureAssetGroups(plan: WorldPlan, scatter: PlannedScatter): Map<string, number> {
  const groups = new Map<string, number>();
  const structures: PlannedStructure[] = [...scatter.buildings, ...scatter.landmarks];
  const compounds = createHamletCompounds(plan, scatter);
  for (const structure of structures) {
    if (!isValidStructure(structure, plan)) continue;
    addRecipeInstances(groups, ARCHITECTURE_RECIPES[structure.architecture.recipeId], {
      compound: structure.architecture.compoundIdentity,
      hero: structure.architecture.hero,
      enchanted: plan.worldTheme === "enchanted-forest",
    });
  }
  const vocabulary = createRepositoryAssetVocabulary({
    placementKey: plan.placementKey,
    geographyId: plan.topology.geography.id,
    archetype: plan.identity.archetype,
    repositoryIdentity: `${plan.repository.id}:${plan.repository.owner}/${plan.repository.name}:${plan.repository.commitSha}`,
  });
  for (const compound of compounds.values()) {
    addCompoundGroundInstances(groups, plan, compound, structures, vocabulary);
  }
  return groups;
}

function overviewTreeLodCounts(
  plan: WorldPlan,
  scatter: PlannedScatter,
  enrichment: PlannedVisualEnrichment,
  ancientTreeIds: ReadonlySet<string>,
): ReadonlyMap<PlannedTreeLodPalette, number> {
  const counts = new Map<PlannedTreeLodPalette, number>();
  const add = (palette: PlannedTreeLodPalette) =>
    counts.set(palette, (counts.get(palette) ?? 0) + 1);
  for (const tree of scatter.trees) {
    add(
      plannedTreeLodPaletteFor(plan.appearance.season, {
        paletteRole: tree.paletteRole,
        ancient: ancientTreeIds.has(tree.id),
      }),
    );
  }
  for (const tree of enrichment.supplementalTrees) {
    add(
      plannedTreeLodPaletteFor(plan.appearance.season, {
        paletteRole: tree.paletteRole,
        ancient: false,
      }),
    );
  }
  return counts;
}

function overviewTreeLodConsumer(
  plan: WorldPlan,
  counts: ReadonlyMap<PlannedTreeLodPalette, number>,
): PlannedRenderConsumer {
  const assetInstances = sum([...counts.values()], (count) => count);
  const mainPassDrawCalls = counts.size * PLANNED_TREE_LOD_CONTRACT.overviewDrawCallsPerPalette;
  const visibleTriangles = sum([...counts.entries()], ([palette, count]) => {
    return count * plannedThemeTreeTrianglesPerInstance(plan.worldTheme, palette);
  });
  return {
    id: "vegetation.trees",
    label: "Procedural deterministic overview tree LODs",
    kind: "procedural",
    logicalItems: counts.size,
    assetInstances,
    assetSourceBatches: counts.size,
    lowerBoundDrawCalls: mainPassDrawCalls,
    lowerBoundTriangles: visibleTriangles,
    mainPassDrawCalls,
    visibleTriangles,
    shadowPassDrawCalls: mainPassDrawCalls,
    shadowTriangles: visibleTriangles,
  };
}

function walkTreeHybridConsumer(
  plan: WorldPlan,
  counts: ReadonlyMap<PlannedTreeLodPalette, number>,
): PlannedRenderConsumer {
  const overview = overviewTreeLodConsumer(plan, counts);
  const families = new Set([...counts.keys()].map((palette) => plannedTreeLodFamilyFor(palette)))
    .size;
  const farDrawCalls = families * PLANNED_TREE_LOD_CONTRACT.walkLodDrawCallsPerFamily;
  const mainPassDrawCalls =
    farDrawCalls + PLANNED_TREE_LOD_CONTRACT.maximumWalkDetailSourcePrimitives;
  const visibleTriangles =
    overview.visibleTriangles + PLANNED_TREE_LOD_CONTRACT.maximumWalkDetailTriangleDelta;
  return {
    id: "vegetation.trees",
    label: "Walk near-detail shipped trees with family-batched far LODs",
    kind: "procedural",
    logicalItems: families + 1,
    assetInstances: overview.assetInstances,
    assetSourceBatches: families + 1,
    lowerBoundDrawCalls: farDrawCalls,
    lowerBoundTriangles: overview.visibleTriangles,
    mainPassDrawCalls,
    visibleTriangles,
    shadowPassDrawCalls: mainPassDrawCalls,
    shadowTriangles: visibleTriangles,
  };
}

function walkWildlifeHybridConsumer(instances: AssetInstances): PlannedRenderConsumer {
  const roleEntries = (Object.entries(ANIMAL_URLS) as Array<[PlannedWalkWildlifeLodRole, string]>)
    .map(([role, url]) => ({
      role,
      url,
      count: instances.filter((instance) => instance === url).length,
    }))
    .filter(({ count }) => count > 0);
  const farDrawCalls =
    roleEntries.length * PLANNED_WALK_WILDLIFE_LOD_CONTRACT.maximumFarDrawCallsPerPopulatedRole;
  const farTriangles = sum(roleEntries, ({ role, count }) => {
    return count * PLANNED_WALK_WILDLIFE_LOD_CONTRACT.trianglesPerFarInstanceByRole[role];
  });
  const animatedCandidates = roleEntries.filter(({ url }) => {
    return (
      assetStats(url).sourcePrimitives <=
      PLANNED_WALK_WILDLIFE_LOD_CONTRACT.maximumAnimatedSourcePrimitives
    );
  });
  const animatedDrawCalls = Math.max(
    0,
    ...animatedCandidates.map(({ url }) => assetStats(url).sourcePrimitives),
  );
  const animatedTriangleDelta = Math.max(
    0,
    ...animatedCandidates.map(({ role, url }) => {
      return (
        assetStats(url).triangles -
        PLANNED_WALK_WILDLIFE_LOD_CONTRACT.trianglesPerFarInstanceByRole[role]
      );
    }),
  );
  return {
    id: "wildlife.actors",
    label: "One animated authored Walk actor with role-batched far 3D wildlife LODs",
    kind: "batched-assets",
    logicalItems: roleEntries.length + (animatedCandidates.length > 0 ? 1 : 0),
    assetInstances: instances.length,
    assetSourceBatches: roleEntries.length + (animatedCandidates.length > 0 ? 1 : 0),
    lowerBoundDrawCalls: farDrawCalls + (animatedCandidates.length > 0 ? 1 : 0),
    lowerBoundTriangles: farTriangles,
    mainPassDrawCalls: farDrawCalls + animatedDrawCalls,
    visibleTriangles: farTriangles + animatedTriangleDelta,
    shadowPassDrawCalls: farDrawCalls + animatedDrawCalls,
    shadowTriangles: farTriangles + animatedTriangleDelta,
  };
}

function groundAssetGroups(plan: WorldPlan, scatter: PlannedScatter): Map<string, number> {
  const groups = new Map<string, number>();
  const details = getKenneySeasonalPalette(plan.appearance.season).groundDetails;
  for (const cluster of scatter.groundCoverClusters) {
    for (const member of cluster.members) {
      const probability = stableFraction(
        `${cluster.id}:${member.offset.x}:${member.offset.z}:seasonal-detail`,
      );
      const seasonalRole = member.assetRole === "flower-group" || member.assetRole === "mushroom";
      const seasonal =
        seasonalRole ||
        (plan.appearance.season === "winter" && probability < 0.18) ||
        (plan.appearance.season === "autumn" && probability < 0.12);
      const url = seasonal
        ? kenneySeasonalAssetReferenceUrl(details[Math.floor(probability * details.length)]!)
        : GROUND_URLS[member.assetRole];
      addUrlCount(groups, url);
    }
  }
  return groups;
}

function ambientAssetGroups(
  scatter: PlannedScatter,
  predicate: (role: PlannedScatter["ambientDetails"][number]["assetRole"]) => boolean,
): Map<string, number> {
  const groups = new Map<string, number>();
  for (const detail of scatter.ambientDetails) {
    if (predicate(detail.assetRole)) addUrlCount(groups, AMBIENT_URLS[detail.assetRole]);
  }
  return groups;
}

function enrichmentAssetGroups<Item extends Readonly<{ assetRole: keyof typeof AMBIENT_URLS }>>(
  items: ReadonlyArray<Item>,
): Map<string, number> {
  const groups = new Map<string, number>();
  for (const item of items) addUrlCount(groups, AMBIENT_URLS[item.assetRole]);
  return groups;
}

function orchardAssetUrl(season: KingdomSeason): string {
  return kenneySeasonalAssetReferenceUrl(getKenneySeasonalPalette(season).canopy[1]!);
}

function lakeHabitatAssetUrls(plan: WorldPlan): string[] {
  const islet = getPlannedTerrainDefinition(plan).water.lake.islet;
  if (!islet.enabled) return [];
  const rockUrls = [AMBIENT_URLS["medium-rock-1"], AMBIENT_URLS["medium-rock-2"]] as const;
  return islet.detailAnchors.map((anchor) => {
    if (anchor.role === "ruin") return MODULE_URLS.brickDoor;
    if (anchor.role === "rock") return rockUrls[stableHash(anchor.id) % rockUrls.length]!;
    return orchardAssetUrl(plan.appearance.season);
  });
}

function polygonTriangleCount(polygon: ReadonlyArray<WorldPlanPoint>): number {
  return polygon.length < 3 ? 0 : polygon.length * 7;
}

function polygonBorderTriangleCount(polygon: ReadonlyArray<WorldPlanPoint>): number {
  return polygon.length < 2 ? 0 : polygon.length * 4;
}

function ribbonTriangleCount(points: ReadonlyArray<WorldPlanPoint>): number {
  let uniqueCount = 0;
  let previous: WorldPlanPoint | null = null;
  for (const point of points) {
    if (!previous || Math.hypot(point.x - previous.x, point.z - previous.z) > 0.000_1) {
      uniqueCount += 1;
      previous = point;
    }
  }
  return uniqueCount < 2 ? 0 : (uniqueCount - 1) * 4;
}

function splitRoadPointRuns(
  segment: PlannedLandUse["primaryRoad"]["segments"][number],
): ReadonlyArray<ReadonlyArray<WorldPlanPoint>> {
  if (segment.points.length < 2) return [];
  const crossings = [...segment.crossings].sort(
    (first, second) =>
      first.startPointIndex - second.startPointIndex || first.endPointIndex - second.endPointIndex,
  );
  if (crossings.length === 0) return [segment.points];
  const runs: Array<ReadonlyArray<WorldPlanPoint>> = [];
  let cursor = 0;
  for (const crossing of crossings) {
    const start = Math.max(cursor, Math.min(segment.points.length - 1, crossing.startPointIndex));
    if (start - cursor >= 1) runs.push(segment.points.slice(cursor, start + 1));
    cursor = Math.max(cursor, Math.min(segment.points.length - 1, crossing.endPointIndex));
  }
  if (segment.points.length - 1 - cursor >= 1) runs.push(segment.points.slice(cursor));
  return runs;
}

function crossingPoints(
  segment: PlannedLandUse["primaryRoad"]["segments"][number],
  crossing: PlannedLandUse["primaryRoad"]["segments"][number]["crossings"][number],
): ReadonlyArray<PlannedLandUse["primaryRoad"]["segments"][number]["points"][number]> {
  const start = Math.max(0, crossing.startPointIndex - 1);
  const end = Math.min(segment.points.length - 1, crossing.endPointIndex + 1);
  return segment.points.slice(start, end + 1);
}

function bridgeStructureTriangles(
  plan: WorldPlan,
  segment: PlannedLandUse["primaryRoad"]["segments"][number],
  crossing: PlannedLandUse["primaryRoad"]["segments"][number]["crossings"][number],
): number {
  const points = crossingPoints(segment, crossing);
  if (points.length < 2) return 0;
  let supportBoxes = 0;
  const deckHeight = (point: (typeof points)[number]) => {
    const region = classifyPlannedTerrainRegion(plan, point.x, point.z);
    return Math.max(point.y + 0.22, (region.waterSurfaceHeight ?? point.y) + 0.72);
  };
  for (let index = 0; index < points.length; index += 1) {
    if (index !== 0 && index !== points.length - 1 && index % 3 !== 0) continue;
    const point = points[index]!;
    const previous = points[Math.max(0, index - 1)]!;
    const next = points[Math.min(points.length - 1, index + 1)]!;
    const deltaX = next.x - previous.x;
    const deltaZ = next.z - previous.z;
    const length = Math.max(0.000_1, Math.hypot(deltaX, deltaZ));
    const normalX = -deltaZ / length;
    const normalZ = deltaX / length;
    for (const side of [-1, 1]) {
      const x = point.x + normalX * segment.width * 0.4 * side;
      const z = point.z + normalZ * segment.width * 0.4 * side;
      const bottom = samplePlannedTerrainHeight(plan, x, z) + 0.04;
      const top = deckHeight(point) - 0.08;
      if (top > bottom + 0.18) supportBoxes += 1;
    }
  }
  return ribbonTriangleCount(points) + supportBoxes * 12;
}

function steppedCutTriangles(
  plan: WorldPlan,
  segment: PlannedLandUse["primaryRoad"]["segments"][number],
  crossing: PlannedLandUse["primaryRoad"]["segments"][number]["crossings"][number],
): Readonly<{ surface: number; structure: number }> {
  const points = crossingPoints(segment, crossing);
  let previousTop: number | null = null;
  let risers = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const deltaX = end.x - start.x;
    const deltaZ = end.z - start.z;
    const length = Math.max(0.000_1, Math.hypot(deltaX, deltaZ));
    const normalX = -deltaZ / length;
    const normalZ = deltaX / length;
    const halfWidth = segment.width / 2;
    const samples = [
      { x: start.x + normalX * halfWidth, z: start.z + normalZ * halfWidth },
      { x: start.x - normalX * halfWidth, z: start.z - normalZ * halfWidth },
      { x: end.x + normalX * halfWidth, z: end.z + normalZ * halfWidth },
      { x: end.x - normalX * halfWidth, z: end.z - normalZ * halfWidth },
    ];
    const top =
      Math.max(...samples.map((point) => samplePlannedTerrainHeight(plan, point.x, point.z))) +
      0.16;
    if (previousTop !== null && Math.abs(previousTop - top) > 0.025) risers += 1;
    previousTop = top;
  }
  const segments = Math.max(0, points.length - 1);
  return { surface: segments * 2, structure: segments * 4 + risers * 2 };
}

function landUseSurfaceMetrics(
  plan: WorldPlan,
  landUse: PlannedLandUse,
): Readonly<{ drawCalls: number; triangles: number }> {
  let drawCalls = 0;
  let triangles = 0;
  const signatures = [
    "civic-square",
    "productive-yard",
    "garden-orchard",
    "frontier-enclosure",
    "village-lanes",
  ] as const;
  for (const signature of signatures) {
    const zones = landUse.zones.filter((zone) => zone.signature === signature);
    const surfaceTriangles = sum(zones, (zone) => polygonTriangleCount(zone.polygon));
    const borderTriangles = sum(zones, (zone) => polygonBorderTriangleCount(zone.polygon));
    if (surfaceTriangles > 0) drawCalls += 1;
    if (borderTriangles > 0) drawCalls += 1;
    triangles += surfaceTriangles + borderTriangles;
  }
  for (const role of ["field", "orchard", "garden"] as const) {
    const roleTriangles = sum(
      landUse.landscapePolygons.filter((polygon) => polygon.role === role),
      (polygon) => polygonTriangleCount(polygon.polygon),
    );
    if (roleTriangles > 0) drawCalls += 1;
    triangles += roleTriangles;
  }
  const ordinaryTriangles = sum(landUse.primaryRoad.segments, (segment) =>
    sum(splitRoadPointRuns(segment), ribbonTriangleCount),
  );
  if (ordinaryTriangles > 0) drawCalls += 2;
  triangles += ordinaryTriangles * 2;
  let bridgeSurface = 0;
  let bridgeStructure = 0;
  let steppedSurface = 0;
  let steppedStructure = 0;
  for (const segment of landUse.primaryRoad.segments) {
    for (const crossing of segment.crossings) {
      if (crossing.kind === "bridge") {
        const points = crossingPoints(segment, crossing);
        bridgeSurface += ribbonTriangleCount(points);
        bridgeStructure += bridgeStructureTriangles(plan, segment, crossing);
      } else {
        const metrics = steppedCutTriangles(plan, segment, crossing);
        steppedSurface += metrics.surface;
        steppedStructure += metrics.structure;
      }
    }
  }
  for (const count of [bridgeSurface, bridgeStructure, steppedSurface, steppedStructure]) {
    if (count > 0) drawCalls += 1;
    triangles += count;
  }
  return { drawCalls, triangles };
}

function pathSurfaceMetrics(
  plan: WorldPlan,
  scatter: PlannedScatter,
): Readonly<{ drawCalls: number; triangles: number; renderedEdges: number }> {
  const batch = createPlannedHamletPathBatch(plan, scatter);
  const metrics = {
    renderedEdges: batch.renderedEdgeIds.length,
    drawCalls: batch.drawCallCount,
    triangles: batch.generatedTriangleCount,
  };
  disposePlannedHamletPathBatch(batch);
  return metrics;
}

function terrainConsumers(plan: WorldPlan, quality: PlannedRenderQuality): PlannedRenderConsumer[] {
  const terrain = buildPlannedTerrainGeometry(plan, TERRAIN_QUALITY_OPTIONS[quality]);
  const water = buildPlannedWaterGeometry(plan, TERRAIN_QUALITY_OPTIONS[quality]);
  const escarpmentColumns = quality === "high" ? 88 : 48;
  const escarpmentRearRows = quality === "high" ? 12 : 8;
  const escarpmentBands = 4 + Math.floor(stableFraction(`${plan.terrainKey}:ribbon:bands`) * 3);
  const escarpmentFaceRows = 2 + escarpmentBands * 3;
  const escarpmentTriangles =
    (escarpmentFaceRows - 1) * escarpmentColumns * 2 +
    escarpmentColumns * 2 +
    escarpmentColumns * escarpmentRearRows * 2 +
    2 * (escarpmentFaceRows + escarpmentRearRows + 1);
  const pieces = [
    ["terrain.surface", "Terrain surface", terrain.surface.triangleCount],
    ["terrain.side-cliffs", "Terrain side cliffs", terrain.sideCliffs.triangleCount],
    ["terrain.islet", "Terrain islet", terrain.islet.triangleCount],
    ["terrain.escarpment", "Rear escarpment", escarpmentTriangles],
    ["terrain.water", "Watershed", water.triangleCount],
  ] as const;
  return pieces.flatMap(([id, label, triangles]) =>
    triangles > 0 ? [proceduralConsumer(id, label, 1, triangles)] : [],
  );
}

function themeConsumers(
  plan: WorldPlan,
  scatter: PlannedScatter,
  navigationMode: "orbit" | "walk",
): Readonly<{ consumers: PlannedRenderConsumer[]; ancientTreeIds: ReadonlySet<string> }> {
  const theme = createPlannedWorldThemeLayer(plan, scatter);
  const consumers: PlannedRenderConsumer[] = [];
  if (theme.worldTheme === "enchanted-forest") {
    const navigationLabel = navigationMode === "walk" ? "Walk" : "Orbit";
    if (theme.runestones.length > 0) {
      consumers.push(
        assetConsumer(
          "theme.runestone-assets",
          "Enchanted runestone assets",
          theme.runestones.map(() => AMBIENT_URLS["medium-rock-2"]),
          "by-url",
          true,
        ),
        batchedProceduralConsumer(
          "theme.runestone-glows",
          `${navigationLabel}-batched full-detail enchanted runestone glow rings`,
          theme.runestones.length,
          theme.runestones.length * PLANNED_THEME_LOD_CONTRACT.runestoneGlowTrianglesPerInstance,
        ),
      );
    }
    if (theme.mushrooms.length > 0) {
      consumers.push(
        assetConsumer(
          "theme.mushrooms",
          "Enchanted mushroom ring assets",
          theme.mushrooms.map(() => GROUND_URLS.mushroom),
          "by-url",
          false,
        ),
      );
    }
    if (theme.rootArches.length > 0) {
      consumers.push(
        batchedProceduralConsumer(
          "theme.root-arches",
          `${navigationLabel}-batched full-detail enchanted root arches`,
          theme.rootArches.length,
          theme.rootArches.length * PLANNED_THEME_LOD_CONTRACT.rootArchTrianglesPerInstance,
          true,
        ),
      );
    }
    if (theme.fireflies.length > 0) {
      consumers.push(
        proceduralConsumer("theme.fireflies", "Enchanted firefly points", 1, 0, "points"),
      );
    }
  }
  return { consumers, ancientTreeIds: new Set(theme.ancientTreeIds) };
}

function lifeConsumers(
  plan: WorldPlan,
  scatter: PlannedScatter,
  enrichment: PlannedVisualEnrichment,
): PlannedRenderConsumer[] {
  const life = createPlannedLifePlan(plan, scatter, enrichment);
  const groups = [
    ["petal", life.petals.length],
    ["smoke", life.smoke.length],
    ["water-mote", life.waterMotes.length],
  ] as const;
  return groups.flatMap(([kind, count]) =>
    count > 0 && isPlannedLifeKindVisible(kind, plan.appearance.season)
      ? [proceduralConsumer(`life.${kind}`, `Seasonal ${kind} points`, 1, 0, "points")]
      : [],
  );
}

function projectedDrawCalls(consumer: PlannedRenderConsumer): number {
  if (consumer.kind === "interaction") return 0;
  if (consumer.id === "paths.hamlet-lanes") return consumer.mainPassDrawCalls > 0 ? 2 : 0;
  if (consumer.id === "land-use.anchor-assets" || consumer.id === "lake.habitat-assets") {
    return consumer.assetSourceBatches;
  }
  if (consumer.id === "portals") return consumer.logicalItems > 0 ? 2 : 0;
  if (consumer.kind === "batched-assets" || consumer.kind === "unbatched-assets") {
    return consumer.lowerBoundDrawCalls;
  }
  return consumer.mainPassDrawCalls;
}

export function estimatePlannedSceneRenderBudget(
  input: PlannedRenderBudgetInput,
): PlannedRenderBudgetEstimate {
  const { world, plan, scatter, enrichment, landUse } = input;
  const quality = input.quality ?? "high";
  const navigationMode = input.navigationMode ?? "orbit";
  const treeMode = plannedTreeLodMode(navigationMode);
  if (scatter.topologyKey !== `scatter-${plan.topologyKey}`) {
    throw new Error("Renderer budget requires scatter from the same world plan.");
  }
  if (landUse.topologyKey !== plan.topologyKey) {
    throw new Error("Renderer budget requires land use from the same world plan.");
  }
  const planBudget = plan.topology.visualBudgets;
  if (
    planBudget.maxDrawCalls !==
      PLANNED_SCENE_DESKTOP_ARCHITECTURE_TARGET.maximumMainPassDrawCalls ||
    planBudget.maxVisibleTriangles !==
      PLANNED_SCENE_DESKTOP_ARCHITECTURE_TARGET.maximumVisibleTriangles
  ) {
    throw new Error(
      `World plan changed the desktop renderer architecture target to ${planBudget.maxDrawCalls}/${planBudget.maxVisibleTriangles}.`,
    );
  }

  const themed = themeConsumers(plan, scatter, navigationMode);
  const architectureGroups = architectureAssetGroups(plan, scatter);
  const treeLodCounts = overviewTreeLodCounts(plan, scatter, enrichment, themed.ancientTreeIds);
  const treeConsumer =
    treeMode === "overview-lod"
      ? overviewTreeLodConsumer(plan, treeLodCounts)
      : walkTreeHybridConsumer(plan, treeLodCounts);
  const groundGroups = groundAssetGroups(plan, scatter);
  const ambientRockGroups = ambientAssetGroups(
    scatter,
    (role) => role === "medium-rock-1" || role === "medium-rock-2",
  );
  const ambientSoftGroups = ambientAssetGroups(
    scatter,
    (role) => role !== "medium-rock-1" && role !== "medium-rock-2",
  );
  const landUseMetrics = landUseSurfaceMetrics(plan, landUse);
  const pathMetrics = pathSurfaceMetrics(plan, scatter);
  const landUseAssets = createPlannedLandUseAssetInstances(landUse, plan.appearance.season).map(
    (instance) => instance.url,
  );
  const wildlifeAssets = scatter.wildlife.map((animal) => ANIMAL_URLS[animal.assetRole]);

  const consumers: PlannedRenderConsumer[] = [
    ...terrainConsumers(plan, quality),
    ...(quality === "high" && navigationMode === "walk"
      ? [proceduralConsumer("atmosphere.sky", "Analytic cinematic sky", 1, 12)]
      : []),
    proceduralConsumer(
      "paths.hamlet-lanes",
      `Hamlet lane and courtyard ribbons (${pathMetrics.renderedEdges} edges)`,
      pathMetrics.drawCalls,
      pathMetrics.triangles,
    ),
    proceduralConsumer(
      "land-use.surfaces",
      "Developed zones, landscapes, primary roads, and crossings",
      landUseMetrics.drawCalls,
      landUseMetrics.triangles,
    ),
    assetConsumer(
      "land-use.anchor-assets",
      "URL-batched land-use anchors",
      landUseAssets,
      "by-url",
      false,
    ),
    assetConsumer(
      "lake.habitat-assets",
      "Individually cloned islet habitat assets",
      lakeHabitatAssetUrls(plan),
      "individual",
      false,
    ),
    treeConsumer,
    assetConsumer(
      "vegetation.ground",
      "Instanced grove ground cover",
      mapInstances(groundGroups),
      "by-url",
      false,
    ),
    assetConsumer(
      "vegetation.ambient-rocks",
      "Instanced shadow-casting ambient rocks",
      mapInstances(ambientRockGroups),
      "by-url",
      true,
    ),
    assetConsumer(
      "vegetation.ambient-soft",
      "Instanced ambient foliage and path rocks",
      mapInstances(ambientSoftGroups),
      "by-url",
      false,
    ),
    assetConsumer(
      "vegetation.cliffs",
      "Instanced cliff formations",
      mapInstances(enrichmentAssetGroups(enrichment.cliffFormations)),
      "by-url",
      true,
    ),
    assetConsumer(
      "vegetation.shore",
      "Instanced shore details",
      mapInstances(enrichmentAssetGroups(enrichment.shoreDetails)),
      "by-url",
      false,
    ),
    assetConsumer(
      "vegetation.meadow",
      "Instanced meadow details",
      mapInstances(enrichmentAssetGroups(enrichment.meadowDetails)),
      "by-url",
      false,
    ),
    assetConsumer(
      "architecture.assets",
      "Instanced modular architecture and compound props",
      mapInstances(architectureGroups),
      "by-url",
      true,
    ),
    treeMode === "overview-lod"
      ? assetConsumer(
          "wildlife.actors",
          "Role-batched overview wildlife",
          wildlifeAssets,
          "by-url",
          true,
        )
      : walkWildlifeHybridConsumer(wildlifeAssets),
    ...themed.consumers,
    ...lifeConsumers(plan, scatter, enrichment),
    ...(navigationMode === "walk"
      ? [
          proceduralConsumer(
            "walk-detail.soft",
            "Bounded Walk grass and reed instances",
            2,
            1_600 * 6 + 260 * 6,
          ),
          proceduralConsumer(
            "walk-detail.solid",
            "Bounded Walk flower and stone instances",
            2,
            180 * 78 + 140 * 144,
            "procedural",
            true,
          ),
          regionalExperienceConsumer(quality, "far"),
          regionalExperienceConsumer(quality, "near"),
        ]
      : []),
    // The analytic interaction index retains identical hit semantics with no
    // transparent WebGL meshes in either Orbit or Walk.
    proceduralConsumer(
      "portals",
      "Repository portal rings and disks",
      world.portals.length > 0 ? 2 : 0,
      world.portals.length * (10 * 32 * 2 + 32),
    ),
    ...(input.selectionMarkerActive
      ? [proceduralConsumer("selection.marker", "Selection marker ring", 1, 40 * 2)]
      : []),
  ].filter((consumer) => consumer.mainPassDrawCalls > 0);

  const budget = {
    maximumMainPassDrawCalls: planBudget.maxDrawCalls,
    maximumVisibleTriangles: planBudget.maxVisibleTriangles,
  };
  const lowerBound = {
    mainPassDrawCalls: sum(consumers, (consumer) => consumer.lowerBoundDrawCalls),
    visibleTriangles: sum(consumers, (consumer) => consumer.lowerBoundTriangles),
  };
  const estimated = {
    mainPassDrawCalls: sum(consumers, (consumer) => consumer.mainPassDrawCalls),
    visibleTriangles: sum(consumers, (consumer) => consumer.visibleTriangles),
    shadowPassDrawCalls:
      quality === "high" ? sum(consumers, (consumer) => consumer.shadowPassDrawCalls) : 0,
    shadowTriangles:
      quality === "high" ? sum(consumers, (consumer) => consumer.shadowTriangles) : 0,
    wholeFrameDrawCalls: 0,
    wholeFrameTriangles: 0,
  };
  estimated.wholeFrameDrawCalls = estimated.mainPassDrawCalls + estimated.shadowPassDrawCalls;
  estimated.wholeFrameTriangles = estimated.visibleTriangles + estimated.shadowTriangles;
  const projectedBatchDrawCalls = sum(consumers, projectedDrawCalls);
  const projectedAfterBoundedBatching = {
    mainPassDrawCalls: projectedBatchDrawCalls,
    visibleTriangles: estimated.visibleTriangles,
    withinBudget:
      projectedBatchDrawCalls <= budget.maximumMainPassDrawCalls &&
      estimated.visibleTriangles <= budget.maximumVisibleTriangles,
    changes: [
      "Merge every path border and surface into two geometry batches.",
      "Move transparent structure/province hit geometry to a raycast-only interaction index.",
      "Batch land-use and lake habitat clones by asset URL while retaining instance metadata.",
      "Collapse each shipped GLB to one source primitive with an offline material atlas where needed.",
      "Instance portal geometry and merge enchanted repeated procedural geometry.",
    ],
  };
  const estimatedTreeConsumer = consumers.find((consumer) => consumer.id === "vegetation.trees");
  if (!estimatedTreeConsumer)
    throw new Error("Renderer budget requires a vegetation tree consumer.");
  const maximumOverviewTrianglesPerInstance = 400 as const;
  const projectedTreeTriangles = estimatedTreeConsumer.visibleTriangles;
  const projectedWholeSceneTriangles =
    estimated.visibleTriangles - estimatedTreeConsumer.visibleTriangles + projectedTreeTriangles;
  const triangleReductionPlan = {
    consumerId: "vegetation.trees" as const,
    currentInstances: estimatedTreeConsumer.assetInstances,
    currentTriangles: estimatedTreeConsumer.visibleTriangles,
    maximumOverviewTrianglesPerInstance,
    projectedConsumerTriangles: projectedTreeTriangles,
    projectedWholeSceneTriangles,
    requiredReduction: Math.max(0, estimated.visibleTriangles - budget.maximumVisibleTriangles),
    withinBudget: projectedWholeSceneTriangles <= budget.maximumVisibleTriangles,
    note:
      treeMode === "overview-lod"
        ? "The measured procedural overview LOD is active; shipped tree GLBs remain reserved for bounded Walk detail."
        : "Walk keeps shipped detail inside a 16k triangle-delta bubble and family-batches every far semantic tree.",
  };
  const violations: PlannedRenderBudgetViolation[] = [];
  if (estimated.mainPassDrawCalls > budget.maximumMainPassDrawCalls) {
    violations.push({
      metric: "mainPassDrawCalls",
      actual: estimated.mainPassDrawCalls,
      maximum: budget.maximumMainPassDrawCalls,
      overBy: estimated.mainPassDrawCalls - budget.maximumMainPassDrawCalls,
    });
  }
  if (estimated.visibleTriangles > budget.maximumVisibleTriangles) {
    violations.push({
      metric: "visibleTriangles",
      actual: estimated.visibleTriangles,
      maximum: budget.maximumVisibleTriangles,
      overBy: estimated.visibleTriangles - budget.maximumVisibleTriangles,
    });
  }
  return {
    schema: PLANNED_SCENE_RENDER_BUDGET_SCHEMA,
    topologyKey: plan.topologyKey,
    quality,
    accounting: {
      passScope: "main-color-plus-directional-shadow",
      source: "renderer-source-estimate",
      loadingFallbackIncluded: false,
      selectionMarkerIncluded: input.selectionMarkerActive ?? false,
      pointsCountAsDrawCallsButNotTriangles: true,
      note: "Main-pass budget comparison excludes the separately reported directional shadow pass. GLB counts include source primitives and visible instance multiplication; loading fallback and post-processing are outside this scene contract.",
    },
    budget,
    lowerBound,
    estimated,
    projectedAfterBoundedBatching,
    triangleReductionPlan,
    withinBudget: violations.length === 0,
    violations,
    consumers: [...consumers].sort(
      (first, second) =>
        second.mainPassDrawCalls - first.mainPassDrawCalls ||
        second.visibleTriangles - first.visibleTriangles ||
        first.id.localeCompare(second.id),
    ),
  };
}

export function assertPlannedSceneRenderBudget(estimate: PlannedRenderBudgetEstimate): void {
  if (!estimate.withinBudget) throw new PlannedRenderBudgetExceededError(estimate);
}
