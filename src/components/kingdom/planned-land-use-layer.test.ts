import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import { createWorldPlan, type WorldPlan } from "@/lib/kingdom/world-plan";

import type {
  PlannedLandUse,
  PlannedLandUseAnchor,
  PlannedRoadCrossing,
  PlannedRoadSegment,
} from "./planned-land-use";
import {
  buildPlannedCrossingGeometry,
  buildPlannedOrdinaryRoadGeometry,
  buildPlannedRoadSurfaceGeometry,
  buildTerrainFollowingPolygonGeometry,
  createPlannedLandUseAssetInstances,
  disposePlannedLandUseGeometryBundle,
  getPlannedDevelopedZoneStyles,
  PLANNED_DEVELOPED_ZONE_SIGNATURES,
  PLANNED_LANDSCAPE_ROLES,
  PLANNED_LAND_USE_ASSET_URLS,
  splitPlannedRoadAtCrossings,
  type PlannedLandUseGeometryBundle,
} from "./planned-land-use-layer";
import { getPlannedTerrainDefinition, samplePlannedTerrainHeight } from "./planned-terrain-model";

function planFor(season: "spring" | "winter"): WorldPlan {
  return createWorldPlan(createDemoKingdom(season));
}

function values(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): number[] {
  return Array.from({ length: attribute.count * attribute.itemSize }, (_, index) =>
    attribute instanceof THREE.BufferAttribute
      ? Number(attribute.array[index])
      : attribute.data.array[index]!,
  );
}

function roadSegment(
  plan: WorldPlan,
  width: number,
  points: ReadonlyArray<Readonly<{ x: number; z: number }>>,
): PlannedRoadSegment {
  return {
    id: "test-road",
    fromNodeId: "from",
    toNodeId: "to",
    width,
    points: points.map((point) => ({
      ...point,
      y: samplePlannedTerrainHeight(plan, point.x, point.z),
    })),
    length: 12,
    maximumPointSpacing: 4,
    terrain: { valid: true, maximumSlopeDegrees: 0, minimumShoreClearance: 10, sampleCount: 3 },
    crossings: [],
    pathSafety: { valid: true, unsupportedSampleCount: 0 },
    clearsStructures: true,
  };
}

function crossing(kind: PlannedRoadCrossing["kind"]): PlannedRoadCrossing {
  return {
    id: `test-${kind}`,
    kind,
    startPointIndex: 0,
    endPointIndex: 2,
    length: 8,
    maximumSlopeDegrees: kind === "bridge" ? 4 : 32,
    waterSampleCount: kind === "bridge" ? 3 : 0,
    shoreSampleCount: 0,
    valid: true,
  };
}

function anchor(
  id: string,
  kind: PlannedLandUseAnchor["kind"],
  role: PlannedLandUseAnchor["role"],
  x: number,
): PlannedLandUseAnchor {
  return {
    id,
    zoneId: "zone-a",
    hamletId: "hamlet-a",
    kind,
    role,
    position: { x, y: 2, z: 4 },
    facingRadians: 0.45,
    clearanceRadius: 1.1,
    walkAdjacent: true,
    waterView: false,
    roadSegmentId: "test-road",
    sourceInstanceIds: [],
    terrain: { valid: true, maximumSlopeDegrees: 2, minimumShoreClearance: 8, sampleCount: 9 },
    clearsStructures: true,
  };
}

function assetFixture(): PlannedLandUse {
  const habitat = anchor("habitat", "habitat", "field-habitat", 6);
  return {
    anchors: [habitat, anchor("prop", "prop", "supply-stack", 10)],
    landscapePolygons: [
      {
        id: "garden-a",
        hamletId: "hamlet-a",
        zoneId: "zone-a",
        role: "garden",
        polygon: [
          { x: 4, z: 2 },
          { x: 8, z: 2 },
          { x: 8, z: 6 },
          { x: 4, z: 6 },
        ],
        center: habitat.position,
        area: 16,
        contextInstanceIds: [],
        terrain: {
          valid: true,
          maximumSlopeDegrees: 2,
          minimumShoreClearance: 8,
          sampleCount: 16,
        },
        clearsStructures: true,
        clearsPrimaryRoad: true,
      },
    ],
  } as unknown as PlannedLandUse;
}

