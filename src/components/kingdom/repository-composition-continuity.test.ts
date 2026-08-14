import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan, repositoryCompositionContract } from "@/lib/kingdom/world-plan";

import { clearPlannedScatterTopologyCacheForTests, createPlannedScatter } from "./planned-scatter";
import { createPlannedVisualEnrichment } from "./planned-visual-enrichment";

const FIXTURE_URL = new URL("./test-fixtures/repository-city-live-world.json", import.meta.url);
const NEXTJS_FIXTURE_URL = new URL("./test-fixtures/nextjs-large-world.json", import.meta.url);

function fixture(url = FIXTURE_URL): KingdomWorld {
  return JSON.parse(readFileSync(url, "utf8")) as KingdomWorld;
}

function withFileCount(source: KingdomWorld, files: number): KingdomWorld {
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
    buildKey: `${source.buildKey}:composition-boundary:${files}`,
    coverage: {
      ...source.coverage,
      discoveredFiles: files + source.coverage.omittedFiles,
      eligibleFiles: files,
      representedFiles: files,
    },
    statistics: { ...source.statistics, files, categories },
  };
}

function planComposition(world: KingdomWorld) {
  clearPlannedScatterTopologyCacheForTests();
  const plan = createWorldPlan(world);
  const scatter = createPlannedScatter(world, plan);
  const enrichment = createPlannedVisualEnrichment(plan, scatter);
  return {
    plan,
    scatter,
    enrichment,
    signature: {
      arrangements: [...new Set(scatter.buildings.map((building) => building.arrangement))].sort(),
      dominantGroves: new Set(
        scatter.trees
          .filter((tree) => tree.woodlandRole === "dominant")
          .map((tree) => tree.groveId),
      ).size,
      satelliteGroves: new Set(
        scatter.trees
          .filter((tree) => tree.woodlandRole === "satellite")
          .map((tree) => tree.groveId),
      ).size,
      clearings: scatter.canopyClearings.length,
    },
  };
}

function assertBoundaryContract(source: KingdomWorld, belowFiles: number, aboveFiles: number) {
  const belowWorld = withFileCount(source, belowFiles);
  const aboveWorld = withFileCount(source, aboveFiles);
  const below = createWorldPlan(belowWorld);
  const above = createWorldPlan(aboveWorld);

  expect(repositoryCompositionContract(aboveWorld)).toEqual(
    repositoryCompositionContract(belowWorld),
  );
  expect(above.composition).toEqual(below.composition);
  expect(above.topology.repositoryScale.logarithmicProgress).toBeGreaterThanOrEqual(
    below.topology.repositoryScale.logarithmicProgress,
  );
  for (const budget of ["maxBuildings", "maxGroves", "maxTrees", "maxWildlifeActors"] as const) {
    expect(above.topology.visualBudgets[budget]).toBeGreaterThanOrEqual(
      below.topology.visualBudgets[budget],
    );
    expect(
      above.topology.visualBudgets[budget] - below.topology.visualBudgets[budget],
    ).toBeLessThanOrEqual(1);
  }
}

describe("repository composition continuity", () => {
  it("keeps feature families fixed and budgets monotone at every legacy label boundary", () => {
    const source = fixture();
    assertBoundaryContract(source, 63, 64);
    assertBoundaryContract(source, 511, 512);
    assertBoundaryContract(source, 4_095, 4_096);
  });

  it("prevents the former 4,096-file vast-mode subsystem jump", () => {
    const source = fixture();
    const below = planComposition(withFileCount(source, 4_095));
    const above = planComposition(withFileCount(source, 4_096));

    expect(below.plan.identity.scaleTier).toBe("expansive");
    expect(above.plan.identity.scaleTier).toBe("vast");
    expect(above.plan.composition).toEqual(below.plan.composition);
    expect(above.signature).toEqual(below.signature);
    expect(
      Math.abs(above.scatter.buildings.length - below.scatter.buildings.length),
    ).toBeLessThanOrEqual(1);
    expect(above.plan.topology.visualBudgets.maxTrees).toBe(
      below.plan.topology.visualBudgets.maxTrees,
    );
    expect(
      Math.abs(above.enrichment.shoreDetails.length - below.enrichment.shoreDetails.length),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(above.enrichment.meadowDetails.length - below.enrichment.meadowDetails.length),
    ).toBeLessThanOrEqual(1);
  }, 30_000);

  it("retains the captured Next.js living-world population at the scale ceiling", () => {
    const result = planComposition(fixture(NEXTJS_FIXTURE_URL));
    expect(result.plan.composition.family).toBe("compound-woodland");
    expect({
      hamlets: result.plan.topology.hamlets.length,
      buildings: result.scatter.buildings.length,
      baseTrees: result.scatter.trees.length,
      supplementalTrees: result.enrichment.supplementalTrees.length,
      totalTrees: result.scatter.trees.length + result.enrichment.supplementalTrees.length,
      shoreDetails: result.enrichment.shoreDetails.length,
      wildlife: result.scatter.wildlife.length,
    }).toEqual({
      hamlets: 5,
      buildings: 28,
      baseTrees: 160,
      supplementalTrees: 80,
      totalTrees: 240,
      shoreDetails: 35,
      wildlife: 12,
    });
  }, 30_000);
});
