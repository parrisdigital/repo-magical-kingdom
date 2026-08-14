import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import type { KingdomWorld, Selection } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import {
  createLandUseWalkObstacles,
  createWalkNavigationGrid,
  isWalkPositionAllowed,
  sampleWalkNavigationHeight,
  walkNavigationGridAllows,
  walkObstacleAt,
  WALK_EYE_HEIGHT,
  type WalkObstacle,
} from "./kingdom-navigation-model";
import { createPlannedLandUse } from "./planned-land-use";
import {
  acquireWalkTarget,
  createRepositoryWalkInteraction,
  createWalkLocationRegions,
  createWalkSettlementPaths,
  createWalkTargetPrompt,
  findLivingWalkSpawn,
  walkCompassHeading,
  walkDistanceToSettlementPath,
  walkLocationLabel,
  walkWaterSightlineClearance,
  walkWaterSightlineIsClear,
  WALK_EXPERIENCE_GATES,
  type WalkSpawnStructure,
  type WalkTarget,
} from "./kingdom-walk-experience-model";
import { createPlannedScatter } from "./planned-scatter";
import {
  getHamletVisualPlacementMask,
  samplePlannedTerrainHeight,
  samplePlannedWaterSurface,
} from "./planned-terrain-model";
import { createPlannedVisualEnrichment } from "./planned-visual-enrichment";

const NEXTJS_FIXTURE_URL = new URL("./test-fixtures/nextjs-large-world.json", import.meta.url);

const WALK_MATRIX_FAMILIES = [
  { id: "foreground-estuary", repositoryId: 5 },
  { id: "eastern-lake-run", repositoryId: 6 },
  { id: "western-basin-watershed", repositoryId: 7 },
  { id: "central-meander", repositoryId: 8 },
] as const;

const WALK_MATRIX_SCALES = [
  { id: "compact", files: 62, logarithmicProgress: 0 },
  { id: "established", files: 120, logarithmicProgress: 0.012160812114612318 },
  { id: "expansive", files: 900, logarithmicProgress: 0.1837892747976836 },
  { id: "vast", files: 8_000, logarithmicProgress: 0.5 },
] as const;

function walkMatrixWorld(repositoryId: number, files: number): KingdomWorld {
  const base = createDemoKingdom("spring");
  const repository = `walk-matrix-${repositoryId}`;
  const categoryTotal = Math.max(
    1,
    base.statistics.categories.reduce((total, category) => total + category.files, 0),
  );
  const categories = base.statistics.categories.map((category, index) => ({
    ...category,
    files:
      index === 0
        ? files -
          base.statistics.categories
            .slice(1)
            .reduce((total, entry) => total + Math.round((entry.files / categoryTotal) * files), 0)
        : Math.round((category.files / categoryTotal) * files),
  }));
  return {
    ...base,
    buildKey: `${base.buildKey}:walk-matrix:${repositoryId}:${files}`,
    seed: `matrix/${repository}`,
    source: {
      ...base.source,
      owner: "matrix",
      repository,
      repositoryId,
      canonicalUrl: `https://github.com/matrix/${repository}`,
      revisionUrl: `https://github.com/matrix/${repository}/tree/${base.source.commitSha}`,
    },
    coverage: {
      ...base.coverage,
      discoveredFiles: files + base.coverage.omittedFiles,
      eligibleFiles: files,
      representedFiles: files,
    },
    statistics: { ...base.statistics, files, categories },
  };
}

function plannedWalkFixture(world: KingdomWorld) {
  const plan = createWorldPlan(world);
  const scatter = createPlannedScatter(world, plan);
  const enrichment = createPlannedVisualEnrichment(plan, scatter);
  const landUse = createPlannedLandUse(plan, scatter, enrichment);
  const interaction = createRepositoryWalkInteraction(world, plan, scatter);
  const obstacles: WalkObstacle[] = [
    ...[...scatter.buildings, ...scatter.landmarks].map((structure) => ({
      x: structure.transform.position.x,
      z: structure.transform.position.z,
      radius: structure.footprintRadius,
    })),
    ...createLandUseWalkObstacles(landUse),
  ];
  const grid = createWalkNavigationGrid(plan, obstacles, landUse);
  const spawn = findLivingWalkSpawn(
    plan,
    obstacles,
    interaction.structures,
    interaction.targets,
    landUse,
    grid,
  );
  return { plan, landUse, interaction, obstacles, grid, spawn };
}

