import * as THREE from "three";

import type { WorldPlan } from "@/lib/kingdom";

import type { PlannedScatter } from "./planned-scatter";
import {
  classifyPlannedTerrainRegion,
  getHamletVisualPlacementMask,
  samplePlannedTerrainHeight,
} from "./planned-terrain-model";

export const PLANNED_HAMLET_PATH_BATCH_DRAW_CALLS = 2;
export const PLANNED_HAMLET_PATH_SEGMENTS = 52;

export type PlannedPathKind = "lane" | "courtyard";

export type PlannedPathEdge = Readonly<{
  id: string;
  from: Readonly<{ x: number; z: number }>;
  to: Readonly<{ x: number; z: number }>;
  kind: PlannedPathKind;
}>;

export type PlannedHamletPathCorridorSample = Readonly<{
  progress: number;
  center: Readonly<{ x: number; z: number }>;
  normal: Readonly<{ x: number; z: number }>;
  surfaceHalfWidth: number;
  borderHalfWidth: number;
  borderLeft: Readonly<{ x: number; z: number }>;
  borderRight: Readonly<{ x: number; z: number }>;
}>;

/**
 * Canonical sampled footprint for one rendered local path. Both the ribbon
 * geometry and regional-placement clearance consume these exact samples, so a
 * courtyard or door lane cannot be dressed over by a visually separate model.
 */
export type PlannedHamletPathCorridor = Readonly<{
  id: string;
  kind: PlannedPathKind;
  samples: ReadonlyArray<PlannedHamletPathCorridorSample>;
  segments: ReadonlyArray<PlannedHamletPathCorridorSegment>;
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
}>;

export type PlannedHamletPathCorridorSegment = Readonly<{
  startLeft: Readonly<{ x: number; z: number }>;
  startRight: Readonly<{ x: number; z: number }>;
  endLeft: Readonly<{ x: number; z: number }>;
  endRight: Readonly<{ x: number; z: number }>;
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
}>;

export type PlannedHamletPathCorridorDistance = Readonly<{
  corridorId: string | null;
  distance: number;
}>;

export type PlannedHamletPathCorridorQueryBounds = Readonly<{
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}>;

export type PlannedHamletPathCorridorOptions = Readonly<{
  queryBounds?: ReadonlyArray<PlannedHamletPathCorridorQueryBounds>;
  clearance?: number;
}>;

export type PlannedHamletPathBatch = Readonly<{
  border: THREE.BufferGeometry;
  surface: THREE.BufferGeometry;
  renderedEdgeIds: ReadonlyArray<string>;
  generatedTriangleCount: number;
  drawCallCount: 0 | typeof PLANNED_HAMLET_PATH_BATCH_DRAW_CALLS;
}>;

export function createPlannedPathEdges(
  plan: WorldPlan,
  scatter: PlannedScatter,
): ReadonlyArray<PlannedPathEdge> {
  const hamlets = plan.topology.hamlets.map((hamlet) => ({
    ...hamlet,
    visualCenter: getHamletVisualPlacementMask(plan, hamlet).center,
  }));
  const edges: PlannedPathEdge[] = [];
  for (const hamlet of hamlets) {
    const buildings = scatter.buildings
      .filter((building) => building.hamletId === hamlet.id)
      .sort((first, second) => first.id.localeCompare(second.id));
    const landmark = scatter.landmarks.find((candidate) => candidate.hamletId === hamlet.id);
    const anchor =
      landmark?.transform.position ?? buildings[0]?.transform.position ?? hamlet.visualCenter;
    edges.push({
      id: `court-entry-${hamlet.id}`,
      from: hamlet.visualCenter,
      to: anchor,
      kind: "courtyard",
    });
    for (const building of buildings) {
      const doorDistance = 2.8 * building.transform.scale.y;
      const door = {
        x: building.transform.position.x + Math.sin(building.transform.rotationY) * doorDistance,
        z: building.transform.position.z + Math.cos(building.transform.rotationY) * doorDistance,
      };
      edges.push({
        id: `lane-${hamlet.id}-${building.id}`,
        from: anchor,
        to: door,
        kind: "lane",
      });
    }
  }
  return edges;
}

