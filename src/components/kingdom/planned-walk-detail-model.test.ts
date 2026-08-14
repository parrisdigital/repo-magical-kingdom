import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { createLandUseWalkObstacles } from "./kingdom-navigation-model";
import { createRepositoryWalkInteraction } from "./kingdom-walk-experience-model";
import { createPlannedLandUse } from "./planned-land-use";
import { createPlannedScatter } from "./planned-scatter";
import { classifyPlannedTerrainRegion } from "./planned-terrain-model";
import { createPlannedVisualEnrichment } from "./planned-visual-enrichment";
import { createPlannedWalkDetailPlan } from "./planned-walk-detail-model";

const NEXTJS_FIXTURE_URL = new URL("./test-fixtures/nextjs-large-world.json", import.meta.url);

function createFixtureDetail(world: KingdomWorld) {
  const plan = createWorldPlan(world);
  const scatter = createPlannedScatter(world, plan);
  const enrichment = createPlannedVisualEnrichment(plan, scatter);
  const landUse = createPlannedLandUse(plan, scatter, enrichment);
  const interaction = createRepositoryWalkInteraction(world, plan, scatter);
  const obstacles = [
    ...[...scatter.buildings, ...scatter.landmarks].map((item) => ({
      x: item.transform.position.x,
      z: item.transform.position.z,
      radius: item.footprintRadius,
    })),
    ...createLandUseWalkObstacles(landUse),
  ];
  return {
    plan,
    landUse,
    obstacles,
    detail: createPlannedWalkDetailPlan(
      plan,
      landUse,
      obstacles,
      interaction.structures,
      interaction.targets,
    ),
  };
}

describe("planned Walk detail", () => {
  it("densifies the captured Next.js settlement-to-water route without violating terrain or structure safety", () => {
    const world = JSON.parse(readFileSync(NEXTJS_FIXTURE_URL, "utf8")) as KingdomWorld;
    const { plan, landUse, obstacles, detail } = createFixtureDetail(world);

    expect(detail.schema).toBe("repo-walk-detail/v1");
    expect(detail.waterFocus).not.toBeNull();
    expect(detail.counts.grass).toBeGreaterThanOrEqual(1_100);
    expect(detail.counts.flower).toBeGreaterThanOrEqual(96);
    expect(detail.counts.reed).toBeGreaterThanOrEqual(96);
    expect(detail.counts.stone).toBeGreaterThanOrEqual(64);
    expect(detail.instances).toHaveLength(
      detail.counts.grass + detail.counts.flower + detail.counts.reed + detail.counts.stone,
    );
    const envelopeDiagonal = Math.hypot(plan.topology.envelope.width, plan.topology.envelope.depth);
    expect(
      Math.max(
        ...detail.instances.map((instance) =>
          Math.hypot(instance.x - detail.spawn.x, instance.z - detail.spawn.z),
        ),
      ) / envelopeDiagonal,
    ).toBeGreaterThanOrEqual(0.32);
    expect(
      detail.instances.filter((instance) =>
        landUse.primaryRoad.segments.some((segment) =>
          segment.points.some(
            (point) => Math.hypot(instance.x - point.x, instance.z - point.z) <= 22,
          ),
        ),
      ).length,
    ).toBeGreaterThanOrEqual(600);

    for (const instance of detail.instances) {
      const region = classifyPlannedTerrainRegion(plan, instance.x, instance.z);
      expect(region.inside, instance.id).toBe(true);
      expect(region.water, instance.id).toBeNull();
      expect(region.slopeDegrees, instance.id).toBeLessThanOrEqual(30);
      const clearance = instance.kind === "stone" ? 0.85 : instance.kind === "reed" ? 0.48 : 0.42;
      expect(
        obstacles.every(
          (obstacle) =>
            Math.hypot(instance.x - obstacle.x, instance.z - obstacle.z) >=
            obstacle.radius + clearance - 0.001,
        ),
        instance.id,
      ).toBe(true);
    }

    expect(createFixtureDetail(world).detail).toEqual(detail);
    const autumn = { ...world, season: "autumn" as const };
    const autumnDetail = createFixtureDetail(autumn).detail;
    expect(autumnDetail.instances).toEqual(detail.instances);
    expect(autumnDetail.spawn).toEqual(detail.spawn);
    expect(autumnDetail.waterFocus).toEqual(detail.waterFocus);
  }, 45_000);
});
