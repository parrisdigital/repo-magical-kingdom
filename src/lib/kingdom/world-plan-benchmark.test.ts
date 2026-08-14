import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "./demo-world";
import { createWorldPlan } from "./world-plan";

const PLANNING_BUDGET_MS = 250;

describe("world plan performance", () => {
  it("keeps every deterministic uncached compact and vast plan below 250 ms", () => {
    const compact = createDemoKingdom();
    const vast = {
      ...compact,
      coverage: {
        ...compact.coverage,
        discoveredFiles: 29_719,
        eligibleFiles: 29_719,
        representedFiles: 29_719,
      },
      statistics: { ...compact.statistics, files: 29_719 },
    };
    const sample = (world: typeof compact, prefix: string) => {
      return Array.from({ length: 8 }, (_, index) => {
        const fixture = {
          ...world,
          seed: `${world.seed}:${prefix}:${index}`,
          source: { ...world.source, commitSha: String(index + 1).padStart(40, "0") },
        };
        const durations = Array.from({ length: 3 }, () => {
          const startedAt = performance.now();
          createWorldPlan({ ...fixture, source: { ...fixture.source } });
          return performance.now() - startedAt;
        }).sort((first, second) => first - second);
        return { index, medianMs: durations[1]!, worstMs: durations[2]! };
      });
    };
    const compactResults = sample(compact, "compact-benchmark");
    const vastResults = sample(vast, "vast-benchmark");
    const sortedMedian = (results: ReadonlyArray<{ medianMs: number }>) =>
      results.map(({ medianMs }) => medianMs).sort((first, second) => first - second);
    const compactMedians = sortedMedian(compactResults);
    const vastMedians = sortedMedian(vastResults);
    console.info(
      JSON.stringify({
        compactMedianMs: compactMedians[4],
        compactWorstIdentityMedianMs: compactMedians.at(-1),
        compactWorstObservedMs: Math.max(...compactResults.map(({ worstMs }) => worstMs)),
        vastMedianMs: vastMedians[4],
        vastWorstIdentityMedianMs: vastMedians.at(-1),
        vastWorstObservedMs: Math.max(...vastResults.map(({ worstMs }) => worstMs)),
      }),
    );
    for (const [prefix, results] of [
      ["compact-benchmark", compactResults],
      ["vast-benchmark", vastResults],
    ] as const) {
      for (const result of results) {
        expect(result.medianMs, `${prefix}[${result.index}] repeat median`).toBeLessThan(
          PLANNING_BUDGET_MS,
        );
      }
    }
  });
});
