"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  getKenneySeasonalPalette,
  kenneySeasonalAssetUrl,
  kenneySeasonalAssetReferenceUrl,
} from "@/lib/assets/kenney-seasonal";
import { quaterniusAssetUrl } from "@/lib/assets/quaternius";
import type { KingdomSeason, WorldPlan, WorldPlanPoint } from "@/lib/kingdom";

import type {
  PlannedDevelopedZoneSignature,
  PlannedLandscapeRole,
  PlannedLandUse,
  PlannedLandUseAnchor,
  PlannedLandUsePoint,
  PlannedRoadCrossing,
  PlannedRoadSegment,
} from "./planned-land-use";
import { classifyPlannedTerrainRegion, samplePlannedTerrainHeight } from "./planned-terrain-model";

export const PLANNED_DEVELOPED_ZONE_SIGNATURES = [
  "civic-square",
  "productive-yard",
  "garden-orchard",
  "frontier-enclosure",
  "village-lanes",
] as const satisfies ReadonlyArray<PlannedDevelopedZoneSignature>;

export const PLANNED_LANDSCAPE_ROLES = [
  "field",
  "orchard",
  "garden",
] as const satisfies ReadonlyArray<PlannedLandscapeRole>;

export const PLANNED_LAND_USE_RENDER_BUDGET = Object.freeze({
  maximumSurfaceDrawCalls: 19,
  maximumGeneratedTriangles: 24_000,
  maximumExplicitAssets: 32,
  maximumAssetSourcePrimitives: 3,
  maximumAssetTrianglesPerInstance: 1_672,
  maximumTotalDrawCalls: 115,
  maximumTotalTriangles: 77_504,
});

const ZONE_SURFACE_OFFSET = 0.085;
const ZONE_BORDER_OFFSET = 0.115;
const LANDSCAPE_SURFACE_OFFSET = 0.105;
const ROAD_BORDER_OFFSET = 0.105;
const ROAD_SURFACE_OFFSET = 0.145;
const ROAD_BORDER_EXTRA_WIDTH = 0.9;
const ZONE_BORDER_WIDTH = 0.34;
const LAND_USE_INTERIOR_ATTRIBUTE = "kingdomLandUseInterior";

type PlannedLandUseSurfacePattern = "solid" | "developed" | "field" | "orchard" | "garden";

export type PlannedLandUseSurfaceStyle = Readonly<{
  color: string;
  borderColor: string;
  roughness: number;
  emissiveIntensity: number;
}>;

export type PlannedLandUseAssetInstance = Readonly<{
  id: string;
  url: string;
  position: readonly [number, number, number];
  rotationY: number;
  targetHeight: number;
}>;

export type PlannedLandUseAssetBatch = Readonly<{
  url: string;
  instances: ReadonlyArray<PlannedLandUseAssetInstance>;
}>;

export type PlannedCrossingGeometry = Readonly<{
  kind: PlannedRoadCrossing["kind"];
  surface: THREE.BufferGeometry;
  structure: THREE.BufferGeometry;
}>;

export type PlannedLandUseGeometryBundle = Readonly<{
  zones: ReadonlyArray<
    Readonly<{
      signature: PlannedDevelopedZoneSignature;
      surface: THREE.BufferGeometry;
      border: THREE.BufferGeometry;
    }>
  >;
  landscapes: ReadonlyArray<
    Readonly<{ role: PlannedLandscapeRole; surface: THREE.BufferGeometry }>
  >;
  roadBorder: THREE.BufferGeometry;
  roadSurface: THREE.BufferGeometry;
  bridgeSurface: THREE.BufferGeometry;
  bridgeStructure: THREE.BufferGeometry;
  steppedSurface: THREE.BufferGeometry;
  steppedStructure: THREE.BufferGeometry;
  generatedTriangleCount: number;
  surfaceDrawCallCount: number;
}>;

type HeightSampler = (point: PlannedLandUsePoint, index: number) => number;

function mixColor(first: string, second: string, amount: number): string {
  return `#${new THREE.Color(first).lerp(new THREE.Color(second), amount).getHexString()}`;
}

/** Appearance-only styling. Placement and geometry never depend on this palette. */
export function getPlannedDevelopedZoneStyles(
  plan: WorldPlan,
): Readonly<Record<PlannedDevelopedZoneSignature, PlannedLandUseSurfaceStyle>> {
  const terrain = plan.appearance.terrain;
  const architecture = plan.appearance.architecture;
  const styles: Record<PlannedDevelopedZoneSignature, PlannedLandUseSurfaceStyle> = {
    "civic-square": {
      color: mixColor("#d7c8ae", terrain.shore, 0.24),
      borderColor: mixColor("#645b50", terrain.escarpment, 0.24),
      roughness: 0.9,
      emissiveIntensity: 0.018,
    },
    "productive-yard": {
      color: mixColor("#9b6c42", architecture.timberTint, 0.2),
      borderColor: mixColor("#4c3628", terrain.escarpment, 0.18),
      roughness: 1,
      emissiveIntensity: 0.012,
    },
    "garden-orchard": {
      color: mixColor("#728f58", terrain.meadow, 0.25),
      borderColor: mixColor("#3f5637", architecture.timberTint, 0.18),
      roughness: 0.96,
      emissiveIntensity: 0.016,
    },
    "frontier-enclosure": {
      color: mixColor("#756557", terrain.escarpment, 0.28),
      borderColor: mixColor("#3f332b", architecture.timberTint, 0.2),
      roughness: 1,
      emissiveIntensity: 0.01,
    },
    "village-lanes": {
      color: mixColor("#b58e67", terrain.shore, 0.25),
      borderColor: mixColor("#594432", architecture.timberTint, 0.2),
      roughness: 0.98,
      emissiveIntensity: 0.014,
    },
  };
  return styles;
}

