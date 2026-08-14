import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import type { PlannedWalkDetailKind } from "./planned-walk-detail-model";

import { createPlannedWalkDetailGeometry } from "./planned-walk-detail";

const EXPECTED_TRIANGLES: Readonly<Record<PlannedWalkDetailKind, number>> = {
  grass: 24,
  flower: 78,
  reed: 24,
  stone: 144,
};

describe("planned Walk-detail geometry", () => {
  it("constructs every bounded high and low source geometry at the frozen triangle cost", () => {
    for (const quality of ["low", "high"] as const) {
      for (const kind of Object.keys(EXPECTED_TRIANGLES) as PlannedWalkDetailKind[]) {
        const geometry = createPlannedWalkDetailGeometry(kind, quality);
        const triangles = geometry.index
          ? geometry.index.count / 3
          : geometry.getAttribute("position").count / 3;

        expect(triangles, `${quality}:${kind}`).toBe(EXPECTED_TRIANGLES[kind]);
        expect(geometry.boundingSphere, `${quality}:${kind}`).not.toBeNull();
        expect(Number.isFinite(geometry.boundingSphere?.radius), `${quality}:${kind}`).toBe(true);
        if (kind === "flower" || (quality === "high" && (kind === "grass" || kind === "reed"))) {
          expect(geometry.getAttribute("color").count).toBe(
            geometry.getAttribute("position").count,
          );
        }
        geometry.computeBoundingBox();
        if (kind === "grass") expect(geometry.boundingBox!.max.y).toBeLessThanOrEqual(0.58);
        if (kind === "reed") expect(geometry.boundingBox!.max.y).toBeLessThanOrEqual(1.28);
        geometry.dispose();
      }
    }
  });

  it("widens high-quality tufts into twelve-blade organic crowns without moving instances", () => {
    const highGrass = createPlannedWalkDetailGeometry("grass", "high");
    const lowGrass = createPlannedWalkDetailGeometry("grass", "low");
    const highReed = createPlannedWalkDetailGeometry("reed", "high");

    highGrass.computeBoundingBox();
    lowGrass.computeBoundingBox();
    highReed.computeBoundingBox();

    expect(highGrass.getAttribute("position").count).toBe(12 * 4);
    expect(highReed.getAttribute("position").count).toBe(12 * 4);
    expect(highGrass.boundingBox!.max.x - highGrass.boundingBox!.min.x).toBeGreaterThan(1);
    expect(highGrass.boundingBox!.max.z - highGrass.boundingBox!.min.z).toBeGreaterThan(1);
    expect(highGrass.boundingBox!.max.y).toBeLessThan(0.48);
    expect(highGrass.boundingBox!.max.x - highGrass.boundingBox!.min.x).toBeGreaterThan(
      lowGrass.boundingBox!.max.x - lowGrass.boundingBox!.min.x,
    );
    expect(highReed.boundingBox!.max.y).toBeGreaterThan(1.15);

    for (const geometry of [highGrass, highReed]) {
      const color = geometry.getAttribute("color");
      const wind = geometry.getAttribute("walkDetailWindWeight");
      const colorValues = Array.from(color.array as ArrayLike<number>);
      const windValues = Array.from(wind.array as ArrayLike<number>);
      expect(color.count).toBe(geometry.getAttribute("position").count);
      expect(wind.count).toBe(geometry.getAttribute("position").count);
      expect(Math.min(...colorValues)).toBeGreaterThan(0);
      expect(Math.max(...colorValues) - Math.min(...colorValues)).toBeGreaterThan(0.45);
      expect(Math.min(...windValues)).toBe(0);
      expect(Math.max(...windValues)).toBe(1);
    }

    highGrass.dispose();
    lowGrass.dispose();
    highReed.dispose();
  });

  it("uses upright high-quality flower heads, leaves, and finite authored colors", () => {
    const flower = createPlannedWalkDetailGeometry("flower", "high");
    flower.computeBoundingBox();

    const color = flower.getAttribute("color");
    const colorValues = Array.from(color.array as ArrayLike<number>);
    expect(color.count).toBe(flower.getAttribute("position").count);
    expect(colorValues.every(Number.isFinite)).toBe(true);
    expect(flower.boundingBox!.max.y).toBeGreaterThan(0.7);
    expect(flower.boundingBox!.max.y).toBeLessThan(0.82);
    expect(flower.boundingBox!.max.x - flower.boundingBox!.min.x).toBeGreaterThan(0.45);
    expect(flower.boundingBox!.max.z - flower.boundingBox!.min.z).toBeGreaterThan(0.25);

    flower.dispose();
  });

  it("uses a neutral material multiplier with high-quality vertex tint and restrained response", () => {
    const source = readFileSync(new URL("./planned-walk-detail.tsx", import.meta.url), "utf8");

    expect(source).toContain('color: "#ffffff"');
    expect(source).toContain('quality === "high" && (kind === "grass" || kind === "reed")');
    expect(source).toContain('roughness: kind === "flower" ? 0.7');
    expect(source).toContain('dithering: quality === "high" && kind !== "stone"');
    expect(source).not.toContain("color: base");
    expect(source).not.toContain("base.clone().multiplyScalar(0.66)");
    expect(source).toContain(".lerp(new THREE.Color(plan.appearance.atmosphere.sunlight), 0.22)");
  });

  it("trades uniform single blades for bounded four-blade clumps at equal high-detail cost", () => {
    const source = readFileSync(new URL("./planned-walk-detail.tsx", import.meta.url), "utf8");

    expect(source).toContain("grass: 400");
    expect(source).toContain("reed: 65");
    expect(400 * EXPECTED_TRIANGLES.grass).toBe(1_600 * 6);
    expect(65 * EXPECTED_TRIANGLES.reed).toBe(260 * 6);
  });

  it("keeps wind rooted with an authored per-vertex weight and a stable shader cache key", () => {
    const source = readFileSync(new URL("./planned-walk-detail.tsx", import.meta.url), "utf8");

    expect(source).toContain("attribute float walkDetailWindWeight;");
    expect(source).toContain("float walkDetailHeight = walkDetailWindWeight;");
    expect(source).toContain('"repo-walk-detail-wind/v2"');
  });
});
