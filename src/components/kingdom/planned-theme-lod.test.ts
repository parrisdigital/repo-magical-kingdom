import type { BufferGeometry } from "three";
import { describe, expect, it } from "vitest";

import {
  createPlannedEnchantedOrbitGeometry,
  createPlannedThemeTreeLodGeometry,
  disposePlannedEnchantedOrbitGeometry,
  PLANNED_THEME_LOD_CONTRACT,
  plannedThemeLodMode,
  plannedThemeTreeTrianglesPerInstance,
} from "./planned-theme-lod";
import { disposePlannedTreeLodGeometry, type PlannedTreeLodPalette } from "./planned-tree-lod";
import type { PlannedWorldThemeLayer } from "./planned-world-theme-model";

const PALETTES: ReadonlyArray<PlannedTreeLodPalette> = ["broadleaf", "flowering", "pine", "winter"];

function exactPositionBounds(geometry: BufferGeometry): Readonly<{
  minimum: ReadonlyArray<number>;
  maximum: ReadonlyArray<number>;
}> {
  const position = geometry.getAttribute("position");
  const minimum = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const maximum = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let index = 0; index < position.count; index += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value =
        axis === 0
          ? position.getX(index)
          : axis === 1
            ? position.getY(index)
            : position.getZ(index);
      minimum[axis] = Math.min(minimum[axis]!, value);
      maximum[axis] = Math.max(maximum[axis]!, value);
    }
  }
  return { minimum, maximum };
}

function enchantedFixture(): PlannedWorldThemeLayer {
  return {
    schema: "repo-planned-world-theme/v1",
    topologyKey: "theme-fixture",
    worldTheme: "enchanted-forest",
    ancientTreeIds: [],
    mushrooms: [],
    fireflies: [],
    instanceBudget: 4,
    runestones: [
      {
        id: "rune-a",
        position: { x: -3, y: 1, z: 8 },
        rotationY: 0.2,
        scale: 1.1,
        glowPhase: 0.7,
      },
      {
        id: "rune-b",
        position: { x: 6, y: 2, z: -5 },
        rotationY: -0.5,
        scale: 1.4,
        glowPhase: 2.1,
      },
    ],
    rootArches: [
      {
        id: "arch-a",
        start: { x: -4, y: 0, z: -2 },
        end: { x: 3, y: 0.4, z: 1 },
        height: 5,
        radius: 0.42,
      },
      {
        id: "arch-b",
        start: { x: 2, y: 0.2, z: 7 },
        end: { x: 9, y: 0.1, z: 5 },
        height: 4.4,
        radius: 0.36,
      },
    ],
  };
}

