import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "./demo-world";
import type { FileCategory, KingdomWorld } from "./types";
import { deriveRepositoryWorldIdentity } from "./world-identity";

function withDominantCategory(world: KingdomWorld, category: FileCategory): KingdomWorld {
  return {
    ...world,
    statistics: {
      ...world.statistics,
      files: 1_000,
      categories: [
        { category, files: 760, bytes: 760_000 },
        { category: "other", files: 240, bytes: 240_000 },
      ],
    },
  };
}

describe("repository world identity", () => {
  it("maps dominant repository evidence to distinct world archetypes", () => {
    const world = createDemoKingdom();
    expect(deriveRepositoryWorldIdentity(withDominantCategory(world, "source")).archetype).toBe(
      "source-forge",
    );
    expect(deriveRepositoryWorldIdentity(withDominantCategory(world, "test")).archetype).toBe(
      "warden-reach",
    );
    expect(deriveRepositoryWorldIdentity(withDominantCategory(world, "docs")).archetype).toBe(
      "archive-domain",
    );
    expect(deriveRepositoryWorldIdentity(withDominantCategory(world, "asset")).archetype).toBe(
      "garden-realm",
    );
  });

  it("is invariant when only the selected season changes", () => {
    const spring = createDemoKingdom("spring");
    const winter = createDemoKingdom("winter");
    expect(deriveRepositoryWorldIdentity(winter)).toEqual(deriveRepositoryWorldIdentity(spring));
  });

  it("classifies repository scale without allowing unbounded scene budgets", () => {
    const world = createDemoKingdom();
    const identity = (files: number) =>
      deriveRepositoryWorldIdentity({
        ...world,
        statistics: { ...world.statistics, files },
      }).scaleTier;

    expect(identity(63)).toBe("compact");
    expect(identity(64)).toBe("established");
    expect(identity(512)).toBe("expansive");
    expect(identity(4_096)).toBe("vast");
  });

  it("keeps all density signals inside the authored tuning envelope", () => {
    const identity = deriveRepositoryWorldIdentity(createDemoKingdom());
    for (const signal of [
      identity.signals.settlementDensity,
      identity.signals.woodlandDensity,
      identity.signals.landmarkDensity,
    ]) {
      expect(signal).toBeGreaterThanOrEqual(0.72);
      expect(signal).toBeLessThanOrEqual(1.35);
    }
  });
});
