import { stableFraction, stableHash } from "@/lib/kingdom/hash";
import type { WorldPlan } from "@/lib/kingdom/world-plan";

import type { PlannedAmbientDetail, PlannedScatter, PlannedTree } from "./planned-scatter";
import {
  classifyPlannedTerrainRegion,
  getHamletVisualPlacementMask,
  getPlannedTerrainDefinition,
  samplePlannedWatershedPoint,
} from "./planned-terrain-model";

type Point = Readonly<{ x: number; z: number }>;

export type PlannedSupplementalTree = Readonly<{
  id: string;
  assetRole: PlannedTree["assetRole"];
  paletteRole: PlannedTree["paletteRole"];
  position: Point;
  rotationY: number;
  scale: Readonly<{ x: number; y: number; z: number }>;
}>;

export type PlannedCliffFormation = Readonly<{
  id: string;
  assetRole: "medium-rock-1" | "medium-rock-2";
  position: Point;
  rotation: Readonly<{ x: number; y: number; z: number }>;
  scale: Readonly<{ x: number; y: number; z: number }>;
}>;

export type PlannedShoreDetail = Readonly<{
  id: string;
  assetRole: Extract<
    PlannedAmbientDetail["assetRole"],
    "round-rock-path" | "bush" | "flowering-bush" | "fern" | "grass" | "flower-group"
  >;
  position: Point;
  rotationY: number;
  scale: Readonly<{ x: number; y: number; z: number }>;
}>;

export type PlannedMeadowDetail = PlannedShoreDetail;

export type PlannedVisualEnrichment = Readonly<{
  supplementalTrees: ReadonlyArray<PlannedSupplementalTree>;
  cliffFormations: ReadonlyArray<PlannedCliffFormation>;
  shoreDetails: ReadonlyArray<PlannedShoreDetail>;
  meadowDetails: ReadonlyArray<PlannedMeadowDetail>;
}>;

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function distance(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function minimumDistance(point: Point, others: ReadonlyArray<Point>): number {
  if (others.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...others.map((other) => distance(point, other)));
}

function normalizedHamletDistance(point: Point, plan: WorldPlan): number {
  return Math.min(
    ...plan.topology.hamlets.map((hamlet) => {
      const mask = getHamletVisualPlacementMask(plan, hamlet);
      const cosine = Math.cos(mask.rotation);
      const sine = Math.sin(mask.rotation);
      const deltaX = point.x - mask.center.x;
      const deltaZ = point.z - mask.center.z;
      const localX = deltaX * cosine + deltaZ * sine;
      const localZ = -deltaX * sine + deltaZ * cosine;
      return Math.hypot(localX / mask.radiusX, localZ / mask.radiusZ);
    }),
  );
}

function createSupplementalTrees(
  plan: WorldPlan,
  scatter: PlannedScatter,
): ReadonlyArray<PlannedSupplementalTree> {
  const { envelope, visualBudgets } = plan.topology;
  const targetTotal = Math.min(visualBudgets.maxTrees, Math.max(164, scatter.trees.length + 68));
  const target = Math.max(0, targetTotal - scatter.trees.length);
  const existing = scatter.trees.map((tree) => tree.transform.position);
  const accepted: Point[] = [...existing];
  const candidates: Array<Readonly<{ point: Point; score: number; key: string }>> = [];
  const columns = 20;
  const rows = 16;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const key = `${plan.topologyKey}:visual-tree:${column}:${row}`;
      const jitterX = stableFraction(`${key}:x`) - 0.5;
      const jitterZ = stableFraction(`${key}:z`) - 0.5;
      const point = {
        x: round(
          envelope.minX +
            envelope.safeMargin * 1.15 +
            ((column + 0.5 + jitterX * 0.72) / columns) *
              (envelope.width - envelope.safeMargin * 2.3),
        ),
        z: round(
          envelope.minZ +
            envelope.depth * 0.16 +
            ((row + 0.5 + jitterZ * 0.72) / rows) * envelope.depth * 0.7,
        ),
      };
      const region = classifyPlannedTerrainRegion(plan, point.x, point.z);
      if (
        !region.inside ||
        region.water !== null ||
        (region.material !== "low-meadow" && region.material !== "high-meadow") ||
        region.slopeDegrees > 24 ||
        normalizedHamletDistance(point, plan) < 1.32
      ) {
        continue;
      }
      const nearestCanopy = minimumDistance(point, existing);
      if (nearestCanopy < 5 || nearestCanopy > 32) continue;
      const normalizedX = Math.abs((point.x - envelope.center.x) / (envelope.width * 0.5));
      const normalizedZ = (point.z - envelope.minZ) / envelope.depth;
      const beltAffinity = 1 - Math.min(1, Math.abs(nearestCanopy - 17) / 17);
      const edgeAffinity = Math.max(0, normalizedX - 0.42) * 1.7;
      const rearAffinity = Math.max(0, 0.46 - normalizedZ) * 1.8;
      candidates.push({
        point,
        key,
        score:
          beltAffinity * 5 + edgeAffinity + rearAffinity + stableFraction(`${key}:score`) * 0.45,
      });
    }
  }

  candidates.sort(
    (first, second) => second.score - first.score || stableHash(first.key) - stableHash(second.key),
  );
  const result: PlannedSupplementalTree[] = [];
  const floweringRoles: ReadonlyArray<PlannedTree["assetRole"]> = [
    "common-tree-2",
    "twisted-tree-1",
  ];
  const greenRoles: ReadonlyArray<PlannedTree["assetRole"]> = [
    "common-tree-1",
    "common-tree-3",
    "twisted-tree-2",
    "pine-2",
  ];

  for (const candidate of candidates) {
    if (result.length >= target) break;
    if (minimumDistance(candidate.point, accepted) < 3.2) continue;
    accepted.push(candidate.point);
    const flowering = stableFraction(`${candidate.key}:palette`) < 0.43;
    const roles = flowering ? floweringRoles : greenRoles;
    const role = roles[stableHash(`${candidate.key}:role`) % roles.length]!;
    const scale = 0.76 + stableFraction(`${candidate.key}:scale`) * 0.52;
    result.push({
      id: `visual-tree-${stableHash(candidate.key).toString(16)}`,
      assetRole: role,
      paletteRole: flowering ? "flowering" : role === "pine-2" ? "pine" : "broadleaf",
      position: candidate.point,
      rotationY: round(stableFraction(`${candidate.key}:rotation`) * Math.PI * 2),
      scale: {
        x: round(scale * (0.88 + stableFraction(`${candidate.key}:width`) * 0.24)),
        y: round(scale * (0.94 + stableFraction(`${candidate.key}:height`) * 0.28)),
        z: round(scale * (0.88 + stableFraction(`${candidate.key}:depth`) * 0.24)),
      },
    });
  }
  return result;
}

