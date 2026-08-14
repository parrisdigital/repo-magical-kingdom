import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { buildPlannedTerrainGeometry } from "./planned-terrain-model";
import { PLANNED_TERRAIN_QUALITY_OPTIONS } from "./planned-terrain";

describe("planned terrain quality budgets", () => {
  const plan = createWorldPlan(createDemoKingdom());

  for (const quality of ["low", "high"] as const) {
    it(`keeps ${quality} surface tessellation inside its explicit triangle ceiling`, () => {
      const options = PLANNED_TERRAIN_QUALITY_OPTIONS[quality];
      const geometry = buildPlannedTerrainGeometry(plan, options);
      const rectangularGridCeiling = options.segmentsX! * options.segmentsZ! * 2;

      expect(geometry.surface.triangleCount).toBeGreaterThan(0);
      expect(geometry.surface.triangleCount).toBeLessThanOrEqual(rectangularGridCeiling);
      expect(geometry.surface.vertexCount).toBeLessThanOrEqual(
        (options.segmentsX! + 1) * (options.segmentsZ! + 1),
      );
      expect(rectangularGridCeiling).toBeLessThanOrEqual(48_000);
    });
  }

  it("keeps low quality meaningfully lighter than the desktop surface", () => {
    const low = buildPlannedTerrainGeometry(plan, PLANNED_TERRAIN_QUALITY_OPTIONS.low);
    const high = buildPlannedTerrainGeometry(plan, PLANNED_TERRAIN_QUALITY_OPTIONS.high);

    expect(low.surface.triangleCount).toBeLessThan(high.surface.triangleCount * 0.5);
  });
});
