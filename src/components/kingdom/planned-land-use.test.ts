import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { KingdomSeason, KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { clearPlannedLandUseCacheForTests, createPlannedLandUse } from "./planned-land-use";
import { clearPlannedScatterTopologyCacheForTests, createPlannedScatter } from "./planned-scatter";
import { classifyPlannedTerrainRegion, queryPlannedWaterDistance } from "./planned-terrain-model";
import { createPlannedVisualEnrichment } from "./planned-visual-enrichment";

const NEXTJS_FIXTURE_URL = new URL("./test-fixtures/nextjs-large-world.json", import.meta.url);

function fixture(season: KingdomSeason = "spring"): KingdomWorld {
  const source = JSON.parse(readFileSync(NEXTJS_FIXTURE_URL, "utf8")) as KingdomWorld;
  return { ...source, season };
}

let sharedSpringFixture: ReturnType<typeof buildFixture> | undefined;

function buildFixture(season: KingdomSeason) {
  const world = fixture(season);
  const plan = createWorldPlan(world);
  clearPlannedScatterTopologyCacheForTests();
  const scatter = createPlannedScatter(world, plan);
  const enrichment = createPlannedVisualEnrichment(plan, scatter);
  const landUse = createPlannedLandUse(plan, scatter, enrichment);
  return { world, plan, scatter, enrichment, landUse };
}

function createFixture(season: KingdomSeason = "spring") {
  if (season !== "spring") return buildFixture(season);
  sharedSpringFixture ??= buildFixture(season);
  return sharedSpringFixture;
}

function landUseContextIds(landUse: ReturnType<typeof createPlannedLandUse>) {
  return {
    zones: landUse.zones.map((zone) => [zone.id, zone.contextInstanceIds] as const),
    landscapes: landUse.landscapePolygons.map(
      (landscape) => [landscape.id, landscape.contextInstanceIds] as const,
    ),
    anchors: landUse.anchors.map((anchor) => [anchor.id, anchor.sourceInstanceIds] as const),
  };
}

function distance(
  first: Readonly<{ x: number; z: number }>,
  second: Readonly<{ x: number; z: number }>,
): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function polygonContains(
  point: Readonly<{ x: number; z: number }>,
  polygon: ReadonlyArray<Readonly<{ x: number; z: number }>>,
): boolean {
  let inside = false;
  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current++
  ) {
    const first = polygon[current]!;
    const second = polygon[previous]!;
    if (
      first.z > point.z !== second.z > point.z &&
      point.x < ((second.x - first.x) * (point.z - first.z)) / (second.z - first.z) + first.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

describe("createPlannedLandUse", () => {
  it("authors distinct, connected regional compositions for the captured large repository", () => {
    const { plan, landUse } = createFixture();

    expect(landUse.schema).toBe("repo-planned-land-use/v1");
    expect(landUse.key).toContain(plan.placementKey);
    expect(landUse.zones).toHaveLength(plan.topology.hamlets.length);
    expect(new Set(landUse.zones.map((zone) => zone.hamletId))).toEqual(
      new Set(plan.topology.hamlets.map((hamlet) => hamlet.id)),
    );
    expect(new Set(landUse.zones.map((zone) => zone.signature)).size).toBeGreaterThanOrEqual(4);
    const hamletsById = new Map(plan.topology.hamlets.map((hamlet) => [hamlet.id, hamlet]));
    for (const zone of landUse.zones) {
      const satellite = hamletsById.get(zone.hamletId)?.role === "commons-hamlet";
      expect(zone.activitySpan, zone.id).toBeGreaterThanOrEqual(satellite ? 8 : 12);
      expect(zone.activitySpan, zone.id).toBeLessThanOrEqual(satellite ? 11 : 18);
      expect(zone.structureIds.length, zone.id).toBeGreaterThan(0);
      expect(zone.terrain.valid, zone.id).toBe(true);
    }
    const primaryZones = landUse.zones.filter(
      (zone) => hamletsById.get(zone.hamletId)?.role !== "commons-hamlet",
    );
    const satelliteZones = landUse.zones.filter(
      (zone) => hamletsById.get(zone.hamletId)?.role === "commons-hamlet",
    );
    expect(primaryZones).toHaveLength(4);
    expect(satelliteZones).toHaveLength(1);
    expect(satelliteZones[0]).toMatchObject({
      signature: "village-lanes",
      radiusX: 13,
      radiusZ: 13,
    });
    expect(satelliteZones[0]!.radiusX).toBeLessThan(
      Math.min(...primaryZones.map((zone) => zone.radiusX)),
    );

    expect(
      landUse.primaryRoad.allHamletsConnected,
      JSON.stringify({
        nodes: landUse.primaryRoad.nodes.map((node) => ({
          id: node.id,
          kind: node.kind,
          position: node.position,
        })),
        connectedHamletIds: landUse.primaryRoad.connectedHamletIds,
        segments: landUse.primaryRoad.segments.map((segment) => ({
          from: segment.fromNodeId,
          to: segment.toNodeId,
          length: segment.length,
        })),
      }),
    ).toBe(true);
    expect(landUse.primaryRoad.connectedHamletIds).toHaveLength(plan.topology.hamlets.length);
    expect(landUse.primaryRoad.segments.length).toBeGreaterThanOrEqual(
      plan.topology.hamlets.length - 1,
    );
    for (const segment of landUse.primaryRoad.segments) {
      expect(segment.width, segment.id).toBeGreaterThanOrEqual(4);
      expect(segment.width, segment.id).toBeLessThanOrEqual(5);
      expect(segment.maximumPointSpacing, segment.id).toBeLessThanOrEqual(1.8);
      expect(segment.terrain.valid, segment.id).toBe(true);
      expect(segment.pathSafety.valid, segment.id).toBe(true);
      expect(
        segment.crossings.every((crossing) => crossing.valid),
        segment.id,
      ).toBe(true);
      expect(segment.clearsStructures, segment.id).toBe(true);
    }

    expect(new Set(landUse.landscapePolygons.map((polygon) => polygon.role))).toEqual(
      new Set(["field", "orchard", "garden"]),
    );
    expect(landUse.landscapePolygons.length).toBeGreaterThanOrEqual(plan.topology.hamlets.length);
    expect(
      landUse.landscapePolygons.filter(
        (landscape) => landscape.hamletId === satelliteZones[0]!.hamletId,
      ),
    ).toHaveLength(2);
    expect(
      primaryZones.every(
        (zone) =>
          landUse.landscapePolygons.filter((landscape) => landscape.hamletId === zone.hamletId)
            .length > 2,
      ),
    ).toBe(true);
    for (const polygon of landUse.landscapePolygons) {
      expect(polygon.terrain.valid, polygon.id).toBe(true);
      expect(polygon.clearsStructures, polygon.id).toBe(true);
      expect(polygon.clearsPrimaryRoad, polygon.id).toBe(true);
    }

    expect(landUse.validation.allHamletsHaveZones).toBe(true);
    expect(landUse.validation.allHamletsNetworkConnected).toBe(true);
    expect(landUse.validation.allRoadsTerrainSafe).toBe(true);
    expect(landUse.validation.allLandscapeTerrainSafe).toBe(true);
    expect(landUse.validation.allAnchorsTerrainSafe).toBe(true);
    expect(landUse.validation.allRenderableItemsClearStructures).toBe(true);
    expect(landUse.validation.hasWalkAdjacentDetailPerHamlet).toBe(true);
    expect(landUse.validation.hasWaterViewPoi).toBe(true);
    expect(landUse.budget.withinBudget).toBe(true);
  }, 60_000);

  it("proves canonical terrain, shore, path, and structure safety at instance level", () => {
    const { plan, scatter, landUse } = createFixture();
    const structures = [...scatter.buildings, ...scatter.landmarks];

    for (const segment of landUse.primaryRoad.segments) {
      for (const [pointIndex, point] of segment.points.entries()) {
        const region = classifyPlannedTerrainRegion(plan, point.x, point.z);
        const water = queryPlannedWaterDistance(plan, point.x, point.z);
        expect(region.inside, segment.id).toBe(true);
        const crossing = segment.crossings.find(
          (candidate) =>
            pointIndex >= candidate.startPointIndex && pointIndex <= candidate.endPointIndex,
        );
        if (crossing?.kind === "bridge") {
          expect(
            region.water !== null ||
              region.material === "shore" ||
              water.shoreDistance < segment.width / 2,
            `${segment.id}:${pointIndex}:bridge`,
          ).toBe(true);
        } else if (crossing?.kind === "stepped-cut") {
          expect(region.water, `${segment.id}:${pointIndex}:stepped-cut`).toBeNull();
          expect(region.material, `${segment.id}:${pointIndex}:stepped-cut`).not.toBe("shore");
          expect(
            region.slopeDegrees,
            `${segment.id}:${pointIndex}:stepped-cut`,
          ).toBeLessThanOrEqual(70);
        } else {
          expect(region.water, segment.id).toBeNull();
          expect(region.material, segment.id).not.toBe("shore");
          expect(region.slopeDegrees, segment.id).toBeLessThanOrEqual(20);
          expect(water.shoreDistance, segment.id).toBeGreaterThanOrEqual(segment.width / 2);
        }
        for (const structure of structures) {
          expect(
            distance(point, structure.transform.position),
            `${segment.id}:${structure.id}`,
          ).toBeGreaterThanOrEqual(segment.width / 2 + structure.footprintRadius + 0.5);
        }
      }

      for (const surface of [...landUse.zones, ...landUse.landscapePolygons]) {
        const minX = Math.min(...surface.polygon.map((point) => point.x));
        const maxX = Math.max(...surface.polygon.map((point) => point.x));
        const minZ = Math.min(...surface.polygon.map((point) => point.z));
        const maxZ = Math.max(...surface.polygon.map((point) => point.z));
        const maximumSlope = "signature" in surface ? 20 : 18;
        for (let z = minZ + 1; z < maxZ; z += 2) {
          for (let x = minX + 1; x < maxX; x += 2) {
            if (!polygonContains({ x, z }, surface.polygon)) continue;
            const region = classifyPlannedTerrainRegion(plan, x, z);
            expect(region.inside, surface.id).toBe(true);
            expect(region.water, surface.id).toBeNull();
            expect(region.material, surface.id).not.toBe("shore");
            expect(region.slopeDegrees, surface.id).toBeLessThanOrEqual(maximumSlope);
          }
        }
      }
    }

    for (const anchor of landUse.anchors) {
      const region = classifyPlannedTerrainRegion(plan, anchor.position.x, anchor.position.z);
      const water = queryPlannedWaterDistance(plan, anchor.position.x, anchor.position.z);
      expect(region.inside, anchor.id).toBe(true);
      expect(region.water, anchor.id).toBeNull();
      expect(region.material, anchor.id).not.toBe("shore");
      expect(region.slopeDegrees, anchor.id).toBeLessThanOrEqual(18);
      expect(water.shoreDistance, anchor.id).toBeGreaterThanOrEqual(anchor.clearanceRadius);
      for (const structure of structures) {
        expect(
          distance(anchor.position, structure.transform.position),
          `${anchor.id}:${structure.id}`,
        ).toBeGreaterThanOrEqual(anchor.clearanceRadius + structure.footprintRadius + 0.5);
      }
    }
  }, 60_000);

  it("meets 12–18 percent developed coverage or reports the exact infeasibility", () => {
    const { landUse } = createFixture();
    const { coverage } = landUse;
    expect(coverage.visibleLandArea).toBeGreaterThan(0);
    expect(coverage.developedArea).toBeGreaterThan(0);
    expect(coverage.target).toEqual({ minimumRatio: 0.12, maximumRatio: 0.18 });
    if (coverage.status === "met") {
      expect(coverage.developedRatio).toBeGreaterThanOrEqual(0.12);
      expect(coverage.developedRatio).toBeLessThanOrEqual(0.18);
      expect(coverage.infeasibilityCodes).toEqual([]);
    } else {
      expect(coverage.infeasibilityCodes.length).toBeGreaterThan(0);
      if (coverage.developedRatio < 0.12) {
        expect(coverage.infeasibilityCodes).toContain("DEVELOPED_COVERAGE_BELOW_TARGET");
        expect(coverage.shortfallArea).toBeGreaterThan(0);
      }
      if (coverage.developedRatio > 0.18) {
        expect(coverage.infeasibilityCodes).toContain("DEVELOPED_COVERAGE_ABOVE_TARGET");
        expect(coverage.excessArea).toBeGreaterThan(0);
      }
    }
  }, 60_000);

  it("keeps repository and commit placement deterministic across seasons", () => {
    const spring = createFixture("spring").landUse;
    clearPlannedLandUseCacheForTests();
    const winter = createFixture("winter").landUse;
    expect(winter).toEqual(spring);
  }, 60_000);

  it("keeps warm-cache Valley to Enchanted theme switches bound to their own topology", () => {
    const source = fixture();
    const valleyWorld: KingdomWorld = { ...source, worldTheme: "kingdom-valley" };
    const forestWorld: KingdomWorld = { ...source, worldTheme: "enchanted-forest" };
    const valleyPlan = createWorldPlan(valleyWorld);
    const forestPlan = createWorldPlan(forestWorld);
    expect(forestPlan.placementKey).toBe(valleyPlan.placementKey);
    expect(forestPlan.topologyKey).not.toBe(valleyPlan.topologyKey);

    clearPlannedScatterTopologyCacheForTests();
    clearPlannedLandUseCacheForTests();
    const valleyScatter = createPlannedScatter(valleyWorld, valleyPlan);
    const valleyEnrichment = createPlannedVisualEnrichment(valleyPlan, valleyScatter);
    const valleyLandUse = createPlannedLandUse(valleyPlan, valleyScatter, valleyEnrichment);

    const forestScatter = createPlannedScatter(forestWorld, forestPlan);
    const forestEnrichment = createPlannedVisualEnrichment(forestPlan, forestScatter);
    // Deliberately keep the Valley land-use cache warm: this is the in-session
    // theme-switch path that previously returned the Valley object unchanged.
    const warmForestLandUse = createPlannedLandUse(forestPlan, forestScatter, forestEnrichment);

    expect(warmForestLandUse).not.toBe(valleyLandUse);
    expect(warmForestLandUse.key).not.toBe(valleyLandUse.key);
    expect(warmForestLandUse.topologyKey).toBe(forestPlan.topologyKey);
    expect(warmForestLandUse.zones).not.toBe(valleyLandUse.zones);
    expect(warmForestLandUse.budget).not.toBe(valleyLandUse.budget);

    clearPlannedLandUseCacheForTests();
    const coldForestLandUse = createPlannedLandUse(forestPlan, forestScatter, forestEnrichment);
    expect(landUseContextIds(warmForestLandUse)).toEqual(landUseContextIds(coldForestLandUse));
    expect(warmForestLandUse.budget).toEqual(coldForestLandUse.budget);
    expect(warmForestLandUse.validation).toEqual(coldForestLandUse.validation);
  }, 60_000);

  it("keeps the cold pure-planning path bounded for a vast repository", () => {
    const world = fixture();
    const plan = createWorldPlan(world);
    clearPlannedScatterTopologyCacheForTests();
    const scatter = createPlannedScatter(world, plan);
    const enrichment = createPlannedVisualEnrichment(plan, scatter);
    clearPlannedLandUseCacheForTests();
    const startedAt = performance.now();
    const landUse = createPlannedLandUse(plan, scatter, enrichment);
    const elapsedMilliseconds = performance.now() - startedAt;
    expect(landUse.validation.allHamletsNetworkConnected).toBe(true);
    // A generous CI ceiling prevents an accidental return to tens-of-seconds
    // planning while leaving room for shared-runner variance.
    expect(elapsedMilliseconds).toBeLessThan(2_000);
  }, 10_000);
});