function createCliffFormations(plan: WorldPlan): ReadonlyArray<PlannedCliffFormation> {
  const { envelope } = plan.topology;
  const terrain = getPlannedTerrainDefinition(plan);
  const candidates: Array<Readonly<{ point: Point; score: number; key: string }>> = [];
  const columns = 26;
  const rows = 12;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const key = `${plan.topologyKey}:cliff-formation:${column}:${row}`;
      const point = {
        x: round(
          envelope.minX +
            envelope.safeMargin * 0.9 +
            ((column + 0.5 + (stableFraction(`${key}:x`) - 0.5) * 0.62) / columns) *
              (envelope.width - envelope.safeMargin * 1.8),
        ),
        z: round(
          envelope.minZ +
            envelope.depth * 0.035 +
            ((row + 0.5 + (stableFraction(`${key}:z`) - 0.5) * 0.56) / rows) *
              envelope.depth *
              0.34,
        ),
      };
      const region = classifyPlannedTerrainRegion(plan, point.x, point.z);
      if (
        !region.inside ||
        region.water !== null ||
        (region.material !== "cliff-stone" && region.material !== "scree") ||
        region.height < 3 ||
        region.height > 15 ||
        region.slopeDegrees < 15 ||
        region.slopeDegrees > 52 ||
        point.z < terrain.rearFaceZ - envelope.depth * 0.015 ||
        point.z > terrain.rearFaceZ + envelope.depth * 0.09 ||
        normalizedHamletDistance(point, plan) < 1.42
      ) {
        continue;
      }
      candidates.push({
        point,
        key,
        score: region.height * 0.72 + region.slopeDegrees * 0.58 + stableFraction(key) * 5,
      });
    }
  }
  candidates.sort(
    (first, second) => second.score - first.score || stableHash(first.key) - stableHash(second.key),
  );
  const target = Math.round(Math.min(8, Math.max(5, envelope.width / 22)));
  const accepted: Point[] = [];
  const result: PlannedCliffFormation[] = [];
  for (const candidate of candidates) {
    if (result.length >= target) break;
    if (minimumDistance(candidate.point, accepted) < 12) continue;
    accepted.push(candidate.point);
    const base = 0.72 + stableFraction(`${candidate.key}:scale`) * 0.54;
    result.push({
      id: `cliff-${stableHash(candidate.key).toString(16)}`,
      assetRole: stableFraction(`${candidate.key}:role`) < 0.56 ? "medium-rock-1" : "medium-rock-2",
      position: candidate.point,
      rotation: {
        x: round((stableFraction(`${candidate.key}:tilt-x`) - 0.5) * 0.28),
        y: round(stableFraction(`${candidate.key}:rotation`) * Math.PI * 2),
        z: round((stableFraction(`${candidate.key}:tilt-z`) - 0.5) * 0.24),
      },
      scale: {
        x: round(base * (0.84 + stableFraction(`${candidate.key}:width`) * 0.42)),
        y: round(base * (0.9 + stableFraction(`${candidate.key}:height`) * 0.54)),
        z: round(base * (0.82 + stableFraction(`${candidate.key}:depth`) * 0.38)),
      },
    });
  }
  return result;
}