function sharedViewAngleDegrees(
  origin: Readonly<{ x: number; z: number }>,
  repositoryTarget: Readonly<{ x: number; z: number }>,
  waterTarget: Readonly<{ x: number; z: number }>,
): number {
  const targetX = repositoryTarget.x - origin.x;
  const targetZ = repositoryTarget.z - origin.z;
  const waterX = waterTarget.x - origin.x;
  const waterZ = waterTarget.z - origin.z;
  const denominator = Math.hypot(targetX, targetZ) * Math.hypot(waterX, waterZ);
  if (denominator < 0.000_001) return 0;
  const cosine = (targetX * waterX + targetZ * waterZ) / denominator;
  return Math.acos(Math.min(1, Math.max(-1, cosine))) * (180 / Math.PI);
}

function fixture(season: "spring" | "winter" = "spring") {
  const world = createDemoKingdom(season);
  const plan = createWorldPlan(world);
  const scatter = createPlannedScatter(world, plan);
  const enrichment = createPlannedVisualEnrichment(plan, scatter);
  const landUse = createPlannedLandUse(plan, scatter, enrichment);
  const provinces = new Map(world.provinces.map((province) => [province.id, province]));
  const structures: WalkSpawnStructure[] = plan.topology.hamlets.flatMap((hamlet) => {
    const province = provinces.get(hamlet.provinceId);
    if (!province) return [];
    const center = getHamletVisualPlacementMask(plan, hamlet).center;
    return [
      {
        id: `fixture:${hamlet.id}`,
        hamletId: hamlet.id,
        x: center.x,
        y: samplePlannedTerrainHeight(plan, center.x, center.z),
        z: center.z,
        radius: 3.2,
        targetId: `structure:fixture:${hamlet.id}`,
      },
    ];
  });
  const obstacles: WalkObstacle[] = [
    ...structures.map((structure) => ({
      x: structure.x,
      z: structure.z,
      radius: structure.radius,
    })),
    ...createLandUseWalkObstacles(landUse),
  ];
  const targets: WalkTarget[] = structures.map((structure) => {
    const hamlet = plan.topology.hamlets.find((candidate) => candidate.id === structure.hamletId)!;
    const province = provinces.get(hamlet.provinceId)!;
    const selection: NonNullable<Selection> = { kind: "province", province };
    return {
      id: structure.targetId,
      label: hamlet.label,
      detail: `${province.label} repository settlement`,
      kind: "building",
      x: structure.x,
      y: structure.y + 2.4,
      z: structure.z,
      selection,
    };
  });
  return { plan, landUse, obstacles, structures, targets };
}

