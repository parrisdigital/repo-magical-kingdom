import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { KingdomWorldTheme } from "@/lib/kingdom/world-theme";

import {
  createPlannedTreeLodGeometry,
  PLANNED_TREE_LOD_CONTRACT,
  type PlannedTreeLodGeometry,
  type PlannedTreeLodPalette,
} from "./planned-tree-lod";
import type {
  PlannedRootArch,
  PlannedRunestone,
  PlannedWorldThemeLayer,
} from "./planned-world-theme-model";

export const PLANNED_THEME_LOD_SCHEMA = "planned-theme-lod/v1" as const;

export const PLANNED_THEME_LOD_CONTRACT = Object.freeze({
  enchantedOrbitTreeTrianglesPerInstanceByPalette: Object.freeze({
    broadleaf: 108,
    flowering: 108,
    pine: 56,
    winter: 56,
  }),
  runestoneGlowTrianglesPerInstance: 6 * 22 * 2,
  rootArchTrianglesPerInstance: 28 * 7 * 2,
  maximumOrbitDrawCallsPerRepeatedFeature: 1,
});

export type PlannedThemeLodMode = "orbit-batched" | "walk-full-detail";

export type PlannedEnchantedOrbitGeometry = Readonly<{
  runestoneGlows: THREE.BufferGeometry | null;
  rootArches: THREE.BufferGeometry | null;
  runestoneGlowTriangles: number;
  rootArchTriangles: number;
}>;

