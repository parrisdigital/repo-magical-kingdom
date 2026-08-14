import type { KingdomWorld, WorldPlan } from "@/lib/kingdom";

import {
  createPlannedLandUseAssetBatches,
  createPlannedLandUseAssetInstances,
} from "./planned-land-use-layer";
import type { PlannedLandUse } from "./planned-land-use";
import {
  estimatePlannedSceneRenderBudget,
  SHIPPED_GLTF_RENDER_STATS,
} from "./planned-render-budget";
import type { PlannedScatter } from "./planned-scatter";
import {
  createPlannedHamletPathBatch,
  disposePlannedHamletPathBatch,
} from "./planned-hamlet-paths";
import { createPlannedScenePickRecords } from "./planned-scene-picking";
import type { PlannedVisualEnrichment } from "./planned-visual-enrichment";

export const PLANNED_RENDER_BATCHING_CONTRACT_SCHEMA =
  "planned-render-batching-contract/v1" as const;

export type PlannedRenderBatchingTransition = Readonly<{
  id: string;
  before: number;
  after: number;
  reduction: number;
}>;

export type PlannedRenderBatchingContract = Readonly<{
  schema: typeof PLANNED_RENDER_BATCHING_CONTRACT_SCHEMA;
  beforeMainPassDrawCalls: 352;
  afterMainPassDrawCalls: number;
  maximumMainPassDrawCalls: 150;
  withinBudget: boolean;
  transitions: ReadonlyArray<PlannedRenderBatchingTransition>;
}>;

const CAPTURED_NEXT_BASELINE_MAIN_PASS_DRAWS = 352;
const CAPTURED_NEXT_PHASE_ZERO_CONSUMERS = Object.freeze({
  hamletPaths: 70,
  architectureHits: 33,
  semanticHits: 17,
  wildlife: 72,
  portals: 16,
  landUseAnchors: 22,
  trees: 20,
});
const CAPTURED_NEXT_PHASE_ZERO_OTHER_CONSUMERS = 102;
const CAPTURED_NEXT_BOUNDED_OTHER_CONSUMERS = 100;
function sourcePrimitiveDraws(urls: ReadonlyArray<string>): number {
  return [...new Set(urls)].reduce((total, url) => {
    const stats = SHIPPED_GLTF_RENDER_STATS[url];
    if (!stats) throw new Error(`Missing shipped renderer stats for ${url}.`);
    return total + stats.sourcePrimitives;
  }, 0);
}

/**
 * Exact whole-scene count for the captured Next fixture. Named transitions come
 * from planners consumed by the renderer. The remaining main-pass consumers
 * are pinned as one measured aggregate so either side of the contract fails
 * when an unaccounted renderer seam changes.
 */