export function getPlannedLandscapeStyles(
  plan: WorldPlan,
): Readonly<Record<PlannedLandscapeRole, PlannedLandUseSurfaceStyle>> {
  const terrain = plan.appearance.terrain;
  return {
    field: {
      color: mixColor(terrain.meadow, "#92794a", 0.34),
      borderColor: mixColor("#665535", terrain.escarpment, 0.16),
      roughness: 1,
      emissiveIntensity: 0.01,
    },
    orchard: {
      color: mixColor(terrain.lowland, "#3f623d", 0.28),
      borderColor: mixColor("#35472f", terrain.escarpment, 0.14),
      roughness: 1,
      emissiveIntensity: 0.012,
    },
    garden: {
      color: mixColor(terrain.meadow, "#788a54", 0.24),
      borderColor: mixColor("#4f5b39", terrain.escarpment, 0.15),
      roughness: 0.96,
      emissiveIntensity: 0.014,
    },
  };
}

function createGeometry(positions: number[], indices: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  if (indices.length > 0) {
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }
  return geometry;
}

function signedPolygonArea(polygon: ReadonlyArray<WorldPlanPoint>): number {
  let doubledArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const next = polygon[(index + 1) % polygon.length]!;
    doubledArea += current.x * next.z - next.x * current.z;
  }
  return doubledArea / 2;
}

function averagePoint(polygon: ReadonlyArray<WorldPlanPoint>): WorldPlanPoint {
  if (polygon.length === 0) return { x: 0, z: 0 };
  return polygon.reduce(
    (total, point) => ({
      x: total.x + point.x / polygon.length,
      z: total.z + point.z / polygon.length,
    }),
    { x: 0, z: 0 },
  );
}

/**
 * Builds a deterministic center fan whose boundary vertices are the model's
 * exact x/z polygon. Every y coordinate is sampled from the authored terrain.
 */
export function buildTerrainFollowingPolygonGeometry(
  plan: WorldPlan,
  polygon: ReadonlyArray<WorldPlanPoint>,
  options: Readonly<{ center?: WorldPlanPoint; verticalOffset?: number }> = {},
): THREE.BufferGeometry {
  if (polygon.length < 3) return createGeometry([], []);
  const center = options.center ?? averagePoint(polygon);
  const verticalOffset = options.verticalOffset ?? 0;
  const ringCount = 4;
  const positions = [
    center.x,
    samplePlannedTerrainHeight(plan, center.x, center.z) + verticalOffset,
    center.z,
  ];
  const interior = [1];
  for (let ringIndex = 1; ringIndex <= ringCount; ringIndex += 1) {
    const progress = ringIndex / ringCount;
    for (const point of polygon) {
      const x = center.x + (point.x - center.x) * progress;
      const z = center.z + (point.z - center.z) * progress;
      positions.push(x, samplePlannedTerrainHeight(plan, x, z) + verticalOffset, z);
      interior.push(1 - progress);
    }
  }
  const indices: number[] = [];
  const counterClockwise = signedPolygonArea(polygon) > 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = index + 1;
    const next = ((index + 1) % polygon.length) + 1;
    if (counterClockwise) indices.push(0, next, current);
    else indices.push(0, current, next);
  }
  for (let ringIndex = 1; ringIndex < ringCount; ringIndex += 1) {
    const innerStart = 1 + (ringIndex - 1) * polygon.length;
    const outerStart = 1 + ringIndex * polygon.length;
    for (let index = 0; index < polygon.length; index += 1) {
      const next = (index + 1) % polygon.length;
      const innerCurrent = innerStart + index;
      const innerNext = innerStart + next;
      const outerCurrent = outerStart + index;
      const outerNext = outerStart + next;
      if (counterClockwise) {
        indices.push(innerCurrent, outerNext, outerCurrent, innerCurrent, innerNext, outerNext);
      } else {
        indices.push(innerCurrent, outerCurrent, outerNext, innerCurrent, outerNext, innerNext);
      }
    }
  }
  const geometry = createGeometry(positions, indices);
  geometry.setAttribute(LAND_USE_INTERIOR_ATTRIBUTE, new THREE.Float32BufferAttribute(interior, 1));
  geometry.userData.plannedBoundary = polygon.map((point) => ({ ...point }));
  geometry.userData.plannedInteriorRingCount = ringCount - 1;
  return geometry;
}

function pointDistance(first: PlannedLandUsePoint, second: PlannedLandUsePoint): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function withoutConsecutiveDuplicates(
  points: ReadonlyArray<PlannedLandUsePoint>,
): ReadonlyArray<PlannedLandUsePoint> {
  return points.filter(
    (point, index) => index === 0 || pointDistance(point, points[index - 1]!) > 0.000_1,
  );
}

function buildTerrainFollowingRibbonGeometry(
  plan: WorldPlan,
  sourcePoints: ReadonlyArray<PlannedLandUsePoint>,
  width: number,
  verticalOffset: number,
  heightSampler?: HeightSampler,
): THREE.BufferGeometry {
  const points = withoutConsecutiveDuplicates(sourcePoints);
  if (points.length < 2 || width <= 0) return createGeometry([], []);
  const positions: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    const previous = points[Math.max(0, index - 1)]!;
    const next = points[Math.min(points.length - 1, index + 1)]!;
    const deltaX = next.x - previous.x;
    const deltaZ = next.z - previous.z;
    const length = Math.max(0.000_1, Math.hypot(deltaX, deltaZ));
    const normalX = -deltaZ / length;
    const normalZ = deltaX / length;
    const centerHeight =
      (heightSampler?.(point, index) ?? samplePlannedTerrainHeight(plan, point.x, point.z)) +
      verticalOffset;
    for (const lateral of [width / 2, 0, -width / 2]) {
      const x = point.x + normalX * lateral;
      const z = point.z + normalZ * lateral;
      const y =
        heightSampler === undefined
          ? samplePlannedTerrainHeight(plan, x, z) + verticalOffset
          : centerHeight;
      positions.push(x, y, z);
    }
  }
  const indices: number[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const offset = index * 3;
    const next = offset + 3;
    indices.push(
      offset,
      next,
      next + 1,
      offset,
      next + 1,
      offset + 1,
      offset + 1,
      next + 1,
      next + 2,
      offset + 1,
      next + 2,
      offset + 2,
    );
  }
  const geometry = createGeometry(positions, indices);
  geometry.userData.plannedWidth = width;
  geometry.userData.plannedCenterline = points.map((point) => ({ ...point }));
  return geometry;
}

