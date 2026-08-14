import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import {
  createPhysicalWaterContract,
  PHYSICAL_LAKE_PERIMETER_SEGMENTS,
  physicalWaterCircleHasClearance,
  segmentToExpandedEllipseDistance,
} from "@/lib/kingdom/physical-water-contract";
import { KINGDOM_SEASONS, type KingdomWorld } from "@/lib/kingdom/types";
import { createHamletTerrainPlacementMasks, createWorldPlan } from "@/lib/kingdom/world-plan";

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

const TERRAIN_MODEL_SOURCE = readFileSync(
  new URL("./planned-terrain-model.ts", import.meta.url),
  "utf8",
);

function numericArray(values: ArrayLike<number>): number[] {
  return Array.from(values);
}

function projectedTriangleArea(
  positions: ArrayLike<number>,
  first: number,
  second: number,
  third: number,
): number {
  const ax = positions[first * 3]!;
  const az = positions[first * 3 + 2]!;
  const bx = positions[second * 3]!;
  const bz = positions[second * 3 + 2]!;
  const cx = positions[third * 3]!;
  const cz = positions[third * 3 + 2]!;
  return Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
}

describe("planned global terrain", () => {
  it("does not paint a second straight inter-hamlet road into terrain materials", () => {
    expect(TERRAIN_MODEL_SOURCE).not.toContain("function pathSurfaceDistance");
    expect(TERRAIN_MODEL_SOURCE).not.toContain(":path-edge");
    expect(TERRAIN_MODEL_SOURCE).not.toContain(
      'else if (pathDistance <= pathEdge && slopeDegrees < 15) material = "path-soil"',
    );
  });

  it("renders the same canonical physical water contract used by planning", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const definition = getPlannedTerrainDefinition(plan);
    const courseMask = plan.topology.terrainZones.find(
      (zone) => zone.kind === "watershed" && zone.mask.shape === "corridor",
    )?.mask;
    const lakeMask = plan.topology.terrainZones.find(
      (zone) => zone.kind === "lake" && zone.mask.shape === "ellipse",
    )?.mask;
    expect(courseMask?.shape).toBe("corridor");
    expect(lakeMask?.shape).toBe("ellipse");
    if (courseMask?.shape !== "corridor" || lakeMask?.shape !== "ellipse") return;
    const placementMasks = createHamletTerrainPlacementMasks(
      plan.topology.envelope,
      plan.topology.hamlets,
    );
    const contract = createPhysicalWaterContract({
      key: plan.terrainKey,
      envelope: plan.topology.envelope,
      horizonZ: plan.topology.camera.horizonZ,
      courseMask,
      lakeMask,
      topologyFamily: plan.topology.geography,
      terraces: plan.topology.hamlets.map((hamlet) => {
        const mask = placementMasks.get(hamlet.id)!;
        return { id: hamlet.id, center: mask.center, radiusX: mask.radiusX, radiusZ: mask.radiusZ };
      }),
    });
    expect(definition.outline).toEqual(contract.outline);
    expect(definition.water).toEqual({ course: contract.course, lake: contract.lake });
  });

  it("shares one canonical definition across equivalent fresh plans", () => {
    const springPlan = createWorldPlan(createDemoKingdom("spring"));
    const winterPlan = createWorldPlan(createDemoKingdom("winter"));

    expect(springPlan).not.toBe(winterPlan);
    expect(springPlan.terrainKey).toBe(winterPlan.terrainKey);
    expect(getPlannedTerrainDefinition(springPlan)).toBe(getPlannedTerrainDefinition(winterPlan));
  });

  it("is deterministic and keeps geometry invariant across seasons", () => {
    const plans = KINGDOM_SEASONS.map((season) => createWorldPlan(createDemoKingdom(season)));
    const first = createPlannedTerrainModel(plans[0]!, {
      segmentsX: 24,
      segmentsZ: 28,
      courseSegments: 16,
    });
    const repeated = createPlannedTerrainModel(plans[0]!, {
      segmentsX: 24,
      segmentsZ: 28,
      courseSegments: 16,
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
    // This is the fitted visible polygon after coastline and terrace coves,
    // not the larger nominal source ellipse used to author the basin.
    expect(lake.footprintRatio).toBeGreaterThanOrEqual(0.1);
    expect(lake.footprintRatio).toBeLessThanOrEqual(0.14);

    const water = buildPlannedWaterGeometry(plan);
    const firstLakeTriangleIndex = water.ranges.courseTriangles * 3;
    const lakeCenterVertex = water.indices[firstLakeTriangleIndex]!;
    const shorelineVertexCount = lake.perimeter.length;
    const expectedLakeTriangles =
      lake.perimeter.length * (1 + (water.ranges.lakeRingCount - 1) * 2);
    expect(lake.perimeter).toHaveLength(PHYSICAL_LAKE_PERIMETER_SEGMENTS);
    expect(water.ranges.lakeFirstVertex).toBe(lakeCenterVertex);
    expect(water.ranges.lakeRingCount).toBeGreaterThanOrEqual(5);
    expect(water.ranges.lakePerimeterSegments).toBe(lake.perimeter.length);
    expect(water.ranges.lakeTriangles).toBe(expectedLakeTriangles);
    expect(water.vertexCount - lakeCenterVertex).toBe(
      1 + water.ranges.lakeRingCount * shorelineVertexCount,
    );
    expect(water.positions[lakeCenterVertex * 3]).toBeCloseTo(lake.center.x, 5);
    expect(water.positions[lakeCenterVertex * 3 + 2]).toBeCloseTo(lake.center.z, 5);
    const shorelineStart =
      lakeCenterVertex + 1 + (water.ranges.lakeRingCount - 1) * shorelineVertexCount;
    for (let index = 0; index < shorelineVertexCount; index += 1) {
      const vertex = shorelineStart + index;
      const x = water.positions[vertex * 3]!;
      const z = water.positions[vertex * 3 + 2]!;
      const canonicalPoint = lake.perimeter[index]!;
      expect(x).toBeCloseTo(canonicalPoint.x, 5);
      expect(z).toBeCloseTo(canonicalPoint.z, 5);
      expect(queryPlannedWaterDistance(plan, x, z).lakeDistance).toBeCloseTo(0, 2);
      expect(samplePlannedWaterSurface(plan, x, z)).not.toBeNull();
    }
    for (let index = 0; index < shorelineVertexCount; index += 1) {
      const triangleStart = firstLakeTriangleIndex + index * 3;
      expect(Array.from(water.indices.slice(triangleStart, triangleStart + 3))).toContain(
        lakeCenterVertex,
      );
    }
    for (
      let index = firstLakeTriangleIndex + shorelineVertexCount * 3;
      index < water.indices.length;
      index += 1
    ) {
      expect(water.indices[index]).not.toBe(lakeCenterVertex);
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

  it("reports the actual fitted lake polygon area and keeps its visible footprint substantial", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const definition = getPlannedTerrainDefinition(plan);
    const water = buildPlannedWaterGeometry(plan);
    const lakeIndexStart = water.ranges.courseTriangles * 3;
    let renderedArea = 0;
    for (let index = lakeIndexStart; index < water.indices.length; index += 3) {
      renderedArea += projectedTriangleArea(
        water.positions,
        water.indices[index]!,
        water.indices[index + 1]!,
        water.indices[index + 2]!,
      );
    }
    expect(definition.water.lake.area).toBeCloseTo(renderedArea, 3);
    expect(definition.water.lake.footprintRatio).toBeCloseTo(
      renderedArea / (definition.envelope.width * definition.envelope.depth),
      5,
    );
    expect(definition.water.lake.footprintRatio).toBeGreaterThanOrEqual(0.1);
    expect(definition.water.lake.footprintRatio).toBeLessThanOrEqual(0.14);
  });

  it("classifies every canonical shoreline chord and triangle interior as lake", () => {
    const demo = createDemoKingdom();
    const plan = createWorldPlan({
      ...demo,
      seed: "water-parity:asset:31:2",
      source: {
        ...demo.source,
        commitSha: "0000000000000000000000000000000005000002",
      },
      coverage: {
        ...demo.coverage,
        discoveredFiles: 31,
        eligibleFiles: 31,
        representedFiles: 31,
      },
      statistics: {
        ...demo.statistics,
        files: 31,
        bytes: 31_000,
        categories: [
          { category: "asset", files: 26, bytes: 25_420 },
          { category: "other", files: 5, bytes: 5_580 },
        ],
      },
    });
    expect(plan.terrainKey).toBe("cd2d5757fff5887c");
    const definition = getPlannedTerrainDefinition(plan);
    const perimeter = definition.water.lake.perimeter;
    expect(perimeter).toHaveLength(96);
    for (let index = 0; index < perimeter.length; index += 1) {
      const first = perimeter[index]!;
      const second = perimeter[(index + 1) % perimeter.length]!;
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
        const edgeX = first.x + (second.x - first.x) * progress;
        const edgeZ = first.z + (second.z - first.z) * progress;
        expect(
          queryPlannedWaterDistance(plan, edgeX, edgeZ).lakeDistance,
          `edge:${index}:${progress}`,
        ).toBeLessThanOrEqual(0.002);
        for (const inward of [0.25, 0.5, 0.75]) {
          const x = edgeX + (definition.water.lake.center.x - edgeX) * inward;
          const z = edgeZ + (definition.water.lake.center.z - edgeZ) * inward;
          expect(
            queryPlannedWaterDistance(plan, x, z).lakeDistance,
            `triangle:${index}:${progress}:${inward}`,
          ).toBeLessThanOrEqual(0.002);
        }
      }
    }
  });

  it("keeps planner-owned grove and wildlife habitats outside rendered water", () => {
    const demo = createDemoKingdom();
    for (let seedIndex = 0; seedIndex < 48; seedIndex += 1) {
      const plan = createWorldPlan({ ...demo, seed: `${demo.seed}:water-clearance:${seedIndex}` });
      for (const grove of plan.topology.groves) {
        for (let sampleIndex = 0; sampleIndex < 24; sampleIndex += 1) {
          const angle = (sampleIndex / 24) * Math.PI * 2;
          const localX = Math.cos(angle) * grove.mask.radiusX;
          const localZ = Math.sin(angle) * grove.mask.radiusZ;
          const cosine = Math.cos(grove.mask.rotation);
          const sine = Math.sin(grove.mask.rotation);
          const x = grove.mask.center.x + localX * cosine - localZ * sine;
          const z = grove.mask.center.z + localX * sine + localZ * cosine;
          expect(
            queryPlannedWaterDistance(plan, x, z).shoreDistance,
            `${plan.terrainKey}:${grove.id}:boundary:${sampleIndex}`,
          ).toBeGreaterThanOrEqual(grove.exclusions.clearance - 0.002);
        }
      }
      for (const wildlife of plan.topology.wildlifeZones) {
        for (let sampleIndex = 0; sampleIndex < 16; sampleIndex += 1) {
          const angle = (sampleIndex / 16) * Math.PI * 2;
          const localX = Math.cos(angle) * wildlife.mask.radiusX;
          const localZ = Math.sin(angle) * wildlife.mask.radiusZ;
          const cosine = Math.cos(wildlife.mask.rotation);
          const sine = Math.sin(wildlife.mask.rotation);
          const x = wildlife.mask.center.x + localX * cosine - localZ * sine;
          const z = wildlife.mask.center.z + localX * sine + localZ * cosine;
          expect(
            queryPlannedWaterDistance(plan, x, z).shoreDistance,
            `${plan.terrainKey}:${wildlife.id}:boundary:${sampleIndex}`,
          ).toBeGreaterThanOrEqual(-0.002);
        }
      }
    }
  });

  it("densely verifies matrix-43 against the narrow fitted-lake lobe", () => {
    const demo = createDemoKingdom();
    const plan = createWorldPlan({
      ...demo,
      seed: "matrix-43",
      source: {
        ...demo.source,
        commitSha: "0000000000000000000000000000000000100043",
      },
      coverage: {
        ...demo.coverage,
        discoveredFiles: 120,
        eligibleFiles: 120,
        representedFiles: 120,
      },
      statistics: {
        ...demo.statistics,
        files: 120,
        categories: [
          { category: "config", files: 98, bytes: 98_000 },
          { category: "source", files: 22, bytes: 22_000 },
        ],
      },
    });
    expect(plan.topology.groves.length).toBeGreaterThan(0);
    const definition = getPlannedTerrainDefinition(plan);
    const contract = {
      key: definition.key,
      envelope: definition.envelope,
      outline: definition.outline,
      terraces: definition.terraces,
      course: definition.water.course,
      lake: definition.water.lake,
    };
    let closestClearanceMargin = Number.POSITIVE_INFINITY;
    let closestLakeClearanceMargin = Number.POSITIVE_INFINITY;
    for (const grove of plan.topology.groves) {
      let minimum = Number.POSITIVE_INFINITY;
      let lakeMinimum = Number.POSITIVE_INFINITY;
      const radius = Math.max(grove.mask.radiusX, grove.mask.radiusZ);
      expect(
        physicalWaterCircleHasClearance(
          contract,
          grove.mask.center,
          radius,
          grove.exclusions.clearance,
        ),
        `${grove.id}:direct-proof`,
      ).toBe(true);
      for (let index = 0; index < 10_000; index += 1) {
        const angle = (index / 10_000) * Math.PI * 2;
        const distance = queryPlannedWaterDistance(
          plan,
          grove.mask.center.x + Math.cos(angle) * radius,
          grove.mask.center.z + Math.sin(angle) * radius,
        );
        minimum = Math.min(minimum, distance.shoreDistance);
        lakeMinimum = Math.min(lakeMinimum, distance.lakeDistance - 4);
      }
      expect(minimum, grove.id).toBeGreaterThanOrEqual(grove.exclusions.clearance - 0.002);
      closestClearanceMargin = Math.min(
        closestClearanceMargin,
        minimum - grove.exclusions.clearance,
      );
      closestLakeClearanceMargin = Math.min(
        closestLakeClearanceMargin,
        lakeMinimum - grove.exclusions.clearance,
      );
    }
    // Preserve this seed as a meaningful near-boundary regression instead of
    // coupling the test to a grove ID that changes with the terrain schema.
    expect(closestClearanceMargin).toBeGreaterThanOrEqual(-0.002);
    // This versioned fixture keeps both canonical water queries genuinely near
    // their hard clearance boundary instead of merely asserting a vacuous
    // lower bound after a terrain-schema change.
    expect(closestClearanceMargin).toBeLessThanOrEqual(3);
    expect(closestLakeClearanceMargin).toBeGreaterThanOrEqual(-0.002);
    expect(closestLakeClearanceMargin).toBeLessThanOrEqual(4.5);
  });

  it("truthfully bounds actual fitted lake footprints across archetypes and scale tiers", () => {
    const demo = createDemoKingdom();
    const categories = ["source", "test", "docs", "config", "asset", "other"] as const;
    const fileCounts = [48, 120, 900, 8_000] as const;
    for (const [categoryIndex, category] of categories.entries()) {
      for (const files of fileCounts) {
        for (let seedIndex = 0; seedIndex < 2; seedIndex += 1) {
          const plan = createWorldPlan({
            ...demo,
            seed: `lake-matrix:${category}:${files}:${seedIndex}`,
            source: {
              ...demo.source,
              commitSha: String(categoryIndex * 100_000 + files + seedIndex).padStart(40, "0"),
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
              categories: [
                { category, files: Math.ceil(files * 0.82), bytes: files * 820 },
                { category: "other", files: Math.floor(files * 0.18), bytes: files * 180 },
              ],
            },
          });
          const definition = getPlannedTerrainDefinition(plan);
          const ratio = definition.water.lake.footprintRatio;
          expect(ratio, `${category}:${files}:${seedIndex}`).toBeGreaterThanOrEqual(0.1);
          expect(ratio, `${category}:${files}:${seedIndex}`).toBeLessThanOrEqual(0.14);
          const water = buildPlannedWaterGeometry(plan);
          let renderedArea = 0;
          for (
            let index = water.ranges.courseTriangles * 3;
            index < water.indices.length;
            index += 3
          ) {
            renderedArea += projectedTriangleArea(
              water.positions,
              water.indices[index]!,
              water.indices[index + 1]!,
              water.indices[index + 2]!,
            );
          }
          expect(definition.water.lake.area, `${category}:${files}:${seedIndex}:area`).toBeCloseTo(
            renderedArea,
            3,
          );
        }
      }
    }
  });

  it("keeps every rendered course segment outside expanded settlement terraces", () => {
    const demo = createDemoKingdom();
    const categories = ["source", "test", "docs", "config", "asset", "other"] as const;
    const seedIndices = [0, 1, 2, 5, 11, 17] as const;
    let maximumCoursePoints = 0;
    for (const [categoryIndex, category] of categories.entries()) {
      for (const files of [48, 120, 900, 8_000] as const) {
        for (const seedIndex of seedIndices) {
          const world = {
            ...demo,
            seed: `outside:${category}:${files}:${seedIndex}`,
            source: {
              ...demo.source,
              commitSha: String(categoryIndex * 100_000 + files + seedIndex).padStart(40, "0"),
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
              categories: [
                { category, files: Math.ceil(files * 0.82), bytes: files * 820 },
                { category: "other", files: Math.floor(files * 0.18), bytes: files * 180 },
              ],
            },
          } satisfies KingdomWorld;
          expect(
            () => createWorldPlan(world),
            `${category}:${files}:${seedIndex}:world-plan`,
          ).not.toThrow();
          const plan = createWorldPlan(world);
          const definition = getPlannedTerrainDefinition(plan);
          maximumCoursePoints = Math.max(
            maximumCoursePoints,
            definition.water.course.points.length,
          );
          const courseXs = definition.water.course.points.map(({ x }) => x);
          expect(
            Math.max(...courseXs) - Math.min(...courseXs),
            `${category}:${files}:${seedIndex}:meander`,
          ).toBeGreaterThanOrEqual(definition.envelope.width * 0.09 - 0.000_01);
          const clearance = definition.water.course.sourceWidth * 1.42 * 0.5 + 5.5;
          for (let index = 1; index < definition.water.course.points.length; index += 1) {
            const start = definition.water.course.points[index - 1]!;
            const end = definition.water.course.points[index]!;
            for (const progress of [0, 0.25, 0.5, 0.75, 1] as const) {
              const x = start.x + (end.x - start.x) * progress;
              const z = start.z + (end.z - start.z) * progress;
              expect(
                isInsidePlannedTerrain(plan, x, z),
                `${category}:${files}:${seedIndex}:segment:${index}:land:${progress}`,
              ).toBe(true);
              const waterHeight = samplePlannedWaterSurface(plan, x, z);
              expect(
                waterHeight,
                `${category}:${files}:${seedIndex}:segment:${index}:water:${progress}`,
              ).not.toBeNull();
              expect(
                samplePlannedTerrainHeight(plan, x, z),
                `${category}:${files}:${seedIndex}:segment:${index}:bed:${progress}`,
              ).toBeLessThanOrEqual(waterHeight! - 0.6);
            }
            for (const terrace of definition.terraces) {
              expect(
                segmentToExpandedEllipseDistance(start, end, terrace, clearance),
                `${category}:${files}:${seedIndex}:segment:${index}:${terrace.id}`,
              ).toBeGreaterThanOrEqual(1 - 0.000_01);
            }
          }
        }
      }
    }
    expect(maximumCoursePoints).toBeLessThanOrEqual(16);
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
    expect(water.ranges.lakeTriangles).toBe(
      definition.water.lake.perimeter.length * (1 + (water.ranges.lakeRingCount - 1) * 2),
    );
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
    const water = buildPlannedWaterGeometry(plan, { courseSegments: 76 });
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
    expect(water.triangleCount).toBeLessThan(2_500);
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