describe("living repository walk experience", () => {
  it("enters beside a safe lived-in compound and looks at a repository POI", () => {
    const { plan, landUse, obstacles, structures, targets } = fixture();
    const grid = createWalkNavigationGrid(plan, obstacles, landUse);
    const spawn = findLivingWalkSpawn(plan, obstacles, structures, targets, landUse, grid);

    expect(spawn).not.toBeNull();
    expect(spawn!.quality).not.toBe("fallback");
    expect(spawn!.structureDistance).toBeGreaterThanOrEqual(
      WALK_EXPERIENCE_GATES.minimumStructureDistance,
    );
    expect(spawn!.structureDistance).toBeLessThanOrEqual(
      WALK_EXPERIENCE_GATES.maximumStructureDistance,
    );
    expect(spawn!.pathDistance).toBeLessThanOrEqual(WALK_EXPERIENCE_GATES.maximumPathDistance);
    expect(isWalkPositionAllowed(plan, obstacles, spawn!.position.x, spawn!.position.z)).toBe(true);
    expect(walkObstacleAt(obstacles, spawn!.position.x, spawn!.position.z)).toBeNull();
    expect(targets.some((target) => target.id === spawn!.targetId)).toBe(true);
    expect(spawn!.lookTarget).not.toEqual({
      x: plan.topology.envelope.center.x,
      y: expect.any(Number),
      z: plan.topology.envelope.center.z,
    });
    if (spawn!.waterInView) {
      expect(spawn!.waterDistance).toBeGreaterThanOrEqual(
        WALK_EXPERIENCE_GATES.minimumPreferredWaterDistance,
      );
      expect(spawn!.waterDistance).toBeLessThanOrEqual(
        WALK_EXPERIENCE_GATES.maximumPreferredWaterDistance,
      );
    }
  });

  it("is deterministic and season-invariant", () => {
    const spring = fixture("spring");
    const winter = fixture("winter");
    const springGrid = createWalkNavigationGrid(spring.plan, spring.obstacles, spring.landUse);
    const winterGrid = createWalkNavigationGrid(winter.plan, winter.obstacles, winter.landUse);
    const first = findLivingWalkSpawn(
      spring.plan,
      spring.obstacles,
      spring.structures,
      spring.targets,
      spring.landUse,
      springGrid,
    );
    const repeated = findLivingWalkSpawn(
      spring.plan,
      spring.obstacles,
      spring.structures,
      spring.targets,
      spring.landUse,
      springGrid,
    );
    const seasonal = findLivingWalkSpawn(
      winter.plan,
      winter.obstacles,
      winter.structures,
      winter.targets,
      winter.landUse,
      winterGrid,
    );

    expect(first).toEqual(repeated);
    expect(seasonal).toEqual(first);
  });

  it("uses every exact canonical land-use road edge for spawn path ranking", () => {
    const { landUse } = fixture();
    const paths = createWalkSettlementPaths(landUse);
    const expected = [...landUse.primaryRoad.segments]
      .sort((first, second) => first.id.localeCompare(second.id))
      .flatMap((segment) =>
        segment.points.slice(1).map((point, edgeIndex) => ({
          id: `${segment.id}:edge:${edgeIndex}`,
          from: {
            x: segment.points[edgeIndex]!.x,
            z: segment.points[edgeIndex]!.z,
          },
          to: { x: point.x, z: point.z },
        })),
      );

    expect(paths).toEqual(expected);
  });

  it("keeps the living Walk entry contract across every topology family and scale", () => {
    const coverage: Array<{
      family: (typeof WALK_MATRIX_FAMILIES)[number]["id"];
      scale: (typeof WALK_MATRIX_SCALES)[number]["id"];
      authoredReachableWater: boolean;
      waterInView: boolean;
    }> = [];

    for (const family of WALK_MATRIX_FAMILIES) {
      for (const scale of WALK_MATRIX_SCALES) {
        const label = `${family.id}/${scale.id}`;
        let walkFixture: ReturnType<typeof plannedWalkFixture>;
        try {
          walkFixture = plannedWalkFixture(walkMatrixWorld(family.repositoryId, scale.files));
        } catch (error) {
          throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`, {
            cause: error,
          });
        }
        const { plan, landUse, interaction, obstacles, grid, spawn } = walkFixture;
        const canonicalSegmentIds = landUse.primaryRoad.segments.map((segment) => segment.id);
        const canonicalSegmentIdSet = new Set(canonicalSegmentIds);
        const paths = createWalkSettlementPaths(landUse);
        // Reachability is authored independently of spawn selection. A compact
        // layout without this canonical road-to-overlook contract is allowed
        // to enter without water; these fixed representatives currently all
        // author a reachable overlook.
        const authoredWaterView = landUse.anchors.find(
          (anchor) =>
            anchor.waterView &&
            anchor.walkAdjacent &&
            anchor.terrain.valid &&
            anchor.clearsStructures &&
            anchor.roadSegmentId !== null &&
            canonicalSegmentIdSet.has(anchor.roadSegmentId),
        );

        expect(plan.topology.geography.id, label).toBe(family.id);
        expect(plan.identity.scaleTier, label).toBe(scale.id);
        expect(plan.topology.repositoryScale.eligibleFiles, label).toBe(scale.files);
        expect(plan.topology.repositoryScale.logarithmicProgress, label).toBe(
          scale.logarithmicProgress,
        );
        expect(grid.primaryRoadNetworkId, label).toBe(landUse.primaryRoad.id);
        expect(grid.primaryRoadSegmentIds, label).toEqual(canonicalSegmentIds);
        expect(grid.roadSurfaces, label).toHaveLength(paths.length);
        expect(landUse.validation.hasWaterViewPoi, label).toBe(Boolean(authoredWaterView));
        expect(spawn, label).not.toBeNull();
        expect(spawn!.quality, label).not.toBe("fallback");
        expect(spawn!.structureDistance, label).toBeGreaterThanOrEqual(
          WALK_EXPERIENCE_GATES.minimumStructureDistance,
        );
        expect(spawn!.structureDistance, label).toBeLessThanOrEqual(
          WALK_EXPERIENCE_GATES.maximumStructureDistance,
        );
        expect(spawn!.pathDistance, label).toBeCloseTo(
          walkDistanceToSettlementPath(paths, spawn!.position.x, spawn!.position.z),
          6,
        );
        expect(spawn!.pathDistance, label).toBeLessThanOrEqual(
          WALK_EXPERIENCE_GATES.maximumPathDistance,
        );
        expect(walkNavigationGridAllows(grid, spawn!.position.x, spawn!.position.z), label).toBe(
          true,
        );
        expect(spawn!.position.y, label).toBeCloseTo(
          sampleWalkNavigationHeight(grid, spawn!.position.x, spawn!.position.z) + WALK_EYE_HEIGHT,
          6,
        );
        expect(walkObstacleAt(obstacles, spawn!.position.x, spawn!.position.z), label).toBeNull();
        expect(
          interaction.structures.some((structure) => structure.id === spawn!.structureId),
          label,
        ).toBe(true);
        expect(
          interaction.targets.some((target) => target.id === spawn!.targetId),
          label,
        ).toBe(true);

        if (authoredWaterView) {
          expect(spawn!.quality, label).toBe("path-water");
          expect(spawn!.waterInView, label).toBe(true);
        }
        if (spawn!.waterInView) {
          expect(spawn!.waterFocus, label).not.toBeNull();
          expect(
            samplePlannedWaterSurface(plan, spawn!.waterFocus!.x, spawn!.waterFocus!.z),
            label,
          ).not.toBeNull();
          const focusDistance = Math.hypot(
            spawn!.waterFocus!.x - spawn!.position.x,
            spawn!.waterFocus!.z - spawn!.position.z,
          );
          expect(focusDistance, label).toBeGreaterThanOrEqual(
            WALK_EXPERIENCE_GATES.minimumPreferredWaterDistance,
          );
          expect(focusDistance, label).toBeLessThanOrEqual(
            WALK_EXPERIENCE_GATES.maximumPreferredWaterDistance,
          );
          expect(
            sharedViewAngleDegrees(spawn!.position, spawn!.lookTarget, spawn!.waterFocus!),
            label,
          ).toBeLessThanOrEqual(WALK_EXPERIENCE_GATES.waterViewAngleDegrees);
          expect(walkWaterSightlineIsClear(plan, spawn!.position, spawn!.waterFocus!), label).toBe(
            true,
          );
          expect(
            walkWaterSightlineClearance(plan, spawn!.position, spawn!.waterFocus!),
            label,
          ).toBeGreaterThanOrEqual(WALK_EXPERIENCE_GATES.minimumWaterSightlineClearance);
        } else {
          expect(spawn!.waterFocus, label).toBeNull();
        }

        coverage.push({
          family: family.id,
          scale: scale.id,
          authoredReachableWater: Boolean(authoredWaterView),
          waterInView: spawn!.waterInView,
        });
      }
    }

    expect(coverage).toHaveLength(WALK_MATRIX_FAMILIES.length * WALK_MATRIX_SCALES.length);
    expect(new Set(coverage.map(({ family, scale }) => `${family}:${scale}`)).size).toBe(
      WALK_MATRIX_FAMILIES.length * WALK_MATRIX_SCALES.length,
    );
    expect(coverage.every(({ authoredReachableWater }) => authoredReachableWater)).toBe(true);
    expect(coverage.every(({ waterInView }) => waterInView)).toBe(true);
  }, 180_000);

  it("acquires only a centered target within thirty world units and reports truthful distance", () => {
    const selection = {
      kind: "province" as const,
      province: createDemoKingdom("spring").provinces[0]!,
    };
    const centered: WalkTarget = {
      id: "centered",
      label: "Archive Hall",
      detail: "Repository documentation",
      kind: "landmark",
      x: 0,
      y: 1.72,
      z: -24,
      selection,
    };
    const outsideCone: WalkTarget = {
      ...centered,
      id: "outside-cone",
      x: Math.sin((8.2 * Math.PI) / 180) * 20,
      z: -Math.cos((8.2 * Math.PI) / 180) * 20,
    };
    const tooFar: WalkTarget = { ...centered, id: "too-far", z: -30.1 };
    const limit: WalkTarget = { ...centered, id: "limit", z: -30 };

    expect(acquireWalkTarget(0, 1.72, 0, 0, 0, -1, [outsideCone, tooFar, centered])).toBe(centered);
    expect(acquireWalkTarget(0, 1.72, 0, 0, 0, -1, [outsideCone, tooFar])).toBeNull();
    expect(acquireWalkTarget(0, 1.72, 0, 0, 0, -1, [limit])).toBe(limit);
    expect(createWalkTargetPrompt(centered, 0, 1.72, 0)).toEqual({
      id: "centered",
      label: "Archive Hall",
      detail: "Repository documentation",
      kind: "landmark",
      distance: 24,
    });
  });

  it("maps camera direction to a stable eight-point compass", () => {
    expect(walkCompassHeading(0, -1)).toBe("N");
    expect(walkCompassHeading(1, 0)).toBe("E");
    expect(walkCompassHeading(0, 1)).toBe("S");
    expect(walkCompassHeading(-1, 0)).toBe("W");
  });

  it("updates the location label when crossing between a settlement and the frontier", () => {
    const { plan } = fixture();
    const regions = createWalkLocationRegions(plan);
    expect(regions.length).toBeGreaterThan(0);
    expect(walkLocationLabel(regions, regions[0]!.x, regions[0]!.z)).toBe(regions[0]!.label);
    expect(
      walkLocationLabel(regions, plan.topology.envelope.minX, plan.topology.envelope.maxZ),
    ).toBe("Repository frontier");
  });

  it("exposes the same repository structures and moving wildlife used by the scene", () => {
    const world = createDemoKingdom("spring");
    const plan = createWorldPlan(world);
    const scatter = createPlannedScatter(world, plan);
    const interaction = createRepositoryWalkInteraction(world, plan, scatter);
    const expectedStructureIds = [...scatter.buildings, ...scatter.landmarks].map(
      (structure) => `structure:${structure.id}`,
    );
    const structureTargetIds = new Set(
      interaction.targets.filter((target) => target.kind !== "animal").map((target) => target.id),
    );

    expect(interaction.structures).toHaveLength(expectedStructureIds.length);
    for (const targetId of expectedStructureIds)
      expect(structureTargetIds.has(targetId)).toBe(true);
    expect(interaction.targets.filter((target) => target.kind === "animal")).toHaveLength(
      scatter.wildlife.length,
    );
    expect(interaction.animalTargetPositions.size).toBe(scatter.wildlife.length);
    expect(
      interaction.targets
        .filter((target) => target.kind === "animal")
        .every((target) => target.selection.kind === "province" && target.runtimePosition),
    ).toBe(true);

    const movingAnimal = interaction.targets.find((target) => target.kind === "animal")!;
    const actorId = movingAnimal.id.slice("animal:".length);
    interaction.animalTargetUpdaters.get(actorId)!(0, 1.72, -12);
    expect(acquireWalkTarget(0, 1.72, 0, 0, 0, -1, [movingAnimal])).toBe(movingAnimal);
  });

  it("spawns safely inside the populated region of the captured vercel/next.js vast world", () => {
    const world = JSON.parse(readFileSync(NEXTJS_FIXTURE_URL, "utf8")) as KingdomWorld;
    const plan = createWorldPlan(world);
    const scatter = createPlannedScatter(world, plan);
    const enrichment = createPlannedVisualEnrichment(plan, scatter);
    const landUse = createPlannedLandUse(plan, scatter, enrichment);
    const interaction = createRepositoryWalkInteraction(world, plan, scatter);
    const obstacles: WalkObstacle[] = [
      ...[...scatter.buildings, ...scatter.landmarks].map((structure) => ({
        x: structure.transform.position.x,
        z: structure.transform.position.z,
        radius: structure.footprintRadius,
      })),
      ...createLandUseWalkObstacles(landUse),
    ];
    const grid = createWalkNavigationGrid(plan, obstacles, landUse);
    const spawn = findLivingWalkSpawn(
      plan,
      obstacles,
      interaction.structures,
      interaction.targets,
      landUse,
      grid,
    );

    expect(plan.identity.scaleTier).toBe("vast");
    expect(spawn).not.toBeNull();
    expect(spawn!.quality).toBe("path-water");
    expect(spawn!.structureDistance).toBeGreaterThanOrEqual(
      WALK_EXPERIENCE_GATES.minimumStructureDistance,
    );
    expect(spawn!.structureDistance).toBeLessThanOrEqual(
      WALK_EXPERIENCE_GATES.maximumStructureDistance,
    );
    expect(spawn!.pathDistance).toBeLessThanOrEqual(WALK_EXPERIENCE_GATES.maximumPathDistance);
    expect(spawn!.waterInView).toBe(true);
    expect(spawn!.waterDistance).toBeGreaterThanOrEqual(
      WALK_EXPERIENCE_GATES.minimumPreferredWaterDistance,
    );
    expect(spawn!.waterDistance).toBeLessThanOrEqual(
      WALK_EXPERIENCE_GATES.maximumPreferredWaterDistance,
    );
    expect(spawn!.waterFocus).not.toBeNull();
    expect(
      samplePlannedWaterSurface(plan, spawn!.waterFocus!.x, spawn!.waterFocus!.z),
    ).not.toBeNull();
    const waterFocusDistance = Math.hypot(
      spawn!.waterFocus!.x - spawn!.position.x,
      spawn!.waterFocus!.z - spawn!.position.z,
    );
    const lookAngleDegrees = (() => {
      const targetX = spawn!.lookTarget.x - spawn!.position.x;
      const targetZ = spawn!.lookTarget.z - spawn!.position.z;
      const waterX = spawn!.waterFocus!.x - spawn!.position.x;
      const waterZ = spawn!.waterFocus!.z - spawn!.position.z;
      const cosine =
        (targetX * waterX + targetZ * waterZ) /
        (Math.hypot(targetX, targetZ) * Math.hypot(waterX, waterZ));
      return Math.acos(Math.min(1, Math.max(-1, cosine))) * (180 / Math.PI);
    })();
    expect(waterFocusDistance).toBeGreaterThanOrEqual(
      WALK_EXPERIENCE_GATES.minimumPreferredWaterDistance,
    );
    expect(waterFocusDistance).toBeLessThanOrEqual(
      WALK_EXPERIENCE_GATES.maximumPreferredWaterDistance,
    );
    expect(lookAngleDegrees).toBeLessThanOrEqual(WALK_EXPERIENCE_GATES.waterViewAngleDegrees);
    expect(walkWaterSightlineIsClear(plan, spawn!.position, spawn!.waterFocus!)).toBe(true);
    expect(
      walkWaterSightlineClearance(plan, spawn!.position, spawn!.waterFocus!),
    ).toBeGreaterThanOrEqual(WALK_EXPERIENCE_GATES.minimumWaterSightlineClearance);
    expect(isWalkPositionAllowed(plan, obstacles, spawn!.position.x, spawn!.position.z)).toBe(true);
    expect(walkObstacleAt(obstacles, spawn!.position.x, spawn!.position.z)).toBeNull();
    expect(interaction.targets.some((target) => target.id === spawn!.targetId)).toBe(true);
  });
});
