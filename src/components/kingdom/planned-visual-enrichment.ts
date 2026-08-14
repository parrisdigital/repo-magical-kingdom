import { stableFraction, stableHash } from "@/lib/kingdom/hash";
import {
  interpolateRepositoryComposition,
  interpolateRepositoryCompositionInteger,
} from "@/lib/kingdom/repository-scale";
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
  beltId: string;
  beltStartGroveId: string;
  beltEndGroveId: string;
  assetRole: PlannedTree["assetRole"];
  paletteRole: PlannedTree["paletteRole"];
  woodlandRole: "dominant";
  densityRole: "connector";
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
  clusterId: string;
  assetRole: Extract<
    PlannedAmbientDetail["assetRole"],
    "round-rock-path" | "bush" | "flowering-bush" | "fern" | "grass" | "flower-group"
  >;
  position: Point;
  rotationY: number;
  scale: Readonly<{ x: number; y: number; z: number }>;
}>;

export type PlannedMeadowDetail = Readonly<Omit<PlannedShoreDetail, "clusterId">>;

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

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (lengthSquared === 0) return distance(point, start);
  const progress = Math.min(
    1,
    Math.max(0, ((point.x - start.x) * deltaX + (point.z - start.z) * deltaZ) / lengthSquared),
  );
  return Math.hypot(
    point.x - (start.x + deltaX * progress),
    point.z - (start.z + deltaZ * progress),
  );
}

function minimumPolylineDistance(point: Point, points: ReadonlyArray<Point>): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    minimum = Math.min(minimum, distanceToSegment(point, points[index - 1]!, points[index]!));
  }
  return minimum;
}