describe("planned enchanted Orbit LOD and batching", () => {
  it("uses 108-triangle enchanted broadleaf trees while retaining all palette bounds", () => {
    for (const palette of PALETTES) {
      const valley = createPlannedThemeTreeLodGeometry(palette, "kingdom-valley");
      const enchanted = createPlannedThemeTreeLodGeometry(palette, "enchanted-forest");
      expect(enchanted.trianglesPerInstance).toBe(
        PLANNED_THEME_LOD_CONTRACT.enchantedOrbitTreeTrianglesPerInstanceByPalette[palette],
      );
      expect(enchanted.trianglesPerInstance).toBe(
        plannedThemeTreeTrianglesPerInstance("enchanted-forest", palette),
      );
      expect(valley.trianglesPerInstance).toBe(
        plannedThemeTreeTrianglesPerInstance("kingdom-valley", palette),
      );
      expect(enchanted.trunk.boundingBox).toEqual(valley.trunk.boundingBox);
      for (const [actual, expected] of enchanted.canopy
        .boundingBox!.min.toArray()
        .map(
          (value, index) => [value, valley.canopy.boundingBox!.min.toArray()[index]!] as const,
        )) {
        expect(actual).toBeCloseTo(expected, 5);
      }
      for (const [actual, expected] of enchanted.canopy
        .boundingBox!.max.toArray()
        .map(
          (value, index) => [value, valley.canopy.boundingBox!.max.toArray()[index]!] as const,
        )) {
        expect(actual).toBeCloseTo(expected, 5);
      }
      disposePlannedTreeLodGeometry(valley);
      disposePlannedTreeLodGeometry(enchanted);
    }
  });

  it("builds enchanted deciduous canopies from four irregular low-poly lobes", () => {
    for (const palette of ["broadleaf", "flowering"] as const) {
      const geometry = createPlannedThemeTreeLodGeometry(palette, "enchanted-forest");
      const lobe = geometry.canopy.getAttribute("canopyLobe");
      const lobeIds = new Set(Array.from({ length: lobe.count }, (_, index) => lobe.getX(index)));
      const canopyTriangles =
        (geometry.canopy.index?.count ?? geometry.canopy.getAttribute("position").count) / 3;

      expect([...lobeIds].sort()).toEqual([0, 1, 2, 3]);
      expect(canopyTriangles).toBe(80);
      expect(geometry.trianglesPerInstance).toBe(108);
      expect(geometry.canopy.boundingBox).not.toBeNull();
      expect(geometry.canopy.boundingSphere).not.toBeNull();
      disposePlannedTreeLodGeometry(geometry);
    }
  });

  it("merges every repeated glow and root tube into one exact geometry per material", () => {
    const layer = enchantedFixture();
    const first = createPlannedEnchantedOrbitGeometry(layer);
    const repeated = createPlannedEnchantedOrbitGeometry(layer);

    expect(first.runestoneGlowTriangles).toBe(
      layer.runestones.length * PLANNED_THEME_LOD_CONTRACT.runestoneGlowTrianglesPerInstance,
    );
    expect(first.rootArchTriangles).toBe(
      layer.rootArches.length * PLANNED_THEME_LOD_CONTRACT.rootArchTrianglesPerInstance,
    );
    expect(first.runestoneGlows).not.toBeNull();
    expect(first.rootArches).not.toBeNull();
    expect(first.runestoneGlows!.boundingBox).not.toBeNull();
    expect(first.runestoneGlows!.boundingSphere).not.toBeNull();
    expect(first.rootArches!.boundingBox).not.toBeNull();
    expect(first.rootArches!.boundingSphere).not.toBeNull();
    expect({
      glow: {
        minimum: first.runestoneGlows!.boundingBox!.min.toArray(),
        maximum: first.runestoneGlows!.boundingBox!.max.toArray(),
      },
      root: {
        minimum: first.rootArches!.boundingBox!.min.toArray(),
        maximum: first.rootArches!.boundingBox!.max.toArray(),
      },
    }).toEqual({
      glow: {
        minimum: [-3.650714874267578, 1.0896891355514526, -5.815197467803955],
        maximum: [6.818118572235107, 2.15031099319458, 8.646833419799805],
      },
      root: {
        minimum: [-4.33206844329834, -0.2284834384918213, -2.368527412414551],
        maximum: [9.285161972045898, 5.747689723968506, 7.354437351226807],
      },
    });
    for (const geometry of [first.runestoneGlows!, first.rootArches!]) {
      const bounds = geometry.boundingBox!;
      const exact = exactPositionBounds(geometry);
      expect(bounds.isEmpty()).toBe(false);
      expect(bounds.min.toArray()).toEqual(exact.minimum);
      expect(bounds.max.toArray()).toEqual(exact.maximum);
    }
    expect(Array.from(first.runestoneGlows!.getAttribute("position").array)).toEqual(
      Array.from(repeated.runestoneGlows!.getAttribute("position").array),
    );
    expect(Array.from(first.rootArches!.getAttribute("position").array)).toEqual(
      Array.from(repeated.rootArches!.getAttribute("position").array),
    );
    let glowDisposeEvents = 0;
    let rootDisposeEvents = 0;
    first.runestoneGlows!.addEventListener("dispose", () => {
      glowDisposeEvents += 1;
    });
    first.rootArches!.addEventListener("dispose", () => {
      rootDisposeEvents += 1;
    });
    disposePlannedEnchantedOrbitGeometry(first);
    disposePlannedEnchantedOrbitGeometry(repeated);
    expect(glowDisposeEvents).toBe(1);
    expect(rootDisposeEvents).toBe(1);
  });

  it("keeps batching isolated to Orbit so Walk retains full detail", () => {
    expect(plannedThemeLodMode("orbit")).toBe("orbit-batched");
    expect(plannedThemeLodMode("walk")).toBe("walk-full-detail");
  });
});