function assertPrimaryRoadWidth(width: number): void {
  if (width < 4 || width > 5) {
    throw new RangeError(`Planned primary road width ${width} is outside the 4-5u contract.`);
  }
}

/** Exact-width, terrain-following road ribbon from the model-provided points. */
export function buildPlannedRoadSurfaceGeometry(
  plan: WorldPlan,
  segment: Pick<PlannedRoadSegment, "id" | "points" | "width">,
  layer: "border" | "surface" = "surface",
): THREE.BufferGeometry {
  assertPrimaryRoadWidth(segment.width);
  const geometry = buildTerrainFollowingRibbonGeometry(
    plan,
    segment.points,
    segment.width + (layer === "border" ? ROAD_BORDER_EXTRA_WIDTH : 0),
    layer === "border" ? ROAD_BORDER_OFFSET : ROAD_SURFACE_OFFSET,
  );
  geometry.userData.plannedRoadId = segment.id;
  geometry.userData.plannedRoadLayer = layer;
  geometry.userData.plannedSurfaceWidth = segment.width;
  return geometry;
}

/**
 * Splits the ordinary ground ribbon at every authored crossing. Crossing end
 * points are retained as seams so the dedicated deck/treads meet the ground
 * road without leaving a gap; no ordinary ribbon is drawn through the span.
 */
export function splitPlannedRoadAtCrossings(
  segment: Pick<PlannedRoadSegment, "points" | "crossings">,
): ReadonlyArray<ReadonlyArray<PlannedLandUsePoint>> {
  if (segment.points.length < 2) return [];
  const crossings = [...segment.crossings].sort(
    (first, second) =>
      first.startPointIndex - second.startPointIndex || first.endPointIndex - second.endPointIndex,
  );
  if (crossings.length === 0) return [segment.points];
  const runs: Array<ReadonlyArray<PlannedLandUsePoint>> = [];
  let cursor = 0;
  for (const crossing of crossings) {
    const start = Math.max(cursor, Math.min(segment.points.length - 1, crossing.startPointIndex));
    if (start - cursor >= 1) runs.push(segment.points.slice(cursor, start + 1));
    cursor = Math.max(cursor, Math.min(segment.points.length - 1, crossing.endPointIndex));
  }
  if (segment.points.length - 1 - cursor >= 1) runs.push(segment.points.slice(cursor));
  return runs;
}

export function buildPlannedOrdinaryRoadGeometry(
  plan: WorldPlan,
  segment: Pick<PlannedRoadSegment, "id" | "points" | "width" | "crossings">,
  layer: "border" | "surface" = "surface",
): THREE.BufferGeometry {
  return mergeAndDispose(
    splitPlannedRoadAtCrossings(segment).map((points, index) =>
      buildPlannedRoadSurfaceGeometry(
        plan,
        { id: `${segment.id}:ordinary:${index}`, points, width: segment.width },
        layer,
      ),
    ),
  );
}

function appendBox(
  positions: number[],
  indices: number[],
  centerX: number,
  centerZ: number,
  minimumY: number,
  maximumY: number,
  halfSize: number,
): void {
  const base = positions.length / 3;
  const minX = centerX - halfSize;
  const maxX = centerX + halfSize;
  const minZ = centerZ - halfSize;
  const maxZ = centerZ + halfSize;
  positions.push(
    minX,
    minimumY,
    minZ,
    maxX,
    minimumY,
    minZ,
    maxX,
    minimumY,
    maxZ,
    minX,
    minimumY,
    maxZ,
    minX,
    maximumY,
    minZ,
    maxX,
    maximumY,
    minZ,
    maxX,
    maximumY,
    maxZ,
    minX,
    maximumY,
    maxZ,
  );
  const faces = [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0,
    4, 3, 4, 7,
  ];
  indices.push(...faces.map((index) => index + base));
}

function crossingSlice(
  segment: Pick<PlannedRoadSegment, "points">,
  crossing: PlannedRoadCrossing,
): ReadonlyArray<PlannedLandUsePoint> {
  const start = Math.max(0, crossing.startPointIndex - 1);
  const end = Math.min(segment.points.length - 1, crossing.endPointIndex + 1);
  return segment.points.slice(start, end + 1);
}

function bridgeGeometry(
  plan: WorldPlan,
  segment: Pick<PlannedRoadSegment, "points" | "width">,
  crossing: PlannedRoadCrossing,
): PlannedCrossingGeometry {
  const points = crossingSlice(segment, crossing);
  const deckHeight = (point: PlannedLandUsePoint) => {
    const region = classifyPlannedTerrainRegion(plan, point.x, point.z);
    return Math.max(point.y + 0.22, (region.waterSurfaceHeight ?? point.y) + 0.72);
  };
  const surface = buildTerrainFollowingRibbonGeometry(plan, points, segment.width, 0, (point) =>
    deckHeight(point),
  );
  surface.userData.plannedCrossingKind = "bridge";
  surface.userData.plannedSurfaceWidth = segment.width;

  const positions: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    if (index !== 0 && index !== points.length - 1 && index % 3 !== 0) continue;
    const point = points[index]!;
    const previous = points[Math.max(0, index - 1)]!;
    const next = points[Math.min(points.length - 1, index + 1)]!;
    const deltaX = next.x - previous.x;
    const deltaZ = next.z - previous.z;
    const length = Math.max(0.000_1, Math.hypot(deltaX, deltaZ));
    const normalX = -deltaZ / length;
    const normalZ = deltaX / length;
    for (const side of [-1, 1]) {
      const x = point.x + normalX * segment.width * 0.4 * side;
      const z = point.z + normalZ * segment.width * 0.4 * side;
      const bottom = samplePlannedTerrainHeight(plan, x, z) + 0.04;
      const top = deckHeight(point) - 0.08;
      if (top > bottom + 0.18) appendBox(positions, indices, x, z, bottom, top, 0.18);
    }
  }
  const supportGeometry = createGeometry(positions, indices);
  const underDeck = buildTerrainFollowingRibbonGeometry(
    plan,
    points,
    segment.width + 0.32,
    0,
    (point) => deckHeight(point) - 0.14,
  );
  const structure = mergeAndDispose([supportGeometry, underDeck]);
  structure.userData.plannedCrossingKind = "bridge-supports";
  return { kind: "bridge", surface, structure };
}