function disposableBundle(): Readonly<{
  bundle: PlannedLandUseGeometryBundle;
  geometries: ReadonlyArray<THREE.BufferGeometry>;
}> {
  const makeGeometry = () => new THREE.BufferGeometry();
  const zones = PLANNED_DEVELOPED_ZONE_SIGNATURES.map((signature) => ({
    signature,
    surface: makeGeometry(),
    border: makeGeometry(),
  }));
  const landscapes = PLANNED_LANDSCAPE_ROLES.map((role) => ({
    role,
    surface: makeGeometry(),
  }));
  const trailing = Array.from({ length: 6 }, makeGeometry);
  const bundle: PlannedLandUseGeometryBundle = {
    zones,
    landscapes,
    roadBorder: trailing[0]!,
    roadSurface: trailing[1]!,
    bridgeSurface: trailing[2]!,
    bridgeStructure: trailing[3]!,
    steppedSurface: trailing[4]!,
    steppedStructure: trailing[5]!,
    generatedTriangleCount: 0,
    surfaceDrawCallCount: 0,
  };
  return {
    bundle,
    geometries: [
      ...zones.flatMap((zone) => [zone.surface, zone.border]),
      ...landscapes.map((landscape) => landscape.surface),
      ...trailing,
    ],
  };
}

describe("planned land-use render geometry", () => {
  it("keeps polygon topology season invariant while sampling the authored terrain", () => {
    const spring = planFor("spring");
    const winter = planFor("winter");
    const center =
      spring.topology.hamlets[0]!.terrainMask?.center ?? spring.topology.hamlets[0]!.mask.center;
    const polygon = [
      { x: center.x - 8, z: center.z - 5 },
      { x: center.x + 8, z: center.z - 5 },
      { x: center.x + 8, z: center.z + 5 },
      { x: center.x - 8, z: center.z + 5 },
    ];
    const springGeometry = buildTerrainFollowingPolygonGeometry(spring, polygon, {
      center,
      verticalOffset: 0.1,
    });
    const winterGeometry = buildTerrainFollowingPolygonGeometry(winter, polygon, {
      center,
      verticalOffset: 0.1,
    });

    expect(values(winterGeometry.getAttribute("position"))).toEqual(
      values(springGeometry.getAttribute("position")),
    );
    expect(Array.from(winterGeometry.index!.array)).toEqual(
      Array.from(springGeometry.index!.array),
    );
    expect(springGeometry.userData.plannedBoundary).toEqual(polygon);
    expect(springGeometry.userData.plannedInteriorRingCount).toBe(3);
    expect(values(springGeometry.getAttribute("kingdomLandUseInterior"))).toEqual([
      1,
      ...Array(4).fill(0.75),
      ...Array(4).fill(0.5),
      ...Array(4).fill(0.25),
      ...Array(4).fill(0),
    ]);
    expect(springGeometry.getAttribute("position").count).toBe(17);
    expect(springGeometry.index!.count / 3).toBe(28);
    const position = springGeometry.getAttribute("position");
    for (let index = 0; index < position.count; index += 1) {
      expect(position.getY(index)).toBeCloseTo(
        samplePlannedTerrainHeight(spring, position.getX(index), position.getZ(index)) + 0.1,
        3,
      );
    }

    springGeometry.dispose();
    winterGeometry.dispose();
  });

  it("renders the exact 4-5u primary-road contract and rejects invalid widths", () => {
    const plan = planFor("spring");
    const center = plan.topology.envelope.center;
    const segment = roadSegment(plan, 4.5, [
      { x: center.x - 5, z: center.z },
      { x: center.x, z: center.z },
      { x: center.x + 5, z: center.z },
    ]);
    const geometry = buildPlannedRoadSurfaceGeometry(plan, segment);
    const position = geometry.getAttribute("position");
    const firstWidth = Math.hypot(
      position.getX(0) - position.getX(2),
      position.getZ(0) - position.getZ(2),
    );

    expect(firstWidth).toBeCloseTo(4.5, 5);
    expect(geometry.userData.plannedSurfaceWidth).toBe(4.5);
    expect(geometry.userData.plannedCenterline).toEqual(segment.points);
    expect(() => buildPlannedRoadSurfaceGeometry(plan, { ...segment, width: 3.99 })).toThrow(
      /4-5u/,
    );
    expect(() => buildPlannedRoadSurfaceGeometry(plan, { ...segment, width: 5.01 })).toThrow(
      /4-5u/,
    );
    geometry.dispose();
  });

  it("builds raised bridge supports and discrete stepped-cut retaining geometry", () => {
    const plan = planFor("spring");
    const lake = getPlannedTerrainDefinition(plan).water.lake;
    const bridgeRoad = roadSegment(plan, 4.4, [
      { x: lake.center.x - 4, z: lake.center.z },
      { x: lake.center.x, z: lake.center.z },
      { x: lake.center.x + 4, z: lake.center.z },
    ]);
    const bridge = buildPlannedCrossingGeometry(plan, bridgeRoad, crossing("bridge"));
    const bridgePositions = bridge.surface.getAttribute("position");
    const terrainAtCenter = samplePlannedTerrainHeight(plan, lake.center.x, lake.center.z);

    expect(bridge.kind).toBe("bridge");
    expect(bridge.surface.userData.plannedCrossingKind).toBe("bridge");
    expect(bridge.surface.userData.plannedSurfaceWidth).toBe(4.4);
    expect(bridgePositions.getY(4)).toBeGreaterThan(terrainAtCenter + 0.5);
    expect(bridge.structure.index!.count).toBeGreaterThanOrEqual(12);

    const landCenter =
      plan.topology.hamlets[0]!.terrainMask?.center ?? plan.topology.hamlets[0]!.mask.center;
    const steppedRoad = roadSegment(plan, 4.7, [
      { x: landCenter.x - 4, z: landCenter.z - 2 },
      { x: landCenter.x, z: landCenter.z },
      { x: landCenter.x + 4, z: landCenter.z + 2 },
    ]);
    const stepped = buildPlannedCrossingGeometry(plan, steppedRoad, crossing("stepped-cut"));
    expect(stepped.kind).toBe("stepped-cut");
    expect(stepped.surface.userData.plannedCrossingKind).toBe("stepped-cut");
    expect(stepped.surface.userData.plannedSurfaceWidth).toBe(4.7);
    expect(stepped.structure.userData.plannedCrossingKind).toBe("stepped-retaining-walls");
    expect(stepped.surface.index!.count).toBeGreaterThan(0);
    expect(stepped.structure.index!.count).toBeGreaterThan(0);

    bridge.surface.dispose();
    bridge.structure.dispose();
    stepped.surface.dispose();
    stepped.structure.dispose();
  });

  it("removes ordinary terrain ribbons from dedicated crossing spans", () => {
    const plan = planFor("spring");
    const center = plan.topology.envelope.center;
    const segment = roadSegment(
      plan,
      4.5,
      Array.from({ length: 7 }, (_, index) => ({
        x: center.x - 6 + index * 2,
        z: center.z,
      })),
    );
    const withCrossing: PlannedRoadSegment = {
      ...segment,
      crossings: [{ ...crossing("bridge"), startPointIndex: 2, endPointIndex: 4 }],
    };
    const runs = splitPlannedRoadAtCrossings(withCrossing);
    const geometry = buildPlannedOrdinaryRoadGeometry(plan, withCrossing);

    expect(runs.map((run) => run.map((point) => point.x))).toEqual([
      withCrossing.points.slice(0, 3).map((point) => point.x),
      withCrossing.points.slice(4).map((point) => point.x),
    ]);
    expect(runs.flat()).not.toContain(withCrossing.points[3]);
    expect(geometry.index!.count).toBeGreaterThan(0);
    geometry.dispose();
  });

  it("keeps all five developed-zone signatures visually distinct", () => {
    const styles = getPlannedDevelopedZoneStyles(planFor("spring"));
    const signatures = PLANNED_DEVELOPED_ZONE_SIGNATURES.map(
      (signature) => `${styles[signature].color}:${styles[signature].borderColor}`,
    );
    expect(new Set(signatures).size).toBe(PLANNED_DEVELOPED_ZONE_SIGNATURES.length);
  });
});