function createShoreDetails(plan: WorldPlan): ReadonlyArray<PlannedShoreDetail> {
  const lake = getPlannedTerrainDefinition(plan).water.lake;
  const candidates: Array<Readonly<{ point: Point; key: string }>> = [];

  for (let index = 0; index < 58; index += 1) {
    const key = `${plan.topologyKey}:lake-edge:${index}`;
    const angle = (index / 58) * Math.PI * 2 + (stableFraction(`${key}:angle`) - 0.5) * 0.08;
    const radial = 1.045 + stableFraction(`${key}:radius`) * 0.16;
    candidates.push({
      key,
      point: {
        x: round(lake.center.x + Math.cos(angle) * lake.radiusX * radial),
        z: round(lake.center.z + Math.sin(angle) * lake.radiusZ * radial),
      },
    });
  }
  for (let index = 2; index < 17; index += 1) {
    const progress = index / 19;
    const water = samplePlannedWatershedPoint(plan, progress);
    const next = samplePlannedWatershedPoint(plan, Math.min(1, progress + 0.015));
    const tangentX = next.x - water.x;
    const tangentZ = next.z - water.z;
    const length = Math.max(0.001, Math.hypot(tangentX, tangentZ));
    for (const side of [-1, 1] as const) {
      const key = `${plan.topologyKey}:river-edge:${index}:${side}`;
      const offset = water.width * 0.55 + 2.1 + stableFraction(`${key}:offset`) * 2.8;
      candidates.push({
        key,
        point: {
          x: round(water.x + (-tangentZ / length) * offset * side),
          z: round(water.z + (tangentX / length) * offset * side),
        },
      });
    }
  }

  const accepted: Point[] = [];
  const result: PlannedShoreDetail[] = [];
  const roles: ReadonlyArray<PlannedShoreDetail["assetRole"]> = [
    "grass",
    "fern",
    "round-rock-path",
    "flower-group",
    "bush",
    "flowering-bush",
  ];
  for (const candidate of candidates) {
    if (result.length >= 34) break;
    const region = classifyPlannedTerrainRegion(plan, candidate.point.x, candidate.point.z);
    if (
      !region.inside ||
      region.water !== null ||
      region.slopeDegrees > 28 ||
      normalizedHamletDistance(candidate.point, plan) < 1.14 ||
      minimumDistance(candidate.point, accepted) < 2.25
    ) {
      continue;
    }
    accepted.push(candidate.point);
    const role = roles[stableHash(`${candidate.key}:role`) % roles.length]!;
    const scale = 0.88 + stableFraction(`${candidate.key}:scale`) * 0.72;
    result.push({
      id: `shore-${stableHash(candidate.key).toString(16)}`,
      assetRole: role,
      position: candidate.point,
      rotationY: round(stableFraction(`${candidate.key}:rotation`) * Math.PI * 2),
      scale: {
        x: round(scale * (0.88 + stableFraction(`${candidate.key}:width`) * 0.28)),
        y: round(scale * (0.9 + stableFraction(`${candidate.key}:height`) * 0.34)),
        z: round(scale * (0.88 + stableFraction(`${candidate.key}:depth`) * 0.28)),
      },
    });
  }
  return result;
}

