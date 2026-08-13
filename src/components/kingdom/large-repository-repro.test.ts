import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import type { KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { clearPlannedScatterTopologyCacheForTests, createPlannedScatter } from "./planned-scatter";
import {
  classifyPlannedTerrainRegion,
  getHamletVisualPlacementMask,
} from "./planned-terrain-model";

const LARGE_FIXTURE_URL = new URL("./test-fixtures/nextjs-large-world.json", import.meta.url);
const COMPACT_FIXTURE_URL = new URL(
  "./test-fixtures/repository-city-live-world.json",
  import.meta.url,
);

function fixture(url: URL): KingdomWorld {
  return JSON.parse(readFileSync(url, "utf8")) as KingdomWorld;
}

function placementFingerprint(world: KingdomWorld): string {
  const plan = createWorldPlan(world);
  clearPlannedScatterTopologyCacheForTests();
  const scatter = createPlannedScatter(world, plan);
  return JSON.stringify({
    envelope: plan.topology.envelope,
    hamlets: plan.topology.hamlets.map(({ id, mask, maxBuildings }) => ({
      id,
      mask,
      maxBuildings,
    })),
    buildings: scatter.buildings.map(({ id, transform }) => ({ id, transform })),
    trees: scatter.trees.map(({ id, transform }) => ({ id, transform })),
  });
}

it("creates a bounded, repository-specific world for captured vercel/next.js data", () => {
  const world = fixture(LARGE_FIXTURE_URL);
  expect(world.source.repositoryId).toBe(70_107_786);
  expect(world.source.commitSha).toBe("3782922bdd68fef4f8241424bc7372af838bd911");
  expect(world.statistics.files).toBe(29_719);

  const plan = createWorldPlan(world);
  clearPlannedScatterTopologyCacheForTests();
  const scatter = createPlannedScatter(world, plan);

  expect(plan.identity.scaleTier).toBe("vast");
  expect(plan.topology.hamlets).toHaveLength(5);
  expect(scatter.buildings).toHaveLength(30);
  expect(scatter.trees.length).toBeLessThanOrEqual(plan.topology.visualBudgets.maxTrees);
  expect(scatter.wildlife.length).toBeLessThanOrEqual(
    plan.topology.visualBudgets.maxWildlifeActors,
  );
  const walkingAnimals = scatter.wildlife.filter(
    (animal) => animal.behavior === "wander" && animal.wanderPath.length > 1,
  );
  expect(walkingAnimals.length).toBeGreaterThan(0);
  for (const animal of walkingAnimals) {
    for (const waypoint of animal.wanderPath) {
      const region = classifyPlannedTerrainRegion(plan, waypoint.x, waypoint.z);
      expect(region.inside, `${animal.id}:waypoint`).toBe(true);
      expect(region.water, `${animal.id}:waypoint`).toBeNull();
      expect(region.material, `${animal.id}:waypoint`).not.toBe("shore");
      expect(region.slopeDegrees, `${animal.id}:waypoint`).toBeLessThanOrEqual(18);
    }
  }

  const relocatedRearHamlet = plan.topology.hamlets.find(
    (hamlet) => hamlet.id === "hamlet-f4caad5452",
  );
  expect(relocatedRearHamlet).toBeDefined();
  if (relocatedRearHamlet) {
    const visualMask = getHamletVisualPlacementMask(plan, relocatedRearHamlet);
    expect(
      (visualMask.center.x - plan.topology.envelope.center.x) *
        (relocatedRearHamlet.mask.center.x - plan.topology.envelope.center.x),
    ).toBeGreaterThan(0);
    expect(Math.abs(visualMask.center.x - plan.topology.envelope.center.x)).toBeGreaterThan(
      Math.abs(relocatedRearHamlet.mask.center.x - plan.topology.envelope.center.x),
    );
  }

  for (const structure of [...scatter.buildings, ...scatter.landmarks]) {
    const region = classifyPlannedTerrainRegion(
      plan,
      structure.transform.position.x,
      structure.transform.position.z,
    );
    expect(region.inside, structure.id).toBe(true);
    expect(region.water, structure.id).toBeNull();
    expect(region.material, structure.id).not.toBe("shore");
    expect(region.slopeDegrees, structure.id).toBeLessThanOrEqual(
      structure.terrain.maxSlopeDegrees,
    );
  }

  expect(new Set(scatter.semanticHitZones.flatMap((zone) => zone.entityIds))).toEqual(
    new Set(world.entities.map((entity) => entity.id)),
  );

  clearPlannedScatterTopologyCacheForTests();
  expect(createPlannedScatter(world, createWorldPlan(world))).toEqual(scatter);
  clearPlannedScatterTopologyCacheForTests();
}, 30_000);

it("changes visible scale and placement between compact and vast repositories", () => {
  const compact = fixture(COMPACT_FIXTURE_URL);
  const vast = fixture(LARGE_FIXTURE_URL);
  const compactPlan = createWorldPlan(compact);
  const vastPlan = createWorldPlan(vast);
  clearPlannedScatterTopologyCacheForTests();
  const compactScatter = createPlannedScatter(compact, compactPlan);
  clearPlannedScatterTopologyCacheForTests();
  const vastScatter = createPlannedScatter(vast, vastPlan);

  expect(compactPlan.identity.scaleTier).toBe("compact");
  expect(vastPlan.identity.scaleTier).toBe("vast");
  expect(vastPlan.topology.envelope.width * vastPlan.topology.envelope.depth).toBeGreaterThan(
    compactPlan.topology.envelope.width * compactPlan.topology.envelope.depth * 2,
  );
  expect(vastPlan.topology.hamlets.length).toBeGreaterThan(compactPlan.topology.hamlets.length);
  expect(vastScatter.buildings.length).toBeGreaterThan(compactScatter.buildings.length);
  expect(vastScatter.trees.length).toBeGreaterThan(compactScatter.trees.length);
  expect(placementFingerprint(vast)).not.toBe(placementFingerprint(compact));
  clearPlannedScatterTopologyCacheForTests();
}, 30_000);
