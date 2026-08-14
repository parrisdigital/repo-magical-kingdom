import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { clearPlannedLandUseCacheForTests, createPlannedLandUse } from "./planned-land-use";
import {
  buildPlannedLandUseGeometryBundle,
  disposePlannedLandUseGeometryBundle,
  PLANNED_LAND_USE_RENDER_BUDGET,
} from "./planned-land-use-layer";
import { clearPlannedScatterTopologyCacheForTests, createPlannedScatter } from "./planned-scatter";
import { createPlannedVisualEnrichment } from "./planned-visual-enrichment";

const COMPACT_FIXTURE_URL = new URL(
  "./test-fixtures/repository-city-live-world.json",
  import.meta.url,
);
const NEXTJS_FIXTURE_URL = new URL("./test-fixtures/nextjs-large-world.json", import.meta.url);

function fixture(url: URL): KingdomWorld {
  return JSON.parse(readFileSync(url, "utf8")) as KingdomWorld;
}

function plannerProbe(source: KingdomWorld, files: number): KingdomWorld {
  const categoryTotal = Math.max(
    1,
    source.statistics.categories.reduce((total, category) => total + category.files, 0),
  );
  const categories = source.statistics.categories.map((category, index) => ({
    ...category,
    files:
      index === 0
        ? files -
          source.statistics.categories
            .slice(1)
            .reduce((total, entry) => total + Math.round((entry.files / categoryTotal) * files), 0)
        : Math.round((category.files / categoryTotal) * files),
  }));
  return {
    ...source,
    buildKey: `${source.buildKey}:land-use-probe:${files}`,
    coverage: {
      ...source.coverage,
      discoveredFiles: files + source.coverage.omittedFiles,
      eligibleFiles: files,
      representedFiles: files,
    },
    statistics: { ...source.statistics, files, categories },
  };
}