function triangleCount(geometry: THREE.BufferGeometry): number {
  return (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
}

function fitGeometryToBounds(
  geometry: THREE.BufferGeometry,
  targetBounds: THREE.Box3,
): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const sourceBounds = geometry.boundingBox;
  if (!sourceBounds) throw new Error("Theme LOD geometry requires finite source bounds.");
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const targetSize = targetBounds.getSize(new THREE.Vector3());
  geometry.scale(
    targetSize.x / Math.max(0.000_001, sourceSize.x),
    targetSize.y / Math.max(0.000_001, sourceSize.y),
    targetSize.z / Math.max(0.000_001, sourceSize.z),
  );
  geometry.computeBoundingBox();
  const fittedCenter = geometry.boundingBox!.getCenter(new THREE.Vector3());
  const targetCenter = targetBounds.getCenter(new THREE.Vector3());
  geometry.translate(
    targetCenter.x - fittedCenter.x,
    targetCenter.y - fittedCenter.y,
    targetCenter.z - fittedCenter.z,
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function enchantedCanopyGeometry(palette: "broadleaf" | "flowering"): THREE.BufferGeometry {
  const flowering = palette === "flowering";
  const lobes = [
    { position: [0, 0, 0] as const, scale: [1, 0.86, 0.92] as const },
    {
      position: [flowering ? -0.74 : -0.82, -0.08, flowering ? 0.24 : 0.1] as const,
      scale: [0.76, 0.7, 0.72] as const,
    },
    {
      position: [flowering ? 0.68 : 0.76, 0.12, flowering ? -0.28 : -0.2] as const,
      scale: [0.7, 0.76, 0.66] as const,
    },
    {
      position: [flowering ? 0.14 : -0.06, 0.72, flowering ? 0.18 : -0.14] as const,
      scale: [0.72, 0.64, 0.7] as const,
    },
  ].map(({ position, scale }, lobeIndex) => {
    const lobe = new THREE.IcosahedronGeometry(1, 0);
    lobe.scale(scale[0], scale[1], scale[2]);
    lobe.translate(position[0], position[1], position[2]);
    lobe.setAttribute(
      "canopyLobe",
      new THREE.Float32BufferAttribute(
        Array.from({ length: lobe.getAttribute("position").count }, () => lobeIndex),
        1,
      ),
    );
    return lobe;
  });
  const canopy = mergeGeometries(lobes, false);
  for (const lobe of lobes) lobe.dispose();
  if (!canopy) throw new Error(`Unable to merge enchanted ${palette} canopy lobes.`);
  return canopy;
}

/**
 * Orbit keeps the same tree transforms, palette, trunk, and silhouette bounds.
 * Enchanted broadleaf/flowering canopies use four irregular detail-0 lobes.
 * Their 80 canopy triangles preserve the previous 108-triangle total and the
 * fitted authored bounds while avoiding the uniform sphere silhouette.
 */
export function createPlannedThemeTreeLodGeometry(
  palette: PlannedTreeLodPalette,
  worldTheme: KingdomWorldTheme,
): PlannedTreeLodGeometry {
  const base = createPlannedTreeLodGeometry(palette);
  if (worldTheme !== "enchanted-forest" || palette === "pine" || palette === "winter") {
    return base;
  }

  const targetBounds = base.canopy.boundingBox?.clone();
  if (!targetBounds) {
    base.trunk.dispose();
    base.canopy.dispose();
    throw new Error("Base overview canopy requires bounds before enchanted LOD fitting.");
  }
  const canopy = fitGeometryToBounds(enchantedCanopyGeometry(palette), targetBounds);
  base.canopy.dispose();
  const trianglesPerInstance = triangleCount(base.trunk) + triangleCount(canopy);
  const expected =
    PLANNED_THEME_LOD_CONTRACT.enchantedOrbitTreeTrianglesPerInstanceByPalette[palette];
  if (trianglesPerInstance !== expected) {
    base.trunk.dispose();
    canopy.dispose();
    throw new Error(
      `Enchanted Orbit tree LOD ${palette} drifted to ${trianglesPerInstance} triangles; expected ${expected}.`,
    );
  }
  return { trunk: base.trunk, canopy, trianglesPerInstance };
}

export function plannedThemeTreeTrianglesPerInstance(
  worldTheme: KingdomWorldTheme,
  palette: PlannedTreeLodPalette,
): number {
  return worldTheme === "enchanted-forest"
    ? PLANNED_THEME_LOD_CONTRACT.enchantedOrbitTreeTrianglesPerInstanceByPalette[palette]
    : PLANNED_TREE_LOD_CONTRACT.overviewTrianglesPerInstanceByPalette[palette];
}

export function plannedThemeLodMode(navigationMode: "orbit" | "walk"): PlannedThemeLodMode {
  return navigationMode === "walk" ? "walk-full-detail" : "orbit-batched";
}

function mergedGeometry(
  sources: ReadonlyArray<THREE.BufferGeometry>,
  label: string,
): THREE.BufferGeometry | null {
  if (sources.length === 0) return null;
  const merged = mergeGeometries([...sources], false);
  for (const source of sources) source.dispose();
  if (!merged) throw new Error(`Unable to merge enchanted ${label} geometry.`);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function runestoneGlowGeometry(runestone: PlannedRunestone): THREE.BufferGeometry {
  const geometry = new THREE.TorusGeometry(0.56 * runestone.scale, 0.035, 6, 22);
  const transform = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  transform.premultiply(
    new THREE.Matrix4().makeRotationY(runestone.rotationY + runestone.glowPhase * 0.08),
  );
  transform.premultiply(
    new THREE.Matrix4().makeTranslation(
      runestone.position.x,
      runestone.position.y + 0.12,
      runestone.position.z,
    ),
  );
  geometry.applyMatrix4(transform);
  return geometry;
}

function rootArchGeometry(arch: PlannedRootArch): THREE.BufferGeometry {
  const start = new THREE.Vector3(arch.start.x, arch.start.y, arch.start.z);
  const end = new THREE.Vector3(arch.end.x, arch.end.y, arch.end.z);
  const middle = start
    .clone()
    .lerp(end, 0.5)
    .setY(Math.max(start.y, end.y) + arch.height);
  const curve = new THREE.CatmullRomCurve3(
    [start, start.clone().lerp(middle, 0.48), middle, middle.clone().lerp(end, 0.52), end],
    false,
    "centripetal",
  );
  return new THREE.TubeGeometry(curve, 28, arch.radius, 7, false);
}

/** One immutable geometry per repeated material, matching two actual Orbit draws. */
export function createPlannedEnchantedOrbitGeometry(
  layer: PlannedWorldThemeLayer,
): PlannedEnchantedOrbitGeometry {
  if (layer.worldTheme !== "enchanted-forest") {
    return {
      runestoneGlows: null,
      rootArches: null,
      runestoneGlowTriangles: 0,
      rootArchTriangles: 0,
    };
  }
  const runestoneGlows = mergedGeometry(
    layer.runestones.map(runestoneGlowGeometry),
    "runestone glow",
  );
  const rootArches = mergedGeometry(layer.rootArches.map(rootArchGeometry), "root arch");
  const runestoneGlowTriangles = runestoneGlows ? triangleCount(runestoneGlows) : 0;
  const rootArchTriangles = rootArches ? triangleCount(rootArches) : 0;
  const expectedRunestoneTriangles =
    layer.runestones.length * PLANNED_THEME_LOD_CONTRACT.runestoneGlowTrianglesPerInstance;
  const expectedRootArchTriangles =
    layer.rootArches.length * PLANNED_THEME_LOD_CONTRACT.rootArchTrianglesPerInstance;
  if (
    runestoneGlowTriangles !== expectedRunestoneTriangles ||
    rootArchTriangles !== expectedRootArchTriangles
  ) {
    runestoneGlows?.dispose();
    rootArches?.dispose();
    throw new Error(
      `Enchanted Orbit batch geometry drifted to ${runestoneGlowTriangles}/${rootArchTriangles} triangles; expected ${expectedRunestoneTriangles}/${expectedRootArchTriangles}.`,
    );
  }
  return { runestoneGlows, rootArches, runestoneGlowTriangles, rootArchTriangles };
}

export function disposePlannedEnchantedOrbitGeometry(
  geometry: PlannedEnchantedOrbitGeometry,
): void {
  geometry.runestoneGlows?.dispose();
  geometry.rootArches?.dispose();
}
