import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import { KINGDOM_SEASONS } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import {
  buildPlannedTerrainGeometry,
  buildPlannedWaterGeometry,
  classifyPlannedTerrainRegion,
  createPlannedTerrainModel,
  getPlannedTerrainDefinition,
  isInsidePlannedTerrain,
  queryPlannedWaterDistance,
  samplePlannedTerrainHeight,
  samplePlannedWatershedPoint,
  samplePlannedWaterSurface,
} from "./planned-terrain-model";

function numericArray(values: ArrayLike<number>): number[] {
  return Array.from(values);
}

describe("planned global terrain", () => {
  it("is deterministic and keeps geometry invariant across seasons", () => {
    const plans = KINGDOM_SEASONS.map((season) => createWorldPlan(createDemoKingdom(season)));
    const first = createPlannedTerrainModel(plans[0]!, {
      segmentsX: 24,
      segmentsZ: 28,
      courseSegments: 16,
      lakeSegments: 24,
    });
    const repeated = createPlannedTerrainModel(plans[0]!, {
      segmentsX: 24,
      segmentsZ: 28,
      courseSegments: 16,
      lakeSegments: 24,
    });
    expect(numericArray(repeated.terrain.surface.positions)).toEqual(
      numericArray(first.terrain.surface.positions),
    );
    expect(numericArray(repeated.water.positions)).toEqual(numericArray(first.water.positions));

    for (const plan of plans.slice(1)) {
      const seasonal = createPlannedTerrainModel(plan, {
        segmentsX: 24,
        segmentsZ: 28,
        courseSegments: 16,
        lakeSegments: 24,
      });
      expect(seasonal.key).toBe(first.key);
      expect(numericArray(seasonal.terrain.surface.positions)).toEqual(
        numericArray(first.terrain.surface.positions),
      );
      expect(numericArray(seasonal.terrain.surface.indices)).toEqual(
        numericArray(first.terrain.surface.indices),
      );
      expect(numericArray(seasonal.water.positions)).toEqual(numericArray(first.water.positions));
    }
  });

  it("authors one irregular elongated envelope rather than a polar oval or ring", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const definition = getPlannedTerrainDefinition(plan);
    const outline = definition.outline;
    const { envelope } = definition;
    const normalizedRadii = outline.map((sample) => {
      const normalizedX = (sample.x - envelope.center.x) / (envelope.width / 2);
      const normalizedZ = (sample.z - envelope.center.z) / (envelope.depth / 2);
      return Math.hypot(normalizedX, normalizedZ);
    });
    expect(outline.length).toBeGreaterThanOrEqual(120);
    expect(Math.max(...normalizedRadii) - Math.min(...normalizedRadii)).toBeGreaterThan(0.19);

    const rightEdge = outline.slice(33, 65);
    const leftEdge = outline.slice(97);
    expect(
      Math.max(...rightEdge.map((sample) => sample.x)) -
        Math.min(...rightEdge.map((sample) => sample.x)),
    ).toBeGreaterThan(3);
    expect(
      Math.max(...leftEdge.map((sample) => sample.x)) -
        Math.min(...leftEdge.map((sample) => sample.x)),
    ).toBeGreaterThan(envelope.width * 0.08);
    expect(
      Math.max(...rightEdge.map((sample) => sample.x)) -
        Math.min(...rightEdge.map((sample) => sample.x)),
    ).toBeGreaterThan(envelope.width * 0.08);
    const sideWidthAt = (progress: number) => {
      const left = outline[96 + Math.round((1 - progress) * 31)]!;
      const right = outline[32 + Math.round(progress * 32)]!;
      return right.x - left.x;
    };
    const widths = [0.2, 0.38, 0.61, 0.82].map(sideWidthAt);
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThan(envelope.width * 0.11);
    expect(
      Math.max(...outline.map((sample) => sample.x)) -
        Math.min(...outline.map((sample) => sample.x)),
    ).toBeGreaterThan(envelope.width * 0.77);
    expect(
      Math.max(...outline.map((sample) => sample.z)) -
        Math.min(...outline.map((sample) => sample.z)),
    ).toBeGreaterThan(envelope.depth * 0.82);
  });

  it("builds a broad asymmetric rear escarpment with a connected nonuniform peak chain", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const definition = getPlannedTerrainDefinition(plan);
    expect(definition.peaks).toHaveLength(6);
    const peakXs = definition.peaks.map((peak) => peak.x);
    expect(Math.max(...peakXs) - Math.min(...peakXs)).toBeGreaterThan(
      definition.envelope.width * 0.55,
    );
    const localPeakHeights = definition.peaks.map((peak) => {
      let maximum = Number.NEGATIVE_INFINITY;
      for (let xStep = -2; xStep <= 2; xStep += 1) {
        for (let zStep = -2; zStep <= 2; zStep += 1) {
          maximum = Math.max(
            maximum,
            samplePlannedTerrainHeight(
              plan,
              peak.x + (peak.radiusX * xStep) / 8,
              peak.z + (peak.radiusZ * zStep) / 8,
            ),
          );
        }
      }
      return maximum;
    });
    expect(
      localPeakHeights.filter((height) => height >= definition.ordinaryHouseHeight * 3).length,
    ).toBeGreaterThanOrEqual(3);

    const faceSamples = Array.from({ length: 41 }, (_, index) => {
      const x = definition.envelope.minX + (definition.envelope.width * (index + 0.5)) / 41;
      return {
        x,
        height: samplePlannedTerrainHeight(plan, x, definition.rearFaceZ - 4),
      };
    });
    const elevatedXs = faceSamples.filter((sample) => sample.height >= 8).map((sample) => sample.x);
    expect(Math.max(...elevatedXs) - Math.min(...elevatedXs)).toBeGreaterThan(
      definition.envelope.width * 0.55,
    );
    expect(new Set(definition.peaks.map((peak) => peak.amplitude.toFixed(3))).size).toBeGreaterThan(
      2,
    );
  });

  it("carves a variable-width monotonic watershed and keeps its terrain below water", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const samples = Array.from({ length: 25 }, (_, index) =>
      samplePlannedWatershedPoint(plan, index / 24),
    );
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]!.surfaceHeight).toBeLessThanOrEqual(
        samples[index - 1]!.surfaceHeight + 0.000_001,
      );
      expect(samples[index]!.z).toBeGreaterThanOrEqual(samples[index - 1]!.z);
    }
    expect(
      Math.max(...samples.map((sample) => sample.width)) -
        Math.min(...samples.map((sample) => sample.width)),
    ).toBeGreaterThan(1.4);

    for (const sample of samples) {
      expect(Math.hypot(sample.tangentX, sample.tangentZ)).toBeCloseTo(1, 8);
      expect(sample.tangentX * sample.normalX + sample.tangentZ * sample.normalZ).toBeCloseTo(0, 8);
      const waterHeight = samplePlannedWaterSurface(plan, sample.x, sample.z);
      expect(waterHeight).not.toBeNull();
      expect(samplePlannedTerrainHeight(plan, sample.x, sample.z)).toBeLessThanOrEqual(
        waterHeight! - 0.6,
      );
    }
    const definition = getPlannedTerrainDefinition(plan);
    const courseXs = samples.map((sample) => sample.x);
    expect(Math.max(...courseXs) - Math.min(...courseXs)).toBeGreaterThan(
      definition.envelope.width * 0.09,
    );
    expect(Math.abs(courseXs[0]! - definition.envelope.center.x)).toBeLessThan(
      definition.envelope.width * 0.14,
    );
    expect(
      Math.max(...courseXs.map((x) => Math.abs(x - definition.envelope.center.x))),
    ).toBeLessThan(definition.envelope.width * 0.36);
  });

  it("builds every river row on the shared local course normal with downward winding", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const courseSegments = 48;
    const crossSegments = 4;
    const water = buildPlannedWaterGeometry(plan, {
      courseSegments,
      courseCrossSegments: crossSegments,
      lakeSegments: 48,
    });
    const definition = getPlannedTerrainDefinition(plan);
    const activeRows = Math.max(
      2,
      Math.floor(courseSegments * definition.water.course.basinEntryProgress),
    );
    for (let row = 0; row <= activeRows; row += 1) {
      const progress = Math.min(
        definition.water.course.basinEntryProgress - 0.008,
        (row / activeRows) * definition.water.course.basinEntryProgress,
      );
      const sample = samplePlannedWatershedPoint(plan, progress);
      const first = row * (crossSegments + 1);
      const last = first + crossSegments;
      const spanX = water.positions[last * 3]! - water.positions[first * 3]!;
      const spanZ = water.positions[last * 3 + 2]! - water.positions[first * 3 + 2]!;
      expect(Math.abs(spanX * sample.tangentX + spanZ * sample.tangentZ)).toBeLessThan(0.001);
      expect(queryPlannedWaterDistance(plan, sample.x, sample.z).signedDistance).toBeLessThan(0);
    }
    for (let index = 0; index < water.ranges.courseTriangles * 3; index += 3) {
      const a = water.indices[index]!;
      const b = water.indices[index + 1]!;
      const c = water.indices[index + 2]!;
      const ax = water.positions[a * 3]!;
      const az = water.positions[a * 3 + 2]!;
      const bx = water.positions[b * 3]!;
      const bz = water.positions[b * 3 + 2]!;
      const cx = water.positions[c * 3]!;
      const cz = water.positions[c * 3 + 2]!;
      expect((bz - az) * (cx - ax) - (bx - ax) * (cz - az)).toBeLessThan(0);
    }
  });

  it("creates a substantial irregular foreground lake fully inside the landmass", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const definition = getPlannedTerrainDefinition(plan);
    const lake = definition.water.lake;
    expect(lake.center.z).toBeGreaterThan(definition.envelope.center.z);
    expect(lake.footprintRatio).toBeGreaterThanOrEqual(0.12);
    expect(lake.footprintRatio).toBeLessThanOrEqual(0.22);

    const water = buildPlannedWaterGeometry(plan, { lakeSegments: 72 });
    const lakeStart = water.vertexCount - 73;
    for (let index = 0; index < 73; index += 1) {
      const vertex = lakeStart + index;
      const x = water.positions[vertex * 3]!;
      const z = water.positions[vertex * 3 + 2]!;
      expect(queryPlannedWaterDistance(plan, x, z).lakeDistance).toBeCloseTo(0, 2);
      expect(samplePlannedWaterSurface(plan, x, z)).not.toBeNull();
    }

    for (let index = 0; index < 48; index += 1) {
      const angle = (index / 48) * Math.PI * 2;
      // A 0.94 inset checks the basin proper; the shoreline feather occupies
      // the remaining narrow band at the organic terrain edge.
      const x = lake.center.x + Math.cos(angle) * lake.radiusX * 0.94;
      const z = lake.center.z + Math.sin(angle) * lake.radiusZ * 0.94;
      expect(isInsidePlannedTerrain(plan, x, z), `lake inset angle ${index}`).toBe(true);
      const waterHeight = samplePlannedWaterSurface(plan, x, z);
      if (waterHeight !== null) {
        expect(samplePlannedTerrainHeight(plan, x, z)).toBeLessThan(waterHeight);
      }
    }
    for (const terrace of definition.terraces) {
      for (let angleIndex = 0; angleIndex < 32; angleIndex += 1) {
        const angle = (angleIndex / 32) * Math.PI * 2;
        const x = terrace.center.x + Math.cos(angle) * (terrace.radiusX + 3.5);
        const z = terrace.center.z + Math.sin(angle) * (terrace.radiusZ + 3.5);
        const region = classifyPlannedTerrainRegion(plan, x, z);
        expect(region.water, `${terrace.id} intersects rendered water`).toBeNull();
        expect(region.material, `${terrace.id} intersects rendered shore`).not.toBe("shore");
      }
    }
  });

  it("seats every hamlet on a smooth supported terrace, including rear hamlets", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const definition = getPlannedTerrainDefinition(plan);
    expect(definition.terraces).toHaveLength(plan.topology.hamlets.length);
    for (const terrace of definition.terraces) {
      let maximumSlope = 0;
      for (let xStep = -2; xStep <= 2; xStep += 1) {
        for (let zStep = -2; zStep <= 2; zStep += 1) {
          const x = terrace.center.x + (terrace.radiusX * xStep) / 5;
          const z = terrace.center.z + (terrace.radiusZ * zStep) / 5;
          const region = classifyPlannedTerrainRegion(plan, x, z);
          expect(region.water).toBeNull();
          maximumSlope = Math.max(maximumSlope, region.slopeDegrees);
        }
      }
      expect(maximumSlope).toBeLessThan(8);
      expect(samplePlannedTerrainHeight(plan, terrace.center.x, terrace.center.z)).toBeCloseTo(
        terrace.targetHeight,
        5,
      );
      let outerMaximumSlope = 0;
      let outerMaximumPoint = "";
      for (let ring = 0.55; ring <= 2.2; ring += 0.15) {
        for (let angleIndex = 0; angleIndex < 24; angleIndex += 1) {
          const angle = (angleIndex / 24) * Math.PI * 2;
          const x = terrace.center.x + Math.cos(angle) * terrace.radiusX * ring;
          const z = terrace.center.z + Math.sin(angle) * terrace.radiusZ * ring;
          const outerRegion = classifyPlannedTerrainRegion(plan, x, z);
          if (
            outerRegion.water !== null ||
            outerRegion.material === "shore" ||
            !outerRegion.inside
          ) {
            continue;
          }
          const outerSlope = outerRegion.slopeDegrees;
          if (outerSlope > outerMaximumSlope) {
            outerMaximumSlope = outerSlope;
            outerMaximumPoint = `r=${ring.toFixed(2)},a=${angle.toFixed(2)},x=${x.toFixed(1)},z=${z.toFixed(1)},material=${outerRegion.material}`;
          }
        }
      }
      expect(
        outerMaximumSlope,
        `${terrace.id} outer terrace slope at ${outerMaximumPoint}`,
      ).toBeLessThan(24);
    }
  });

  it("clips the river before its transparent surface can overlap the lake", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const definition = getPlannedTerrainDefinition(plan);
    const water = buildPlannedWaterGeometry(plan, {
      courseSegments: 48,
      courseCrossSegments: 4,
      lakeSegments: 48,
    });
    const courseIndexCount = water.ranges.courseTriangles * 3;
    const courseVertexIndices = new Set<number>();
    for (let index = 0; index < courseIndexCount; index += 1) {
      courseVertexIndices.add(water.indices[index]!);
    }
    let minimumLakeRadius = Number.POSITIVE_INFINITY;
    for (const vertexIndex of courseVertexIndices) {
      const x = water.positions[vertexIndex * 3]!;
      const z = water.positions[vertexIndex * 3 + 2]!;
      expect(classifyPlannedTerrainRegion(plan, x, z).water).not.toBe("lake");
      const normalizedRadius = Math.hypot(
        (x - definition.water.lake.center.x) / definition.water.lake.radiusX,
        (z - definition.water.lake.center.z) / definition.water.lake.radiusZ,
      );
      minimumLakeRadius = Math.min(minimumLakeRadius, normalizedRadius);
    }
    expect(minimumLakeRadius).toBeGreaterThan(0.9);
    expect(water.ranges.courseTriangles).toBeGreaterThan(0);
    expect(water.ranges.lakeTriangles).toBe(48);
  });

  it("exposes stone on steep slopes and keeps all geometry finite and bounded", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const definition = getPlannedTerrainDefinition(plan);
    let stoneSamples = 0;
    for (let zIndex = 0; zIndex <= 20; zIndex += 1) {
      const z = definition.envelope.minZ + (definition.envelope.depth * zIndex) / 20;
      for (let xIndex = 0; xIndex <= 24; xIndex += 1) {
        const x = definition.envelope.minX + (definition.envelope.width * xIndex) / 24;
        const region = classifyPlannedTerrainRegion(plan, x, z);
        if (region.material === "cliff-stone") stoneSamples += 1;
      }
    }
    expect(stoneSamples).toBeGreaterThan(8);

    const terrain = buildPlannedTerrainGeometry(plan, { segmentsX: 112, segmentsZ: 128 });
    const water = buildPlannedWaterGeometry(plan, { courseSegments: 76, lakeSegments: 84 });
    for (const geometry of [terrain.surface, terrain.sideCliffs, water]) {
      expect([...geometry.positions].every(Number.isFinite)).toBe(true);
      expect([...geometry.indices].every(Number.isFinite)).toBe(true);
      expect(geometry.indices.length % 3).toBe(0);
      expect(Math.max(...geometry.indices)).toBeLessThan(geometry.vertexCount);
    }
    for (let index = 0; index < terrain.surface.positions.length; index += 3) {
      expect(terrain.surface.positions[index]!).toBeGreaterThanOrEqual(definition.envelope.minX);
      expect(terrain.surface.positions[index]!).toBeLessThanOrEqual(definition.envelope.maxX);
      expect(terrain.surface.positions[index + 2]!).toBeGreaterThanOrEqual(
        definition.envelope.minZ,
      );
      expect(terrain.surface.positions[index + 2]!).toBeLessThanOrEqual(definition.envelope.maxZ);
    }
    for (let index = 0; index < water.positions.length; index += 3) {
      expect(
        isInsidePlannedTerrain(plan, water.positions[index]!, water.positions[index + 2]!),
        `water vertex ${index / 3} at ${water.positions[index]}, ${water.positions[index + 2]}`,
      ).toBe(true);
    }
    expect(terrain.surface.triangleCount).toBeLessThan(29_000);
    expect(water.triangleCount).toBeLessThan(1_000);
  });

  it("uses a shallow local boundary skirt instead of a shared deep slab", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const definition = getPlannedTerrainDefinition(plan);
    const terrain = buildPlannedTerrainGeometry(plan, { segmentsX: 112, segmentsZ: 128 });
    const positions = terrain.sideCliffs.positions;
    expect(terrain.sideCliffs.vertexCount).toBe(definition.outline.length * 3);

    const thicknesses: number[] = [];
    const topHeights: number[] = [];
    const bottomHeights: number[] = [];
    for (let vertex = 0; vertex < terrain.sideCliffs.vertexCount; vertex += 3) {
      const topHeight = positions[vertex * 3 + 1]!;
      const shoulderHeight = positions[(vertex + 1) * 3 + 1]!;
      const bottomHeight = positions[(vertex + 2) * 3 + 1]!;
      expect(topHeight).toBeGreaterThan(shoulderHeight);
      expect(shoulderHeight).toBeGreaterThan(bottomHeight);
      topHeights.push(topHeight);
      bottomHeights.push(bottomHeight);
      thicknesses.push(topHeight - bottomHeight);
    }

    const surfaceHeights = Array.from(
      { length: terrain.surface.vertexCount },
      (_, vertex) => terrain.surface.positions[vertex * 3 + 1]!,
    );
    const worldHeight = Math.max(...surfaceHeights) - Math.min(...surfaceHeights);
    expect(Math.min(...thicknesses)).toBeGreaterThanOrEqual(0.82 - 0.000_01);
    expect(Math.max(...thicknesses)).toBeLessThanOrEqual(1.48 + 0.000_01);
    expect(Math.max(...thicknesses) / worldHeight).toBeLessThan(0.05);
    expect(Math.max(...bottomHeights) - Math.min(...bottomHeights)).toBeGreaterThan(
      definition.ordinaryHouseHeight * 2,
    );
    for (let index = 0; index < topHeights.length; index += 1) {
      expect(bottomHeights[index]).toBeCloseTo(topHeights[index]! - thicknesses[index]!, 5);
    }
  });
});
