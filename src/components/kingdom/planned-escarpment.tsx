"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { stableFraction } from "@/lib/kingdom/hash";
import type { WorldPlan } from "@/lib/kingdom/world-plan";

import { samplePlannedTerrainHeight } from "./planned-terrain-model";

export type PlannedEscarpmentQuality = "low" | "high";

export type PlannedEscarpmentProps = Readonly<{
  plan: WorldPlan;
  quality?: PlannedEscarpmentQuality;
}>;

export type PlannedEscarpmentPoint = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type PlannedEscarpmentGeometryData = Readonly<{
  positions: Float32Array;
  indices: Uint32Array;
  materialZones: Uint8Array;
  vertexCount: number;
  triangleCount: number;
  faceTriangleCount: number;
  shelfTriangleCount: number;
  rearTriangleCount: number;
  endCapTriangleCount: number;
  columns: number;
  rearRows: number;
  bandCount: number;
  wallWidth: number;
  shelfDepth: number;
  rearConnectionDepth: number;
  maximumRearSlopeDegrees: number;
  maximumRearStep: number;
  crest: ReadonlyArray<PlannedEscarpmentPoint>;
  notch: Readonly<{
    centerX: number;
    width: number;
    depth: number;
  }>;
}>;

const MATERIAL_STONE = 0;
const MATERIAL_LEDGE = 1;
const MATERIAL_GRASS = 2;

const QUALITY_COLUMNS: Readonly<Record<PlannedEscarpmentQuality, number>> = {
  low: 48,
  high: 88,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function mix(first: number, second: number, amount: number): number {
  return first + (second - first) * amount;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function findHeadwaterX(plan: WorldPlan): number {
  const watershed = plan.topology.terrainZones.find(
    (zone) => zone.kind === "watershed" && zone.mask.shape === "corridor",
  );
  if (watershed?.mask.shape !== "corridor") return plan.topology.envelope.center.x;
  return watershed.mask.points[0]?.x ?? plan.topology.envelope.center.x;
}

type CrestSample = Readonly<
  PlannedEscarpmentPoint & {
    baseY: number;
    baseZ: number;
    shelfY: number;
    shelfZ: number;
    groundY: number;
    groundZ: number;
  }
>;

type FaceRow = Readonly<{
  heightProgress: number;
  depthProgress: number;
  projection: number;
  material: 0 | 1;
}>;

function buildFaceRows(topologyKey: string, bandCount: number): ReadonlyArray<FaceRow> {
  const rows: FaceRow[] = [
    { heightProgress: 0, depthProgress: 0, projection: 0, material: MATERIAL_STONE },
  ];
  for (let band = 1; band <= bandCount; band += 1) {
    const progress = clamp(
      band / (bandCount + 1) +
        (stableFraction(`${topologyKey}:ribbon:ledge:${band}:height`) - 0.5) * 0.045,
      0.08,
      0.92,
    );
    const thickness =
      0.011 + stableFraction(`${topologyKey}:ribbon:ledge:${band}:thickness`) * 0.016;
    const projection =
      0.045 + stableFraction(`${topologyKey}:ribbon:ledge:${band}:projection`) * 0.065;
    rows.push(
      {
        heightProgress: progress - thickness * 0.75,
        depthProgress: progress - thickness * 0.58,
        projection: 0,
        material: MATERIAL_STONE,
      },
      {
        heightProgress: progress - thickness * 0.75,
        depthProgress: progress,
        projection,
        material: MATERIAL_LEDGE,
      },
      {
        heightProgress: progress + thickness * 1.25,
        depthProgress: progress + thickness * 0.82,
        projection: 0.025,
        material: MATERIAL_STONE,
      },
    );
  }
  rows.push({ heightProgress: 1, depthProgress: 1, projection: 0, material: MATERIAL_STONE });
  return rows;
}

function appendQuad(
  indices: number[],
  upperLeft: number,
  lowerLeft: number,
  upperRight: number,
  lowerRight: number,
): void {
  indices.push(upperLeft, lowerLeft, upperRight, upperRight, lowerLeft, lowerRight);
}

function appendEndCap(
  positions: number[],
  indices: number[],
  zones: number[],
  boundary: ReadonlyArray<PlannedEscarpmentPoint>,
  outwardX: -1 | 1,
): number {
  const start = positions.length / 3;
  const total = boundary.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }),
    { x: 0, y: 0, z: 0 },
  );
  const center = {
    x: total.x / boundary.length,
    y: total.y / boundary.length,
    z: total.z / boundary.length,
  };
  positions.push(center.x, center.y, center.z);
  zones.push(MATERIAL_STONE);
  for (const point of boundary) {
    positions.push(point.x, point.y, point.z);
    zones.push(MATERIAL_STONE);
  }
  for (let index = 0; index < boundary.length; index += 1) {
    const next = (index + 1) % boundary.length;
    const first = boundary[index]!;
    const second = boundary[next]!;
    const firstY = first.y - center.y;
    const firstZ = first.z - center.z;
    const secondY = second.y - center.y;
    const secondZ = second.z - center.z;
    const normalX = firstY * secondZ - firstZ * secondY;
    if (normalX * outwardX >= 0) indices.push(start, start + 1 + index, start + 1 + next);
    else indices.push(start, start + 1 + next, start + 1 + index);
  }
  return boundary.length;
}