describe("planned land-use assets and lifecycle", () => {
  it("uses only registered shipped legal roots", () => {
    expect(PLANNED_LAND_USE_ASSET_URLS.length).toBeGreaterThanOrEqual(10);
    for (const url of PLANNED_LAND_USE_ASSET_URLS) {
      expect(url).toMatch(/^\/assets\/world\/(?:kenney|quaternius)\//);
      expect(url).toMatch(/\.glb$/);
    }
  });

  it("changes seasonal appearance without changing anchor instance topology", () => {
    const fixture = assetFixture();
    const spring = createPlannedLandUseAssetInstances(fixture, "spring");
    const winter = createPlannedLandUseAssetInstances(fixture, "winter");
    const withoutAppearance = (instance: (typeof spring)[number]) => ({
      ...instance,
      url: undefined,
    });

    expect(winter.map(withoutAppearance)).toEqual(spring.map(withoutAppearance));
    expect(winter[0]!.url).not.toBe(spring[0]!.url);
    expect(winter[0]!.url).toMatch(/^\/assets\/world\/kenney\/holiday\//);
    expect(winter[1]!.url).toBe(spring[1]!.url);
  });

  it("disposes every generated BufferGeometry in the bundle", () => {
    const { bundle, geometries } = disposableBundle();
    const disposals = geometries.map((geometry) => vi.spyOn(geometry, "dispose"));
    disposePlannedLandUseGeometryBundle(bundle);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
  });
});
