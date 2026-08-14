import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import { compiledKingdomWorldSchema } from "@/lib/kingdom/schemas";
import { KINGDOM_SEASONS } from "@/lib/kingdom/types";
import { createWorldPlan, type EllipseRegionMask, type WorldPlan } from "@/lib/kingdom/world-plan";

import {
  clearPlannedScatterTopologyCacheForTests,
  createPlannedScatter,
  REPOSITORY_BUILDING_MAGNITUDE_SCALE,
  type PlannedScatter,
} from "./planned-scatter";
import {
  classifyPlannedTerrainRegion,
  getHamletArchitecturePlacementMask,
  getPlannedTerrainDefinition,
} from "./planned-terrain-model";

function distance(
  first: Readonly<{ x: number; z: number }>,
  second: Readonly<{ x: number; z: number }>,
): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function ellipseContains(
  mask: EllipseRegionMask,
  point: Readonly<{ x: number; z: number }>,
  margin = 0,
): boolean {
  const cosine = Math.cos(mask.rotation);
  const sine = Math.sin(mask.rotation);
  const deltaX = point.x - mask.center.x;
  const deltaZ = point.z - mask.center.z;
  const localX = deltaX * cosine + deltaZ * sine;
  const localZ = -deltaX * sine + deltaZ * cosine;
  return (localX / (mask.radiusX - margin)) ** 2 + (localZ / (mask.radiusZ - margin)) ** 2 <= 1.001;
}

