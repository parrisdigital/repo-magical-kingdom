import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { buildPlannedWaterGeometry } from "./planned-terrain-model";
import {
  applyWaterDetailShader,
  createPlannedWaterSurfaceAttributes,
  PLANNED_WATER_MATERIAL_SIDE,
  resolvePlannedWaterAnimationTime,
  type WaterShaderUniforms,
} from "./planned-terrain";

describe("planned watershed presentation", () => {
  it("authors deterministic, bounded edge/region/flow attributes for one water mesh", () => {
    const plan = createWorldPlan(createDemoKingdom("spring"));
    const water = buildPlannedWaterGeometry(plan, {
      courseSegments: 28,
      courseCrossSegments: 5,
      lakeSegments: 36,
    });
    const first = createPlannedWaterSurfaceAttributes(water, 5);
    const repeated = createPlannedWaterSurfaceAttributes(water, 5);

    expect(Array.from(repeated.edge)).toEqual(Array.from(first.edge));
    expect(Array.from(repeated.region)).toEqual(Array.from(first.region));
    expect(Array.from(repeated.progress)).toEqual(Array.from(first.progress));
    expect(first.edge).toHaveLength(water.vertexCount);
    expect(first.region).toHaveLength(water.vertexCount);
    expect(first.progress).toHaveLength(water.vertexCount);
    expect(first.firstLakeIndex).toBeGreaterThan(0);
    expect(first.firstLakeIndex).toBeLessThan(water.vertexCount);

    for (const values of [first.edge, first.region, first.progress]) {
      expect(Array.from(values).every(Number.isFinite)).toBe(true);
      expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...values)).toBeLessThanOrEqual(1);
    }

    expect(Array.from(first.region.slice(0, first.firstLakeIndex))).toEqual(
      Array(first.firstLakeIndex).fill(0),
    );
    expect(Array.from(first.region.slice(first.firstLakeIndex))).toEqual(
      Array(water.vertexCount - first.firstLakeIndex).fill(1),
    );
    expect(first.edge[first.firstLakeIndex]).toBe(0);
    expect(Array.from(first.edge.slice(first.firstLakeIndex + 1))).toEqual(
      Array(water.vertexCount - first.firstLakeIndex - 1).fill(1),
    );

    const rowWidth = 6;
    for (let rowStart = 0; rowStart < first.firstLakeIndex; rowStart += rowWidth) {
      expect(first.edge[rowStart]).toBe(1);
      expect(first.edge[rowStart + rowWidth - 1]).toBe(1);
      expect(Math.min(...first.edge.slice(rowStart, rowStart + rowWidth))).toBeCloseTo(0.2, 5);
    }
  });

  it("renders the authored downward winding from an above-terrain camera", () => {
    const plan = createWorldPlan(createDemoKingdom("spring"));
    const water = buildPlannedWaterGeometry(plan, {
      courseSegments: 20,
      courseCrossSegments: 5,
      lakeSegments: 28,
    });
    let minimumMagnitude = Number.POSITIVE_INFINITY;

    for (let offset = 0; offset < water.indices.length; offset += 3) {
      const first = (water.indices[offset] ?? 0) * 3;
      const second = (water.indices[offset + 1] ?? 0) * 3;
      const third = (water.indices[offset + 2] ?? 0) * 3;
      const firstX = water.positions[first] ?? 0;
      const firstZ = water.positions[first + 2] ?? 0;
      const abX = (water.positions[second] ?? 0) - firstX;
      const abZ = (water.positions[second + 2] ?? 0) - firstZ;
      const acX = (water.positions[third] ?? 0) - firstX;
      const acZ = (water.positions[third + 2] ?? 0) - firstZ;
      const normalY = abZ * acX - abX * acZ;
      minimumMagnitude = Math.min(minimumMagnitude, Math.abs(normalY));
      expect(normalY).toBeLessThan(0);
    }

    expect(minimumMagnitude).toBeGreaterThan(0.000_01);
    expect(PLANNED_WATER_MATERIAL_SIDE).toBe(THREE.BackSide);
    expect(PLANNED_WATER_MATERIAL_SIDE).not.toBe(THREE.DoubleSide);
  });

  it("freezes the shader phase at zero for reduced motion", () => {
    expect(resolvePlannedWaterAnimationTime(17.25, false)).toBe(17.25);
    expect(resolvePlannedWaterAnimationTime(17.25, true)).toBe(0);
    expect(resolvePlannedWaterAnimationTime(-2, false)).toBe(0);
    expect(resolvePlannedWaterAnimationTime(Number.NaN, false)).toBe(0);
  });

  it("injects depth, directional flow, fragment ripples, Fresnel, and inline foam", () => {
    const uniforms: WaterShaderUniforms = {
      time: { value: 0 },
      deepColor: { value: new THREE.Color("#459fb5") },
      shallowColor: { value: new THREE.Color("#b7e5e6") },
      foamColor: { value: new THREE.Color("#f5fbef") },
      skyColor: { value: new THREE.Color("#bcd9e8") },
    };
    const shader = {
      uniforms: {},
      vertexShader: [
        "#include <common>",
        "#include <begin_vertex>",
        "#include <worldpos_vertex>",
      ].join("\n"),
      fragmentShader: [
        "#include <common>",
        "#include <normal_fragment_maps>",
        "#include <color_fragment>",
        "#include <emissivemap_fragment>",
        "#include <opaque_fragment>",
      ].join("\n"),
    } as unknown as THREE.WebGLProgramParametersWithUniforms;

    applyWaterDetailShader(shader, uniforms);

    expect(shader.uniforms.uKingdomWaterTime).toBe(uniforms.time);
    expect(shader.uniforms.uKingdomWaterDeepColor).toBe(uniforms.deepColor);
    expect(shader.vertexShader).toContain("kingdomWaterProgress * 74.0");
    expect(shader.fragmentShader).toContain("kingdomWaterDepth");
    expect(shader.fragmentShader).toContain("kingdomRiverThread");
    expect(shader.fragmentShader).toContain("kingdomWaterRippleSlope");
    expect(shader.fragmentShader).toContain("kingdomFresnel");
    expect(shader.fragmentShader).toContain("kingdomFoamThreshold");
    expect(shader.fragmentShader).toContain("diffuseColor.a = 1.0");
    expect(shader.fragmentShader).not.toContain("discard");
  });
});