function distanceToSettlementPaths(point: Point, plan: WorldPlan): number {
  const terraces = [...getPlannedTerrainDefinition(plan).terraces].sort(
    (first, second) => first.center.z - second.center.z || first.id.localeCompare(second.id),
  );
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < terraces.length; index += 1) {
    minimum = Math.min(
      minimum,
      distanceToSegment(point, terraces[index - 1]!.center, terraces[index]!.center),
    );
  }
  return minimum;
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
  const compactTarget = Math.min(visualBudgets.maxTrees, Math.max(164, scatter.trees.length + 68));
  const targetTotal = Math.round(
    interpolateRepositoryComposition(
      plan.topology.repositoryScale,
      compactTarget,
      visualBudgets.maxTrees,
    ),
  );
  const target = Math.max(0, targetTotal - scatter.trees.length);
  const existing = scatter.trees.map((tree) => tree.transform.position);
  if (target === 0) return [];

  const groupedGroves = new Map<string, PlannedTree[]>();
  for (const tree of scatter.trees) {
    if (plan.composition.connectedWoodland && tree.woodlandRole !== "dominant") continue;
    const trees = groupedGroves.get(tree.groveId) ?? [];
    trees.push(tree);
    groupedGroves.set(tree.groveId, trees);
  }
  const groveCenters = [...groupedGroves.entries()].map(([groveId, trees]) => {
    const runtimeCenter = {
      x: trees.reduce((total, tree) => total + tree.transform.position.x, 0) / trees.length,
      z: trees.reduce((total, tree) => total + tree.transform.position.z, 0) / trees.length,
    };
    return {
      groveId,
      point: {
        x: round(runtimeCenter.x),
        z: round(runtimeCenter.z),
      },
    };
  });
  const pairs = (() => {
    if (plan.composition.connectedWoodland) {
      return groveCenters.slice(1).map((grove, index) => [groveCenters[index]!, grove] as const);
    }
    const ordered = [...groveCenters].sort((first, second) =>
      first.groveId.localeCompare(second.groveId),
    );
    const primaryIndex = stableHash(`${plan.composition.key}:woodland-primary`) % ordered.length;
    const primary = ordered[primaryIndex]!;
    const remainingGroves = ordered.filter((_, index) => index !== primaryIndex);
    const second = [...remainingGroves].sort(
      (first, other) =>
        distance(primary.point, first.point) - distance(primary.point, other.point) ||
        first.groveId.localeCompare(other.groveId),
    )[0]!;
    const remainingAfterSecond = remainingGroves.filter(
      (grove) => grove.groveId !== second.groveId,
    );
    const third = remainingAfterSecond.sort(
      (first, other) =>
        distance(second.point, first.point) - distance(second.point, other.point) ||
        first.groveId.localeCompare(other.groveId),
    )[0]!;
    return [[primary, second] as const, [second, third] as const];
  })();
  const beltCount = Math.min(pairs.length, target);
  if (beltCount === 0) return [];
  const beltGuides = pairs.slice(0, beltCount).map(([start, end], beltIndex) => {
    const points: Point[] = [];
    const segments = 24;
    const sourceDeltaX = end.point.x - start.point.x;
    const sourceDeltaZ = end.point.z - start.point.z;
    const sourceLength = Math.max(1, Math.hypot(sourceDeltaX, sourceDeltaZ));
    const woodlandExtension = plan.composition.connectedWoodland
      ? Math.hypot(envelope.width, envelope.depth) * 0.07
      : 0;
    const guideStart = {
      x: start.point.x - (sourceDeltaX / sourceLength) * (beltIndex === 0 ? woodlandExtension : 0),
      z: start.point.z - (sourceDeltaZ / sourceLength) * (beltIndex === 0 ? woodlandExtension : 0),
    };
    const guideEnd = {
      x:
        end.point.x +
        (sourceDeltaX / sourceLength) * (beltIndex === beltCount - 1 ? woodlandExtension : 0),
      z:
        end.point.z +
        (sourceDeltaZ / sourceLength) * (beltIndex === beltCount - 1 ? woodlandExtension : 0),
    };
    const deltaX = guideEnd.x - guideStart.x;
    const deltaZ = guideEnd.z - guideStart.z;
    const length = Math.max(1, Math.hypot(deltaX, deltaZ));
    const bendSign =
      stableFraction(`${plan.composition.key}:woodland-belt:${beltIndex}:bend`) < 0.5 ? -1 : 1;
    const bend = Math.min(envelope.width, envelope.depth) * (0.018 + beltIndex * 0.004) * bendSign;
    for (let segment = 0; segment <= segments; segment += 1) {
      const progress = segment / segments;
      const curve = Math.sin(progress * Math.PI) * bend;
      points.push({
        x: round(guideStart.x + deltaX * progress + (-deltaZ / length) * curve),
        z: round(guideStart.z + deltaZ * progress + (deltaX / length) * curve),
      });
    }
    return {
      id: `woodland-belt-${beltIndex}-${start.groveId.slice(-4)}-${end.groveId.slice(-4)}`,
      startGroveId: start.groveId,
      endGroveId: end.groveId,
      terminal: beltIndex === 0 || beltIndex === beltCount - 1,
      span: length,
      points,
    };
  });
  type SupplementalTreeCandidate = Readonly<{
    point: Point;
    score: number;
    key: string;
    progress: number;
  }>;
  const candidatesByBelt = new Map<string, SupplementalTreeCandidate[]>(
    beltGuides.map((belt) => [belt.id, []]),
  );
  // A fixed normalized candidate lattice preserves the same authored family
  // while the continuous envelope expands beneath it. View budgets, not grid
  // resolution, decide how many candidates become visible instances.
  const columns = 80;
  const rows = 84;
  const satelliteCanopy = scatter.trees
    .filter((tree) => tree.woodlandRole === "satellite")
    .map((tree) => tree.transform.position);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const key = `${plan.composition.key}:visual-tree:${column}:${row}`;
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
            envelope.depth * 0.12 +
            ((row + 0.5 + jitterZ * 0.72) / rows) * envelope.depth * 0.81,
        ),
      };
      const region = classifyPlannedTerrainRegion(plan, point.x, point.z);
      if (
        !region.inside ||
        region.water !== null ||
        (region.material !== "low-meadow" && region.material !== "high-meadow") ||
        region.slopeDegrees > 24 ||
        normalizedHamletDistance(point, plan) < 1.32 ||
        distanceToSettlementPaths(point, plan) < 4.2 ||
        (plan.composition.connectedWoodland && minimumDistance(point, satelliteCanopy) <= 19.5) ||
        scatter.canopyClearings.some(
          (clearing) => distance(point, clearing.center) <= clearing.radius + 1.2,
        )
      ) {
        continue;
      }
      const nearestCanopy = minimumDistance(point, existing);
      const maximumCanopyReach = interpolateRepositoryComposition(
        plan.topology.repositoryScale,
        54,
        150,
      );
      if (nearestCanopy < 3.4 || nearestCanopy > maximumCanopyReach) continue;
      const guideDistances = beltGuides
        .map((belt) => {
          const guidePoint = belt.points
            .map((sample, index) => ({
              distance: distance(point, sample),
              progress: index / Math.max(1, belt.points.length - 1),
            }))
            .sort((first, second) => first.distance - second.distance)[0]!;
          return {
            belt,
            distance: minimumPolylineDistance(point, belt.points),
            progress: guidePoint.progress,
          };
        })
        .sort(
          (first, second) =>
            first.distance - second.distance || first.belt.id.localeCompare(second.belt.id),
        );
      for (const guide of guideDistances) {
        const maximumGuideDistance = plan.composition.connectedWoodland
          ? guide.belt.terminal
            ? // Terminal shoulders let the connected woodland taper outward on
              // valid meadow instead of ending as four equal compact groves.
              44
            : guide.belt.span > Math.hypot(envelope.width, envelope.depth) * 0.22
              ? 72
              : 8.5 + Math.abs(guide.progress * 2 - 1) * 5.5
          : 34;
        if (guide.distance > maximumGuideDistance) continue;
        candidatesByBelt.get(guide.belt.id)!.push({
          point,
          key,
          progress: guide.progress,
          score:
            (1 - guide.distance / maximumGuideDistance) * 5 +
            (1 - Math.min(1, Math.abs(nearestCanopy - 14) / 28)) * 1.4 +
            stableFraction(`${key}:${guide.belt.id}:score`) * 0.35,
        });
      }
    }
  }

  const result: PlannedSupplementalTree[] = [];
  const accepted: Point[] = [...existing];
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
  const supplementalTree = (
    candidate: SupplementalTreeCandidate,
    belt: (typeof beltGuides)[number],
  ): PlannedSupplementalTree => {
    const flowering = stableFraction(`${candidate.key}:palette`) < 0.38;
    const roles = flowering ? floweringRoles : greenRoles;
    const role = roles[stableHash(`${candidate.key}:role`) % roles.length]!;
    const scale = 0.8 + stableFraction(`${candidate.key}:scale`) * 0.5;
    return {
      id: `visual-tree-${stableHash(candidate.key).toString(16)}`,
      beltId: belt.id,
      beltStartGroveId: belt.startGroveId,
      beltEndGroveId: belt.endGroveId,
      assetRole: role,
      paletteRole: flowering ? "flowering" : role === "pine-2" ? "pine" : "broadleaf",
      woodlandRole: "dominant",
      densityRole: "connector",
      position: candidate.point,
      rotationY: round(stableFraction(`${candidate.key}:rotation`) * Math.PI * 2),
      scale: {
        x: round(scale * (0.88 + stableFraction(`${candidate.key}:width`) * 0.24)),
        y: round(scale * (0.94 + stableFraction(`${candidate.key}:height`) * 0.28)),
        z: round(scale * (0.88 + stableFraction(`${candidate.key}:depth`) * 0.24)),
      },
    };
  };

  for (const [beltIndex, belt] of beltGuides.entries()) {
    const beltTarget = Math.floor(target / beltCount) + (beltIndex < target % beltCount ? 1 : 0);
    const candidates = candidatesByBelt.get(belt.id) ?? [];
    candidates.sort(
      (first, second) =>
        second.score - first.score || stableHash(first.key) - stableHash(second.key),
    );
    const startTrees = scatter.trees
      .filter((tree) => tree.groveId === belt.startGroveId)
      .map((tree) => tree.transform.position);
    const endTrees = scatter.trees
      .filter((tree) => tree.groveId === belt.endGroveId)
      .map((tree) => tree.transform.position);
    const available = candidates.filter(
      (candidate) => minimumDistance(candidate.point, accepted) >= 3.2,
    );
    const connectionStep = 17.2;
    const candidateBuckets = new Map<string, number[]>();
    const bucketKey = (point: Point) =>
      `${Math.floor(point.x / connectionStep)}:${Math.floor(point.z / connectionStep)}`;
    for (const [candidateIndex, candidate] of available.entries()) {
      const key = bucketKey(candidate.point);
      const bucket = candidateBuckets.get(key) ?? [];
      bucket.push(candidateIndex);
      candidateBuckets.set(key, bucket);
    }
    const nearbyCandidateIndices = (point: Point): ReadonlyArray<number> => {
      const column = Math.floor(point.x / connectionStep);
      const row = Math.floor(point.z / connectionStep);
      const nearby: number[] = [];
      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
          nearby.push(
            ...(candidateBuckets.get(`${column + columnOffset}:${row + rowOffset}`) ?? []),
          );
        }
      }
      return nearby.sort((first, second) => first - second);
    };
    const startIndices = available
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => minimumDistance(candidate.point, startTrees) <= 17.8)
      .map(({ index }) => index);
    const open = new Set(startIndices);
    const cameFrom = new Map<number, number>();
    const costs = new Map(startIndices.map((index) => [index, 0]));
    let goalIndex: number | null = null;
    while (open.size > 0) {
      const currentIndex = [...open].sort((first, second) => {
        const firstCandidate = available[first]!;
        const secondCandidate = available[second]!;
        const firstEstimate =
          costs.get(first)! + minimumDistance(firstCandidate.point, endTrees) * 0.92;
        const secondEstimate =
          costs.get(second)! + minimumDistance(secondCandidate.point, endTrees) * 0.92;
        return (
          firstEstimate - secondEstimate ||
          secondCandidate.progress - firstCandidate.progress ||
          stableHash(firstCandidate.key) - stableHash(secondCandidate.key)
        );
      })[0]!;
      open.delete(currentIndex);
      const current = available[currentIndex]!;
      if (minimumDistance(current.point, endTrees) <= 17.8) {
        goalIndex = currentIndex;
        break;
      }
      for (const nextIndex of nearbyCandidateIndices(current.point)) {
        if (nextIndex === currentIndex) continue;
        const next = available[nextIndex]!;
        const step = distance(current.point, next.point);
        if (step < 3.2 || step > connectionStep) continue;
        const regressionCost = Math.max(0, current.progress - next.progress) * 24;
        const candidateCost = costs.get(currentIndex)! + step + regressionCost;
        if (candidateCost >= (costs.get(nextIndex) ?? Number.POSITIVE_INFINITY)) continue;
        cameFrom.set(nextIndex, currentIndex);
        costs.set(nextIndex, candidateCost);
        open.add(nextIndex);
      }
    }
    if (goalIndex === null) continue;
    const pathIndices = [goalIndex];
    while (cameFrom.has(pathIndices[0]!)) pathIndices.unshift(cameFrom.get(pathIndices[0]!)!);
    const chosen = pathIndices.map((index) => available[index]!);
    accepted.push(...chosen.map((candidate) => candidate.point));

    // Keep two connected-woodland slots available for the global diameter
    // frontier below; otherwise every belt exhausts its budget on interior fill.
    const beltInteriorTarget = plan.composition.connectedWoodland
      ? Math.max(chosen.length, beltTarget - 2)
      : beltTarget;
    while (chosen.length < beltInteriorTarget) {
      const next = candidates
        .filter(
          (candidate) =>
            !chosen.includes(candidate) &&
            minimumDistance(candidate.point, accepted) >= 3.2 &&
            minimumDistance(
              candidate.point,
              chosen.map((entry) => entry.point),
            ) <= connectionStep,
        )
        .sort(
          (first, second) =>
            second.score - first.score || stableHash(first.key) - stableHash(second.key),
        )[0];
      if (!next) break;
      chosen.push(next);
      accepted.push(next.point);
    }

    result.push(...chosen.map((candidate) => supplementalTree(candidate, belt)));
  }

  // Fill the reserved slots only from the existing belt frontier, preserving
  // per-belt connectivity and choosing the candidate that most extends the
  // dominant component's current diameter.
  while (result.length < target) {
    const dominantPoints = [
      ...scatter.trees
        .filter((tree) => tree.woodlandRole === "dominant")
        .map((tree) => tree.transform.position),
      ...result.map((tree) => tree.position),
    ];
    let diameterStart = dominantPoints[0]!;
    let diameterEnd = dominantPoints[0]!;
    let diameter = 0;
    for (const [index, point] of dominantPoints.entries()) {
      for (
        let candidateIndex = index + 1;
        candidateIndex < dominantPoints.length;
        candidateIndex += 1
      ) {
        const span = distance(point, dominantPoints[candidateIndex]!);
        if (span <= diameter) continue;
        diameter = span;
        diameterStart = point;
        diameterEnd = dominantPoints[candidateIndex]!;
      }
    }
    const frontier = beltGuides
      .flatMap((belt) =>
        (candidatesByBelt.get(belt.id) ?? []).map((candidate) => ({ belt, candidate })),
      )
      .filter(({ belt, candidate }) => {
        if (minimumDistance(candidate.point, accepted) < 3.2) return false;
        const beltTrees = result
          .filter((tree) => tree.beltId === belt.id)
          .map((tree) => tree.position);
        return beltTrees.length > 0 && minimumDistance(candidate.point, beltTrees) <= 17.2;
      })
      .sort((first, second) => {
        const firstSpan = Math.max(
          distance(first.candidate.point, diameterStart),
          distance(first.candidate.point, diameterEnd),
        );
        const secondSpan = Math.max(
          distance(second.candidate.point, diameterStart),
          distance(second.candidate.point, diameterEnd),
        );
        return (
          secondSpan - firstSpan ||
          second.candidate.score - first.candidate.score ||
          stableHash(first.candidate.key) - stableHash(second.candidate.key) ||
          first.belt.id.localeCompare(second.belt.id)
        );
      });
    const next = frontier[0];
    if (!next) break;
    accepted.push(next.candidate.point);
    result.push(supplementalTree(next.candidate, next.belt));
  }
  return result;
}