function distanceToSegment(
  point: Readonly<{ x: number; z: number }>,
  start: Readonly<{ x: number; z: number }>,
  end: Readonly<{ x: number; z: number }>,
): number {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const projection = Math.min(
    1,
    Math.max(
      0,
      lengthSquared === 0
        ? 0
        : ((point.x - start.x) * deltaX + (point.z - start.z) * deltaZ) / lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (start.x + projection * deltaX),
    point.z - (start.z + projection * deltaZ),
  );
}

function topologyOnly(scatter: PlannedScatter) {
  return {
    ...scatter,
    appearance: undefined,
  };
}

function fixture(): Readonly<{
  world: ReturnType<typeof createDemoKingdom>;
  plan: WorldPlan;
  scatter: PlannedScatter;
}> {
  const world = createDemoKingdom("spring");
  const plan = createWorldPlan(world);
  return { world, plan, scatter: createPlannedScatter(world, plan) };
}

function compactForegroundEstuaryFixture() {
  const base = createDemoKingdom("spring");
  const repository = "walk-matrix-1";
  return {
    ...base,
    buildKey: `${base.buildKey}:walk-matrix:1:62`,
    seed: `matrix/${repository}`,
    source: {
      ...base.source,
      owner: "matrix",
      repository,
      repositoryId: 1,
      canonicalUrl: `https://github.com/matrix/${repository}`,
      revisionUrl: `https://github.com/matrix/${repository}/tree/${base.source.commitSha}`,
    },
  };
}

describe("createPlannedScatter", () => {
  it("accepts the compact foreground-estuary fixture at the strict schema boundary", () => {
    const world = compactForegroundEstuaryFixture();
    expect(compiledKingdomWorldSchema.safeParse(world).success).toBe(true);
    const plan = createWorldPlan(world);
    expect(plan.identity.scaleTier).toBe("compact");
    expect(plan.topology.geography.id).toBe("foreground-estuary");
  });

  it("omits only an unsafe compact foreground-estuary landmark visual", () => {
    const world = compactForegroundEstuaryFixture();
    const plan = createWorldPlan(world);
    clearPlannedScatterTopologyCacheForTests();
    const scatter = createPlannedScatter(world, plan);

    expect(plan.topology.landmarks.map((landmark) => landmark.id)).toEqual([
      "landmark-383e3eac13",
      "landmark-50bcfba641",
    ]);
    expect(scatter.buildings).toHaveLength(
      plan.topology.hamlets.reduce((total, hamlet) => total + hamlet.maxBuildings, 0),
    );
    expect(scatter.landmarks.map((landmark) => landmark.id)).toEqual(["landmark-383e3eac13"]);
    expect(scatter.landmarkRuntime).toEqual({
      targetInstances: 2,
      emittedInstances: 1,
      omittedLandmarkIds: ["landmark-50bcfba641"],
    });
    expect(
      scatter.landmarkRuntime.emittedInstances + scatter.landmarkRuntime.omittedLandmarkIds.length,
    ).toBe(scatter.landmarkRuntime.targetInstances);

    const omittedLandmark = plan.topology.landmarks.find(
      (landmark) => landmark.id === "landmark-50bcfba641",
    )!;
    expect(omittedLandmark.entityId).not.toBeNull();
    if (!omittedLandmark.entityId)
      throw new Error("Expected the omitted landmark to trace a file.");
    expect(world.entities.map((entity) => entity.id)).toContain(omittedLandmark.entityId);
    const semanticZone = scatter.semanticHitZones.find(
      (zone) => zone.provinceId === omittedLandmark.provinceId,
    );
    expect(semanticZone?.entityIds).toContain(omittedLandmark.entityId);

    const structures = [...scatter.buildings, ...scatter.landmarks];
    for (let firstIndex = 0; firstIndex < structures.length; firstIndex += 1) {
      const first = structures[firstIndex]!;
      for (let sampleIndex = 0; sampleIndex < 9; sampleIndex += 1) {
        const angle = ((sampleIndex - 1) / 8) * Math.PI * 2;
        const radius = sampleIndex === 0 ? 0 : first.footprintRadius;
        const region = classifyPlannedTerrainRegion(
          plan,
          first.transform.position.x + Math.cos(angle) * radius,
          first.transform.position.z + Math.sin(angle) * radius,
        );
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
  });

  it("is deterministic and changes appearance, never placement, across seasons", () => {
    const spring = fixture();
    expect(createPlannedScatter(spring.world, spring.plan)).toEqual(spring.scatter);
    expect(spring.scatter.landmarkRuntime).toEqual({
      targetInstances: spring.plan.topology.landmarks.length,
      emittedInstances: spring.plan.topology.landmarks.length,
      omittedLandmarkIds: [],
    });

    const scatters = KINGDOM_SEASONS.map((season) => {
      const world = createDemoKingdom(season);
      return createPlannedScatter(world, createWorldPlan(world));
    });
    const [reference, ...others] = scatters;
    for (const scatter of others) {
      expect(topologyOnly(scatter)).toEqual(topologyOnly(reference!));
      expect(scatter.appearance).not.toEqual(reference!.appearance);
    }
  });

  it("maps linked explicit-file magnitude to visible building scale without breaking packing", () => {
    const world = createDemoKingdom("spring");
    const plan = createWorldPlan(world);
    clearPlannedScatterTopologyCacheForTests();
    const baseline = createPlannedScatter(world, plan);
    const nonHeroBuildings = baseline.buildings.filter(
      (building) => building.entityId !== null && !building.architecture.hero,
    );
    expect(nonHeroBuildings.length).toBeGreaterThanOrEqual(2);
    const smallStructure = nonHeroBuildings[0]!;
    const largeStructure = nonHeroBuildings.at(-1)!;
    expect(largeStructure.entityId).not.toBe(smallStructure.entityId);

    const orderedEntityIds = [...world.entities]
      .sort((first, second) => first.id.localeCompare(second.id))
      .map((entity) => entity.id);
    const magnitudeByEntityId = new Map(
      orderedEntityIds.map((id, index, all) => [
        id,
        2 + (index / Math.max(1, all.length - 1)) * 10,
      ]),
    );
    magnitudeByEntityId.set(smallStructure.entityId!, 1);
    magnitudeByEntityId.set(largeStructure.entityId!, 13);
    const magnitudeWorld = {
      ...world,
      entities: world.entities.map((entity) => {
        const magnitude = magnitudeByEntityId.get(entity.id)!;
        return {
          ...entity,
          size: Math.round(2 ** magnitude),
          scale: { ...entity.scale, y: magnitude },
        };
      }),
    };

    clearPlannedScatterTopologyCacheForTests();
    const scatter = createPlannedScatter(magnitudeWorld, plan);
    const small = scatter.buildings.find((building) => building.id === smallStructure.id)!;
    const large = scatter.buildings.find((building) => building.id === largeStructure.id)!;
    expect(small.transform.scale.y).toBe(REPOSITORY_BUILDING_MAGNITUDE_SCALE.minimum);
    expect(large.transform.scale.y).toBe(REPOSITORY_BUILDING_MAGNITUDE_SCALE.maximum);
    expect(large.architecture.sourceMagnitudeScale).toBeGreaterThan(
      small.architecture.sourceMagnitudeScale,
    );
    expect(large.architecture.desiredHeightScale).toBeGreaterThan(
      small.architecture.desiredHeightScale,
    );
    expect(small.architecture.desiredVisualScale).toBe(
      smallStructure.architecture.desiredVisualScale,
    );
    expect(large.architecture.desiredVisualScale).toBe(
      largeStructure.architecture.desiredVisualScale,
    );
    expect(small.architecture.coverageRadius).toBe(smallStructure.architecture.coverageRadius);
    expect(large.architecture.coverageRadius).toBe(largeStructure.architecture.coverageRadius);
    expect(small.footprintRadius).toBe(smallStructure.footprintRadius);
    expect(large.footprintRadius).toBe(largeStructure.footprintRadius);
    expect(scatter.buildings).toHaveLength(baseline.buildings.length);

    const structures = [...scatter.buildings, ...scatter.landmarks];
    for (let firstIndex = 0; firstIndex < structures.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < structures.length; secondIndex += 1) {
        const first = structures[firstIndex]!;
        const second = structures[secondIndex]!;
        expect(
          distance(first.transform.position, second.transform.position) -
            first.footprintRadius -
            second.footprintRadius,
          `${first.id} / ${second.id}`,
        ).toBeGreaterThanOrEqual(1.5 - 0.001);
      }
    }
    clearPlannedScatterTopologyCacheForTests();
  });

  it("is stable across twenty independently planned fresh plans", () => {
    const referenceWorld = createDemoKingdom("spring");
    for (let index = 0; index < 20; index += 1) {
      const season = KINGDOM_SEASONS[index % KINGDOM_SEASONS.length]!;
      const base = createDemoKingdom(season);
      const world = {
        ...base,
        source: referenceWorld.source,
        seed: referenceWorld.seed,
      };
      clearPlannedScatterTopologyCacheForTests();
      const scatter = createPlannedScatter(world, createWorldPlan(world));
      expect(scatter.buildings.length).toBeGreaterThanOrEqual(12);
      expect(scatter.ambientRuntime.emittedInstances).toBe(scatter.ambientDetails.length);
      expect(scatter.ambientRuntime.emittedInstances).toBeLessThanOrEqual(
        scatter.ambientRuntime.targetInstances,
      );
    }
    clearPlannedScatterTopologyCacheForTests();
  }, 90_000);

  it("renders a massive repository as a bounded multi-settlement world", () => {
    const demo = createDemoKingdom("spring");
    const massive = {
      ...demo,
      coverage: {
        ...demo.coverage,
        discoveredFiles: 100_000,
        eligibleFiles: 96_000,
        representedFiles: 96_000,
      },
      statistics: {
        ...demo.statistics,
        files: 96_000,
        bytes: 12_000_000_000,
      },
    };
    clearPlannedScatterTopologyCacheForTests();
    const plan = createWorldPlan(massive);
    const scatter = createPlannedScatter(massive, plan);

    expect(plan.topology.hamlets.map((hamlet) => hamlet.maxBuildings)).toEqual([6, 6, 6, 6, 4, 4]);
    expect(
      plan.topology.hamlets.slice(0, 4).every((hamlet) => hamlet.role !== "commons-hamlet"),
    ).toBe(true);
    expect(plan.topology.hamlets.slice(4).every((hamlet) => hamlet.role === "commons-hamlet")).toBe(
      true,
    );
    expect(scatter.buildings).toHaveLength(32);
    expect(scatter.wildlife.length).toBeLessThanOrEqual(16);
    expect(scatter.trees.length).toBeLessThanOrEqual(240);
    expect(scatter.semanticHitZones.flatMap((zone) => zone.entityIds).sort()).toEqual(
      massive.entities.map((entity) => entity.id).sort(),
    );
  }, 30_000);

  it.each([
    {
      repositoryId: 3,
      family: "foreground-estuary",
      scaleTier: "vast",
      files: 8_192,
    },
    {
      repositoryId: 2,
      family: "eastern-lake-run",
      scaleTier: "established",
      files: 128,
    },
    {
      repositoryId: 1,
      family: "western-basin-watershed",
      scaleTier: "expansive",
      files: 1_024,
    },
    {
      repositoryId: 4,
      family: "central-meander",
      scaleTier: "compact",
      files: 48,
    },
  ] as const)(
    "packs actual $scaleTier structure footprints on dry terraces in $family",
    ({ repositoryId, family, scaleTier, files }) => {
      const demo = createDemoKingdom("spring");
      const world = {
        ...demo,
        seed: `fixtures/repository-${repositoryId}`,
        source: {
          ...demo.source,
          repositoryId,
          owner: "fixtures",
          repository: `repository-${repositoryId}`,
        },
        coverage: {
          ...demo.coverage,
          discoveredFiles: files,
          eligibleFiles: files,
          representedFiles: files,
        },
        statistics: {
          ...demo.statistics,
          files,
          bytes: files * 48_000,
        },
      };
      clearPlannedScatterTopologyCacheForTests();
      const plan = createWorldPlan(world);
      const scatter = createPlannedScatter(world, plan);

      expect(plan.topology.geography.id).toBe(family);
      expect(plan.identity.scaleTier).toBe(scaleTier);
      expect(scatter.buildings).toHaveLength(
        plan.topology.hamlets.reduce((total, hamlet) => total + hamlet.maxBuildings, 0),
      );
      for (const hamlet of plan.topology.hamlets) {
        const mask = getHamletArchitecturePlacementMask(plan, hamlet);
        const structures = [
          ...scatter.buildings.filter((building) => building.hamletId === hamlet.id),
          ...scatter.landmarks.filter((landmark) => landmark.hamletId === hamlet.id),
        ];
        for (const structure of structures) {
          expect(
            ellipseContains(mask, structure.transform.position, structure.footprintRadius),
            structure.id,
          ).toBe(true);
        }
      }
    },
    30_000,
  );

  it("places 12–24 buildings in two to four compact, nonoverlapping hamlets", () => {
    const { plan, scatter } = fixture();
    expect(plan.topology.hamlets.length).toBeGreaterThanOrEqual(2);
    expect(plan.topology.hamlets.length).toBeLessThanOrEqual(4);
    expect(scatter.buildings.length).toBeGreaterThanOrEqual(12);
    expect(scatter.buildings.length).toBeLessThanOrEqual(24);

    for (const hamlet of plan.topology.hamlets) {
      const buildings = scatter.buildings.filter((building) => building.hamletId === hamlet.id);
      expect(buildings.length).toBe(hamlet.maxBuildings);
      expect(buildings.length).toBeGreaterThanOrEqual(3);
      expect(buildings.length).toBeLessThanOrEqual(6);
      const visualMask = getHamletArchitecturePlacementMask(plan, hamlet);
      for (const building of buildings) {
        expect(
          ellipseContains(visualMask, building.transform.position, building.footprintRadius),
        ).toBe(true);
        expect(building.terrain.estimatedSlopeDegrees).toBeLessThanOrEqual(
          building.terrain.maxSlopeDegrees,
        );
        expect(building.terrain.resampleRadius).toBeGreaterThan(building.footprintRadius);
        const actual = classifyPlannedTerrainRegion(
          plan,
          building.transform.position.x,
          building.transform.position.z,
        );
        expect(building.terrain.estimatedSlopeDegrees).toBeCloseTo(actual.slopeDegrees, 2);
        expect(building.terrain.surfaceHeight).toBeCloseTo(actual.height, 2);
        expect(
          Math.hypot(
            building.terrain.normal.x,
            building.terrain.normal.y,
            building.terrain.normal.z,
          ),
        ).toBeCloseTo(1, 2);
      }
      for (let firstIndex = 0; firstIndex < buildings.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < buildings.length; secondIndex += 1) {
          const first = buildings[firstIndex]!;
          const second = buildings[secondIndex]!;
          expect(
            distance(first.transform.position, second.transform.position),
          ).toBeGreaterThanOrEqual(first.footprintRadius + second.footprintRadius + 1.5);
        }
      }
    }

    const structures = [...scatter.buildings, ...scatter.landmarks];
    for (let firstIndex = 0; firstIndex < structures.length; firstIndex += 1) {
      const first = structures[firstIndex]!;
      expect(first.footprintRadius).toBeGreaterThanOrEqual(3.2);
      for (let secondIndex = firstIndex + 1; secondIndex < structures.length; secondIndex += 1) {
        const second = structures[secondIndex]!;
        expect(
          distance(first.transform.position, second.transform.position),
          `${first.id} intersects ${second.id}`,
        ).toBeGreaterThanOrEqual(first.footprintRadius + second.footprintRadius + 1.5);
      }
    }

    const crown = scatter.landmarks.find((landmark) => landmark.assetRole === "repository-crown");
    expect(crown?.hamletId).not.toBeNull();
    const crownHamlet = plan.topology.hamlets.find((hamlet) => hamlet.id === crown?.hamletId);
    expect(crownHamlet).toBeDefined();
    if (crown && crownHamlet) {
      expect(
        ellipseContains(
          getHamletArchitecturePlacementMask(plan, crownHamlet),
          crown.transform.position,
          crown.footprintRadius,
        ),
      ).toBe(true);
    }
  });

  it("creates ecological grove clusters with clearings and water/hamlet exclusions", () => {
    const { plan, scatter } = fixture();
    const course = plan.topology.terrainZones.find((zone) => zone.kind === "watershed")?.mask;
    const lake = plan.topology.terrainZones.find((zone) => zone.kind === "lake")?.mask;
    expect(course?.shape).toBe("corridor");
    expect(lake?.shape).toBe("ellipse");
    if (course?.shape !== "corridor" || lake?.shape !== "ellipse") return;

    expect(scatter.trees.length).toBeGreaterThanOrEqual(80);
    expect(scatter.trees.length).toBeLessThanOrEqual(120);
    expect(new Set(scatter.trees.map((tree) => tree.assetRole)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(scatter.trees.map((tree) => tree.paletteRole)).size).toBeGreaterThanOrEqual(3);
    const massIds = new Set(
      scatter.trees
        .filter((tree) => tree.placementRole === "grove-mass")
        .map((tree) => tree.groveId),
    );
    const edgeTrees = scatter.trees.filter((tree) => tree.placementRole === "edge-tree");
    expect(massIds.size).toBeGreaterThanOrEqual(4);
    expect(massIds.size).toBeLessThanOrEqual(6);
    expect(edgeTrees.length).toBeGreaterThanOrEqual(4);
    expect(edgeTrees.length).toBeLessThanOrEqual(8);
    const floweringTrees = scatter.trees.filter((tree) => tree.paletteRole === "flowering").length;
    expect(floweringTrees / scatter.trees.length).toBeGreaterThanOrEqual(0.35);
    expect(floweringTrees / scatter.trees.length).toBeLessThanOrEqual(0.65);
    for (const groveId of massIds) {
      const trees = scatter.trees.filter(
        (tree) => tree.groveId === groveId && tree.placementRole === "grove-mass",
      );
      expect(trees.length).toBeGreaterThanOrEqual(12);
      expect(trees.length).toBeLessThanOrEqual(24);
      const capacity = scatter.groveRuntimeCapacities.find(
        (candidate) => candidate.groveId === groveId,
      )!;
      expect(scatter.trees.filter((tree) => tree.groveId === groveId).length).toBeLessThanOrEqual(
        capacity.runtimeMaxTrees,
      );
      expect(capacity.semanticSuggestedMaxTrees).toBe(
        plan.topology.groves.find((grove) => grove.id === groveId)!.maxTrees,
      );
      for (const tree of trees) {
        const courseDistance = Math.min(
          ...course.points
            .slice(1)
            .map((end, index) =>
              distanceToSegment(tree.transform.position, course.points[index]!, end),
            ),
        );
        expect(courseDistance).toBeGreaterThan(course.width / 2 + 4);
        for (const hamlet of plan.topology.hamlets) {
          expect(distance(tree.transform.position, hamlet.mask.center)).toBeGreaterThan(
            hamlet.mask.radiusX + 4,
          );
        }
      }
    }
  });

  it("cycles valid asset roles when large worlds need more edge trees than role variants", () => {
    const { world, plan } = fixture();
    const sourceGrove = plan.topology.groves[0]!;
    const scaledPlan: WorldPlan = {
      ...plan,
      identity: { ...plan.identity, scaleTier: "vast" },
      topology: {
        ...plan.topology,
        visualBudgets: {
          ...plan.topology.visualBudgets,
          maxGroves: 8,
          maxTrees: 240,
        },
        groves: [
          ...plan.topology.groves,
          {
            ...sourceGrove,
            id: `${sourceGrove.id}-scale-regression`,
            mask: {
              ...sourceGrove.mask,
              center: {
                x: plan.topology.envelope.maxX - plan.topology.envelope.safeMargin * 2,
                z: plan.topology.envelope.center.z,
              },
            },
          },
        ],
      },
    };

    clearPlannedScatterTopologyCacheForTests();
    const scatter = createPlannedScatter(world, scaledPlan);
    const edgeTrees = scatter.trees.filter((tree) => tree.placementRole === "edge-tree");

    expect(edgeTrees.length).toBeGreaterThanOrEqual(7);
    expect(edgeTrees.every((tree) => typeof tree.assetRole === "string")).toBe(true);
    const validRoles = new Set([
      "twisted-tree-1",
      "pine-2",
      "common-tree-3",
      "dead-tree",
      "common-tree-2",
      "twisted-tree-2",
    ]);
    expect(edgeTrees.every((tree) => validRoles.has(tree.assetRole))).toBe(true);
    clearPlannedScatterTopologyCacheForTests();
  });

  it("excludes ecological instances from the actual widened terrain water and shore", () => {
    const { plan, scatter } = fixture();
    const terrainLake = getPlannedTerrainDefinition(plan).water.lake;
    const semanticLake = plan.topology.terrainZones.find((zone) => zone.kind === "lake")?.mask;
    expect(semanticLake?.shape).toBe("ellipse");
    if (semanticLake?.shape !== "ellipse") return;
    expect(terrainLake.radiusX * terrainLake.radiusZ).toBeGreaterThan(
      semanticLake.radiusX * semanticLake.radiusZ * 2,
    );

    const ecologicalPoints = [
      ...scatter.trees.map((tree) => tree.transform.position),
      ...scatter.groundCoverClusters.map((cluster) => cluster.center),
      ...scatter.wildlife.map((animal) => animal.transform.position),
    ];
    for (const point of ecologicalPoints) {
      const region = classifyPlannedTerrainRegion(plan, point.x, point.z);
      expect(region.inside).toBe(true);
      expect(region.water).toBeNull();
      expect(region.material).not.toBe("shore");
    }
  });

  it("emits every structural and ecological footprint on valid rendered terrain", () => {
    const { plan, scatter } = fixture();
    const placements = [
      ...scatter.buildings.map((building) => ({
        id: building.id,
        point: building.transform.position,
        maxSlope: building.terrain.maxSlopeDegrees,
      })),
      ...scatter.landmarks.map((landmark) => ({
        id: landmark.id,
        point: landmark.transform.position,
        maxSlope: landmark.terrain.maxSlopeDegrees,
      })),
      ...scatter.trees.map((tree) => ({
        id: tree.id,
        point: tree.transform.position,
        maxSlope: tree.terrain.maxSlopeDegrees,
      })),
      ...scatter.wildlife.map((animal) => ({
        id: animal.id,
        point: animal.transform.position,
        maxSlope: animal.terrain.maxSlopeDegrees,
      })),
      ...scatter.ambientDetails.map((detail) => ({
        id: detail.id,
        point: detail.transform.position,
        maxSlope: detail.terrain.maxSlopeDegrees,
      })),
      ...scatter.groundCoverClusters.flatMap((cluster) =>
        cluster.members.map((member, index) => ({
          id: `${cluster.id}:${index}`,
          point: {
            x: cluster.center.x + member.offset.x,
            z: cluster.center.z + member.offset.z,
          },
          maxSlope: 32,
        })),
      ),
    ];

    for (const placement of placements) {
      const region = classifyPlannedTerrainRegion(plan, placement.point.x, placement.point.z);
      expect(region.inside, placement.id).toBe(true);
      expect(region.water, placement.id).toBeNull();
      expect(region.material, placement.id).not.toBe("shore");
      expect(region.slopeDegrees, placement.id).toBeLessThanOrEqual(placement.maxSlope);
    }

    for (const structure of [...scatter.buildings, ...scatter.landmarks]) {
      const radius = structure.footprintRadius;
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        const point = {
          x: structure.transform.position.x + Math.cos(angle) * radius,
          z: structure.transform.position.z + Math.sin(angle) * radius,
        };
        const region = classifyPlannedTerrainRegion(plan, point.x, point.z);
        expect(region.inside, `${structure.id}:footprint:${index}`).toBe(true);
        expect(region.water, `${structure.id}:footprint:${index}`).toBeNull();
        expect(region.material, `${structure.id}:footprint:${index}`).not.toBe("shore");
        expect(region.slopeDegrees, `${structure.id}:footprint:${index}`).toBeLessThanOrEqual(
          structure.terrain.maxSlopeDegrees,
        );
      }
    }
  });

  it("varies rotations and scales without line-correlated placement", () => {
    const { scatter } = fixture();
    expect(new Set(scatter.buildings.map((item) => item.transform.rotationY)).size).toBeGreaterThan(
      4,
    );
    expect(new Set(scatter.buildings.map((item) => item.transform.scale.y)).size).toBeGreaterThan(
      4,
    );
    expect(new Set(scatter.trees.map((item) => item.transform.rotationY)).size).toBeGreaterThan(12);
    expect(new Set(scatter.trees.map((item) => item.transform.scale.y)).size).toBeGreaterThan(12);
    expect(new Set(scatter.trees.map((item) => item.transform.position.x)).size).toBeGreaterThan(
      scatter.trees.length * 0.85,
    );
    expect(new Set(scatter.trees.map((item) => item.transform.position.z)).size).toBeGreaterThan(
      scatter.trees.length * 0.85,
    );
  });

  it("uses clustered ground cover only at grove transitions", () => {
    const { plan, scatter } = fixture();
    const groveIds = new Set(plan.topology.groves.map((grove) => grove.id));
    expect(scatter.groundCoverClusters.length).toBeGreaterThanOrEqual(plan.topology.groves.length);
    for (const cluster of scatter.groundCoverClusters) {
      expect(groveIds.has(cluster.groveId)).toBe(true);
      expect(cluster.members.length).toBeGreaterThanOrEqual(8);
      expect(cluster.members.length).toBeLessThanOrEqual(12);
      const region = classifyPlannedTerrainRegion(plan, cluster.center.x, cluster.center.z);
      expect(region.inside).toBe(true);
      expect(region.water).toBeNull();
    }
  });

  it("budgets ambient transition detail as constrained instancing-ready data", () => {
    const { plan, scatter } = fixture();
    expect(scatter.ambientDetails.length).toBeGreaterThanOrEqual(36);
    expect(scatter.ambientDetails.length).toBeLessThanOrEqual(54);
    expect(new Set(scatter.ambientDetails.map((detail) => detail.zone))).toEqual(
      new Set(["shore-transition", "cliff-transition", "meadow-transition"]),
    );
    expect(new Set(scatter.ambientDetails.map((detail) => detail.assetRole)).size).toBeGreaterThan(
      3,
    );
    const zoneCounts = Object.groupBy(scatter.ambientDetails, (detail) => detail.zone);
    expect(zoneCounts["cliff-transition"]?.length).toBeGreaterThanOrEqual(10);
    expect(zoneCounts["cliff-transition"]?.length).toBeLessThanOrEqual(16);
    expect(zoneCounts["shore-transition"]?.length).toBeGreaterThanOrEqual(8);
    expect(zoneCounts["shore-transition"]?.length).toBeLessThanOrEqual(14);
    expect(zoneCounts["meadow-transition"]?.length).toBeGreaterThanOrEqual(12);
    expect(zoneCounts["meadow-transition"]?.length).toBeLessThanOrEqual(20);
    const microclusters = Object.groupBy(scatter.ambientDetails, (detail) => detail.microclusterId);
    for (const [clusterId, details] of Object.entries(microclusters)) {
      expect(details?.length, clusterId).toBeGreaterThanOrEqual(2);
      expect(details?.length, clusterId).toBeLessThanOrEqual(4);
      expect(details?.every((detail) => detail.microclusterSize === details.length)).toBe(true);
    }
    expect(scatter.ambientRuntime.targetInstances).toBe(44);
    expect(scatter.ambientRuntime.emittedInstances).toBe(scatter.ambientDetails.length);
    for (const detail of scatter.ambientDetails) {
      const region = classifyPlannedTerrainRegion(
        plan,
        detail.transform.position.x,
        detail.transform.position.z,
      );
      expect(region.inside, detail.id).toBe(true);
      expect(region.water, detail.id).toBeNull();
      expect(region.material, detail.id).not.toBe("shore");
      expect(region.slopeDegrees, detail.id).toBeLessThanOrEqual(detail.terrain.maxSlopeDegrees);
    }
  });

  it("keeps landmarks and wildlife within their planned slots and budgets", () => {
    const { plan, scatter } = fixture();
    expect(scatter.landmarks).toHaveLength(plan.topology.landmarks.length);
    expect(scatter.landmarks.length).toBeGreaterThanOrEqual(1);
    expect(scatter.landmarks.length).toBeLessThanOrEqual(3);
    expect(scatter.wildlife.length).toBeLessThanOrEqual(
      plan.topology.visualBudgets.maxWildlifeActors,
    );
    for (const animal of scatter.wildlife) {
      const habitatTrees = scatter.trees.filter((tree) => tree.groveId === animal.habitatGroveId);
      expect(habitatTrees.length).toBeGreaterThan(0);
      expect(
        Math.min(
          ...habitatTrees.map((tree) =>
            Math.hypot(
              tree.transform.position.x - animal.transform.position.x,
              tree.transform.position.z - animal.transform.position.z,
            ),
          ),
        ),
      ).toBeLessThan(22);
    }
  });

  it("preserves complete semantic traceability without visible one-file-per-object output", () => {
    const { world, plan, scatter } = fixture();
    const tracedEntities = scatter.semanticHitZones.flatMap((zone) => zone.entityIds).sort();
    expect(scatter.semanticHitZones).toHaveLength(world.provinces.length);
    expect(scatter.semanticHitZones.every((zone) => zone.visible === false)).toBe(true);
    expect(tracedEntities).toEqual(world.entities.map((entity) => entity.id).sort());
    expect(scatter.buildings.length).toBeLessThan(world.coverage.representedFiles);

    const groundMembers = scatter.groundCoverClusters.reduce(
      (total, cluster) => total + cluster.members.length,
      0,
    );
    expect(scatter.trees.length).toBeLessThanOrEqual(plan.topology.visualBudgets.maxTrees);
    expect(groundMembers).toBeLessThanOrEqual(plan.topology.visualBudgets.maxSurfaceScatter);
    expect(groundMembers + scatter.ambientDetails.length).toBeLessThanOrEqual(
      plan.topology.visualBudgets.maxSurfaceScatter,
    );
  });

  it("rejects a plan belonging to a different repository revision", () => {
    const { world, plan } = fixture();
    expect(() =>
      createPlannedScatter(
        {
          ...world,
          source: { ...world.source, commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
        },
        plan,
      ),
    ).toThrow(/same immutable repository revision/);
  });
});