export function createPlannedRenderBatchingContract(
  input: Readonly<{
    world: KingdomWorld;
    plan: WorldPlan;
    scatter: PlannedScatter;
    landUse: PlannedLandUse;
    enrichment: PlannedVisualEnrichment;
  }>,
): PlannedRenderBatchingContract {
  const { world, plan, scatter, landUse, enrichment } = input;
  const before = estimatePlannedSceneRenderBudget({
    world,
    plan,
    scatter,
    enrichment,
    landUse,
    quality: "high",
    navigationMode: "orbit",
  });
  const paths = createPlannedHamletPathBatch(plan, scatter);
  const pickRecords = createPlannedScenePickRecords(world, plan, scatter);
  const architectureRecordCount = pickRecords.filter(
    (record) => record.shape.kind === "box",
  ).length;
  const semanticRecordCount = pickRecords.filter(
    (record) => record.shape.kind === "ellipse",
  ).length;
  if (architectureRecordCount === 0 || semanticRecordCount === 0) {
    disposePlannedHamletPathBatch(paths);
    throw new Error("Analytic pick records must retain architecture and semantic provenance.");
  }
  const wildlifeUrls = scatter.wildlife.map((animal) => {
    const name = animal.assetRole === "deer" ? "Deer" : animal.assetRole === "fox" ? "Fox" : "Stag";
    return `/assets/world/quaternius/animals/${name}.glb`;
  });
  const anchorBatches = createPlannedLandUseAssetBatches(
    createPlannedLandUseAssetInstances(landUse, plan.appearance.season),
  );
  const overviewTreeDrawCalls = before.consumers.find(
    (consumer) => consumer.id === "vegetation.trees",
  )?.mainPassDrawCalls;
  if (overviewTreeDrawCalls === undefined) {
    disposePlannedHamletPathBatch(paths);
    throw new Error("Captured renderer estimate has no overview tree consumer.");
  }
  const transitions: PlannedRenderBatchingTransition[] = [
    {
      id: "paths.hamlet-lanes",
      before: CAPTURED_NEXT_PHASE_ZERO_CONSUMERS.hamletPaths,
      after: paths.drawCallCount,
      reduction: CAPTURED_NEXT_PHASE_ZERO_CONSUMERS.hamletPaths - paths.drawCallCount,
    },
    {
      id: "interaction.architecture-hits",
      before: CAPTURED_NEXT_PHASE_ZERO_CONSUMERS.architectureHits,
      after: 0,
      reduction: CAPTURED_NEXT_PHASE_ZERO_CONSUMERS.architectureHits,
    },
    {
      id: "interaction.semantic-hits",
      before: CAPTURED_NEXT_PHASE_ZERO_CONSUMERS.semanticHits,
      after: 0,
      reduction: CAPTURED_NEXT_PHASE_ZERO_CONSUMERS.semanticHits,
    },
    {
      id: "wildlife.actors",
      before: CAPTURED_NEXT_PHASE_ZERO_CONSUMERS.wildlife,
      after: sourcePrimitiveDraws(wildlifeUrls),
      reduction: CAPTURED_NEXT_PHASE_ZERO_CONSUMERS.wildlife - sourcePrimitiveDraws(wildlifeUrls),
    },
    {
      id: "portals",
      before: CAPTURED_NEXT_PHASE_ZERO_CONSUMERS.portals,
      after: world.portals.length > 0 ? 2 : 0,
      reduction: CAPTURED_NEXT_PHASE_ZERO_CONSUMERS.portals - (world.portals.length > 0 ? 2 : 0),
    },
    {
      id: "land-use.anchor-assets",
      before: CAPTURED_NEXT_PHASE_ZERO_CONSUMERS.landUseAnchors,
      after: sourcePrimitiveDraws(anchorBatches.map((batch) => batch.url)),
      reduction:
        CAPTURED_NEXT_PHASE_ZERO_CONSUMERS.landUseAnchors -
        sourcePrimitiveDraws(anchorBatches.map((batch) => batch.url)),
    },
    {
      id: "vegetation.trees",
      before: CAPTURED_NEXT_PHASE_ZERO_CONSUMERS.trees,
      after: overviewTreeDrawCalls,
      reduction: CAPTURED_NEXT_PHASE_ZERO_CONSUMERS.trees - overviewTreeDrawCalls,
    },
  ];
  const currentOtherConsumers =
    before.estimated.mainPassDrawCalls -
    transitions.reduce((total, transition) => total + transition.after, 0);
  if (currentOtherConsumers !== CAPTURED_NEXT_BOUNDED_OTHER_CONSUMERS) {
    disposePlannedHamletPathBatch(paths);
    throw new Error(
      `Other bounded renderer consumers drifted to ${currentOtherConsumers}; expected ${CAPTURED_NEXT_BOUNDED_OTHER_CONSUMERS}.`,
    );
  }
  transitions.push({
    id: "renderer.other-main-pass-consumers",
    before: CAPTURED_NEXT_PHASE_ZERO_OTHER_CONSUMERS,
    after: currentOtherConsumers,
    reduction: CAPTURED_NEXT_PHASE_ZERO_OTHER_CONSUMERS - currentOtherConsumers,
  });
  disposePlannedHamletPathBatch(paths);
  const afterMainPassDrawCalls = transitions.reduce(
    (total, transition) => total - transition.before + transition.after,
    CAPTURED_NEXT_BASELINE_MAIN_PASS_DRAWS,
  );
  if (before.estimated.mainPassDrawCalls !== afterMainPassDrawCalls) {
    throw new Error(
      `Renderer estimator ${before.estimated.mainPassDrawCalls} does not match implemented batching contract ${afterMainPassDrawCalls}.`,
    );
  }
  return {
    schema: PLANNED_RENDER_BATCHING_CONTRACT_SCHEMA,
    beforeMainPassDrawCalls: CAPTURED_NEXT_BASELINE_MAIN_PASS_DRAWS,
    afterMainPassDrawCalls,
    maximumMainPassDrawCalls: 150,
    withinBudget: afterMainPassDrawCalls <= 150,
    transitions,
  };
}