function pathCurve(plan: WorldPlan, edge: PlannedPathEdge): THREE.QuadraticBezierCurve3 | null {
  const start = new THREE.Vector3(edge.from.x, 0, edge.from.z);
  const end = new THREE.Vector3(edge.to.x, 0, edge.to.z);
  const midpoint = start.clone().lerp(end, 0.5);
  const direction = end.clone().sub(start);
  const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
  const bends = edge.kind === "lane" ? [0, 1.8, -1.8, 3.2, -3.2] : [0, 2.8, -2.8, 5, -5];
  let best: Readonly<{ curve: THREE.QuadraticBezierCurve3; penalty: number }> | null = null;
  for (const bend of bends) {
    const control = midpoint.clone().addScaledVector(perpendicular, bend);
    const curve = new THREE.QuadraticBezierCurve3(start, control, end);
    let penalty = 0;
    for (let index = 2; index < 38; index += 1) {
      const point = curve.getPoint(index / 40);
      const region = classifyPlannedTerrainRegion(plan, point.x, point.z);
      if (!region.inside) penalty += 100;
      if (region.water !== null) penalty += 80;
      if (region.material === "shore") penalty += 14;
      if (region.slopeDegrees > 18) penalty += region.slopeDegrees - 18;
      if (best && penalty >= best.penalty) break;
    }
    if (!best || penalty < best.penalty) best = { curve, penalty };
    if (best.penalty === 0) return best.curve;
  }
  return best && best.penalty < 18 ? best.curve : null;
}

function pathHalfWidth(kind: PlannedPathKind, progress: number): number {
  const baseHalfWidth = kind === "courtyard" ? 1.18 : 0.68;
  return baseHalfWidth + Math.sin(progress * Math.PI) * (kind === "courtyard" ? 0.12 : 0.06);
}

export function createPlannedHamletPathCorridors(
  plan: WorldPlan,
  scatter: PlannedScatter,
  options: PlannedHamletPathCorridorOptions = {},
): ReadonlyArray<PlannedHamletPathCorridor> {
  // A quadratic Bezier reaches at most half its control-point displacement
  // from the endpoint chord because 2t(1-t) peaks at 0.5.
  const maximumCurveOffset = 2.5;
  const maximumBorderHalfWidth = (1.18 + 0.12) * 1.34;
  const queryExpansion = maximumCurveOffset + maximumBorderHalfWidth + (options.clearance ?? 0);
  const edges = createPlannedPathEdges(plan, scatter).filter((edge) => {
    if (!options.queryBounds || options.queryBounds.length === 0) return true;
    const minX = Math.min(edge.from.x, edge.to.x) - queryExpansion;
    const maxX = Math.max(edge.from.x, edge.to.x) + queryExpansion;
    const minZ = Math.min(edge.from.z, edge.to.z) - queryExpansion;
    const maxZ = Math.max(edge.from.z, edge.to.z) + queryExpansion;
    return options.queryBounds.some(
      (bounds) =>
        maxX >= bounds.minX && minX <= bounds.maxX && maxZ >= bounds.minZ && minZ <= bounds.maxZ,
    );
  });
  return edges.flatMap((edge) => {
    const curve = pathCurve(plan, edge);
    if (!curve) return [];
    const samples = Array.from({ length: PLANNED_HAMLET_PATH_SEGMENTS + 1 }, (_, index) => {
      const progress = index / PLANNED_HAMLET_PATH_SEGMENTS;
      const point = curve.getPoint(progress);
      const tangent = curve.getTangent(progress);
      const tangentLength = Math.hypot(tangent.x, tangent.z);
      const normal =
        tangentLength > 0.000_001
          ? { x: -tangent.z / tangentLength, z: tangent.x / tangentLength }
          : { x: 0, z: 1 };
      const surfaceHalfWidth = pathHalfWidth(edge.kind, progress);
      const center = { x: point.x, z: point.z };
      const borderHalfWidth = surfaceHalfWidth * 1.34;
      return {
        progress,
        center,
        normal,
        surfaceHalfWidth,
        borderHalfWidth,
        borderLeft: {
          x: center.x - normal.x * borderHalfWidth,
          z: center.z - normal.z * borderHalfWidth,
        },
        borderRight: {
          x: center.x + normal.x * borderHalfWidth,
          z: center.z + normal.z * borderHalfWidth,
        },
      };
    });
    const segments = samples.slice(1).map((end, index) => {
      const start = samples[index]!;
      const borderPoints = [start.borderLeft, start.borderRight, end.borderLeft, end.borderRight];
      return {
        startLeft: start.borderLeft,
        startRight: start.borderRight,
        endLeft: end.borderLeft,
        endRight: end.borderRight,
        bounds: {
          minX: Math.min(...borderPoints.map((point) => point.x)),
          maxX: Math.max(...borderPoints.map((point) => point.x)),
          minZ: Math.min(...borderPoints.map((point) => point.z)),
          maxZ: Math.max(...borderPoints.map((point) => point.z)),
        },
      };
    });
    const borderPoints = samples.flatMap((sample) => [sample.borderLeft, sample.borderRight]);
    return [
      {
        id: edge.id,
        kind: edge.kind,
        samples,
        segments,
        bounds: {
          minX: Math.min(...borderPoints.map((point) => point.x)),
          maxX: Math.max(...borderPoints.map((point) => point.x)),
          minZ: Math.min(...borderPoints.map((point) => point.z)),
          maxZ: Math.max(...borderPoints.map((point) => point.z)),
        },
      },
    ];
  });
}