function createMeadowDetails(
  plan: WorldPlan,
  scatter: PlannedScatter,
  supplementalTrees: ReadonlyArray<PlannedSupplementalTree>,
): ReadonlyArray<PlannedMeadowDetail> {
  const { envelope } = plan.topology;
  const canopy = [
    ...scatter.trees.map((tree) => tree.transform.position),
    ...supplementalTrees.map((tree) => tree.position),
  ];
  const candidates: Array<Readonly<{ point: Point; key: string; score: number }>> = [];
  const columns = 19;
  const rows = 16;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const key = `${plan.topologyKey}:meadow-detail:${column}:${row}`;
      const point = {
        x: round(
          envelope.minX +
            envelope.safeMargin +
            ((column + 0.5 + (stableFraction(`${key}:x`) - 0.5) * 0.72) / columns) *
              (envelope.width - envelope.safeMargin * 2),
        ),
        z: round(
          envelope.minZ +
            envelope.depth * 0.2 +
            ((row + 0.5 + (stableFraction(`${key}:z`) - 0.5) * 0.72) / rows) * envelope.depth * 0.7,
        ),
      };
      const region = classifyPlannedTerrainRegion(plan, point.x, point.z);
      const hamletDistance = normalizedHamletDistance(point, plan);
      const canopyDistance = minimumDistance(point, canopy);
      if (
        !region.inside ||
        region.water !== null ||
        region.material === "shore" ||
        (region.material !== "low-meadow" && region.material !== "high-meadow") ||
        region.slopeDegrees > 18 ||
        hamletDistance < 1.12 ||
        canopyDistance < 4.2 ||
        canopyDistance > 25
      ) {
        continue;
      }
      const transitionAffinity = 1 - Math.min(1, Math.abs(canopyDistance - 11) / 14);
      const settlementAffinity = 1 - Math.min(1, Math.abs(hamletDistance - 1.7) / 1.3);
      candidates.push({
        point,
        key,
        score:
          transitionAffinity * 3.2 +
          settlementAffinity * 1.4 +
          stableFraction(`${key}:score`) * 0.45,
      });
    }
  }

  candidates.sort(
    (first, second) => second.score - first.score || stableHash(first.key) - stableHash(second.key),
  );
  const accepted: Point[] = [];
  const result: PlannedMeadowDetail[] = [];
  const roles: ReadonlyArray<PlannedMeadowDetail["assetRole"]> = [
    "grass",
    "flower-group",
    "flower-group",
    "fern",
    "flowering-bush",
    "bush",
  ];
  for (const candidate of candidates) {
    if (result.length >= 58) break;
    if (minimumDistance(candidate.point, accepted) < 3.1) continue;
    accepted.push(candidate.point);
    const role = roles[stableHash(`${candidate.key}:role`) % roles.length]!;
    const scale = 1.05 + stableFraction(`${candidate.key}:scale`) * 0.85;
    result.push({
      id: `meadow-${stableHash(candidate.key).toString(16)}`,
      assetRole: role,
      position: candidate.point,
      rotationY: round(stableFraction(`${candidate.key}:rotation`) * Math.PI * 2),
      scale: {
        x: round(scale * (0.9 + stableFraction(`${candidate.key}:width`) * 0.22)),
        y: round(scale * (0.92 + stableFraction(`${candidate.key}:height`) * 0.3)),
        z: round(scale * (0.9 + stableFraction(`${candidate.key}:depth`) * 0.22)),
      },
    });
  }
  return result;
}

/**
 * Adds budget-backed visual density around the semantic scatter without
 * changing repository topology or season-dependent placement.
 */
export function createPlannedVisualEnrichment(
  plan: WorldPlan,
  scatter: PlannedScatter,
): PlannedVisualEnrichment {
  const supplementalTrees = createSupplementalTrees(plan, scatter);
  const cliffFormations = createCliffFormations(plan);
  const remainingSurfaceBudget = Math.max(
    0,
    plan.topology.visualBudgets.maxSurfaceScatter -
      scatter.groundCoverClusters.reduce((total, cluster) => total + cluster.members.length, 0) -
      scatter.ambientDetails.length -
      cliffFormations.length,
  );
  const shoreDetails = createShoreDetails(plan).slice(0, remainingSurfaceBudget);
  const meadowDetails = createMeadowDetails(plan, scatter, supplementalTrees).slice(
    0,
    Math.max(0, remainingSurfaceBudget - shoreDetails.length),
  );
  return { supplementalTrees, cliffFormations, shoreDetails, meadowDetails };
}
