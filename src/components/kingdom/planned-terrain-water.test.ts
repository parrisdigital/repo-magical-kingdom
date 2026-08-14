import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { buildPlannedWaterGeometry } from "./planned-terrain-model";
import {
  applyWaterDetailShader,
  createPlannedWaterSurfaceAttributes,
  PLANNED_WATER_MATERIAL_CONTRACT,
  PLANNED_WATER_MATERIAL_SIDE,
  PLANNED_WATER_PROGRAM_CACHE_KEY,
  resolvePlannedWaterAnimationTime,
  updatePlannedWaterAnimationTime,
  type WaterShaderUniforms,
} from "./planned-terrain";

describe("planned watershed presentation", () => {
  it("authors deterministic, bounded edge/region/flow attributes for one water mesh", () => {
    const plan = createWorldPlan(createDemoKingdom("spring"));
    const water = buildPlannedWaterGeometry(plan, {
      courseSegments: 28,
      courseCrossSegments: 5,
    });
    const first = createPlannedWaterSurfaceAttributes(water);
    const repeated = createPlannedWaterSurfaceAttributes(water);

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

    // Regression: the old lake was one center vertex joined directly to the
    // shoreline, so every non-center lake vertex had edge=1. That made the
    // depth field interpolate as a handful of visible triangular wedges.
    // A tessellated lake must carry several sampled interior shore distances.
    const lakeEdges = Array.from(first.edge.slice(first.firstLakeIndex));
    const interiorLakeEdges = lakeEdges.slice(1, -water.ranges.lakePerimeterSegments);
    const distinctInteriorEdges = new Set(
      interiorLakeEdges
        .filter((value) => value > 0.001 && value < 0.999)
        .map((value) => value.toFixed(4)),
    );
    expect(water.ranges.lakeRingCount).toBeGreaterThanOrEqual(5);
    expect(interiorLakeEdges.length).toBeGreaterThan(water.ranges.lakePerimeterSegments * 3);
    expect(distinctInteriorEdges.size).toBeGreaterThan(12);
    expect(lakeEdges.slice(-water.ranges.lakePerimeterSegments)).toEqual(
      Array(water.ranges.lakePerimeterSegments).fill(1),
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

  it("updates one stable time uniform and freezes it exactly for reduced motion", () => {
    const time = { value: 4.5 };

    expect(updatePlannedWaterAnimationTime(time, 12.75, false)).toBe(time);
    expect(time.value).toBe(12.75);
    expect(updatePlannedWaterAnimationTime(time, 99, true)).toBe(time);
    expect(time.value).toBe(0);
  });

  it("keeps the watershed in one opaque depth-writing material contract", () => {
    expect(PLANNED_WATER_MATERIAL_CONTRACT).toEqual({
      transparent: false,
      opacity: 1,
      depthWrite: true,
      side: THREE.BackSide,
    });
    expect(PLANNED_WATER_PROGRAM_CACHE_KEY).toBe("planned-watershed-directional-water-v5");
  });

  it("injects distinct non-grid lake waves and river flow with physical highlights", () => {
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
        "#include <color_fragment>",
        "#include <normal_fragment_maps>",
        "#include <emissivemap_fragment>",
        "#include <opaque_fragment>",
      ].join("\n"),
    } as unknown as THREE.WebGLProgramParametersWithUniforms;

    applyWaterDetailShader(shader, uniforms);

    expect(shader.uniforms.uKingdomWaterTime).toBe(uniforms.time);
    expect(shader.uniforms.uKingdomWaterDeepColor).toBe(uniforms.deepColor);
    expect(shader.vertexShader).toContain("kingdomLakeWave");
    expect(shader.vertexShader).toContain("kingdomRiverWave");
    expect(shader.fragmentShader).toContain("kingdomWaterDepth");
    expect(shader.fragmentShader).toContain("kingdomLakeWaveSlope");
    expect(shader.fragmentShader).toContain("kingdomRiverFlowSlope");
    expect(shader.fragmentShader).toContain("kingdomFresnel");
    expect(shader.fragmentShader).toContain("kingdomBroadReflectionModulation");
    expect(shader.fragmentShader).toContain("kingdomSkyGradient");
    expect(shader.fragmentShader).toContain("kingdomSunGlint");
    expect(shader.fragmentShader).toContain("kingdomBrokenFoam");
    expect(shader.fragmentShader).toContain("float interruption");
    expect(shader.fragmentShader).toContain("kingdomFoam * 0.58");
    expect(shader.fragmentShader).toContain(
      "kingdomFresnel * kingdomBroadReflectionModulation * 0.28",
    );
    expect(shader.fragmentShader).toContain("diffuseColor.a = 1.0");
    expect(shader.fragmentShader).not.toContain("discard");
    expect(shader.fragmentShader).not.toContain("floor(");
    expect(shader.fragmentShader).not.toContain("kingdomWaterNoise");
    expect(shader.fragmentShader).not.toContain("kingdomLakeRippleA");
    expect(shader.fragmentShader).not.toContain("kingdomRiverThread");
    expect(shader.fragmentShader).not.toContain("kingdomFresnel * 0.54");

    const slopeDeclaration = shader.fragmentShader.indexOf("vec2 kingdomWaterSlope =");
    const colorUse = shader.fragmentShader.indexOf("vec3 kingdomWaterDetailWorldNormal");
    const normalUse = shader.fragmentShader.indexOf("vec3 kingdomWaterDetailNormalView");
    expect(slopeDeclaration).toBeGreaterThan(-1);
    expect(slopeDeclaration).toBeLessThan(colorUse);
    expect(slopeDeclaration).toBeLessThan(normalUse);
    expect(shader.fragmentShader.match(/vec2 kingdomWaterSlope\s*=/g)).toHaveLength(1);
  });

  it("produces deterministic shader source and uniform bindings", () => {
    const createShader = () =>
      ({
        uniforms: {},
        vertexShader: "#include <common>\n#include <begin_vertex>\n#include <worldpos_vertex>",
        fragmentShader: [
          "#include <common>",
          "#include <color_fragment>",
          "#include <normal_fragment_maps>",
          "#include <emissivemap_fragment>",
          "#include <opaque_fragment>",
        ].join("\n"),
      }) as unknown as THREE.WebGLProgramParametersWithUniforms;
    const uniforms: WaterShaderUniforms = {
      time: { value: 0 },
      deepColor: { value: new THREE.Color("#459fb5") },
      shallowColor: { value: new THREE.Color("#b7e5e6") },
      foamColor: { value: new THREE.Color("#f5fbef") },
      skyColor: { value: new THREE.Color("#bcd9e8") },
    };
    const first = createShader();
    const repeated = createShader();

    applyWaterDetailShader(first, uniforms);
    applyWaterDetailShader(repeated, uniforms);

    expect(repeated.vertexShader).toBe(first.vertexShader);
    expect(repeated.fragmentShader).toBe(first.fragmentShader);
    expect(repeated.uniforms).toEqual(first.uniforms);
  });
});