type FlatPoint = Readonly<{ x: number; z: number }>;

function pointToBoundsDistanceSquared(
  point: FlatPoint,
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>,
): number {
  const deltaX = Math.max(bounds.minX - point.x, 0, point.x - bounds.maxX);
  const deltaZ = Math.max(bounds.minZ - point.z, 0, point.z - bounds.maxZ);
  return deltaX * deltaX + deltaZ * deltaZ;
}

function pointToSegmentDistanceSquared(point: FlatPoint, start: FlatPoint, end: FlatPoint): number {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const progress =
    lengthSquared <= 0.000_001
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((point.x - start.x) * deltaX + (point.z - start.z) * deltaZ) / lengthSquared,
          ),
        );
  const distanceX = point.x - (start.x + deltaX * progress);
  const distanceZ = point.z - (start.z + deltaZ * progress);
  return distanceX * distanceX + distanceZ * distanceZ;
}

function triangleSign(point: FlatPoint, first: FlatPoint, second: FlatPoint): number {
  return (point.x - second.x) * (first.z - second.z) - (first.x - second.x) * (point.z - second.z);
}

function pointInsideTriangle(
  point: FlatPoint,
  first: FlatPoint,
  second: FlatPoint,
  third: FlatPoint,
): boolean {
  const sign1 = triangleSign(point, first, second);
  const sign2 = triangleSign(point, second, third);
  const sign3 = triangleSign(point, third, first);
  const hasNegative = sign1 < -0.000_001 || sign2 < -0.000_001 || sign3 < -0.000_001;
  const hasPositive = sign1 > 0.000_001 || sign2 > 0.000_001 || sign3 > 0.000_001;
  return !(hasNegative && hasPositive);
}

function pointToTriangleDistanceSquared(
  point: FlatPoint,
  first: FlatPoint,
  second: FlatPoint,
  third: FlatPoint,
): number {
  if (pointInsideTriangle(point, first, second, third)) return 0;
  return Math.min(
    pointToSegmentDistanceSquared(point, first, second),
    pointToSegmentDistanceSquared(point, second, third),
    pointToSegmentDistanceSquared(point, third, first),
  );
}

