import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import type { KingdomSeason, KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import {
  createPlannedScatter,
  REPOSITORY_BUILDING_MAGNITUDE_SCALE,
  type PlannedScatter,
} from "./planned-scatter";
import { ARCHITECTURE_FOOTPRINT_COVERAGE } from "./repo-asset-vocabulary";

const NEXTJS_FIXTURE_URL = new URL("./test-fixtures/nextjs-large-world.json", import.meta.url);

function nextWorld(season: KingdomSeason = "spring"): KingdomWorld {
  const source = JSON.parse(readFileSync(NEXTJS_FIXTURE_URL, "utf8")) as KingdomWorld;
  return {
    ...source,
    season,
    provinces: source.provinces.map((province) => ({ ...province, season })),
  };
}

function structures(scatter: PlannedScatter) {
  return [
    ...scatter.buildings.map((building) => ({ ...building, landmark: false as const })),
    ...scatter.landmarks.map((landmark) => ({ ...landmark, landmark: true as const })),
  ];
}

function assertArchitectureSafety(world: KingdomWorld) {
  const plan = createWorldPlan(world);
  const scatter = createPlannedScatter(world, plan);
  const planned = structures(scatter);
  const recipeCounts = new Map<string, number>();
  for (const structure of planned) {
    const architecture = structure.architecture;
    recipeCounts.set(architecture.recipeId, (recipeCounts.get(architecture.recipeId) ?? 0) + 1);
    expect(architecture.structureId).toBe(structure.id);
    expect(architecture.coverageRadius).toBeLessThanOrEqual(
      structure.footprintRadius * ARCHITECTURE_FOOTPRINT_COVERAGE + 0.001,
    );
    const roleScale = architecture.hero ? 1.52 : structure.landmark ? 1.44 : 1.28;
    const expectedVisualScale = structure.transform.scale.x * roleScale;
    const expectedHeightScale = structure.transform.scale.y * roleScale;
    expect(architecture.sourceHorizontalScale).toBe(structure.transform.scale.x);
    expect(architecture.sourceMagnitudeScale).toBe(structure.transform.scale.y);
    expect(architecture.desiredVisualScale).toBeCloseTo(expectedVisualScale, 10);
    expect(architecture.desiredHeightScale).toBeCloseTo(expectedHeightScale, 10);
    // The renderer's visual scale is exactly the planned desired scale: no
    // post-placement fit/shrink remains in the runtime contract.
    expect(architecture.desiredVisualScale / expectedVisualScale).toBe(1);
  }
  for (let firstIndex = 0; firstIndex < planned.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < planned.length; secondIndex += 1) {
      const first = planned[firstIndex]!;
      const second = planned[secondIndex]!;
      const distance = Math.hypot(
        first.transform.position.x - second.transform.position.x,
        first.transform.position.z - second.transform.position.z,
      );
      expect(
        distance - first.footprintRadius - second.footprintRadius,
        `${first.id} / ${second.id}`,
      ).toBeGreaterThanOrEqual(1.5 - 0.001);
    }
  }
  expect(
    new Set(planned.map(({ architecture }) => architecture.recipeId)).size,
  ).toBeGreaterThanOrEqual(Math.min(4, planned.length));
  expect(Math.max(...recipeCounts.values()) / planned.length).toBeLessThanOrEqual(0.35);
  return { plan, scatter, planned };
}

describe("planner-aware architecture footprints", () => {
  it("renders 28 hierarchical + 3 landmark Next structures at full scale inside exact footprints", () => {
    const { plan, scatter, planned } = assertArchitectureSafety(nextWorld());
    expect(scatter.buildings).toHaveLength(28);
    expect(scatter.landmarks).toHaveLength(3);
    expect(planned).toHaveLength(31);
    expect(new Set(planned.map((structure) => structure.id)).size).toBe(31);
    const satellites = new Set(
      plan.topology.hamlets
        .filter((hamlet) => hamlet.role === "commons-hamlet")
        .map((hamlet) => hamlet.id),
    );
    const satelliteStructures = planned.filter(
      (structure) => structure.hamletId !== null && satellites.has(structure.hamletId),
    );
    expect(satellites.size).toBe(1);
    expect(satelliteStructures).toHaveLength(4);
    expect(
      satelliteStructures.every(
        (structure) =>
          !structure.architecture.hero && structure.architecture.compoundIdentity === "village",
      ),
    ).toBe(true);
    expect(
      scatter.buildings.every(
        (building) =>
          building.architecture.sourceMagnitudeScale >=
            REPOSITORY_BUILDING_MAGNITUDE_SCALE.minimum &&
          building.architecture.sourceMagnitudeScale <= REPOSITORY_BUILDING_MAGNITUDE_SCALE.maximum,
      ),
    ).toBe(true);
    expect(
      Math.max(...scatter.buildings.map((building) => building.architecture.desiredHeightScale)),
    ).toBeLessThanOrEqual(REPOSITORY_BUILDING_MAGNITUDE_SCALE.maximum * 1.52 + 0.000_001);
    expect(Math.max(...scatter.buildings.map((building) => building.footprintRadius))).toBeLessThan(
      7,
    );
  });

  it("keeps compact and vast recipe packing safe and deterministic", () => {
    const compact = assertArchitectureSafety(createDemoKingdom("spring"));
    const vast = assertArchitectureSafety(nextWorld("spring"));
    expect(compact.plan.identity.scaleTier).toBe("compact");
    expect(vast.plan.identity.scaleTier).toBe("vast");
    expect(compact.scatter).toEqual(
      createPlannedScatter(
        createDemoKingdom("spring"),
        createWorldPlan(createDemoKingdom("spring")),
      ),
    );
  });

  it("is invariant across seasonal appearance changes", () => {
    const spring = assertArchitectureSafety(nextWorld("spring")).planned.map(
      ({ id, architecture, footprintRadius, transform }) => ({
        id,
        architecture,
        footprintRadius,
        transform,
      }),
    );
    const winter = assertArchitectureSafety(nextWorld("winter")).planned.map(
      ({ id, architecture, footprintRadius, transform }) => ({
        id,
        architecture,
        footprintRadius,
        transform,
      }),
    );
    expect(winter).toEqual(spring);
  });

  it("keeps the architecture planner renderer-agnostic and acyclic", () => {
    const source = readFileSync(new URL("./repo-architecture-plan.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/kingdom-scene-planned|planned-scatter/u);
  });
});
