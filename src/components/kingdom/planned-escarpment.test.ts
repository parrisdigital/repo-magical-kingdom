import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import { KINGDOM_SEASONS, type FileCategory, type KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { buildPlannedEscarpmentGeometry } from "./planned-escarpment";
import { samplePlannedTerrainHeight } from "./planned-terrain-model";

const REAR_SLOPE_CONTRACT_DEGREES = 60;
const REAR_STEP_CONTRACT = 5;

function values(array: ArrayLike<number>): number[] {
  return Array.from(array);
}

function triangleNormal(
  positions: Float32Array,
  firstIndex: number,
  secondIndex: number,
  thirdIndex: number,
): Readonly<{ x: number; y: number; z: number; length: number }> {
  const ax = positions[firstIndex * 3]!;
  const ay = positions[firstIndex * 3 + 1]!;
  const az = positions[firstIndex * 3 + 2]!;
  const abx = positions[secondIndex * 3]! - ax;
  const aby = positions[secondIndex * 3 + 1]! - ay;
  const abz = positions[secondIndex * 3 + 2]! - az;
  const acx = positions[thirdIndex * 3]! - ax;
  const acy = positions[thirdIndex * 3 + 1]! - ay;
  const acz = positions[thirdIndex * 3 + 2]! - az;
  const x = aby * acz - abz * acy;
  const y = abz * acx - abx * acz;
  const z = abx * acy - aby * acx;
  return { x, y, z, length: Math.hypot(x, y, z) };
}

function matrixWorld(category: FileCategory, files: number, seedIndex: number): KingdomWorld {
  const demo = createDemoKingdom();
  const secondaryCategory = category === "other" ? "source" : "other";
  return {
    ...demo,
    seed: `escarpment-matrix:${category}:${files}:${seedIndex}`,
    source: {
      ...demo.source,
      commitSha: `${category.length}${files}${seedIndex}`.padStart(40, "0"),
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
        { category: secondaryCategory, files: Math.floor(files * 0.18), bytes: files * 180 },
      ],
    },
  };
}

function expectRearProfileContract(
  plan: ReturnType<typeof createWorldPlan>,
  quality: "low" | "high",
  caseLabel: string,
) {
  const geometry = buildPlannedEscarpmentGeometry(plan, quality);
  const verticesPerRow = geometry.columns + 1;
  const faceRows = geometry.faceTriangleCount / (geometry.columns * 2) + 1;
  const shelfRearStart = (faceRows + 1) * verticesPerRow;
  const rearStart = shelfRearStart + verticesPerRow;
  const maximumRiseRatio = Math.tan((REAR_SLOPE_CONTRACT_DEGREES * Math.PI) / 180);
  let measuredMaximumStep = 0;

  expect(geometry.maximumRearSlopeDegrees, `${caseLabel}:${quality}:slope`).toBeLessThan(
    REAR_SLOPE_CONTRACT_DEGREES,
  );
  expect(geometry.maximumRearStep, `${caseLabel}:${quality}:step`).toBeLessThan(REAR_STEP_CONTRACT);

  for (let column = 0; column <= geometry.columns; column += 1) {
    const shelfVertex = shelfRearStart + column;
    const rearShelfVertex = rearStart + column;
    for (let axis = 0; axis < 3; axis += 1) {
      expect(geometry.positions[rearShelfVertex * 3 + axis]).toBeCloseTo(
        geometry.positions[shelfVertex * 3 + axis]!,
        5,
      );
    }

    const groundVertex = rearStart + geometry.rearRows * verticesPerRow + column;
    const groundX = geometry.positions[groundVertex * 3]!;
    const groundY = geometry.positions[groundVertex * 3 + 1]!;
    const groundZ = geometry.positions[groundVertex * 3 + 2]!;
    expect(groundY).toBeCloseTo(samplePlannedTerrainHeight(plan, groundX, groundZ) + 0.055, 4);

    for (let row = 1; row <= geometry.rearRows; row += 1) {
      const previousVertex = rearStart + (row - 1) * verticesPerRow + column;
      const vertex = rearStart + row * verticesPerRow + column;
      const rise = Math.abs(
        geometry.positions[vertex * 3 + 1]! - geometry.positions[previousVertex * 3 + 1]!,
      );
      const run = Math.abs(
        geometry.positions[vertex * 3 + 2]! - geometry.positions[previousVertex * 3 + 2]!,
      );
      measuredMaximumStep = Math.max(measuredMaximumStep, rise);
      expect(rise).toBeLessThanOrEqual(run * maximumRiseRatio + 0.000_1);
    }
  }

  expect(geometry.maximumRearStep).toBeCloseTo(measuredMaximumStep, 5);
}

