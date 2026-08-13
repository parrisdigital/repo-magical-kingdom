import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { createPlannedScatter } from "./planned-scatter";
import { classifyPlannedTerrainRegion } from "./planned-terrain-model";
import {
  createPlannedWorldThemeLayer,
  MAX_ENCHANTED_ANCIENT_TREES,
  MAX_ENCHANTED_FIREFLIES,
  MAX_ENCHANTED_MUSHROOMS,
  MAX_ENCHANTED_ROOT_ARCHES,
  MAX_ENCHANTED_RUNESTONES,
} from "./planned-world-theme-model";

function fixture(
  worldTheme: "kingdom-valley" | "enchanted-forest",
  season: "spring" | "winter" = "spring",
) {
  const world = createDemoKingdom(season, worldTheme);
  const plan = createWorldPlan(world);
  const scatter = createPlannedScatter(world, plan);
  return { world, plan, scatter, layer: createPlannedWorldThemeLayer(plan, scatter) };
}

describe("createPlannedWorldThemeLayer", () => {
  it("keeps the base kingdom valley free of enchanted-only decoration", () => {
    const { layer } = fixture("kingdom-valley");

    expect(layer.worldTheme).toBe("kingdom-valley");
    expect(layer.ancientTreeIds).toEqual([]);
    expect(layer.runestones).toEqual([]);
    expect(layer.rootArches).toEqual([]);
    expect(layer.mushrooms).toEqual([]);
    expect(layer.fireflies).toEqual([]);
    expect(layer.instanceBudget).toBe(0);
  }, 15_000);

  it("authors a bounded, populated enchanted-forest language", () => {
    const { scatter, layer } = fixture("enchanted-forest");
    const treeIds = new Set(scatter.trees.map((tree) => tree.id));

    expect(layer.worldTheme).toBe("enchanted-forest");
    expect(layer.ancientTreeIds.length).toBeGreaterThanOrEqual(6);
    expect(layer.ancientTreeIds.length).toBeLessThanOrEqual(MAX_ENCHANTED_ANCIENT_TREES);
    expect(layer.ancientTreeIds.every((id) => treeIds.has(id))).toBe(true);
    expect(layer.runestones.length).toBeGreaterThan(0);
    expect(layer.runestones.length).toBeLessThanOrEqual(MAX_ENCHANTED_RUNESTONES);
    expect(layer.rootArches.length).toBeGreaterThan(0);
    expect(layer.rootArches.length).toBeLessThanOrEqual(MAX_ENCHANTED_ROOT_ARCHES);
    expect(layer.mushrooms.length).toBeGreaterThan(12);
    expect(layer.mushrooms.length).toBeLessThanOrEqual(MAX_ENCHANTED_MUSHROOMS);
    expect(layer.fireflies).toHaveLength(MAX_ENCHANTED_FIREFLIES);
    expect(layer.instanceBudget).toBeLessThanOrEqual(
      MAX_ENCHANTED_RUNESTONES +
        MAX_ENCHANTED_ROOT_ARCHES +
        MAX_ENCHANTED_MUSHROOMS +
        MAX_ENCHANTED_FIREFLIES,
    );
  });

  it("anchors physical decoration only to valid dry terrain", () => {
    const { plan, layer } = fixture("enchanted-forest");
    for (const decoration of [...layer.runestones, ...layer.mushrooms]) {
      const region = classifyPlannedTerrainRegion(
        plan,
        decoration.position.x,
        decoration.position.z,
      );
      expect(region.inside, decoration.id).toBe(true);
      expect(region.water, decoration.id).toBeNull();
      expect(region.material, decoration.id).not.toBe("shore");
      expect(region.slopeDegrees, decoration.id).toBeLessThanOrEqual(28);
    }
  });

  it("keeps the same enchanted anchors across season changes", () => {
    const spring = fixture("enchanted-forest", "spring");
    const winter = fixture("enchanted-forest", "winter");

    expect(winter.plan.topologyKey).toBe(spring.plan.topologyKey);
    expect(winter.layer).toEqual(spring.layer);
  });
});