function appendQuad(
  positions: number[],
  indices: number[],
  first: readonly [number, number, number],
  second: readonly [number, number, number],
  third: readonly [number, number, number],
  fourth: readonly [number, number, number],
): void {
  const base = positions.length / 3;
  positions.push(...first, ...second, ...third, ...fourth);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function steppedCutGeometry(
  plan: WorldPlan,
  segment: Pick<PlannedRoadSegment, "points" | "width">,
  crossing: PlannedRoadCrossing,
): PlannedCrossingGeometry {
  const points = crossingSlice(segment, crossing);
  const surfacePositions: number[] = [];
  const surfaceIndices: number[] = [];
  const structurePositions: number[] = [];
  const structureIndices: number[] = [];
  let previousTop: number | null = null;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const deltaX = end.x - start.x;
    const deltaZ = end.z - start.z;
    const length = Math.max(0.000_1, Math.hypot(deltaX, deltaZ));
    const normalX = -deltaZ / length;
    const normalZ = deltaX / length;
    const halfWidth = segment.width / 2;
    const startLeft = { x: start.x + normalX * halfWidth, z: start.z + normalZ * halfWidth };
    const startRight = { x: start.x - normalX * halfWidth, z: start.z - normalZ * halfWidth };
    const endLeft = { x: end.x + normalX * halfWidth, z: end.z + normalZ * halfWidth };
    const endRight = { x: end.x - normalX * halfWidth, z: end.z - normalZ * halfWidth };
    const top =
      Math.max(
        samplePlannedTerrainHeight(plan, startLeft.x, startLeft.z),
        samplePlannedTerrainHeight(plan, startRight.x, startRight.z),
        samplePlannedTerrainHeight(plan, endLeft.x, endLeft.z),
        samplePlannedTerrainHeight(plan, endRight.x, endRight.z),
      ) + 0.16;
    appendQuad(
      surfacePositions,
      surfaceIndices,
      [startLeft.x, top, startLeft.z],
      [endLeft.x, top, endLeft.z],
      [endRight.x, top, endRight.z],
      [startRight.x, top, startRight.z],
    );
    const startLeftGround = samplePlannedTerrainHeight(plan, startLeft.x, startLeft.z) + 0.03;
    const endLeftGround = samplePlannedTerrainHeight(plan, endLeft.x, endLeft.z) + 0.03;
    const startRightGround = samplePlannedTerrainHeight(plan, startRight.x, startRight.z) + 0.03;
    const endRightGround = samplePlannedTerrainHeight(plan, endRight.x, endRight.z) + 0.03;
    appendQuad(
      structurePositions,
      structureIndices,
      [startLeft.x, startLeftGround, startLeft.z],
      [endLeft.x, endLeftGround, endLeft.z],
      [endLeft.x, top, endLeft.z],
      [startLeft.x, top, startLeft.z],
    );
    appendQuad(
      structurePositions,
      structureIndices,
      [endRight.x, endRightGround, endRight.z],
      [startRight.x, startRightGround, startRight.z],
      [startRight.x, top, startRight.z],
      [endRight.x, top, endRight.z],
    );
    if (previousTop !== null && Math.abs(previousTop - top) > 0.025) {
      const lower = Math.min(previousTop, top);
      const upper = Math.max(previousTop, top);
      appendQuad(
        structurePositions,
        structureIndices,
        [startLeft.x, lower, startLeft.z],
        [startLeft.x, upper, startLeft.z],
        [startRight.x, upper, startRight.z],
        [startRight.x, lower, startRight.z],
      );
    }
    previousTop = top;
  }
  const surface = createGeometry(surfacePositions, surfaceIndices);
  surface.userData.plannedCrossingKind = "stepped-cut";
  surface.userData.plannedSurfaceWidth = segment.width;
  const structure = createGeometry(structurePositions, structureIndices);
  structure.userData.plannedCrossingKind = "stepped-retaining-walls";
  return { kind: "stepped-cut", surface, structure };
}

/** Bridge decks/supports and stepped treads/retaining walls are intentionally separate. */
export function buildPlannedCrossingGeometry(
  plan: WorldPlan,
  segment: Pick<PlannedRoadSegment, "points" | "width">,
  crossing: PlannedRoadCrossing,
): PlannedCrossingGeometry {
  assertPrimaryRoadWidth(segment.width);
  return crossing.kind === "bridge"
    ? bridgeGeometry(plan, segment, crossing)
    : steppedCutGeometry(plan, segment, crossing);
}

