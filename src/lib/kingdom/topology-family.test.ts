import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "./demo-world";
import { deriveRepositoryTopologyFamily } from "./topology-family";

describe("repository topology family", () => {
  it("is deterministic, season-independent, and theme-independent", () => {
    const springValley = createDemoKingdom("spring", "kingdom-valley");
    const winterForest = createDemoKingdom("winter", "enchanted-forest");

    expect(deriveRepositoryTopologyFamily(springValley)).toEqual(
      deriveRepositoryTopologyFamily(springValley),
    );
    expect(deriveRepositoryTopologyFamily(winterForest)).toEqual(
      deriveRepositoryTopologyFamily(springValley),
    );
  });

  it("keeps normalized anchors inside safe authoring ranges", () => {
    const demo = createDemoKingdom();
    for (let repositoryId = 1; repositoryId <= 256; repositoryId += 1) {
      const family = deriveRepositoryTopologyFamily({
        seed: `owner/repository-${repositoryId}`,
        source: {
          ...demo.source,
          repositoryId,
          owner: "owner",
          repository: `repository-${repositoryId}`,
        },
      });
      expect(Math.abs(family.lake.center.x)).toBeLessThanOrEqual(0.36);
      expect(family.lake.center.z).toBeGreaterThanOrEqual(0.5);
      expect(family.lake.center.z).toBeLessThanOrEqual(0.79);
      expect(family.course.points).toHaveLength(5);
      expect(family.course.points[0]!.z).toBeLessThan(0.12);
      expect(family.course.points.at(-1)!.z).toBeGreaterThan(0.93);
      expect(Math.abs(family.ridge.angle)).toBeLessThanOrEqual(0.06);
    }
  });
});
