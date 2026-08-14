import { describe, expect, it } from "vitest";

import {
  createPlannedWalkWildlifeLodGeometry,
  PLANNED_WALK_WILDLIFE_LOD_CONTRACT,
  PLANNED_WALK_WILDLIFE_LOD_SCHEMA,
  type PlannedWalkWildlifeLodRole,
} from "./planned-wildlife-lod";

const ROLES: ReadonlyArray<PlannedWalkWildlifeLodRole> = ["deer", "fox", "stag"];

function triangles(role: PlannedWalkWildlifeLodRole): number {
  return PLANNED_WALK_WILDLIFE_LOD_CONTRACT.trianglesPerFarInstanceByRole[role];
}

describe("planned Walk wildlife LOD", () => {
  it("pins a bounded one-draw role contract while reserving the animated near actor", () => {
    expect(PLANNED_WALK_WILDLIFE_LOD_SCHEMA).toBe("planned-walk-wildlife-lod/v1");
    expect(PLANNED_WALK_WILDLIFE_LOD_CONTRACT).toMatchObject({
      maximumFarDrawCallsPerPopulatedRole: 1,
      maximumAnimatedSourcePrimitives: 6,
      trianglesPerFarInstanceByRole: {
        deer: 196,
        fox: 216,
        stag: 292,
      },
    });
  });

  it.each(ROLES)("creates a deterministic normalized %s silhouette with vertex accents", (role) => {
    const first = createPlannedWalkWildlifeLodGeometry(role);
    const repeated = createPlannedWalkWildlifeLodGeometry(role);
    const firstPositions = Array.from(first.getAttribute("position").array);
    const repeatedPositions = Array.from(repeated.getAttribute("position").array);
    const colors = first.getAttribute("color");

    expect((first.index?.count ?? first.getAttribute("position").count) / 3).toBe(triangles(role));
    expect(repeatedPositions).toEqual(firstPositions);
    expect(colors.count).toBe(first.getAttribute("position").count);
    expect(new Set(Array.from(colors.array)).size).toBeGreaterThan(1);
    expect(first.boundingBox?.min.y).toBeCloseTo(0, 6);
    expect(first.boundingBox?.max.y).toBeCloseTo(1, 6);
    expect(first.boundingSphere?.radius).toBeGreaterThan(0.45);
    expect(first.boundingSphere?.radius).toBeLessThan(1.1);

    first.dispose();
    repeated.dispose();
  });
});