/**
 * Builds the repository-deterministic rear wall. Positions and indices depend
 * only on topology, so changing season can recolor but never reshape it.
 */
export function buildPlannedEscarpmentGeometry(
  plan: WorldPlan,
  quality: PlannedEscarpmentQuality = "high",
): PlannedEscarpmentGeometryData {
  const { envelope, camera } = plan.topology;
  const columns = QUALITY_COLUMNS[quality];
  const rearRows = quality === "high" ? 12 : 8;
  const bandCount = 4 + Math.floor(stableFraction(`${plan.topologyKey}:ribbon:bands`) * 3);
  const wallWidthRatio = 0.68 + stableFraction(`${plan.topologyKey}:ribbon:width`) * 0.05;
  const wallWidth = envelope.width * wallWidthRatio;
  const centerShift =
    (stableFraction(`${plan.topologyKey}:ribbon:center`) - 0.5) * envelope.width * 0.035;
  const wallCenterX = clamp(
    envelope.center.x + centerShift,
    envelope.minX + envelope.safeMargin + wallWidth / 2,
    envelope.maxX - envelope.safeMargin - wallWidth / 2,
  );
  const minimumX = wallCenterX - wallWidth / 2;
  const headwaterX = clamp(
    findHeadwaterX(plan),
    minimumX + wallWidth * 0.08,
    minimumX + wallWidth * 0.92,
  );
  const notchWidth = clamp(wallWidth * 0.034, 4.2, 6.8);
  const notchDepth = clamp(envelope.depth * 0.061, 8.5, 12.5);
  const shelfDepth =
    envelope.depth * (0.032 + stableFraction(`${plan.topologyKey}:ribbon:shelf-depth`) * 0.009);
  const requestedRearConnectionDepth =
    envelope.depth *
    (0.135 + stableFraction(`${plan.topologyKey}:ribbon:rear-connection-depth`) * 0.005);
  const nominalBaseZ = camera.horizonZ + envelope.depth * 0.045;
  const faceDepth =
    envelope.depth * (0.044 + stableFraction(`${plan.topologyKey}:ribbon:face-depth`) * 0.01);
  const phaseA = stableFraction(`${plan.topologyKey}:ribbon:phase:a`) * Math.PI * 2;
  const phaseB = stableFraction(`${plan.topologyKey}:ribbon:phase:b`) * Math.PI * 2;
  const phaseC = stableFraction(`${plan.topologyKey}:ribbon:phase:c`) * Math.PI * 2;

  const crest: CrestSample[] = [];
  for (let column = 0; column <= columns; column += 1) {
    const progress = column / columns;
    const signedProgress = progress * 2 - 1;
    const x = minimumX + wallWidth * progress;
    const edgeStrength = smoothstep(0, 0.14, progress) * smoothstep(0, 0.14, 1 - progress);
    const baseZ =
      nominalBaseZ +
      Math.sin(progress * Math.PI * 3.2 + phaseA) * envelope.depth * 0.0042 +
      Math.sin(progress * Math.PI * 7.4 + phaseB) * envelope.depth * 0.0015;
    const crestZ =
      baseZ - faceDepth + Math.sin(progress * Math.PI * 4.3 + phaseC) * envelope.depth * 0.0032;
    const baseY = samplePlannedTerrainHeight(plan, x, baseZ) + 0.12;

    let rearSupport = Number.NEGATIVE_INFINITY;
    for (let sample = 0; sample <= 10; sample += 1) {
      const z = mix(envelope.minZ + envelope.safeMargin * 0.45, crestZ, sample / 10);
      rearSupport = Math.max(rearSupport, samplePlannedTerrainHeight(plan, x, z));
    }

    const broadCrest =
      Math.sin(progress * Math.PI * 3.1 + phaseA) * 2.55 +
      Math.sin(progress * Math.PI * 7.2 + phaseB) * 1.52;
    const crestChips =
      Math.sin(progress * Math.PI * 14.6 + phaseC) * 1.02 +
      Math.sin(progress * Math.PI * 23.4 - phaseA) * 0.52;
    let spire = 0;
    for (let peak = 0; peak < 5; peak += 1) {
      const peakCenter =
        0.1 +
        peak * 0.2 +
        (stableFraction(`${plan.topologyKey}:ribbon:peak:${peak}:center`) - 0.5) * 0.055;
      const peakRadius =
        0.075 + stableFraction(`${plan.topologyKey}:ribbon:peak:${peak}:radius`) * 0.045;
      const peakAmplitude =
        2.8 + stableFraction(`${plan.topologyKey}:ribbon:peak:${peak}:height`) * 4.8;
      const peakStrength = Math.max(0, 1 - Math.abs(progress - peakCenter) / peakRadius);
      spire = Math.max(spire, Math.pow(peakStrength, 1.55) * peakAmplitude);
    }
    const minimumFaceHeight = mix(8.5, 14.5, edgeStrength);
    const uncutCrest =
      Math.max(baseY + minimumFaceHeight, rearSupport + 0.9) +
      (broadCrest + crestChips + spire) * edgeStrength;
    const notchDistance = (x - headwaterX) / notchWidth;
    const notchCut = Math.exp(-(notchDistance * notchDistance) * 1.3) * notchDepth;
    const coreCrestY = Math.max(baseY + 5.8, uncutCrest - notchCut);
    // Both ribbon ends return to the sampled terrain instead of terminating as
    // tall sheets when the camera orbits around either flank.
    const crestY = mix(baseY, coreCrestY, edgeStrength);
    const shelfZ = crestZ - shelfDepth * (0.9 + Math.cos(signedProgress * Math.PI) * 0.08);
    const shelfTerrain = samplePlannedTerrainHeight(plan, x, shelfZ) + 0.18;
    const coreShelfY = clamp(
      shelfTerrain,
      coreCrestY - 1.45,
      coreCrestY + 0.32 + Math.sin(progress * Math.PI * 5 + phaseB) * 0.1,
    );
    const shelfY = mix(shelfTerrain, coreShelfY, edgeStrength);
    const groundZ = Math.max(
      envelope.minZ + envelope.safeMargin * 0.42,
      shelfZ - requestedRearConnectionDepth,
    );
    const groundY = samplePlannedTerrainHeight(plan, x, groundZ) + 0.055;
    crest.push({ x, y: crestY, z: crestZ, baseY, baseZ, shelfY, shelfZ, groundY, groundZ });
  }
  const rearConnectionDepth = Math.min(...crest.map((sample) => sample.shelfZ - sample.groundZ));

  const positions: number[] = [];
  const indices: number[] = [];
  const zones: number[] = [];
  const faceRows = buildFaceRows(plan.topologyKey, bandCount);
  const verticesPerRow = columns + 1;

  for (const row of faceRows) {
    for (let column = 0; column <= columns; column += 1) {
      const sample = crest[column]!;
      const irregularProjection =
        row.projection * (0.76 + Math.sin((column / columns) * Math.PI * 9.2 + phaseC) * 0.24);
      const columnProgress = column / columns;
      const edgeTaper =
        smoothstep(0, 0.14, columnProgress) * smoothstep(0, 0.14, 1 - columnProgress);
      const verticalRib =
        (Math.sin(columnProgress * Math.PI * 12.7 + phaseA) * 0.32 +
          Math.sin(columnProgress * Math.PI * 25.8 - phaseC) * 0.16) *
        (0.3 + Math.sin(row.heightProgress * Math.PI) * 0.7) *
        edgeTaper;
      positions.push(
        sample.x,
        mix(sample.y, sample.baseY, row.heightProgress),
        mix(sample.z, sample.baseZ, row.depthProgress) + irregularProjection + verticalRib,
      );
      zones.push(row.material);
    }
  }
  for (let row = 0; row < faceRows.length - 1; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const upperLeft = row * verticesPerRow + column;
      const upperRight = upperLeft + 1;
      const lowerLeft = upperLeft + verticesPerRow;
      const lowerRight = lowerLeft + 1;
      appendQuad(indices, upperLeft, lowerLeft, upperRight, lowerRight);
    }
  }
  const faceTriangleCount = indices.length / 3;

  const shelfStart = positions.length / 3;
  for (const sample of crest) {
    positions.push(sample.x, sample.y + 0.025, sample.z);
    zones.push(MATERIAL_GRASS);
  }
  const shelfRearStart = positions.length / 3;
  for (const sample of crest) {
    positions.push(sample.x, sample.shelfY + 0.025, sample.shelfZ);
    zones.push(MATERIAL_GRASS);
  }
  for (let column = 0; column < columns; column += 1) {
    const frontLeft = shelfStart + column;
    const frontRight = frontLeft + 1;
    const rearLeft = shelfRearStart + column;
    const rearRight = rearLeft + 1;
    indices.push(frontLeft, frontRight, rearLeft, frontRight, rearRight, rearLeft);
  }

  const rearStart = positions.length / 3;
  let maximumRearSlopeDegrees = 0;
  let maximumRearStep = 0;
  for (let row = 0; row <= rearRows; row += 1) {
    const progress = row / rearRows;
    const eased = mix(progress, smoothstep(0, 1, progress), 0.18);
    for (let column = 0; column <= columns; column += 1) {
      const sample = crest[column]!;
      const z = mix(sample.shelfZ, sample.groundZ, progress);
      const terrainY = samplePlannedTerrainHeight(plan, sample.x, z) + 0.055;
      const shelfY = sample.shelfY + 0.025;
      const y = mix(shelfY, terrainY, eased);
      positions.push(sample.x, y, z);
      zones.push(MATERIAL_GRASS);
      if (row > 0) {
        const previousVertex = rearStart + (row - 1) * verticesPerRow + column;
        const previousY = positions[previousVertex * 3 + 1]!;
        const previousZ = positions[previousVertex * 3 + 2]!;
        const rise = Math.abs(y - previousY);
        const run = Math.max(0.000_1, Math.abs(z - previousZ));
        maximumRearStep = Math.max(maximumRearStep, rise);
        maximumRearSlopeDegrees = Math.max(
          maximumRearSlopeDegrees,
          (Math.atan(rise / run) * 180) / Math.PI,
        );
      }
    }
  }
  for (let row = 0; row < rearRows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const frontLeft = rearStart + row * verticesPerRow + column;
      const frontRight = frontLeft + 1;
      const backLeft = frontLeft + verticesPerRow;
      const backRight = backLeft + 1;
      indices.push(frontLeft, frontRight, backLeft, frontRight, backRight, backLeft);
    }
  }
  const rearTriangleCount = columns * rearRows * 2;

  const endCapStart = indices.length / 3;
  for (const [column, outwardX] of [
    [0, -1],
    [columns, 1],
  ] as const) {
    const boundary: PlannedEscarpmentPoint[] = [];
    for (let row = 0; row < faceRows.length; row += 1) {
      const vertex = row * verticesPerRow + column;
      boundary.push({
        x: positions[vertex * 3]!,
        y: positions[vertex * 3 + 1]!,
        z: positions[vertex * 3 + 2]!,
      });
    }
    for (let row = rearRows; row >= 0; row -= 1) {
      const vertex = rearStart + row * verticesPerRow + column;
      boundary.push({
        x: positions[vertex * 3]!,
        y: positions[vertex * 3 + 1]!,
        z: positions[vertex * 3 + 2]!,
      });
    }
    appendEndCap(positions, indices, zones, boundary, outwardX);
  }
  const endCapTriangleCount = indices.length / 3 - endCapStart;
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    materialZones: new Uint8Array(zones),
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
    faceTriangleCount,
    shelfTriangleCount: columns * 2,
    rearTriangleCount,
    endCapTriangleCount,
    columns,
    rearRows,
    bandCount,
    wallWidth,
    shelfDepth,
    rearConnectionDepth,
    maximumRearSlopeDegrees,
    maximumRearStep,
    crest: crest.map(({ x, y, z }) => ({ x, y, z })),
    notch: { centerX: headwaterX, width: notchWidth * 2, depth: notchDepth },
  };
}