export function mergePlannedLandUseGeometries(
  geometries: ReadonlyArray<THREE.BufferGeometry>,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const includesInterior = geometries.some((geometry) =>
    geometry.hasAttribute(LAND_USE_INTERIOR_ATTRIBUTE),
  );
  const interior: number[] = [];
  let vertexOffset = 0;
  for (const geometry of geometries) {
    const position = geometry.getAttribute("position");
    if (!(position instanceof THREE.BufferAttribute)) continue;
    for (let index = 0; index < position.count; index += 1) {
      positions.push(position.getX(index), position.getY(index), position.getZ(index));
      if (includesInterior) {
        const sourceInterior = geometry.getAttribute(LAND_USE_INTERIOR_ATTRIBUTE);
        interior.push(sourceInterior ? sourceInterior.getX(index) : 1);
      }
    }
    if (geometry.index) {
      for (let index = 0; index < geometry.index.count; index += 1) {
        indices.push(geometry.index.getX(index) + vertexOffset);
      }
    } else {
      for (let index = 0; index < position.count; index += 1) indices.push(index + vertexOffset);
    }
    vertexOffset += position.count;
  }
  const merged = createGeometry(positions, indices);
  if (includesInterior) {
    merged.setAttribute(LAND_USE_INTERIOR_ATTRIBUTE, new THREE.Float32BufferAttribute(interior, 1));
  }
  return merged;
}

function mergeAndDispose(geometries: ReadonlyArray<THREE.BufferGeometry>): THREE.BufferGeometry {
  const merged = mergePlannedLandUseGeometries(geometries);
  geometries.forEach((geometry) => geometry.dispose());
  return merged;
}

function asPoint3(plan: WorldPlan, point: WorldPlanPoint): PlannedLandUsePoint {
  return { x: point.x, y: samplePlannedTerrainHeight(plan, point.x, point.z), z: point.z };
}

function buildPolygonGroup(
  plan: WorldPlan,
  items: ReadonlyArray<
    Readonly<{ polygon: ReadonlyArray<WorldPlanPoint>; center: PlannedLandUsePoint }>
  >,
  verticalOffset: number,
): THREE.BufferGeometry {
  return mergeAndDispose(
    items.map((item) =>
      buildTerrainFollowingPolygonGeometry(plan, item.polygon, {
        center: item.center,
        verticalOffset,
      }),
    ),
  );
}

