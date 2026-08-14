import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  createPlannedTreeLodBatches,
  createPlannedTreeLodGeometry,
  createPlannedWalkTreeLodBatches,
  disposePlannedTreeLodGeometry,
  PLANNED_TREE_LOD_CONTRACT,
  plannedTreeLodMode,
  plannedTreeLodPaletteFor,
  selectPlannedWalkTreeHybrid,
  type PlannedWalkTreeDetailCandidate,
  type PlannedTreeLodInstance,
  type PlannedTreeLodPalette,
} from "./planned-tree-lod";

const PALETTES = ["broadleaf", "flowering", "pine", "winter"] as const;

describe("planned overview tree LOD", () => {
  it("keeps deterministic geometry far below the overview triangle ceiling", () => {
    for (const palette of PALETTES) {
      const first = createPlannedTreeLodGeometry(palette);
      const second = createPlannedTreeLodGeometry(palette);
      expect(first.trianglesPerInstance).toBeLessThanOrEqual(
        PLANNED_TREE_LOD_CONTRACT.maximumOverviewTrianglesPerInstance,
      );
      expect(first.trianglesPerInstance).toBe(
        PLANNED_TREE_LOD_CONTRACT.overviewTrianglesPerInstanceByPalette[palette],
      );
      expect(second.trianglesPerInstance).toBe(first.trianglesPerInstance);
      expect(Array.from(second.trunk.getAttribute("position").array)).toEqual(
        Array.from(first.trunk.getAttribute("position").array),
      );
      expect(Array.from(second.canopy.getAttribute("position").array)).toEqual(
        Array.from(first.canopy.getAttribute("position").array),
      );
      expect(first.trunk.boundingBox).not.toBeNull();
      expect(first.trunk.boundingBox?.min.y).toBeCloseTo(0, 5);
      expect(first.canopy.boundingBox).not.toBeNull();
      expect(first.canopy.boundingBox?.min.y).toBeGreaterThan(1);
      expect(Math.max(first.trunk.boundingBox!.max.y, first.canopy.boundingBox!.max.y)).toBeCloseTo(
        PLANNED_TREE_LOD_CONTRACT.targetHeight,
        5,
      );
      disposePlannedTreeLodGeometry(first);
      disposePlannedTreeLodGeometry(second);
    }
  });

  it("keeps overview geometry measurably lighter than the shipped near-camera trees", () => {
    const lightestShippedTreeTriangles = 3_505;
    for (const palette of PALETTES) {
      expect(PLANNED_TREE_LOD_CONTRACT.overviewTrianglesPerInstanceByPalette[palette]).toBeLessThan(
        lightestShippedTreeTriangles / 10,
      );
    }
  });

  it("batches any repository-sized tree set into two draws per active palette", () => {
    const instances: PlannedTreeLodInstance[] = Array.from({ length: 225 }, (_, index) => ({
      id: `tree-${String(224 - index).padStart(3, "0")}`,
      palette: PALETTES[index % PALETTES.length]!,
      matrix: new THREE.Matrix4().makeTranslation(index, 0, -index),
    }));
    const batches = createPlannedTreeLodBatches(instances);

    expect(batches.map((batch) => batch.palette)).toEqual([...PALETTES].sort());
    expect(batches.reduce((total, batch) => total + batch.matrices.length, 0)).toBe(225);
    expect(
      batches.length * PLANNED_TREE_LOD_CONTRACT.overviewDrawCallsPerPalette,
    ).toBeLessThanOrEqual(
      PLANNED_TREE_LOD_CONTRACT.maximumOverviewPaletteCount *
        PLANNED_TREE_LOD_CONTRACT.overviewDrawCallsPerPalette,
    );
    for (const batch of batches) {
      const translations = batch.matrices.map(
        (matrix) => new THREE.Vector3().setFromMatrixPosition(matrix).x,
      );
      expect(translations).toEqual([...translations].sort((first, second) => second - first));
    }
  });

  it("uses a bounded near-detail hybrid for Walk while Orbit uses the overview LOD", () => {
    expect(plannedTreeLodMode("orbit")).toBe("overview-lod");
    expect(plannedTreeLodMode("walk")).toBe("walk-hybrid");
  });

  it("combines Walk far trees into two silhouette families without losing palette identity", () => {
    const instances: PlannedTreeLodInstance[] = PALETTES.map((palette, index) => ({
      id: `tree-${index}`,
      palette,
      matrix: new THREE.Matrix4().makeTranslation(index * 2, 0, index),
    }));
    const batches = createPlannedWalkTreeLodBatches(instances);

    expect(batches.map((batch) => batch.family)).toEqual(["conifer", "deciduous"]);
    expect(batches.flatMap((batch) => batch.palettes).sort()).toEqual([...PALETTES].sort());
    expect(batches.reduce((total, batch) => total + batch.matrices.length, 0)).toBe(
      instances.length,
    );
    expect(batches.length).toBeLessThanOrEqual(PLANNED_TREE_LOD_CONTRACT.maximumWalkLodFamilyCount);
    expect(
      batches.length * PLANNED_TREE_LOD_CONTRACT.walkLodDrawCallsPerFamily,
    ).toBeLessThanOrEqual(4);
  });

  it("keeps only the nearest eligible shipped tree family inside the Walk resource cap", () => {
    const candidate = (
      id: string,
      x: number,
      detailKey: string,
      detailTriangles: number,
      detailSourcePrimitives = 2,
    ): PlannedWalkTreeDetailCandidate => ({
      id,
      palette: "broadleaf",
      matrix: new THREE.Matrix4().makeTranslation(x, 0, 0),
      detailKey,
      detailSourcePrimitives,
      detailTriangles,
      lodTriangles: 348,
    });
    const instances = [
      candidate("near-a", 4, "common-a.glb", 6_200),
      candidate("near-b", 8, "common-a.glb", 6_200),
      candidate("other-family", 6, "common-b.glb", 3_500),
      candidate("too-many-draws", 2, "three-primitive.glb", 100, 3),
      candidate("outside", PLANNED_TREE_LOD_CONTRACT.walkDetailRadius + 1, "common-a.glb", 100),
    ];
    const hybrid = selectPlannedWalkTreeHybrid(instances, { x: 0, z: 0 });

    expect(hybrid.detail.map((instance) => instance.id)).toEqual(["near-a", "near-b"]);
    expect(hybrid.far.map((instance) => instance.id).sort()).toEqual([
      "other-family",
      "outside",
      "too-many-draws",
    ]);
    expect(hybrid.detailSourcePrimitives).toBe(2);
    expect(hybrid.detailTriangleDelta).toBe(2 * (6_200 - 348));
    expect(hybrid.detailTriangleDelta).toBeLessThanOrEqual(
      PLANNED_TREE_LOD_CONTRACT.maximumWalkDetailTriangleDelta,
    );
    expect(hybrid.detail.length + hybrid.far.length).toBe(instances.length);
    expect(new Set([...hybrid.detail, ...hybrid.far].map((instance) => instance.id)).size).toBe(
      instances.length,
    );
  });

  it("preserves season and grove identity in the overview palette", () => {
    expect(plannedTreeLodPaletteFor("spring", { paletteRole: "flowering", ancient: false })).toBe(
      "flowering",
    );
    expect(plannedTreeLodPaletteFor("summer", { paletteRole: "pine", ancient: false })).toBe(
      "pine",
    );
    expect(plannedTreeLodPaletteFor("autumn", { paletteRole: "twisted", ancient: true })).toBe(
      "flowering",
    );
    expect(plannedTreeLodPaletteFor("winter", { paletteRole: "broadleaf", ancient: false })).toBe(
      "winter",
    );
  });

  it("keeps the exported contract red-capable when the ceiling is crossed", () => {
    const assertWithinContract = (triangles: number) => {
      if (triangles > PLANNED_TREE_LOD_CONTRACT.maximumOverviewTrianglesPerInstance) {
        throw new RangeError(`Overview tree LOD exceeds ${triangles} triangles.`);
      }
    };
    expect(() =>
      assertWithinContract(PLANNED_TREE_LOD_CONTRACT.maximumOverviewTrianglesPerInstance + 1),
    ).toThrow(RangeError);
  });
});

it("keeps the palette type exhaustive", () => {
  const palettes: ReadonlyArray<PlannedTreeLodPalette> = PALETTES;
  expect(palettes).toHaveLength(PLANNED_TREE_LOD_CONTRACT.maximumOverviewPaletteCount);
});
