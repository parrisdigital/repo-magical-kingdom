import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import type { KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { clearPlannedScatterTopologyCacheForTests, createPlannedScatter } from "./planned-scatter";
import { classifyPlannedTerrainRegion } from "./planned-terrain-model";

const FIXTURE_URL = new URL("./test-fixtures/repository-city-live-world.json", import.meta.url);

function distance(
  first: Readonly<{ x: number; z: number }>,
  second: Readonly<{ x: number; z: number }>,
): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

it("creates truthful scatter for the captured live repository-city world", () => {
  const world = JSON.parse(readFileSync(FIXTURE_URL, "utf8")) as KingdomWorld;
  expect(world.source.repositoryId).toBe(1_296_981_064);
  expect(world.source.commitSha).toBe("0e61374af12387266c6fb13c273bee845b5f0864");
  const plan = createWorldPlan(world);
  clearPlannedScatterTopologyCacheForTests();
  const scatter = createPlannedScatter(world, plan);

  const hamletCapacity = plan.topology.hamlets.reduce(
    (total, hamlet) => total + hamlet.maxBuildings,
    0,
  );
  const expectedBuildingCount = Math.max(
    plan.topology.hamlets.length * 3,
    Math.min(
      plan.topology.repositoryScale.viewBudgets.overview.maxBuildings,
      plan.topology.hamlets.length * 6,
    ),
  );
  expect(hamletCapacity).toBe(expectedBuildingCount);
  expect(
    Math.max(...plan.topology.hamlets.map((hamlet) => hamlet.maxBuildings)) -
      Math.min(...plan.topology.hamlets.map((hamlet) => hamlet.maxBuildings)),
  ).toBeLessThanOrEqual(1);
  expect(scatter.buildings).toHaveLength(hamletCapacity);
  expect(scatter.landmarks.map((landmark) => landmark.id)).toEqual(
    plan.topology.landmarks.map((landmark) => landmark.id),
  );
  for (const hamlet of plan.topology.hamlets) {
    expect(
      scatter.buildings.filter((building) => building.hamletId === hamlet.id),
      hamlet.id,
    ).toHaveLength(hamlet.maxBuildings);
  }

  const structures = [...scatter.buildings, ...scatter.landmarks];
  for (let firstIndex = 0; firstIndex < structures.length; firstIndex += 1) {
    const first = structures[firstIndex]!;
    for (let sampleIndex = 0; sampleIndex < 9; sampleIndex += 1) {
      const angle = ((sampleIndex - 1) / 8) * Math.PI * 2;
      const radius = sampleIndex === 0 ? 0 : first.footprintRadius;
      const x = first.transform.position.x + Math.cos(angle) * radius;
      const z = first.transform.position.z + Math.sin(angle) * radius;
      const region = classifyPlannedTerrainRegion(plan, x, z);
      expect(region.inside, `${first.id}:footprint:${sampleIndex}`).toBe(true);
      expect(region.water, `${first.id}:footprint:${sampleIndex}`).toBeNull();
      expect(region.material, `${first.id}:footprint:${sampleIndex}`).not.toBe("shore");
      expect(region.slopeDegrees, `${first.id}:footprint:${sampleIndex}`).toBeLessThanOrEqual(
        first.terrain.maxSlopeDegrees,
      );
    }
    for (let secondIndex = firstIndex + 1; secondIndex < structures.length; secondIndex += 1) {
      const second = structures[secondIndex]!;
      expect(
        distance(first.transform.position, second.transform.position),
        `${first.id} intersects ${second.id}`,
      ).toBeGreaterThanOrEqual(first.footprintRadius + second.footprintRadius + 1.5);
    }
  }

  expect(new Set(scatter.semanticHitZones.flatMap((zone) => zone.entityIds))).toEqual(
    new Set(world.entities.map((entity) => entity.id)),
  );

  clearPlannedScatterTopologyCacheForTests();
  expect(createPlannedScatter(world, createWorldPlan(world))).toEqual(scatter);
  clearPlannedScatterTopologyCacheForTests();
}, 20_000);
