import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { KingdomSeason, KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan, type WorldPlan } from "@/lib/kingdom/world-plan";
import type { KingdomWorldTheme } from "@/lib/kingdom/world-theme";

const COMPACT_FIXTURE_URL = new URL(
  "./test-fixtures/repository-city-live-world.json",
  import.meta.url,
);
const NEXTJS_FIXTURE_URL = new URL("./test-fixtures/nextjs-large-world.json", import.meta.url);

function fixture(url: URL): KingdomWorld {
  return JSON.parse(readFileSync(url, "utf8")) as KingdomWorld;
}

function plannerProbe(
  source: KingdomWorld,
  files: number,
  season: KingdomSeason = source.season,
  worldTheme: KingdomWorldTheme = source.worldTheme,
): KingdomWorld {
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
    buildKey: `${source.buildKey}:planner-probe:${files}`,
    season,
    worldTheme,
    provinces: source.provinces.map((province) => ({ ...province, season })),
    coverage: {
      ...source.coverage,
      discoveredFiles: files + source.coverage.omittedFiles,
      eligibleFiles: files,
      representedFiles: files,
    },
    statistics: {
      ...source.statistics,
      files,
      categories,
    },
  };
}

function planningFingerprint(plan: WorldPlan): string {
  return JSON.stringify({
    envelope: plan.topology.envelope,
    settlementEnvelope: plan.topology.repositoryScale.settlementEnvelope,
    hamlets: plan.topology.hamlets.map(({ id, mask, terrainMask, maxBuildings }) => ({
      id,
      mask,
      terrainMask,
      maxBuildings,
    })),
  });
}

describe("repository scale gold matrix", () => {
  it("gives compact, 5k, Next, and 100k repositories distinct bounded worlds", () => {
    const compact = fixture(COMPACT_FIXTURE_URL);
    const cases = [
      { label: "compact", world: compact },
      { label: "5k", world: plannerProbe(compact, 5_000) },
      { label: "next", world: fixture(NEXTJS_FIXTURE_URL) },
      { label: "100k", world: plannerProbe(compact, 100_000) },
    ] as const;
    const durations: number[] = [];
    const plans = cases.map(({ world }) => {
      const startedAt = performance.now();
      const plan = createWorldPlan(world);
      durations.push(performance.now() - startedAt);
      return plan;
    });

    expect(plans.map((plan) => plan.topology.hamlets.length)).toEqual([3, 4, 5, 6]);
    expect(plans.map((plan) => plan.topology.visualBudgets.maxBuildings)).toEqual([18, 24, 28, 32]);
    for (let index = 1; index < plans.length; index += 1) {
      const previous = plans[index - 1]!;
      const current = plans[index]!;
      expect(current.topology.envelope.width * current.topology.envelope.depth).toBeGreaterThan(
        previous.topology.envelope.width * previous.topology.envelope.depth,
      );
      expect(current.topology.repositoryScale.regionCapacity).toBeGreaterThan(
        previous.topology.repositoryScale.regionCapacity,
      );
      expect(current.topology.repositoryScale.settlementCapacity).toBeGreaterThan(
        previous.topology.repositoryScale.settlementCapacity,
      );
      expect(current.topology.repositoryScale.settlementEnvelope.area).toBeGreaterThan(
        previous.topology.repositoryScale.settlementEnvelope.area,
      );
      expect(current.topology.hamlets.length).toBeGreaterThan(previous.topology.hamlets.length);
      expect(current.topology.visualBudgets.maxBuildings).toBeGreaterThan(
        previous.topology.visualBudgets.maxBuildings,
      );
    }

    expect(new Set(plans.map(planningFingerprint))).toHaveLength(4);
    expect(
      new Set(
        plans.map((plan) => `${plan.topology.envelope.width}:${plan.topology.envelope.depth}`),
      ),
    ).toHaveLength(4);
    for (const [index, plan] of plans.entries()) {
      const overview = plan.topology.repositoryScale.viewBudgets.overview;
      expect(plan.topology.hamlets.length, cases[index]!.label).toBeLessThanOrEqual(
        overview.maxRegions,
      );
      expect(plan.topology.visualBudgets.maxBuildings, cases[index]!.label).toBeLessThanOrEqual(
        overview.maxBuildings,
      );
      expect(plan.topology.visualBudgets.maxTrees, cases[index]!.label).toBeLessThanOrEqual(
        overview.maxTrees,
      );
      expect(durations[index], `${cases[index]!.label} planner duration`).toBeLessThan(500);
    }
  });

  it("keeps scale and structure independent of appearance while retaining commit identity", () => {
    const compact = fixture(COMPACT_FIXTURE_URL);
    const spring = plannerProbe(compact, 100_000, "spring", "kingdom-valley");
    const winter = plannerProbe(compact, 100_000, "winter", "kingdom-valley");
    const forest = plannerProbe(compact, 100_000, "spring", "enchanted-forest");
    const springPlan = createWorldPlan(spring);
    const winterPlan = createWorldPlan(winter);
    const forestPlan = createWorldPlan(forest);

    expect(winterPlan.topology).toEqual(springPlan.topology);
    expect(forestPlan.topology.repositoryScale).toEqual(springPlan.topology.repositoryScale);
    expect(forestPlan.topology.envelope).toEqual(springPlan.topology.envelope);
    expect(forestPlan.topology.hamlets).toEqual(springPlan.topology.hamlets);
    expect(winterPlan.topologyKey).toBe(springPlan.topologyKey);
    expect(forestPlan.terrainKey).toBe(springPlan.terrainKey);
    expect(forestPlan.placementKey).toBe(springPlan.placementKey);
    expect(winterPlan.appearance).not.toEqual(springPlan.appearance);
    expect(forestPlan.appearance).not.toEqual(springPlan.appearance);

    const nextCommitSource = plannerProbe(compact, 100_000);
    const nextCommit = {
      ...nextCommitSource,
      source: {
        ...nextCommitSource.source,
        commitSha: "ffffffffffffffffffffffffffffffffffffffff",
      },
    };
    const nextCommitPlan = createWorldPlan(nextCommit);
    expect(createWorldPlan(spring)).toEqual(springPlan);
    expect(nextCommitPlan.topologyKey).not.toBe(springPlan.topologyKey);
    expect(nextCommitPlan.terrainKey).not.toBe(springPlan.terrainKey);
    expect(nextCommitPlan.placementKey).not.toBe(springPlan.placementKey);
  });
});
