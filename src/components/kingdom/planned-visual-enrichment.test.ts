import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import { KINGDOM_SEASONS } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { createPlannedScatter } from "./planned-scatter";
import {
  classifyPlannedTerrainRegion,
  getHamletVisualPlacementMask,
} from "./planned-terrain-model";
import { createPlannedVisualEnrichment } from "./planned-visual-enrichment";

function normalizedHamletDistance(
  point: Readonly<{ x: number; z: number }>,
  plan: ReturnType<typeof createWorldPlan>,
): number {
  return Math.min(
    ...plan.topology.hamlets.map((hamlet) => {
      const mask = getHamletVisualPlacementMask(plan, hamlet);
      return Math.hypot(
        (point.x - mask.center.x) / mask.radiusX,
        (point.z - mask.center.z) / mask.radiusZ,
      );
    }),
  );
}

describe("createPlannedVisualEnrichment", () => {
  it("is deterministic and keeps geometry identical across seasons", () => {
    const enrichments = KINGDOM_SEASONS.map((season) => {
      const world = createDemoKingdom(season);
      const plan = createWorldPlan(world);
      return createPlannedVisualEnrichment(plan, createPlannedScatter(world, plan));
    });
    expect(enrichments[0]).toEqual(enrichments[1]);
    expect(enrichments[0]).toEqual(enrichments[2]);
    expect(enrichments[0]).toEqual(enrichments[3]);
  });

  it("fills unused canopy capacity with dispersed valid edge woodland", () => {
    const world = createDemoKingdom("spring");
    const plan = createWorldPlan(world);
    const scatter = createPlannedScatter(world, plan);
    const enrichment = createPlannedVisualEnrichment(plan, scatter);
    expect(enrichment.supplementalTrees.length).toBeGreaterThanOrEqual(30);
    expect(scatter.trees.length + enrichment.supplementalTrees.length).toBeLessThanOrEqual(
      plan.topology.visualBudgets.maxTrees,
    );
    expect(
      new Set(enrichment.supplementalTrees.map((tree) => tree.assetRole)).size,
    ).toBeGreaterThan(2);
    for (const tree of enrichment.supplementalTrees) {
      const region = classifyPlannedTerrainRegion(plan, tree.position.x, tree.position.z);
      expect(region.inside, tree.id).toBe(true);
      expect(region.water, tree.id).toBeNull();
      expect(["low-meadow", "high-meadow"], tree.id).toContain(region.material);
      expect(region.slopeDegrees, tree.id).toBeLessThanOrEqual(24);
      expect(normalizedHamletDistance(tree.position, plan), tree.id).toBeGreaterThanOrEqual(1.32);
    }
  });

  it("places readable cliff formations and shoreline transitions within surface budgets", () => {
    const world = createDemoKingdom("spring");
    const plan = createWorldPlan(world);
    const scatter = createPlannedScatter(world, plan);
    const enrichment = createPlannedVisualEnrichment(plan, scatter);
    expect(enrichment.cliffFormations.length).toBeGreaterThanOrEqual(4);
    expect(enrichment.shoreDetails.length).toBeGreaterThanOrEqual(20);
    expect(enrichment.meadowDetails.length).toBeGreaterThanOrEqual(24);
    const existingSurfaceInstances =
      scatter.ambientDetails.length +
      scatter.groundCoverClusters.reduce((total, cluster) => total + cluster.members.length, 0);
    expect(
      existingSurfaceInstances +
        enrichment.cliffFormations.length +
        enrichment.shoreDetails.length +
        enrichment.meadowDetails.length,
    ).toBeLessThanOrEqual(plan.topology.visualBudgets.maxSurfaceScatter);
    for (const rock of enrichment.cliffFormations) {
      const region = classifyPlannedTerrainRegion(plan, rock.position.x, rock.position.z);
      expect(region.inside, rock.id).toBe(true);
      expect(region.water, rock.id).toBeNull();
      expect(["cliff-stone", "scree"], rock.id).toContain(region.material);
      expect(region.height, rock.id).toBeGreaterThanOrEqual(3);
      expect(region.height, rock.id).toBeLessThanOrEqual(15);
    }
    for (let firstIndex = 0; firstIndex < enrichment.cliffFormations.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < enrichment.cliffFormations.length;
        secondIndex += 1
      ) {
        const first = enrichment.cliffFormations[firstIndex]!.position;
        const second = enrichment.cliffFormations[secondIndex]!.position;
        expect(Math.hypot(first.x - second.x, first.z - second.z)).toBeGreaterThanOrEqual(12);
      }
    }
    for (const detail of enrichment.shoreDetails) {
      const region = classifyPlannedTerrainRegion(plan, detail.position.x, detail.position.z);
      expect(region.inside, detail.id).toBe(true);
      expect(region.water, detail.id).toBeNull();
      expect(region.slopeDegrees, detail.id).toBeLessThanOrEqual(28);
    }
    for (const detail of enrichment.meadowDetails) {
      const region = classifyPlannedTerrainRegion(plan, detail.position.x, detail.position.z);
      expect(region.inside, detail.id).toBe(true);
      expect(region.water, detail.id).toBeNull();
      expect(["low-meadow", "high-meadow"], detail.id).toContain(region.material);
      expect(region.slopeDegrees, detail.id).toBeLessThanOrEqual(18);
      expect(normalizedHamletDistance(detail.position, plan), detail.id).toBeGreaterThanOrEqual(
        1.12,
      );
    }
  });
});
