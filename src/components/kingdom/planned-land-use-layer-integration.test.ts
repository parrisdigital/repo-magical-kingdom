import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { createPlannedLandUse } from "./planned-land-use";
import {
  buildPlannedLandUseGeometryBundle,
  createPlannedLandUseAssetInstances,
  disposePlannedLandUseGeometryBundle,
  PLANNED_LAND_USE_RENDER_BUDGET,
} from "./planned-land-use-layer";
import { createPlannedScatter } from "./planned-scatter";
import { createPlannedVisualEnrichment } from "./planned-visual-enrichment";

const NEXTJS_FIXTURE_URL = new URL("./test-fixtures/nextjs-large-world.json", import.meta.url);

describe("planned land-use renderer on the vast repository fixture", () => {
  it("stays deterministic and within the complete static render budget", () => {
    const world = JSON.parse(readFileSync(NEXTJS_FIXTURE_URL, "utf8")) as KingdomWorld;
    const plan = createWorldPlan(world);
    const scatter = createPlannedScatter(world, plan);
    const enrichment = createPlannedVisualEnrichment(plan, scatter);
    const landUse = createPlannedLandUse(plan, scatter, enrichment);
    const geometry = buildPlannedLandUseGeometryBundle(plan, landUse);
    const springAssets = createPlannedLandUseAssetInstances(landUse, "spring");
    const winterAssets = createPlannedLandUseAssetInstances(landUse, "winter");
    const maximumAssetDrawCalls =
      springAssets.length * PLANNED_LAND_USE_RENDER_BUDGET.maximumAssetSourcePrimitives;
    const maximumAssetTriangles =
      springAssets.length * PLANNED_LAND_USE_RENDER_BUDGET.maximumAssetTrianglesPerInstance;

    expect(landUse.validation.findings).toEqual([]);
    expect(geometry.generatedTriangleCount).toBeLessThanOrEqual(
      PLANNED_LAND_USE_RENDER_BUDGET.maximumGeneratedTriangles,
    );
    expect(geometry.surfaceDrawCallCount).toBeLessThanOrEqual(
      PLANNED_LAND_USE_RENDER_BUDGET.maximumSurfaceDrawCalls,
    );
    expect(springAssets.length).toBeLessThanOrEqual(
      PLANNED_LAND_USE_RENDER_BUDGET.maximumExplicitAssets,
    );
    expect(geometry.surfaceDrawCallCount + maximumAssetDrawCalls).toBeLessThanOrEqual(
      PLANNED_LAND_USE_RENDER_BUDGET.maximumTotalDrawCalls,
    );
    expect(geometry.generatedTriangleCount + maximumAssetTriangles).toBeLessThanOrEqual(
      PLANNED_LAND_USE_RENDER_BUDGET.maximumTotalTriangles,
    );
    const topology = (instance: (typeof springAssets)[number]) => ({
      id: instance.id,
      position: instance.position,
      rotationY: instance.rotationY,
      targetHeight: instance.targetHeight,
    });
    expect(winterAssets.map(topology)).toEqual(springAssets.map(topology));

    disposePlannedLandUseGeometryBundle(geometry);
  }, 10_000);
});