function blendColor(first: string, second: string, amount: number): THREE.Color {
  return new THREE.Color(first).lerp(new THREE.Color(second), amount);
}

function escarpmentPalette(plan: WorldPlan): ReadonlyArray<THREE.Color> {
  const terrain = plan.appearance.terrain;
  const warmStone = blendColor(terrain.escarpment, "#ead0bd", 0.82);
  const ledge = warmStone.clone().lerp(new THREE.Color(terrain.shore), 0.06);
  const grass = blendColor(terrain.meadow, plan.appearance.atmosphere.horizon, 0.13);
  return [warmStone, ledge, grass];
}

function vertexColor(
  base: THREE.Color,
  materialZone: number,
  x: number,
  y: number,
  z: number,
): THREE.Color {
  if (materialZone === MATERIAL_GRASS) {
    const meadowField =
      Math.sin(x * 0.045 + z * 0.022) * 0.55 + Math.sin(x * 0.12 - z * 0.065) * 0.22;
    return base.clone().offsetHSL(meadowField * 0.006, meadowField * 0.018, meadowField * 0.036);
  }
  const verticalRibs =
    Math.sin(x * 0.105 + z * 0.018) * 0.64 +
    Math.sin(x * 0.047 - z * 0.011) * 0.36 +
    Math.sin(x * 0.19 + z * 0.007) * 0.17;
  const horizontalStrata =
    Math.sin(y * 0.39 + x * 0.012) * 0.08 + Math.sin(y * 0.83 - z * 0.01) * 0.035;
  const ledgeLift = materialZone === MATERIAL_LEDGE ? 0.006 : 0;
  return base
    .clone()
    .offsetHSL(
      verticalRibs * 0.009,
      -Math.abs(verticalRibs) * 0.014,
      verticalRibs * 0.11 + horizontalStrata * 0.012 + ledgeLift,
    );
}

function toBufferGeometry(
  data: PlannedEscarpmentGeometryData,
  palette: ReadonlyArray<THREE.Color>,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  const colors = new Float32Array(data.vertexCount * 3);
  for (let index = 0; index < data.vertexCount; index += 1) {
    const materialZone = data.materialZones[index] ?? MATERIAL_STONE;
    const base = palette[materialZone] ?? palette[MATERIAL_STONE]!;
    const color = vertexColor(
      base,
      materialZone,
      data.positions[index * 3] ?? 0,
      data.positions[index * 3 + 1] ?? 0,
      data.positions[index * 3 + 2] ?? 0,
    );
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function PlannedEscarpment({ plan, quality = "high" }: PlannedEscarpmentProps) {
  const data = useMemo(() => buildPlannedEscarpmentGeometry(plan, quality), [plan, quality]);
  const palette = useMemo(() => escarpmentPalette(plan), [plan]);
  const geometry = useMemo(() => toBufferGeometry(data, palette), [data, palette]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      name="planned-rear-escarpment"
      geometry={geometry}
      castShadow={false}
      receiveShadow
      renderOrder={1}
    >
      <meshStandardMaterial
        vertexColors
        roughness={0.96}
        metalness={0}
        envMapIntensity={0.3}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}
