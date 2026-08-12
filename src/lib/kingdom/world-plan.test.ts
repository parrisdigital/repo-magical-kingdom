import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "./demo-world";
import { KINGDOM_SEASONS } from "./types";
import {
  createWorldPlan,
  type CorridorRegionMask,
  type WorldPlanEnvelope,
  type WorldPlanPoint,
  type WorldRegionMask,
} from "./world-plan";

const EPSILON = 0.002;

function distance(first: WorldPlanPoint, second: WorldPlanPoint): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function distanceToSegment(
  subject: WorldPlanPoint,
  start: WorldPlanPoint,
  end: WorldPlanPoint,
): number {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (lengthSquared === 0) return distance(subject, start);
  const projection = Math.min(
    1,
    Math.max(0, ((subject.x - start.x) * deltaX + (subject.z - start.z) * deltaZ) / lengthSquared),
  );
  return Math.hypot(
    subject.x - (start.x + projection * deltaX),
    subject.z - (start.z + projection * deltaZ),
  );
}

function distanceToCorridor(subject: WorldPlanPoint, corridor: CorridorRegionMask): number {
  return Math.min(
    ...corridor.points
      .slice(1)
      .map((end, index) => distanceToSegment(subject, corridor.points[index]!, end)),
  );
}

function expectMaskInside(mask: WorldRegionMask, envelope: WorldPlanEnvelope): void {
  if (mask.shape === "polygon") {
    for (const point of mask.points) {
      expect(point.x).toBeGreaterThanOrEqual(envelope.minX - EPSILON);
      expect(point.x).toBeLessThanOrEqual(envelope.maxX + EPSILON);
      expect(point.z).toBeGreaterThanOrEqual(envelope.minZ - EPSILON);
      expect(point.z).toBeLessThanOrEqual(envelope.maxZ + EPSILON);
    }
    return;
  }

  if (mask.shape === "corridor") {
    for (const point of mask.points) {
      expect(point.x - mask.width / 2).toBeGreaterThanOrEqual(envelope.minX - EPSILON);
      expect(point.x + mask.width / 2).toBeLessThanOrEqual(envelope.maxX + EPSILON);
      expect(point.z - mask.width / 2).toBeGreaterThanOrEqual(envelope.minZ - EPSILON);
      expect(point.z + mask.width / 2).toBeLessThanOrEqual(envelope.maxZ + EPSILON);
    }
    return;
  }

  const cosine = Math.cos(mask.rotation);
  const sine = Math.sin(mask.rotation);
  const extentX = Math.sqrt(mask.radiusX ** 2 * cosine ** 2 + mask.radiusZ ** 2 * sine ** 2);
  const extentZ = Math.sqrt(mask.radiusX ** 2 * sine ** 2 + mask.radiusZ ** 2 * cosine ** 2);
  expect(mask.center.x - extentX).toBeGreaterThanOrEqual(envelope.minX - EPSILON);
  expect(mask.center.x + extentX).toBeLessThanOrEqual(envelope.maxX + EPSILON);
  expect(mask.center.z - extentZ).toBeGreaterThanOrEqual(envelope.minZ - EPSILON);
  expect(mask.center.z + extentZ).toBeLessThanOrEqual(envelope.maxZ + EPSILON);
}