describe("planned rear escarpment ribbon", () => {
  it("is deterministic and keeps geometry invariant across seasons", () => {
    const plans = KINGDOM_SEASONS.map((season) => createWorldPlan(createDemoKingdom(season)));
    const first = buildPlannedEscarpmentGeometry(plans[0]!, "low");
    const repeated = buildPlannedEscarpmentGeometry(plans[0]!, "low");
    expect(values(repeated.positions)).toEqual(values(first.positions));
    expect(values(repeated.indices)).toEqual(values(first.indices));
    expect(values(repeated.materialZones)).toEqual(values(first.materialZones));

    for (const plan of plans.slice(1)) {
      const seasonal = buildPlannedEscarpmentGeometry(plan, "low");
      expect(values(seasonal.positions)).toEqual(values(first.positions));
      expect(values(seasonal.indices)).toEqual(values(first.indices));
      expect(values(seasonal.materialZones)).toEqual(values(first.materialZones));
      expect(seasonal.notch).toEqual(first.notch);
    }
  });

  it("forms one connected 65–75% width wall with a jagged crest", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const geometry = buildPlannedEscarpmentGeometry(plan, "high");
    const ratio = geometry.wallWidth / plan.topology.envelope.width;
    expect(ratio).toBeGreaterThanOrEqual(0.65);
    expect(ratio).toBeLessThanOrEqual(0.75);
    expect(geometry.crest).toHaveLength(geometry.columns + 1);

    const crestXs = geometry.crest.map((point) => point.x);
    const crestYs = geometry.crest.map((point) => point.y);
    expect(Math.max(...crestXs) - Math.min(...crestXs)).toBeCloseTo(geometry.wallWidth, 4);
    expect(Math.max(...crestYs) - Math.min(...crestYs)).toBeGreaterThan(8);
    for (let index = 1; index < crestXs.length; index += 1) {
      expect(crestXs[index]!).toBeGreaterThan(crestXs[index - 1]!);
      expect(crestXs[index]! - crestXs[index - 1]!).toBeCloseTo(
        geometry.wallWidth / geometry.columns,
        4,
      );
    }
  });

  it("cuts a narrow headwater notch into the crest", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const geometry = buildPlannedEscarpmentGeometry(plan, "high");
    expect(geometry.notch.width / geometry.wallWidth).toBeLessThan(0.09);
    expect(geometry.notch.depth).toBeGreaterThanOrEqual(8.5);

    const nearestIndex = geometry.crest.reduce(
      (bestIndex, point, index) =>
        Math.abs(point.x - geometry.notch.centerX) <
        Math.abs(geometry.crest[bestIndex]!.x - geometry.notch.centerX)
          ? index
          : bestIndex,
      0,
    );
    const shoulderOffset = Math.max(
      2,
      Math.round((geometry.notch.width / geometry.wallWidth) * geometry.columns * 0.9),
    );
    const leftShoulder = geometry.crest[Math.max(0, nearestIndex - shoulderOffset)]!;
    const rightShoulder =
      geometry.crest[Math.min(geometry.columns, nearestIndex + shoulderOffset)]!;
    expect(geometry.crest[nearestIndex]!.y).toBeLessThan(
      (leftShoulder.y + rightShoulder.y) / 2 - 2,
    );
  });

  it("contains 4–6 ledge bands plus a shallow grassy shelf within budget", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const geometry = buildPlannedEscarpmentGeometry(plan, "high");
    expect(geometry.bandCount).toBeGreaterThanOrEqual(4);
    expect(geometry.bandCount).toBeLessThanOrEqual(6);
    expect(new Set(values(geometry.materialZones))).toEqual(new Set([0, 1, 2]));
    expect(geometry.shelfDepth).toBeGreaterThan(plan.topology.envelope.depth * 0.03);
    expect(geometry.shelfDepth).toBeLessThan(plan.topology.envelope.depth * 0.045);
    expect(geometry.rearConnectionDepth).toBeGreaterThanOrEqual(plan.topology.envelope.depth * 0.1);
    expect(geometry.rearConnectionDepth).toBeLessThanOrEqual(plan.topology.envelope.depth * 0.14);
    expect(geometry.maximumRearSlopeDegrees).toBeLessThan(60);
    expect(geometry.maximumRearStep).toBeLessThan(5);
    expect(geometry.shelfTriangleCount).toBe(geometry.columns * 2);
    expect(geometry.rearRows).toBe(12);
    expect(geometry.rearTriangleCount).toBe(geometry.columns * geometry.rearRows * 2);
    expect(geometry.endCapTriangleCount).toBeGreaterThan(0);
    expect(geometry.triangleCount).toBe(
      geometry.faceTriangleCount +
        geometry.shelfTriangleCount +
        geometry.rearTriangleCount +
        geometry.endCapTriangleCount,
    );
    expect(geometry.triangleCount).toBeLessThan(6_500);
  });

  it("uses eight rear rows at low quality and twelve at high quality", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const low = buildPlannedEscarpmentGeometry(plan, "low");
    const high = buildPlannedEscarpmentGeometry(plan, "high");
    expect(low.rearRows).toBe(8);
    expect(high.rearRows).toBe(12);
    expect(low.rearTriangleCount).toBe(low.columns * low.rearRows * 2);
    expect(high.rearTriangleCount).toBe(high.columns * high.rearRows * 2);
    expect(low.maximumRearSlopeDegrees).toBeLessThan(60);
    expect(high.maximumRearSlopeDegrees).toBeLessThan(60);
    expect(high.maximumRearStep).toBeLessThan(5);

    const faceRows = high.faceTriangleCount / (high.columns * 2) + 1;
    const verticesPerRow = high.columns + 1;
    const rearStart = faceRows * verticesPerRow + verticesPerRow * 2;
    const outerRowStart = rearStart + high.rearRows * verticesPerRow;
    for (let column = 0; column <= high.columns; column += 1) {
      const vertex = outerRowStart + column;
      const x = high.positions[vertex * 3]!;
      const y = high.positions[vertex * 3 + 1]!;
      const z = high.positions[vertex * 3 + 2]!;
      expect(y).toBeCloseTo(samplePlannedTerrainHeight(plan, x, z) + 0.055, 5);
    }
  });

  it("constructs slope-bounded supported rear profiles across archetypes and scale tiers", () => {
    const archetypes = [
      ["source", "source-forge"],
      ["test", "warden-reach"],
      ["docs", "archive-domain"],
      ["config", "observatory-frontier"],
      ["asset", "garden-realm"],
      ["other", "crossroads"],
    ] as const;
    const scaleTiers = [
      [48, "compact"],
      [120, "established"],
      [900, "expansive"],
      [8_000, "vast"],
    ] as const;
    const seedIndices = [0, 17] as const;

    for (const [category, archetype] of archetypes) {
      for (const [files, scaleTier] of scaleTiers) {
        for (const seedIndex of seedIndices) {
          const plan = createWorldPlan(matrixWorld(category, files, seedIndex));
          const caseLabel = `${category}:${files}:${seedIndex}`;
          expect(plan.identity.dominantCategory, caseLabel).toBe(category);
          expect(plan.identity.archetype, caseLabel).toBe(archetype);
          expect(plan.identity.scaleTier, caseLabel).toBe(scaleTier);
          expectRearProfileContract(plan, "low", caseLabel);
          expectRearProfileContract(plan, "high", caseLabel);
        }
      }
    }
  }, 30_000);

  it("tapers both wall ends into terrain and closes their visible volume", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const geometry = buildPlannedEscarpmentGeometry(plan, "high");
    const endCrests = [geometry.crest[0]!, geometry.crest.at(-1)!];
    for (const crest of endCrests) {
      const terrainHeight = samplePlannedTerrainHeight(plan, crest.x, crest.z);
      expect(crest.y - terrainHeight).toBeLessThan(0.5);
    }
    expect(geometry.endCapTriangleCount).toBeGreaterThanOrEqual(12);
  });

  it("keeps every index and vertex finite and inside the rear envelope", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const geometry = buildPlannedEscarpmentGeometry(plan, "high");
    expect(values(geometry.positions).every(Number.isFinite)).toBe(true);
    expect(values(geometry.indices).every(Number.isFinite)).toBe(true);
    expect(geometry.indices.length % 3).toBe(0);
    expect(Math.max(...geometry.indices)).toBeLessThan(geometry.vertexCount);
    expect(geometry.materialZones).toHaveLength(geometry.vertexCount);

    const { envelope } = plan.topology;
    for (let vertex = 0; vertex < geometry.vertexCount; vertex += 1) {
      const x = geometry.positions[vertex * 3]!;
      const y = geometry.positions[vertex * 3 + 1]!;
      const z = geometry.positions[vertex * 3 + 2]!;
      expect(x).toBeGreaterThanOrEqual(envelope.minX);
      expect(x).toBeLessThanOrEqual(envelope.maxX);
      expect(y).toBeGreaterThan(-10);
      expect(y).toBeLessThan(100);
      expect(z).toBeGreaterThanOrEqual(envelope.minZ);
      expect(z).toBeLessThan(envelope.minZ + envelope.depth * 0.31);
    }
  });

  it("winds the stone face toward the camera and the shelf upward", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const geometry = buildPlannedEscarpmentGeometry(plan, "high");
    const faceIndexCount = geometry.faceTriangleCount * 3;
    const horizontalEndIndex =
      (geometry.faceTriangleCount + geometry.shelfTriangleCount + geometry.rearTriangleCount) * 3;
    for (let index = 0; index < geometry.indices.length; index += 3) {
      const normal = triangleNormal(
        geometry.positions,
        geometry.indices[index]!,
        geometry.indices[index + 1]!,
        geometry.indices[index + 2]!,
      );
      expect(normal.length).toBeGreaterThan(0.000_001);
      if (index < faceIndexCount) expect(normal.z).toBeGreaterThanOrEqual(-0.000_01);
      else if (index < horizontalEndIndex) expect(normal.y).toBeGreaterThan(0);
      else expect(Math.abs(normal.x)).toBeGreaterThan(0.000_001);
    }
  });
});