function createCliffFormations(plan: WorldPlan): ReadonlyArray<PlannedCliffFormation> {
  const { envelope } = plan.topology;
  const terrain = getPlannedTerrainDefinition(plan);
  const candidates: Array<Readonly<{ point: Point; score: number; key: string }>> = [];
  // The escarpment is narrow relative to the full terrain envelope. A fixed,
  // repository-independent lattice keeps placements continuous while giving
  // angled and partially terraced ridges enough safe samples to populate both
  // sides of the face without relaxing material, slope, or spacing rules.
  const columns = 42;
  const rows = 20;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const key = `${plan.composition.key}:cliff-formation:${column}:${row}`;
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
      const localRearFaceZ =
        terrain.rearFaceZ + (point.x - envelope.center.x) * Math.tan(terrain.ridgeAngle);
      if (
        !region.inside ||
        region.water !== null ||
        (region.material !== "cliff-stone" && region.material !== "scree") ||
        region.height < 3 ||
        region.height > 15 ||
        region.slopeDegrees < 15 ||
        region.slopeDegrees > 52 ||
        point.z < localRearFaceZ - envelope.depth * 0.015 ||
        point.z > localRearFaceZ + envelope.depth * 0.09 ||
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
  const candidates = new Map<string, Array<Readonly<{ point: Point; key: string }>>>();
  const targetTotal = interpolateRepositoryCompositionInteger(
    plan.topology.repositoryScale,
    24,
    35,
  );
  const lakeClusterCount = interpolateRepositoryCompositionInteger(
    plan.topology.repositoryScale,
    7,
    6,
  );
  const lakePhase = stableFraction(`${plan.composition.key}:shore-cluster-phase`) * Math.PI * 2;
  const lakeCosine = Math.cos(lake.rotation);
  const lakeSine = Math.sin(lake.rotation);
  for (let clusterIndex = 0; clusterIndex < lakeClusterCount; clusterIndex += 1) {
    const clusterId = `lake-shore-cluster-${clusterIndex}`;
    const clusterCandidates: Array<Readonly<{ point: Point; key: string }>> = [];
    const centerAngle =
      lakePhase +
      ((clusterIndex + stableFraction(`${clusterId}:spacing`) * 0.26) / lakeClusterCount) *
        Math.PI *
        2;
    for (let memberIndex = 0; memberIndex < 32; memberIndex += 1) {
      const key = `${plan.composition.key}:${clusterId}:${memberIndex}`;
      const signedIndex =
        memberIndex === 0 ? 0 : Math.ceil(memberIndex / 2) * (memberIndex % 2 ? 1 : -1);
      const angle =
        centerAngle + signedIndex * 0.028 + (stableFraction(`${key}:angle`) - 0.5) * 0.018;
      const radial = 1.055 + stableFraction(`${key}:radius`) * 0.14;
      const localX = Math.cos(angle) * lake.radiusX * radial;
      const localZ = Math.sin(angle) * lake.radiusZ * radial;
      clusterCandidates.push({
        key,
        point: {
          x: round(lake.center.x + localX * lakeCosine - localZ * lakeSine),
          z: round(lake.center.z + localX * lakeSine + localZ * lakeCosine),
        },
      });
    }
    candidates.set(clusterId, clusterCandidates);
  }

  const riverClusterCount = interpolateRepositoryCompositionInteger(
    plan.topology.repositoryScale,
    5,
    4,
  );
  for (let clusterIndex = 0; clusterIndex < riverClusterCount; clusterIndex += 1) {
    const clusterId = `river-shore-cluster-${clusterIndex}`;
    const clusterCandidates: Array<Readonly<{ point: Point; key: string }>> = [];
    const centerProgress = 0.16 + (clusterIndex / Math.max(1, riverClusterCount - 1)) * 0.64;
    for (let memberIndex = 0; memberIndex < 32; memberIndex += 1) {
      const key = `${plan.composition.key}:${clusterId}:${memberIndex}`;
      const signedIndex =
        memberIndex === 0 ? 0 : Math.ceil(memberIndex / 2) * (memberIndex % 2 ? 1 : -1);
      const progress = Math.min(
        0.9,
        Math.max(
          0.08,
          centerProgress + signedIndex * 0.008 + (stableFraction(`${key}:progress`) - 0.5) * 0.006,
        ),
      );
      const water = samplePlannedWatershedPoint(plan, progress);
      const next = samplePlannedWatershedPoint(plan, Math.min(1, progress + 0.012));
      const tangentX = next.x - water.x;
      const tangentZ = next.z - water.z;
      const length = Math.max(0.001, Math.hypot(tangentX, tangentZ));
      const side = (clusterIndex + memberIndex) % 2 === 0 ? -1 : 1;
      const offset = water.width * 0.55 + 2.2 + stableFraction(`${key}:offset`) * 3.1;
      clusterCandidates.push({
        key,
        point: {
          x: round(water.x + (-tangentZ / length) * offset * side),
          z: round(water.z + (tangentX / length) * offset * side),
        },
      });
    }
    candidates.set(clusterId, clusterCandidates);
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
  const perClusterTarget = 4;
  for (const [clusterId, clusterCandidates] of candidates) {
    if (result.length >= targetTotal) break;
    const clusterDetails: PlannedShoreDetail[] = [];
    for (const candidate of clusterCandidates) {
      if (
        clusterDetails.length >= perClusterTarget ||
        result.length + clusterDetails.length >= targetTotal
      )
        break;
      const region = classifyPlannedTerrainRegion(plan, candidate.point.x, candidate.point.z);
      if (
        !region.inside ||
        region.water !== null ||
        region.material === "shore" ||
        region.slopeDegrees > 28 ||
        normalizedHamletDistance(candidate.point, plan) < 1.14 ||
        minimumDistance(candidate.point, [
          ...accepted,
          ...clusterDetails.map((detail) => detail.position),
        ]) < 2.25
      ) {
        continue;
      }
      const role = roles[stableHash(`${candidate.key}:role`) % roles.length]!;
      const scale = 0.88 + stableFraction(`${candidate.key}:scale`) * 0.72;
      clusterDetails.push({
        id: `shore-${stableHash(candidate.key).toString(16)}`,
        clusterId,
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
    if (clusterDetails.length >= 2) {
      result.push(...clusterDetails);
      accepted.push(...clusterDetails.map((detail) => detail.position));
    }
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
  const columns = interpolateRepositoryCompositionInteger(plan.topology.repositoryScale, 19, 32);
  const rows = interpolateRepositoryCompositionInteger(plan.topology.repositoryScale, 16, 26);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const key = `${plan.composition.key}:meadow-detail:${column}:${row}`;
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
        distanceToSettlementPaths(point, plan) < 2.4 ||
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
    if (
      minimumDistance(candidate.point, accepted) <
      interpolateRepositoryComposition(plan.topology.repositoryScale, 3.1, 2.75)
    )
      continue;
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