function buildZoneBorderGroup(
  plan: WorldPlan,
  items: ReadonlyArray<Readonly<{ polygon: ReadonlyArray<WorldPlanPoint> }>>,
): THREE.BufferGeometry {
  return mergeAndDispose(
    items.map((item) => {
      if (item.polygon.length < 2) return createGeometry([], []);
      const closed = [...item.polygon, item.polygon[0]!].map((point) => asPoint3(plan, point));
      return buildTerrainFollowingRibbonGeometry(
        plan,
        closed,
        ZONE_BORDER_WIDTH,
        ZONE_BORDER_OFFSET,
      );
    }),
  );
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  return (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
}

function bundleGeometries(
  bundle: PlannedLandUseGeometryBundle,
): ReadonlyArray<THREE.BufferGeometry> {
  return [
    ...bundle.zones.flatMap((zone) => [zone.surface, zone.border]),
    ...bundle.landscapes.map((landscape) => landscape.surface),
    bundle.roadBorder,
    bundle.roadSurface,
    bundle.bridgeSurface,
    bundle.bridgeStructure,
    bundle.steppedSurface,
    bundle.steppedStructure,
  ];
}

/** Batches surfaces by semantic role, keeping draw calls bounded and topology editable. */
export function buildPlannedLandUseGeometryBundle(
  plan: WorldPlan,
  landUse: PlannedLandUse,
): PlannedLandUseGeometryBundle {
  const zones = PLANNED_DEVELOPED_ZONE_SIGNATURES.map((signature) => {
    const matching = landUse.zones.filter((zone) => zone.signature === signature);
    return {
      signature,
      surface: buildPolygonGroup(plan, matching, ZONE_SURFACE_OFFSET),
      border: buildZoneBorderGroup(plan, matching),
    };
  });
  const landscapes = PLANNED_LANDSCAPE_ROLES.map((role) => ({
    role,
    surface: buildPolygonGroup(
      plan,
      landUse.landscapePolygons.filter((landscape) => landscape.role === role),
      LANDSCAPE_SURFACE_OFFSET,
    ),
  }));
  const roadBorders = landUse.primaryRoad.segments.map((segment) =>
    buildPlannedOrdinaryRoadGeometry(plan, segment, "border"),
  );
  const roadSurfaces = landUse.primaryRoad.segments.map((segment) =>
    buildPlannedOrdinaryRoadGeometry(plan, segment, "surface"),
  );
  const crossings = landUse.primaryRoad.segments.flatMap((segment) =>
    segment.crossings.map((crossing) => buildPlannedCrossingGeometry(plan, segment, crossing)),
  );
  const bridgeSurface = mergeAndDispose(
    crossings.filter((crossing) => crossing.kind === "bridge").map((crossing) => crossing.surface),
  );
  const bridgeStructure = mergeAndDispose(
    crossings
      .filter((crossing) => crossing.kind === "bridge")
      .map((crossing) => crossing.structure),
  );
  const steppedSurface = mergeAndDispose(
    crossings
      .filter((crossing) => crossing.kind === "stepped-cut")
      .map((crossing) => crossing.surface),
  );
  const steppedStructure = mergeAndDispose(
    crossings
      .filter((crossing) => crossing.kind === "stepped-cut")
      .map((crossing) => crossing.structure),
  );
  const result = {
    zones,
    landscapes,
    roadBorder: mergeAndDispose(roadBorders),
    roadSurface: mergeAndDispose(roadSurfaces),
    bridgeSurface,
    bridgeStructure,
    steppedSurface,
    steppedStructure,
    generatedTriangleCount: 0,
    surfaceDrawCallCount: 0,
  } satisfies PlannedLandUseGeometryBundle;
  const geometries = bundleGeometries(result);
  const generatedTriangleCount = geometries.reduce(
    (total, geometry) => total + triangleCount(geometry),
    0,
  );
  const surfaceDrawCallCount = geometries.filter(
    (geometry) => geometry.getAttribute("position").count > 0,
  ).length;
  if (generatedTriangleCount > PLANNED_LAND_USE_RENDER_BUDGET.maximumGeneratedTriangles) {
    disposePlannedLandUseGeometryBundle(result);
    throw new RangeError(
      `Planned land-use generated ${generatedTriangleCount} triangles; budget is ${PLANNED_LAND_USE_RENDER_BUDGET.maximumGeneratedTriangles}.`,
    );
  }
  if (surfaceDrawCallCount > PLANNED_LAND_USE_RENDER_BUDGET.maximumSurfaceDrawCalls) {
    disposePlannedLandUseGeometryBundle(result);
    throw new RangeError(
      `Planned land-use generated ${surfaceDrawCallCount} surface draw calls; budget is ${PLANNED_LAND_USE_RENDER_BUDGET.maximumSurfaceDrawCalls}.`,
    );
  }
  return { ...result, generatedTriangleCount, surfaceDrawCallCount };
}

export function disposePlannedLandUseGeometryBundle(bundle: PlannedLandUseGeometryBundle): void {
  bundleGeometries(bundle).forEach((geometry) => geometry.dispose());
}

const PROP_ASSET_URLS = {
  "settlement-threshold": quaterniusAssetUrl("medieval", "Prop_WoodenFence_Single"),
  "notice-board": quaterniusAssetUrl("medieval", "Prop_WoodenFence_Single"),
  "supply-stack": quaterniusAssetUrl("medieval", "Prop_Wagon"),
  "orchard-marker": quaterniusAssetUrl("medieval", "Prop_Vine1"),
  "watch-fire": quaterniusAssetUrl("medieval", "Prop_Chimney"),
  "wayfinding-post": quaterniusAssetUrl("medieval", "Prop_WoodenFence_Single"),
  "waterside-overlook": quaterniusAssetUrl("medieval", "Prop_WoodenFence_Single"),
} as const;

const FIELD_ASSETS = {
  spring: kenneySeasonalAssetUrl("nature", "crop_carrot"),
  summer: kenneySeasonalAssetUrl("nature", "crops_wheatStageB"),
  autumn: kenneySeasonalAssetUrl("nature", "crop_pumpkin"),
  winter: kenneySeasonalAssetUrl("holiday", "snow-flat-large"),
} as const;

const GARDEN_ASSETS = {
  spring: kenneySeasonalAssetUrl("nature", "flower_purpleA"),
  summer: kenneySeasonalAssetUrl("nature", "crop_melon"),
  autumn: kenneySeasonalAssetUrl("nature", "crop_pumpkin"),
  winter: kenneySeasonalAssetUrl("holiday", "snow-pile"),
} as const;

function orchardAssetUrl(season: KingdomSeason): string {
  return kenneySeasonalAssetReferenceUrl(getKenneySeasonalPalette(season).canopy[1]!);
}

export function plannedLandUseAnchorAssetUrl(
  anchor: PlannedLandUseAnchor,
  season: KingdomSeason,
  landscapeRole: PlannedLandscapeRole | null,
): string {
  if (anchor.kind === "habitat") {
    if (landscapeRole === "orchard" || anchor.role === "orchard-habitat") {
      return orchardAssetUrl(season);
    }
    return landscapeRole === "garden" ? GARDEN_ASSETS[season] : FIELD_ASSETS[season];
  }
  if (anchor.role === "field-habitat") return FIELD_ASSETS[season];
  if (anchor.role === "orchard-habitat") return orchardAssetUrl(season);
  return PROP_ASSET_URLS[anchor.role as keyof typeof PROP_ASSET_URLS];
}

function assetTargetHeight(
  anchor: PlannedLandUseAnchor,
  landscapeRole: PlannedLandscapeRole | null,
): number {
  if (anchor.kind === "habitat") {
    if (landscapeRole === "orchard" || anchor.role === "orchard-habitat") return 5.4;
    return landscapeRole === "garden" ? 0.85 : 1.05;
  }
  if (anchor.role === "supply-stack") return 2.25;
  if (anchor.role === "orchard-marker") return 1.7;
  if (anchor.role === "watch-fire") return 1.9;
  return 1.55;
}

function matchingLandscapeRole(
  landUse: PlannedLandUse,
  anchor: PlannedLandUseAnchor,
): PlannedLandscapeRole | null {
  if (anchor.kind !== "habitat") return null;
  return (
    landUse.landscapePolygons.find(
      (landscape) =>
        landscape.hamletId === anchor.hamletId &&
        Math.hypot(landscape.center.x - anchor.position.x, landscape.center.z - anchor.position.z) <
          0.05,
    )?.role ?? null
  );
}

/** Converts only preplanned anchors into render instances; no placement is generated here. */
export function createPlannedLandUseAssetInstances(
  landUse: PlannedLandUse,
  season: KingdomSeason,
): ReadonlyArray<PlannedLandUseAssetInstance> {
  return landUse.anchors
    .slice(0, PLANNED_LAND_USE_RENDER_BUDGET.maximumExplicitAssets)
    .map((anchor) => {
      const landscapeRole = matchingLandscapeRole(landUse, anchor);
      return {
        id: anchor.id,
        url: plannedLandUseAnchorAssetUrl(anchor, season, landscapeRole),
        position: [anchor.position.x, anchor.position.y + 0.045, anchor.position.z] as const,
        rotationY: anchor.facingRadians,
        targetHeight: assetTargetHeight(anchor, landscapeRole),
      };
    });
}

/** URL batches are stable and are the renderer's authoritative prop grouping. */
export function createPlannedLandUseAssetBatches(
  instances: ReadonlyArray<PlannedLandUseAssetInstance>,
): ReadonlyArray<PlannedLandUseAssetBatch> {
  const groups = new Map<string, PlannedLandUseAssetInstance[]>();
  for (const instance of instances) {
    const group = groups.get(instance.url);
    if (group) group.push(instance);
    else groups.set(instance.url, [instance]);
  }
  return [...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([url, batchInstances]) => ({
      url,
      instances: [...batchInstances].sort((first, second) => first.id.localeCompare(second.id)),
    }));
}

export const PLANNED_LAND_USE_ASSET_URLS = [
  ...new Set([
    ...Object.values(PROP_ASSET_URLS),
    ...Object.values(FIELD_ASSETS),
    ...Object.values(GARDEN_ASSETS),
    ...(["spring", "summer", "autumn", "winter"] as const).map(orchardAssetUrl),
  ]),
] as const;

for (const url of PLANNED_LAND_USE_ASSET_URLS) useGLTF.preload(url);

type PlannedLandUseAssetPrimitive = Readonly<{
  id: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  sourceMatrix: THREE.Matrix4;
}>;

type PlannedLandUseAssetTemplate = Readonly<{
  height: number;
  minimumY: number;
  center: THREE.Vector3;
  primitives: ReadonlyArray<PlannedLandUseAssetPrimitive>;
}>;

function createPlannedLandUseAssetTemplate(scene: THREE.Object3D): PlannedLandUseAssetTemplate {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const primitives: PlannedLandUseAssetPrimitive[] = [];
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    primitives.push({
      id: child.uuid,
      geometry: child.geometry,
      material: child.material,
      sourceMatrix: child.matrixWorld.clone(),
    });
  });
  return {
    height: Math.max(0.1, bounds.max.y - bounds.min.y),
    minimumY: bounds.min.y,
    center: bounds.getCenter(new THREE.Vector3()),
    primitives,
  };
}