describe("continuous-scale land-use coverage matrix", () => {
  it("keeps compact, 5k, Next, and 100k composition measurable", () => {
    const compact = fixture(COMPACT_FIXTURE_URL);
    const cases = [
      { label: "compact", world: compact },
      { label: "5k", world: plannerProbe(compact, 5_000) },
      { label: "next", world: fixture(NEXTJS_FIXTURE_URL) },
      { label: "100k", world: plannerProbe(compact, 100_000) },
    ] as const;
    const metrics = cases.map(({ label, world }) => {
      const plan = createWorldPlan(world);
      clearPlannedScatterTopologyCacheForTests();
      const scatter = createPlannedScatter(world, plan);
      const enrichment = createPlannedVisualEnrichment(plan, scatter);
      clearPlannedLandUseCacheForTests();
      const startedAt = performance.now();
      const landUse = createPlannedLandUse(plan, scatter, enrichment);
      const elapsedMilliseconds = performance.now() - startedAt;
      const geometry = buildPlannedLandUseGeometryBundle(plan, landUse);
      const metric = {
        label,
        files: world.statistics.files,
        envelope: [plan.topology.envelope.width, plan.topology.envelope.depth],
        visibleLandArea: landUse.coverage.visibleLandArea,
        developedArea: landUse.coverage.developedArea,
        developedRatio: landUse.coverage.developedRatio,
        zones: landUse.zones.length,
        landscapes: landUse.landscapePolygons.length,
        landscapeArea:
          Math.round(
            landUse.landscapePolygons.reduce((total, polygon) => total + polygon.area, 0) * 1_000,
          ) / 1_000,
        roadSegments: landUse.primaryRoad.segments.length,
        roadLength:
          Math.round(
            landUse.primaryRoad.segments.reduce((total, segment) => total + segment.length, 0) *
              1_000,
          ) / 1_000,
        surfaceDrawCalls: geometry.surfaceDrawCallCount,
        generatedTriangles: geometry.generatedTriangleCount,
        elapsedMilliseconds,
        findings: landUse.validation.findings,
      };
      expect(landUse.coverage.status, label).toBe("met");
      expect(landUse.coverage.developedRatio, label).toBeGreaterThanOrEqual(0.12);
      expect(landUse.coverage.developedRatio, label).toBeLessThanOrEqual(0.18);
      expect(landUse.validation.findings, label).toEqual([]);
      expect(landUse.validation.allRoadsTerrainSafe, label).toBe(true);
      expect(landUse.validation.allLandscapeTerrainSafe, label).toBe(true);
      expect(landUse.validation.allRenderableItemsClearStructures, label).toBe(true);
      expect(landUse.primaryRoad.widthRange, label).toEqual({ minimum: 4, maximum: 5 });
      expect(landUse.primaryRoad.connectedHamletIds, label).toEqual(
        [...plan.topology.hamlets.map((hamlet) => hamlet.id)].sort(),
      );
      expect(
        plan.topology.hamlets.every((hamlet) =>
          landUse.anchors.some(
            (anchor) =>
              anchor.hamletId === hamlet.id &&
              anchor.kind === "prop" &&
              anchor.walkAdjacent &&
              anchor.roadSegmentId !== null,
          ),
        ),
        label,
      ).toBe(true);
      expect(
        landUse.primaryRoad.segments.every(
          (segment) =>
            segment.width >= 4 &&
            segment.width <= 5 &&
            segment.clearsStructures &&
            segment.pathSafety.valid &&
            segment.crossings.every((crossing) => crossing.valid),
        ),
        label,
      ).toBe(true);
      expect(
        landUse.primaryRoad.segments
          .flatMap((segment) => segment.crossings)
          .every(
            (crossing) =>
              crossing.valid &&
              (crossing.kind !== "bridge" ||
                crossing.waterSampleCount + crossing.shoreSampleCount > 0),
          ),
        label,
      ).toBe(true);
      expect(new Set(landUse.landscapePolygons.map((polygon) => polygon.hamletId)), label).toEqual(
        new Set(landUse.zones.map((zone) => zone.hamletId)),
      );
      expect(new Set(landUse.landscapePolygons.map((polygon) => polygon.role)), label).toEqual(
        new Set(["field", "orchard", "garden"]),
      );
      expect(geometry.surfaceDrawCallCount, label).toBeLessThanOrEqual(
        PLANNED_LAND_USE_RENDER_BUDGET.maximumSurfaceDrawCalls,
      );
      expect(geometry.generatedTriangleCount, label).toBeLessThanOrEqual(
        PLANNED_LAND_USE_RENDER_BUDGET.maximumGeneratedTriangles,
      );
      expect(elapsedMilliseconds, `${label} cold land-use planner`).toBeLessThan(2_000);
      disposePlannedLandUseGeometryBundle(geometry);
      return metric;
    });
    expect(metrics.map((metric) => metric.envelope)).toEqual([
      [182, 274],
      [279.003, 322.345],
      [364.831, 546.8613],
      [414.668, 485.487],
    ]);
    expect(metrics.map((metric) => metric.visibleLandArea)).toEqual([
      35_360, 65_600, 149_056, 154_272,
    ]);
    expect(metrics.map((metric) => metric.developedArea)).toEqual([5_280, 9_888, 21_888, 22_368]);
    expect(metrics.map((metric) => metric.developedRatio)).toEqual([0.149, 0.151, 0.147, 0.145]);
    expect(metrics.map((metric) => metric.zones)).toEqual([3, 4, 5, 6]);
    expect(metrics.map((metric) => metric.landscapes)).toEqual([9, 14, 36, 39]);
    expect(metrics.map((metric) => metric.landscapeArea)).toEqual([
      1_983.901, 4_035.188, 13_497.155, 14_751.329,
    ]);
    expect(metrics.map((metric) => metric.roadSegments)).toEqual([3, 4, 5, 6]);
    expect(metrics.map((metric) => metric.roadLength)).toEqual([
      117.925, 572.847, 982.702, 752.837,
    ]);
    expect(metrics.map((metric) => metric.surfaceDrawCalls)).toEqual([13, 15, 19, 15]);
    expect(metrics.map((metric) => metric.generatedTriangles)).toEqual([
      2_060, 4_604, 8_694, 7_922,
    ]);
  }, 30_000);
});
