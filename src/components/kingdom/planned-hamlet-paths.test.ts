import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import {
  createPlannedHamletPathBatch,
  createPlannedHamletPathCorridors,
  createPlannedPathEdges,
  disposePlannedHamletPathBatch,
  PLANNED_HAMLET_PATH_SEGMENTS,
  queryPlannedHamletPathCorridorDistance,
} from "./planned-hamlet-paths";
import { createPlannedScatter } from "./planned-scatter";

const NEXTJS_FIXTURE_URL = new URL("./test-fixtures/nextjs-large-world.json", import.meta.url);

describe("planned hamlet path batching", () => {
  it("retains every local edge and exact triangles in two terrain-following meshes", () => {
    const world = JSON.parse(readFileSync(NEXTJS_FIXTURE_URL, "utf8")) as KingdomWorld;
    const plan = createWorldPlan(world);
    const scatter = createPlannedScatter(world, plan);
    const edges = createPlannedPathEdges(plan, scatter);
    const batch = createPlannedHamletPathBatch(plan, scatter);
    const expectedEdgeIds = plan.topology.hamlets.flatMap((hamlet) => [
      `court-entry-${hamlet.id}`,
      ...scatter.buildings
        .filter((building) => building.hamletId === hamlet.id)
        .sort((first, second) => first.id.localeCompare(second.id))
        .map((building) => `lane-${hamlet.id}-${building.id}`),
    ]);
    const pathSegments = 52;
    const expectedLayerIndexCount = expectedEdgeIds.length * pathSegments * 6;

    expect(edges.map((edge) => edge.id)).toEqual(expectedEdgeIds);
    expect(batch.renderedEdgeIds).toEqual(expectedEdgeIds);
    expect(new Set(batch.renderedEdgeIds).size).toBe(batch.renderedEdgeIds.length);
    expect(batch.renderedEdgeIds.every((id) => /^(?:lane|court-entry)-/u.test(id))).toBe(true);
    expect(batch.drawCallCount).toBe(2);
    expect(batch.generatedTriangleCount).toBe((expectedLayerIndexCount * 2) / 3);
    expect(batch.border.index?.count).toBe(expectedLayerIndexCount);
    expect(batch.surface.index?.count).toBe(expectedLayerIndexCount);

    disposePlannedHamletPathBatch(batch);
  }, 10_000);

  it("shares one deterministic sampled footprint between ribbon geometry and clearance", () => {
    const world = JSON.parse(readFileSync(NEXTJS_FIXTURE_URL, "utf8")) as KingdomWorld;
    const plan = createWorldPlan(world);
    const scatter = createPlannedScatter(world, plan);
    const corridors = createPlannedHamletPathCorridors(plan, scatter);
    const repeated = createPlannedHamletPathCorridors(plan, scatter);
    const batch = createPlannedHamletPathBatch(plan, scatter);

    expect(repeated).toEqual(corridors);
    expect(corridors.map((corridor) => corridor.id)).toEqual(batch.renderedEdgeIds);
    expect(
      corridors.every((corridor) => corridor.samples.length === PLANNED_HAMLET_PATH_SEGMENTS + 1),
    ).toBe(true);

    const first = corridors[0]!;
    const sample = first.samples[Math.floor(PLANNED_HAMLET_PATH_SEGMENTS / 2)]!;
    expect(queryPlannedHamletPathCorridorDistance(sample.center, corridors)).toEqual({
      corridorId: first.id,
      distance: 0,
    });

    const firstSample = first.samples[0]!;
    const borderPosition = batch.border.getAttribute("position");
    expect(borderPosition.getX(0)).toBeCloseTo(
      firstSample.center.x - firstSample.normal.x * firstSample.borderHalfWidth,
      5,
    );
    expect(borderPosition.getZ(0)).toBeCloseTo(
      firstSample.center.z - firstSample.normal.z * firstSample.borderHalfWidth,
      5,
    );

    disposePlannedHamletPathBatch(batch);
  }, 10_000);
});
