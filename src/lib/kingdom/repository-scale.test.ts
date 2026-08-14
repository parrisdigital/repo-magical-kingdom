import { describe, expect, it } from "vitest";

import {
  deriveRepositoryPlanningScale,
  REPOSITORY_SCALE_LIMITS,
  REPOSITORY_SCALE_SCHEMA,
} from "./repository-scale";

describe("continuous repository planning scale", () => {
  it("grows continuously through the former 4,096-file saturation boundary", () => {
    const below = deriveRepositoryPlanningScale(4_095);
    const boundary = deriveRepositoryPlanningScale(4_096);
    const above = deriveRepositoryPlanningScale(4_097);

    expect(below.schema).toBe(REPOSITORY_SCALE_SCHEMA);
    expect(boundary.minimumEnvelope.width).toBeGreaterThan(below.minimumEnvelope.width);
    expect(above.minimumEnvelope.width).toBeGreaterThan(boundary.minimumEnvelope.width);
    expect(boundary.logarithmicProgress).toBeGreaterThan(below.logarithmicProgress);
    expect(above.logarithmicProgress).toBeGreaterThan(boundary.logarithmicProgress);
  });

  it("keeps compact worlds stable and caps geometry plus every view budget", () => {
    const empty = deriveRepositoryPlanningScale(0);
    const compact = deriveRepositoryPlanningScale(63);
    const ceiling = deriveRepositoryPlanningScale(REPOSITORY_SCALE_LIMITS.logarithmicFileCeiling);
    const beyond = deriveRepositoryPlanningScale(20_000_000);

    expect(compact).toEqual({ ...empty, eligibleFiles: 63 });
    expect(ceiling.minimumEnvelope).toEqual(beyond.minimumEnvelope);
    expect(ceiling.regionCapacity).toBe(REPOSITORY_SCALE_LIMITS.capacity.maximumRegions);
    expect(ceiling.settlementCapacity).toBe(REPOSITORY_SCALE_LIMITS.capacity.maximumSettlements);
    expect(ceiling.minimumEnvelope).toMatchObject({
      width: REPOSITORY_SCALE_LIMITS.envelope.maximumWidth,
      depth: REPOSITORY_SCALE_LIMITS.envelope.maximumDepth,
    });

    for (const view of Object.values(beyond.viewBudgets)) {
      expect(view.maxRegions).toBeLessThanOrEqual(6);
      expect(view.maxBuildings).toBeLessThanOrEqual(32);
      expect(view.maxTrees).toBeLessThanOrEqual(240);
      expect(view.maxWildlifeActors).toBeLessThanOrEqual(16);
      expect(view.maxSurfaceScatter).toBeLessThanOrEqual(480);
      expect(view.maxDrawCalls).toBeLessThanOrEqual(150);
      expect(view.maxVisibleTriangles).toBeLessThanOrEqual(750_000);
    }
  });

  it("is monotonic across representative repository magnitudes", () => {
    const scales = [63, 5_000, 29_719, 100_000, 1_000_000].map(deriveRepositoryPlanningScale);
    for (let index = 1; index < scales.length; index += 1) {
      const previous = scales[index - 1]!;
      const current = scales[index]!;
      expect(current.minimumEnvelope.area).toBeGreaterThan(previous.minimumEnvelope.area);
      expect(current.regionCapacity).toBeGreaterThan(previous.regionCapacity);
      expect(current.settlementCapacity).toBeGreaterThan(previous.settlementCapacity);
      expect(current.settlementEnvelope.area).toBeGreaterThan(previous.settlementEnvelope.area);
    }
  });
});