function createPlannedLandUseInstanceMatrices(
  batch: PlannedLandUseAssetBatch,
  template: PlannedLandUseAssetTemplate,
): ReadonlyArray<THREE.Matrix4> {
  return batch.instances.map((instance) => {
    const scale = instance.targetHeight / template.height;
    const world = new THREE.Matrix4().compose(
      new THREE.Vector3(...instance.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, instance.rotationY, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    const normalization = new THREE.Matrix4()
      .makeTranslation(
        -template.center.x * scale,
        -template.minimumY * scale,
        -template.center.z * scale,
      )
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    return world.multiply(normalization);
  });
}

function PlannedLandUseAssetPrimitiveBatch({
  primitive,
  matrices,
}: Readonly<{
  primitive: PlannedLandUseAssetPrimitive;
  matrices: ReadonlyArray<THREE.Matrix4>;
}>) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const composed = new THREE.Matrix4();
    matrices.forEach((matrix, index) => {
      mesh.current?.setMatrixAt(index, composed.multiplyMatrices(matrix, primitive.sourceMatrix));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [matrices, primitive.sourceMatrix]);
  return (
    <instancedMesh
      ref={mesh}
      args={[primitive.geometry, primitive.material, matrices.length]}
      receiveShadow
      frustumCulled={false}
    />
  );
}

function PlannedLandUseAssetBatchRenderer({
  batch,
}: Readonly<{ batch: PlannedLandUseAssetBatch }>) {
  const { scene } = useGLTF(batch.url);
  const template = useMemo(() => createPlannedLandUseAssetTemplate(scene), [scene]);
  const matrices = useMemo(
    () => createPlannedLandUseInstanceMatrices(batch, template),
    [batch, template],
  );
  return (
    <group name={`planned-land-use-batch:${batch.url}`} dispose={null}>
      {template.primitives.map((primitive) => (
        <PlannedLandUseAssetPrimitiveBatch
          key={primitive.id}
          primitive={primitive}
          matrices={matrices}
        />
      ))}
    </group>
  );
}

function hasGeometry(geometry: THREE.BufferGeometry): boolean {
  return geometry.getAttribute("position").count > 0;
}

function ProceduralSurface({
  name,
  geometry,
  style,
  polygonOffsetFactor,
  pattern = "solid",
}: Readonly<{
  name: string;
  geometry: THREE.BufferGeometry;
  style: PlannedLandUseSurfaceStyle;
  polygonOffsetFactor: number;
  pattern?: PlannedLandUseSurfacePattern;
}>) {
  const material = useMemo(() => {
    const patterned = pattern !== "solid";
    const next = new THREE.MeshStandardMaterial({
      color: style.color,
      roughness: style.roughness,
      metalness: 0,
      emissive: style.color,
      emissiveIntensity: style.emissiveIntensity,
      polygonOffset: true,
      polygonOffsetFactor,
      polygonOffsetUnits: 1,
      transparent: patterned,
      opacity: patterned ? (pattern === "developed" ? 0.5 : 0.72) : 1,
      depthWrite: !patterned,
    });
    if (patterned) {
      next.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            `#include <common>
attribute float ${LAND_USE_INTERIOR_ATTRIBUTE};
varying float vKingdomLandUseInterior;
varying vec3 vKingdomLandUseWorldPosition;`,
          )
          .replace(
            "#include <worldpos_vertex>",
            `#include <worldpos_vertex>
vKingdomLandUseInterior = ${LAND_USE_INTERIOR_ATTRIBUTE};
vKingdomLandUseWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
          );
        const patternExpression =
          pattern === "field"
            ? `float kingdomRow = 1.0 - smoothstep(
  0.12,
  0.31,
  abs(fract(dot(vKingdomLandUseWorldPosition.xz, vec2(0.86, 0.51)) / 3.4) - 0.5)
);
float kingdomPatternAlpha = 0.12 + kingdomRow * 0.68;
diffuseColor.rgb *= mix(0.86, 1.1, kingdomRow);`
            : pattern === "orchard"
              ? `vec2 kingdomOrchardCell = fract(vec2(
  dot(vKingdomLandUseWorldPosition.xz, vec2(0.94, 0.342)),
  dot(vKingdomLandUseWorldPosition.xz, vec2(-0.342, 0.94))
) / 5.2) - 0.5;
float kingdomOrchard = 1.0 - smoothstep(0.13, 0.25, length(kingdomOrchardCell));
float kingdomPatternAlpha = 0.1 + kingdomOrchard * 0.72;
diffuseColor.rgb *= mix(0.84, 1.12, kingdomOrchard);`
              : pattern === "garden"
                ? `float kingdomGardenRows = max(
  1.0 - smoothstep(0.1, 0.27, abs(fract(dot(vKingdomLandUseWorldPosition.xz, vec2(0.72, -0.69)) / 2.5) - 0.5)),
  (1.0 - smoothstep(0.08, 0.2, abs(fract(dot(vKingdomLandUseWorldPosition.xz, vec2(0.69, 0.72)) / 5.0) - 0.5))) * 0.48
);
float kingdomPatternAlpha = 0.1 + kingdomGardenRows * 0.64;
diffuseColor.rgb *= mix(0.88, 1.08, kingdomGardenRows);`
                : `float kingdomPatternAlpha = 0.48;
diffuseColor.rgb *= 0.96;`;
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
varying float vKingdomLandUseInterior;
varying vec3 vKingdomLandUseWorldPosition;`,
          )
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
${patternExpression}
float kingdomLandUseEdge = smoothstep(0.0, 0.34, vKingdomLandUseInterior);
diffuseColor.a *= kingdomPatternAlpha * kingdomLandUseEdge;
if (diffuseColor.a < 0.025) discard;`,
          );
      };
      next.customProgramCacheKey = () => `repo-land-use-surface/v2:${pattern}`;
    }
    return next;
  }, [pattern, polygonOffsetFactor, style]);
  useEffect(() => () => material.dispose(), [material]);
  if (!hasGeometry(geometry)) return null;
  return <mesh name={name} geometry={geometry} material={material} receiveShadow />;
}

export type PlannedLandUseLayerProps = Readonly<{
  plan: WorldPlan;
  landUse: PlannedLandUse;
  season: KingdomSeason;
}>;

/** Static, batched rendering of the already-planned repository land-use model. */
export function PlannedLandUseLayer({ plan, landUse, season }: PlannedLandUseLayerProps) {
  const geometry = useMemo(() => buildPlannedLandUseGeometryBundle(plan, landUse), [landUse, plan]);
  const zoneStyles = useMemo(() => getPlannedDevelopedZoneStyles(plan), [plan]);
  const landscapeStyles = useMemo(() => getPlannedLandscapeStyles(plan), [plan]);
  const assets = useMemo(
    () => createPlannedLandUseAssetInstances(landUse, season),
    [landUse, season],
  );
  const assetBatches = useMemo(() => createPlannedLandUseAssetBatches(assets), [assets]);
  const roadStyle = useMemo<PlannedLandUseSurfaceStyle>(
    () => ({
      color: mixColor("#b49368", plan.appearance.terrain.shore, 0.22),
      borderColor: mixColor("#51402f", plan.appearance.architecture.timberTint, 0.18),
      roughness: 1,
      emissiveIntensity: 0.014,
    }),
    [plan],
  );
  useEffect(() => () => disposePlannedLandUseGeometryBundle(geometry), [geometry]);

  return (
    <group name="planned-land-use-layer">
      <group name="planned-developed-zones">
        {geometry.zones.map(({ signature, surface, border }) => {
          const style = zoneStyles[signature];
          return (
            <group key={signature} name={`planned-zone-${signature}`}>
              <ProceduralSurface
                name={`${signature}-border`}
                geometry={border}
                style={{ ...style, color: style.borderColor }}
                polygonOffsetFactor={-1}
              />
              <ProceduralSurface
                name={`${signature}-surface`}
                geometry={surface}
                style={style}
                polygonOffsetFactor={-2}
                pattern="developed"
              />
            </group>
          );
        })}
      </group>
      <group name="planned-landscape-polygons">
        {geometry.landscapes.map(({ role, surface }) => (
          <ProceduralSurface
            key={role}
            name={`planned-landscape-${role}`}
            geometry={surface}
            style={landscapeStyles[role]}
            polygonOffsetFactor={-2}
            pattern={role}
          />
        ))}
      </group>
      <group name="planned-primary-road-network">
        <ProceduralSurface
          name="primary-road-border"
          geometry={geometry.roadBorder}
          style={{ ...roadStyle, color: roadStyle.borderColor }}
          polygonOffsetFactor={-2}
        />
        <ProceduralSurface
          name="primary-road-surface"
          geometry={geometry.roadSurface}
          style={roadStyle}
          polygonOffsetFactor={-3}
        />
        <ProceduralSurface
          name="bridge-decks"
          geometry={geometry.bridgeSurface}
          style={{ ...roadStyle, color: "#805b3d", borderColor: "#4d3425", roughness: 0.94 }}
          polygonOffsetFactor={-4}
        />
        <ProceduralSurface
          name="bridge-supports"
          geometry={geometry.bridgeStructure}
          style={{ ...roadStyle, color: "#493425", borderColor: "#35251c", roughness: 1 }}
          polygonOffsetFactor={-1}
        />
        <ProceduralSurface
          name="stepped-cut-treads"
          geometry={geometry.steppedSurface}
          style={{ ...roadStyle, color: "#a79986", borderColor: "#675c4e", roughness: 1 }}
          polygonOffsetFactor={-4}
        />
        <ProceduralSurface
          name="stepped-cut-retaining-walls"
          geometry={geometry.steppedStructure}
          style={{ ...roadStyle, color: "#685d51", borderColor: "#453e37", roughness: 1 }}
          polygonOffsetFactor={-1}
        />
      </group>
      <group name="planned-land-use-anchor-assets">
        {assetBatches.map((batch) => (
          <PlannedLandUseAssetBatchRenderer key={batch.url} batch={batch} />
        ))}
      </group>
    </group>
  );
}