/** Exact XZ distance to the rendered border triangles in the shared corridor contract. */
export function queryPlannedHamletPathCorridorDistance(
  point: FlatPoint,
  corridors: ReadonlyArray<PlannedHamletPathCorridor>,
): PlannedHamletPathCorridorDistance {
  let corridorId: string | null = null;
  let distanceSquared = Number.POSITIVE_INFINITY;
  for (const corridor of corridors) {
    if (pointToBoundsDistanceSquared(point, corridor.bounds) > distanceSquared) continue;
    for (const segment of corridor.segments) {
      if (pointToBoundsDistanceSquared(point, segment.bounds) > distanceSquared) continue;
      const candidateDistanceSquared = Math.min(
        pointToTriangleDistanceSquared(point, segment.startLeft, segment.endLeft, segment.endRight),
        pointToTriangleDistanceSquared(
          point,
          segment.startLeft,
          segment.endRight,
          segment.startRight,
        ),
      );
      if (
        candidateDistanceSquared < distanceSquared - 0.000_000_000_001 ||
        (Math.abs(candidateDistanceSquared - distanceSquared) <= 0.000_000_000_001 &&
          corridor.id.localeCompare(corridorId ?? "") < 0)
      ) {
        corridorId = corridor.id;
        distanceSquared = candidateDistanceSquared;
      }
    }
  }
  return { corridorId, distance: Math.sqrt(distanceSquared) };
}

function buildPathGeometry(
  plan: WorldPlan,
  corridor: PlannedHamletPathCorridor,
  layer: "border" | "surface",
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const sample of corridor.samples) {
    for (const side of [-1, 1]) {
      const borderPoint = side === -1 ? sample.borderLeft : sample.borderRight;
      const x =
        layer === "border"
          ? borderPoint.x
          : sample.center.x + sample.normal.x * sample.surfaceHalfWidth * side;
      const z =
        layer === "border"
          ? borderPoint.z
          : sample.center.z + sample.normal.z * sample.surfaceHalfWidth * side;
      positions.push(
        x,
        samplePlannedTerrainHeight(plan, x, z) + (layer === "border" ? 0.065 : 0.095),
        z,
      );
    }
  }
  for (let index = 0; index < corridor.samples.length - 1; index += 1) {
    const offset = index * 2;
    indices.push(offset, offset + 2, offset + 3, offset, offset + 3, offset + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function mergePathGeometries(
  geometries: ReadonlyArray<THREE.BufferGeometry>,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;
  for (const geometry of geometries) {
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    for (let index = 0; index < position.count; index += 1) {
      positions.push(position.getX(index), position.getY(index), position.getZ(index));
      normals.push(normal.getX(index), normal.getY(index), normal.getZ(index));
    }
    const sourceIndex = geometry.index;
    if (!sourceIndex) throw new Error("Planned path geometry must remain indexed.");
    for (let index = 0; index < sourceIndex.count; index += 1) {
      indices.push(sourceIndex.getX(index) + vertexOffset);
    }
    vertexOffset += position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  merged.setIndex(indices);
  if (indices.length > 0) {
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
  }
  return merged;
}

/**
 * Keeps every deterministic lane vertex while reducing N lane meshes to one
 * border mesh and one surface mesh. Inter-hamlet travel remains exclusively in
 * PlannedLandUse; this module only renders local courtyard/door connections.
 */
export function createPlannedHamletPathBatch(
  plan: WorldPlan,
  scatter: PlannedScatter,
): PlannedHamletPathBatch {
  const borderParts: THREE.BufferGeometry[] = [];
  const surfaceParts: THREE.BufferGeometry[] = [];
  const renderedEdgeIds: string[] = [];
  for (const corridor of createPlannedHamletPathCorridors(plan, scatter)) {
    const border = buildPathGeometry(plan, corridor, "border");
    const surface = buildPathGeometry(plan, corridor, "surface");
    borderParts.push(border);
    surfaceParts.push(surface);
    renderedEdgeIds.push(corridor.id);
  }
  const border = mergePathGeometries(borderParts);
  const surface = mergePathGeometries(surfaceParts);
  borderParts.forEach((geometry) => geometry.dispose());
  surfaceParts.forEach((geometry) => geometry.dispose());
  const generatedTriangleCount = ((border.index?.count ?? 0) + (surface.index?.count ?? 0)) / 3;
  return {
    border,
    surface,
    renderedEdgeIds,
    generatedTriangleCount,
    drawCallCount: renderedEdgeIds.length === 0 ? 0 : PLANNED_HAMLET_PATH_BATCH_DRAW_CALLS,
  };
}

export function disposePlannedHamletPathBatch(batch: PlannedHamletPathBatch): void {
  batch.border.dispose();
  batch.surface.dispose();
}
