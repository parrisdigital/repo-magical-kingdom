import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { createPlannedLandUse } from "./planned-land-use";
import { createPlannedRenderBatchingContract } from "./planned-render-batching-contract";
import { createPlannedScatter } from "./planned-scatter";
import { createPlannedVisualEnrichment } from "./planned-visual-enrichment";

const NEXTJS_FIXTURE_URL = new URL("./test-fixtures/nextjs-large-world.json", import.meta.url);
const SCENE_SOURCE_URL = new URL("./kingdom-scene-planned.tsx", import.meta.url);
const LAND_USE_SOURCE_URL = new URL("./planned-land-use-layer.tsx", import.meta.url);

function capturedNextScene() {
  const world = JSON.parse(readFileSync(NEXTJS_FIXTURE_URL, "utf8")) as KingdomWorld;
  const plan = createWorldPlan(world);
  const scatter = createPlannedScatter(world, plan);
  const enrichment = createPlannedVisualEnrichment(plan, scatter);
  const landUse = createPlannedLandUse(plan, scatter, enrichment);
  return { world, plan, scatter, enrichment, landUse };
}

describe("bounded planned renderer implementation", () => {
  it("pins each actual renderer seam instead of accepting an estimator-only projection", () => {
    const scene = readFileSync(SCENE_SOURCE_URL, "utf8");
    const landUse = readFileSync(LAND_USE_SOURCE_URL, "utf8");

    for (const seam of [
      "createPlannedHamletPathBatch(plan, scatter)",
      "new PlannedScenePickProxy(records)",
      'renderedNavigationMode === "orbit"',
      "<OverviewWildlifeRoleBatch",
      "<WalkWildlifeRoleBatch",
      "createPlannedWalkWildlifeLodGeometry(role)",
      "createPlannedThemeTreeLodGeometry(batch.palette, plan.worldTheme)",
      "createPlannedEnchantedOrbitGeometry(layer)",
      '"enchanted-runestone-glows-walk-batch"',
      '"enchanted-root-arches-walk-batch"',
      'lodMode === "orbit-batched"',
      'treeMode === "overview-lod"',
      "<WalkTreeHybridLayer",
      "createTreeGroups(hybrid.detail)",
      "url={GROUND_URLS.mushroom}",
      "disposePlannedEnchantedOrbitGeometry(repeatedFeatureGeometry)",
      "navigationMode={renderedNavigationMode}",
      "writePlannedPortalMatrices(instances",
      "args={[undefined, undefined, instances.length]}",
    ]) {
      expect(scene, seam).toContain(seam);
    }
    expect(scene).toMatch(/<EnchantedThemeLayer[^>]*navigationMode=\{renderedNavigationMode\}/u);
    expect(scene).not.toContain("<boxGeometry");
    expect(scene).not.toContain("<circleGeometry args={[1, 28]}");
    expect(scene).not.toContain("paths.flatMap(");
    expect(landUse).toContain("createPlannedLandUseAssetBatches(assets)");
    expect(landUse).toContain("<PlannedLandUseAssetBatchRenderer");
    expect(landUse).not.toContain("assets.map((instance)");
  });

  it("measures the captured Next world at or below 150 actual main-pass draws", () => {
    const input = capturedNextScene();
    const contract = createPlannedRenderBatchingContract({
      ...input,
    });

    expect(contract.beforeMainPassDrawCalls).toBe(352);
    expect(contract.transitions).toEqual([
      { id: "paths.hamlet-lanes", before: 70, after: 2, reduction: 68 },
      { id: "interaction.architecture-hits", before: 33, after: 0, reduction: 33 },
      { id: "interaction.semantic-hits", before: 17, after: 0, reduction: 17 },
      { id: "wildlife.actors", before: 72, after: 18, reduction: 54 },
      { id: "portals", before: 16, after: 2, reduction: 14 },
      { id: "land-use.anchor-assets", before: 22, after: 11, reduction: 11 },
      { id: "vegetation.trees", before: 20, after: 6, reduction: 14 },
      { id: "renderer.other-main-pass-consumers", before: 102, after: 100, reduction: 2 },
    ]);
    expect(contract.afterMainPassDrawCalls).toBe(139);
    expect(contract.withinBudget).toBe(true);
  }, 10_000);
});