describe("createWorldPlan", () => {
  it("is deterministic and isolates season changes to appearance", () => {
    const world = createDemoKingdom("spring");
    expect(createWorldPlan(world)).toEqual(createWorldPlan(world));

    const plans = KINGDOM_SEASONS.map((season) => createWorldPlan(createDemoKingdom(season)));
    const [spring, ...otherSeasons] = plans;
    for (const plan of otherSeasons) {
      expect(plan.topologyKey).toBe(spring?.topologyKey);
      expect(plan.repository).toEqual(spring?.repository);
      expect(plan.topology).toEqual(spring?.topology);
      expect(plan.appearance).not.toEqual(spring?.appearance);
    }
  });

  it("keeps every authored region inside the renderer envelope", () => {
    const { topology } = createWorldPlan(createDemoKingdom());
    for (const zone of topology.terrainZones) expectMaskInside(zone.mask, topology.envelope);
    for (const hamlet of topology.hamlets) expectMaskInside(hamlet.mask, topology.envelope);
    for (const grove of topology.groves) expectMaskInside(grove.mask, topology.envelope);
    for (const wildlife of topology.wildlifeZones) {
      expectMaskInside(wildlife.mask, topology.envelope);
    }
    for (const semanticZone of topology.semanticZones) {
      expectMaskInside(semanticZone.hitMask, topology.envelope);
    }
  });

  it("authors a broad rear escarpment and a watershed that reaches the foreground", () => {
    const { topology } = createWorldPlan(createDemoKingdom());
    const escarpment = topology.terrainZones.find((zone) => zone.kind === "rear-escarpment");
    const watershed = topology.terrainZones.find((zone) => zone.kind === "watershed");

    expect(escarpment?.mask.shape).toBe("polygon");
    expect(watershed?.mask.shape).toBe("corridor");
    if (escarpment?.mask.shape !== "polygon" || watershed?.mask.shape !== "corridor") return;

    const escarpmentXs = escarpment.mask.points.map((point) => point.x);
    const escarpmentZs = escarpment.mask.points.map((point) => point.z);
    expect(Math.max(...escarpmentXs) - Math.min(...escarpmentXs)).toBeGreaterThan(
      topology.envelope.width * 0.85,
    );
    expect(Math.max(...escarpmentZs)).toBeLessThan(0);
    expect(watershed.mask.points[0]!.z).toBeLessThan(Math.max(...escarpmentZs) + EPSILON);
    expect(watershed.mask.points.at(-1)!.z).toBeGreaterThanOrEqual(
      topology.envelope.maxZ - topology.envelope.safeMargin - EPSILON,
    );

    expect(new Set(topology.terrainZones.map((zone) => zone.kind))).toEqual(
      new Set(["lowland", "meadow", "rear-escarpment", "watershed", "lake", "shore"]),
    );
  });

  it("selects only strong directory hamlets and keeps their clusters bounded and separate", () => {
    const world = createDemoKingdom();
    const { topology } = createWorldPlan(world);
    const expectedProvinceIds = [...world.provinces]
      .filter((province) => province.role !== "nexus")
      .sort(
        (first, second) =>
          second.representedFiles - first.representedFiles ||
          second.representedBytes - first.representedBytes ||
          { source: 6, test: 5, docs: 4, config: 3, asset: 2, other: 1 }[second.dominantCategory] -
            { source: 6, test: 5, docs: 4, config: 3, asset: 2, other: 1 }[
              first.dominantCategory
            ] ||
          first.id.localeCompare(second.id),
      )
      .slice(0, topology.hamlets.length)
      .map((province) => province.id);

    expect(topology.hamlets.length).toBeGreaterThanOrEqual(2);
    expect(topology.hamlets.length).toBeLessThanOrEqual(4);
    expect(new Set(topology.hamlets.map((hamlet) => hamlet.provinceId))).toEqual(
      new Set(expectedProvinceIds),
    );
    expect(topology.hamlets.every((hamlet) => hamlet.maxBuildings >= 3)).toBe(true);
    expect(topology.hamlets.every((hamlet) => hamlet.maxBuildings <= 6)).toBe(true);

    for (let firstIndex = 0; firstIndex < topology.hamlets.length; firstIndex += 1) {
      const first = topology.hamlets[firstIndex]!;
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < topology.hamlets.length;
        secondIndex += 1
      ) {
        const second = topology.hamlets[secondIndex]!;
        expect(distance(first.mask.center, second.mask.center)).toBeGreaterThanOrEqual(
          first.mask.radiusX + second.mask.radiusX + 8 - EPSILON,
        );
      }
    }
  });

  it("keeps forest and wildlife habitat clear of water and hamlets", () => {
    const { topology } = createWorldPlan(createDemoKingdom());
    const course = topology.terrainZones.find((zone) => zone.kind === "watershed")?.mask;
    const lake = topology.terrainZones.find((zone) => zone.kind === "lake")?.mask;
    expect(course?.shape).toBe("corridor");
    expect(lake?.shape).toBe("ellipse");
    if (course?.shape !== "corridor" || lake?.shape !== "ellipse") return;

    expect(topology.groves.length).toBeGreaterThanOrEqual(3);
    for (const grove of topology.groves) {
      const groveRadius = Math.max(grove.mask.radiusX, grove.mask.radiusZ);
      expect(distanceToCorridor(grove.mask.center, course)).toBeGreaterThanOrEqual(
        groveRadius + course.width / 2 + grove.exclusions.clearance - EPSILON,
      );
      expect(distance(grove.mask.center, lake.center)).toBeGreaterThanOrEqual(
        groveRadius + Math.max(lake.radiusX, lake.radiusZ) + grove.exclusions.clearance - EPSILON,
      );
      for (const hamlet of topology.hamlets) {
        expect(distance(grove.mask.center, hamlet.mask.center)).toBeGreaterThanOrEqual(
          groveRadius + hamlet.mask.radiusX + grove.exclusions.clearance - EPSILON,
        );
      }
      expect(grove.exclusions.terrainZoneIds).toEqual(
        expect.arrayContaining(["water-course", "water-lake"]),
      );
      expect(grove.exclusions.hamletIds).toHaveLength(topology.hamlets.length);
    }

    const grovesById = new Map(topology.groves.map((grove) => [grove.id, grove]));
    for (const wildlife of topology.wildlifeZones) {
      const grove = grovesById.get(wildlife.habitatGroveId)!;
      expect(distance(wildlife.mask.center, grove.mask.center)).toBe(0);
      expect(wildlife.mask.radiusX).toBeLessThan(grove.mask.radiusX);
      expect(wildlife.mask.radiusZ).toBeLessThan(grove.mask.radiusZ);
    }
  });

  it("keeps visual counts within browser budgets", () => {
    const { topology } = createWorldPlan(createDemoKingdom());
    const budgets = topology.visualBudgets;
    const buildingCount = topology.hamlets.reduce(
      (total, hamlet) => total + hamlet.maxBuildings,
      0,
    );
    const treeCount = topology.groves.reduce((total, grove) => total + grove.maxTrees, 0);
    const wildlifeCount = topology.wildlifeZones.reduce((total, zone) => total + zone.maxActors, 0);
    const canopyCount = topology.scatterConstraints.find(
      (constraint) => constraint.layer === "forest-canopy",
    )!.maxInstances;
    const surfaceScatterCount = topology.scatterConstraints
      .filter((constraint) => constraint.layer !== "forest-canopy")
      .reduce((total, constraint) => total + constraint.maxInstances, 0);

    expect(topology.terrainZones.length).toBeLessThanOrEqual(budgets.maxTerrainZones);
    expect(topology.hamlets.length).toBeLessThanOrEqual(budgets.maxHamlets);
    expect(buildingCount).toBeGreaterThanOrEqual(12);
    expect(buildingCount).toBeLessThanOrEqual(24);
    expect(buildingCount).toBe(budgets.maxBuildings);
    expect(topology.groves.length).toBeLessThanOrEqual(budgets.maxGroves);
    expect(treeCount).toBeLessThanOrEqual(budgets.maxTrees);
    expect(topology.landmarks.length).toBeGreaterThanOrEqual(1);
    expect(topology.landmarks.length).toBeLessThanOrEqual(3);
    expect(topology.landmarks.length).toBeLessThanOrEqual(budgets.maxLandmarks);
    expect(wildlifeCount).toBeLessThanOrEqual(budgets.maxWildlifeActors);
    expect(canopyCount).toBeLessThanOrEqual(budgets.maxTrees);
    expect(surfaceScatterCount).toBeLessThanOrEqual(budgets.maxSurfaceScatter);
  });

  it("scales massive repositories through bounded aggregation instead of one mesh per file", () => {
    const demo = createDemoKingdom();
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
    const { topology } = createWorldPlan(massive);
    const buildingCount = topology.hamlets.reduce(
      (total, hamlet) => total + hamlet.maxBuildings,
      0,
    );
    const wildlifeCount = topology.wildlifeZones.reduce((total, zone) => total + zone.maxActors, 0);

    expect(topology.hamlets).toHaveLength(3);
    expect(buildingCount).toBe(18);
    expect(buildingCount).toBe(topology.visualBudgets.maxBuildings);
    expect(buildingCount).toBeLessThan(massive.statistics.files / 1_000);
    expect(topology.visualBudgets.maxTrees).toBe(240);
    expect(wildlifeCount).toBe(topology.visualBudgets.maxWildlifeActors);
    expect(wildlifeCount).toBeGreaterThan(6);
    expect(wildlifeCount).toBeLessThanOrEqual(12);
    expect(topology.visualBudgets.maxVisibleTriangles).toBe(750_000);
    expect(topology.visualBudgets.maxDrawCalls).toBe(150);
  });

  it("keeps every repository entity traceable without creating a building for each file", () => {
    const world = createDemoKingdom();
    const { topology } = createWorldPlan(world);
    const coveredEntityIds = topology.semanticZones.flatMap((zone) => zone.entityIds).sort();
    const worldEntityIds = world.entities.map((entity) => entity.id).sort();
    const hamletProvinceIds = new Set(topology.hamlets.map((hamlet) => hamlet.provinceId));

    expect(topology.semanticMapping.buildingRule).toContain("two to four");
    expect(topology.semanticZones).toHaveLength(world.provinces.length);
    expect(coveredEntityIds).toEqual(worldEntityIds);
    expect(
      topology.semanticZones.every((zone) =>
        hamletProvinceIds.has(zone.provinceId)
          ? zone.expression === "hamlet"
          : zone.expression !== "hamlet",
      ),
    ).toBe(true);
    expect(topology.semanticZones.some((zone) => zone.expression !== "hamlet")).toBe(true);
    expect(topology.hamlets.reduce((total, hamlet) => total + hamlet.maxBuildings, 0)).toBeLessThan(
      world.coverage.representedFiles,
    );
  });
});
