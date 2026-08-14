import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import type { KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { createPlannedLandUse } from "./planned-land-use";
import { isPlannedRegionalExperienceRenderable } from "./planned-regional-experience-model";
import { createPlannedScatter } from "./planned-scatter";
import {
  addWalkNavigationGridObstacles,
  advanceWalkMotion,
  clearWalkInputState,
  constrainWalkMotionForResolution,
  createLandUseWalkObstacles,
  createPlannedRegionalWalkObstacles,
  createWalkNavigationGrid,
  createWalkInputState,
  createWalkMotionState,
  findWalkSpawn,
  isWalkPositionAllowed,
  normalizedWalkAxisScale,
  resolveWalkStep,
  sampleWalkNavigationHeight,
  updateWalkInputState,
  WALK_BODY_RADIUS,
  walkObstacleAt,
  walkForwardAxis,
  walkNavigationGridAllows,
  walkPositionBlockReason,
  walkRightAxis,
  walkSpeedForPlan,
  walkSurfaceBlockReason,
  type WalkObstacle,
} from "./kingdom-navigation-model";
import { createRepositoryWalkInteraction } from "./kingdom-walk-experience-model";
import { samplePlannedTerrainHeight } from "./planned-terrain-model";
import { createPlannedVisualEnrichment } from "./planned-visual-enrichment";
import { createPlannedWalkRuntimePlan } from "./planned-walk-runtime-model";

const NEXTJS_FIXTURE_URL = new URL("./test-fixtures/nextjs-large-world.json", import.meta.url);

function worldFixture(world: KingdomWorld) {
  const plan = createWorldPlan(world);
  const scatter = createPlannedScatter(world, plan);
  const enrichment = createPlannedVisualEnrichment(plan, scatter);
  const landUse = createPlannedLandUse(plan, scatter, enrichment);
  const obstacles: WalkObstacle[] = [
    ...[...scatter.buildings, ...scatter.landmarks].map((item) => ({
      x: item.transform.position.x,
      z: item.transform.position.z,
      radius: item.footprintRadius,
    })),
    ...createLandUseWalkObstacles(landUse),
  ];
  return { plan, landUse, obstacles };
}

function fixture(season: "spring" | "winter" = "spring") {
  return worldFixture(createDemoKingdom(season));
}

describe("kingdom walk navigation", () => {
  it("maps WASD and arrows, normalizes diagonal movement, and clears held keys on blur", () => {
    let input = createWalkInputState();
    input = updateWalkInputState(input, "W", true);
    input = updateWalkInputState(input, "ArrowRight", true);

    const right = walkRightAxis(input);
    const forward = walkForwardAxis(input);
    const scale = normalizedWalkAxisScale(right, forward);
    expect(right * scale).toBeCloseTo(Math.SQRT1_2, 12);
    expect(forward * scale).toBeCloseTo(Math.SQRT1_2, 12);

    input = clearWalkInputState();
    expect(input).toEqual(createWalkInputState());
    expect(walkRightAxis(input)).toBe(0);
    expect(walkForwardAxis(input)).toBe(0);
    expect(updateWalkInputState(input, " ", true)).toBe(input);
  });

  it("rejects outside terrain, water, shore, steep slopes, and structure footprints", () => {
    expect(
      walkSurfaceBlockReason({
        inside: false,
        material: "outside",
        slopeDegrees: 0,
        water: null,
      }),
    ).toBe("outside");
    expect(
      walkSurfaceBlockReason({
        inside: true,
        material: "lake-bed",
        slopeDegrees: 0,
        water: "lake",
      }),
    ).toBe("water");
    expect(
      walkSurfaceBlockReason({ inside: true, material: "shore", slopeDegrees: 3, water: null }),
    ).toBe("shore");
    expect(
      walkSurfaceBlockReason({
        inside: true,
        material: "high-meadow",
        slopeDegrees: 24.01,
        water: null,
      }),
    ).toBe("steep");

    const { plan, landUse, obstacles } = fixture();
    const spawn = findWalkSpawn(plan, obstacles, landUse);
    expect(spawn).not.toBeNull();
    expect(
      walkPositionBlockReason(plan, [{ x: spawn!.x, z: spawn!.z, radius: 1 }], spawn!.x, spawn!.z),
    ).toBe("structure");
  });

  it("slides along one valid axis when a diagonal step is blocked", () => {
    const resolution = resolveWalkStep(0, 0, 1, 1, (x, z) => x <= 0 && z <= 1);
    expect(resolution).toBe("z");
    expect(resolveWalkStep(0, 0, 1, 0, () => false)).toBe("blocked");
    expect(resolveWalkStep(0, 0, -1, 1, () => true)).toBe("full");
  });

  it("eases into walking and sprinting, decelerates, and removes camera gait under reduced motion", () => {
    const motion = createWalkMotionState();
    advanceWalkMotion(motion, 0, -1, false, 1 / 60, 10, false);
    const firstSpeed = motion.speed;
    expect(firstSpeed).toBeGreaterThan(0);
    expect(firstSpeed).toBeLessThan(10);

    for (let frame = 0; frame < 120; frame += 1) {
      advanceWalkMotion(motion, 0, -1, true, 1 / 60, 10, false);
    }
    expect(motion.speed).toBeCloseTo(15.5, 1);
    expect(Math.abs(motion.bobY)).toBeLessThanOrEqual(0.052);
    expect(Math.abs(motion.swayX)).toBeLessThanOrEqual(0.026);

    const sprintSpeed = motion.speed;
    advanceWalkMotion(motion, 0, 0, false, 1 / 60, 10, false);
    expect(motion.speed).toBeLessThan(sprintSpeed);
    expect(motion.speed).toBeGreaterThan(0);

    advanceWalkMotion(motion, 0, -1, false, 1 / 60, 10, true);
    expect(motion.bobY).toBe(0);
    expect(motion.swayX).toBe(0);

    constrainWalkMotionForResolution(motion, "x");
    expect(motion.velocityZ).toBe(0);
    constrainWalkMotionForResolution(motion, "blocked");
    expect(motion.speed).toBe(0);
  });

  it("keeps traversal near a human-scale game pace across repository sizes", () => {
    const compact = fixture().plan;
    const vast = worldFixture(
      JSON.parse(readFileSync(NEXTJS_FIXTURE_URL, "utf8")) as KingdomWorld,
    ).plan;
    const compactSpeed = walkSpeedForPlan(compact, false);
    const vastSpeed = walkSpeedForPlan(vast, false);

    expect(compactSpeed).toBeGreaterThanOrEqual(5.4);
    expect(vastSpeed).toBeGreaterThan(compactSpeed);
    expect(vastSpeed).toBeLessThanOrEqual(7.2);
    expect(walkSpeedForPlan(vast, true)).toBeCloseTo(vastSpeed * 0.72, 8);
  });

  it("chooses a deterministic, valid spawn that does not change with season", () => {
    const spring = fixture("spring");
    const winter = fixture("winter");
    const first = findWalkSpawn(spring.plan, spring.obstacles, spring.landUse);
    const second = findWalkSpawn(spring.plan, spring.obstacles, spring.landUse);
    const seasonal = findWalkSpawn(winter.plan, winter.obstacles, winter.landUse);

    expect(first).not.toBeNull();
    expect(first).toEqual(second);
    expect(seasonal).toEqual(first);
    expect(isWalkPositionAllowed(spring.plan, spring.obstacles, first!.x, first!.z)).toBe(true);

    const grid = createWalkNavigationGrid(spring.plan, spring.obstacles, spring.landUse);
    const gridSpawn = findWalkSpawn(spring.plan, spring.obstacles, spring.landUse, grid);
    expect(gridSpawn).not.toBeNull();
    expect(walkNavigationGridAllows(grid, gridSpawn!.x, gridSpawn!.z)).toBe(true);
    expect(grid.allowed).toBeInstanceOf(Uint8Array);
    expect(grid.heights).toBeInstanceOf(Float32Array);
  });

  it("compiles the exact canonical road network and land-use prop footprints season-invariantly", () => {
    const spring = fixture("spring");
    const winter = fixture("winter");
    const springGrid = createWalkNavigationGrid(spring.plan, spring.obstacles, spring.landUse);
    const winterGrid = createWalkNavigationGrid(winter.plan, winter.obstacles, winter.landUse);
    const expectedSegmentIds = spring.landUse.primaryRoad.segments.map((segment) => segment.id);

    expect(springGrid.primaryRoadNetworkId).toBe(spring.landUse.primaryRoad.id);
    expect(springGrid.primaryRoadSegmentIds).toEqual(expectedSegmentIds);
    expect(new Set(springGrid.primaryRoadSegmentIds).size).toBe(expectedSegmentIds.length);
    expect(springGrid.roadSurfaces.map((surface) => surface.segmentId)).toEqual(
      expect.arrayContaining(expectedSegmentIds),
    );
    expect(createLandUseWalkObstacles(spring.landUse)).toEqual(
      spring.landUse.anchors.map((anchor) => ({
        x: anchor.position.x,
        z: anchor.position.z,
        radius: anchor.clearanceRadius,
      })),
    );
    expect(winterGrid.primaryRoadNetworkId).toBe(springGrid.primaryRoadNetworkId);
    expect(winterGrid.primaryRoadSegmentIds).toEqual(springGrid.primaryRoadSegmentIds);
    expect(winterGrid.roadSurfaces).toEqual(springGrid.roadSurfaces);
  });

  it("makes every valid canonical crossing traversable at its authored elevation on captured next.js", () => {
    const world = JSON.parse(readFileSync(NEXTJS_FIXTURE_URL, "utf8")) as KingdomWorld;
    const { plan, landUse, obstacles } = worldFixture(world);
    const grid = createWalkNavigationGrid(plan, obstacles, landUse);
    let crossingCount = 0;
    const crossingKinds = new Set<string>();

    for (const segment of landUse.primaryRoad.segments) {
      for (const crossing of segment.crossings.filter((candidate) => candidate.valid)) {
        crossingCount += 1;
        crossingKinds.add(crossing.kind);
        for (
          let pointIndex = crossing.startPointIndex;
          pointIndex <= crossing.endPointIndex;
          pointIndex += 1
        ) {
          const point = segment.points[pointIndex]!;
          expect(
            walkNavigationGridAllows(grid, point.x, point.z),
            `${segment.id}:${crossing.id}:${pointIndex}`,
          ).toBe(true);
          expect(sampleWalkNavigationHeight(grid, point.x, point.z)).toBeGreaterThan(
            samplePlannedTerrainHeight(plan, point.x, point.z) + 0.1,
          );
        }
      }
    }

    expect(crossingCount).toBeGreaterThan(0);
    expect(crossingKinds).toEqual(new Set(["bridge", "stepped-cut"]));
  });

  it("adds rendered regional prop footprints to a copied worker grid without moving its spawn", () => {
    const world = JSON.parse(readFileSync(NEXTJS_FIXTURE_URL, "utf8")) as KingdomWorld;
    const plan = createWorldPlan(world);
    const scatter = createPlannedScatter(world, plan);
    const enrichment = createPlannedVisualEnrichment(plan, scatter);
    const landUse = createPlannedLandUse(plan, scatter, enrichment);
    const interaction = createRepositoryWalkInteraction(world, plan, scatter);
    const obstacles: WalkObstacle[] = [
      ...[...scatter.buildings, ...scatter.landmarks].map((item) => ({
        x: item.transform.position.x,
        z: item.transform.position.z,
        radius: item.footprintRadius,
      })),
      ...createLandUseWalkObstacles(landUse),
    ];
    const baseNavigationGrid = createWalkNavigationGrid(plan, obstacles, landUse);
    const runtime = createPlannedWalkRuntimePlan({
      plan,
      landUse,
      scatter,
      enrichment,
      obstacles,
      structures: interaction.structures,
      targets: interaction.targets,
    });
    const regional = runtime.regional;
    expect(isPlannedRegionalExperienceRenderable(regional)).toBe(true);

    const additions = createPlannedRegionalWalkObstacles(regional!);
    const repeatedAdditions = createPlannedRegionalWalkObstacles(regional!);
    const originalAllowed = baseNavigationGrid.allowed.slice();
    const originalHeights = baseNavigationGrid.heights.slice();
    const originalObstacles = [...baseNavigationGrid.obstacles];
    const augmented = addWalkNavigationGridObstacles(baseNavigationGrid, additions);
    const repeated = addWalkNavigationGridObstacles(baseNavigationGrid, additions);

    expect(additions).toEqual(repeatedAdditions);
    expect(additions.length).toBeGreaterThan(0);
    expect(augmented).not.toBe(baseNavigationGrid);
    expect(augmented.allowed).not.toBe(baseNavigationGrid.allowed);
    expect(augmented.heights).not.toBe(baseNavigationGrid.heights);
    expect(baseNavigationGrid.allowed).toEqual(originalAllowed);
    expect(baseNavigationGrid.heights).toEqual(originalHeights);
    expect(baseNavigationGrid.obstacles).toEqual(originalObstacles);
    expect(augmented.allowed).toEqual(repeated.allowed);
    expect(augmented.heights).toEqual(repeated.heights);
    expect(augmented.obstacles).toEqual(repeated.obstacles);
    expect(augmented.heights).toEqual(originalHeights);

    expect(
      walkNavigationGridAllows(augmented, regional!.route.spawn.x, regional!.route.spawn.z),
    ).toBe(true);
    const fenceInstances = regional!.instances.filter((instance) => instance.role === "fence");
    expect(fenceInstances.length).toBeGreaterThan(0);
    for (const fence of fenceInstances) {
      const obstacle = additions.find(
        (candidate) => candidate.x === fence.position.x && candidate.z === fence.position.z,
      )!;
      expect(obstacle).toBeDefined();
      expect(
        walkNavigationGridAllows(augmented, fence.position.x, fence.position.z),
        fence.id,
      ).toBe(false);
      const bodyProbeX = fence.position.x + obstacle.radius + WALK_BODY_RADIUS * 0.5;
      expect(walkObstacleAt(additions, bodyProbeX, fence.position.z), fence.id).toBe(obstacle);
      expect(walkNavigationGridAllows(augmented, bodyProbeX, fence.position.z), fence.id).toBe(
        false,
      );
    }
  }, 45_000);
});
