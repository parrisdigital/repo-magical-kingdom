import { stableFraction } from "./hash";
import { KingdomError } from "./errors";
import type {
  CorridorRegionMask,
  EllipseRegionMask,
  WorldPlanEnvelope,
  WorldPlanPoint,
} from "./world-plan";
import type { RepositoryTopologyFamily } from "./topology-family";

export type PhysicalWaterTerrace = Readonly<{
  id: string;
  center: WorldPlanPoint;
  radiusX: number;
  radiusZ: number;
}>;

export type PhysicalLakeContract = Readonly<{
  center: WorldPlanPoint;
  radiusX: number;
  radiusZ: number;
  rotation: number;
  surfaceHeight: number;
  area: number;
  footprintRatio: number;
  inletAngle: number;
  perimeter: ReadonlyArray<WorldPlanPoint>;
  islet: Readonly<{
    enabled: boolean;
    kind: "grove" | "ruin";
    center: WorldPlanPoint;
    radiusX: number;
    radiusZ: number;
    rotation: number;
    height: number;
    detailAnchors: ReadonlyArray<
      Readonly<{
        id: string;
        role: "rock" | "tree" | "ruin";
        x: number;
        y: number;
        z: number;
        rotation: number;
        scale: number;
      }>
    >;
  }>;
}>;

export type PhysicalWaterCourseContract = Readonly<{
  points: ReadonlyArray<WorldPlanPoint>;
  sourceWidth: number;
  headwaterSurfaceHeight: number;
  outletSurfaceHeight: number;
  basinEntryProgress: number;
}>;

export type PhysicalWaterContract = Readonly<{
  key: string;
  envelope: WorldPlanEnvelope;
  outline: ReadonlyArray<WorldPlanPoint>;
  terraces: ReadonlyArray<PhysicalWaterTerrace>;
  course: PhysicalWaterCourseContract;
  lake: PhysicalLakeContract;
}>;

export type PhysicalWaterDistance = Readonly<{
  signedDistance: number;
  shoreDistance: number;
  courseDistance: number;
  lakeDistance: number;
}>;

export type CreatePhysicalWaterContractInput = Readonly<{
  key: string;
  envelope: WorldPlanEnvelope;
  horizonZ: number;
  courseMask: CorridorRegionMask;
  lakeMask: EllipseRegionMask;
  terraces: ReadonlyArray<PhysicalWaterTerrace>;
  topologyFamily?: RepositoryTopologyFamily;
}>;

export const PHYSICAL_LAKE_PERIMETER_SEGMENTS = 96;

// Preserve the semantic target-area distribution while reserving a small
// fitting margin for the irregular shoreline lobes. Without this calibration,
// a small but repeatable tail of terrain/v3 identities exceeded the public
// fourteen-percent visible-footprint contract after polygon fitting.
const PHYSICAL_LAKE_BASE_RADIUS_SCALE = 0.988;
const PHYSICAL_LAKE_TERRACE_CLEARANCE = 5.75;

function createPhysicalLakeIslet(
  key: string,
  lake: Pick<PhysicalLakeContract, "center" | "radiusX" | "radiusZ" | "rotation" | "surfaceHeight">,
  lakeArea: number,
  topologyFamily: RepositoryTopologyFamily | undefined,
): PhysicalLakeContract["islet"] {
  const enabled =
    topologyFamily?.id === "eastern-lake-run" || topologyFamily?.id === "western-basin-watershed";
  const kind = topologyFamily?.id === "western-basin-watershed" ? "ruin" : "grove";
  const targetArea = lakeArea * (0.03 + stableFraction(`${key}:islet-area`) * 0.012);
  const aspect = 1.25 + stableFraction(`${key}:islet-aspect`) * 0.5;
  const unclampedRadiusZ = Math.sqrt(targetArea / Math.PI / aspect);
  const radiusZ = Math.min(unclampedRadiusZ, lake.radiusZ * 0.3);
  const radiusX = Math.min(radiusZ * aspect, lake.radiusX * 0.32);
  const rotation = lake.rotation - 0.34 + stableFraction(`${key}:islet-rotation`) * 0.68;
  const center = lakeLocalToWorld(
    lake,
    lake.radiusX * (-0.08 + stableFraction(`${key}:islet-x`) * 0.2),
    lake.radiusZ * (-0.05 + stableFraction(`${key}:islet-z`) * 0.16),
  );
  const height = 1.05 + stableFraction(`${key}:islet-height`) * 0.48;
  const anchorTemplates =
    kind === "ruin"
      ? ([
          ["ruin", -0.1, -0.02, 1.08],
          ["rock", 0.36, 0.2, 0.82],
          ["rock", -0.38, 0.24, 0.72],
          ["tree", 0.2, -0.32, 0.84],
        ] as const)
      : ([
          ["tree", -0.16, -0.08, 1.04],
          ["tree", 0.24, 0.16, 0.82],
          ["rock", -0.38, 0.25, 0.72],
          ["rock", 0.16, -0.36, 0.78],
        ] as const);
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const detailAnchors = anchorTemplates.map(([role, localX, localZ, scale], index) => {
    const offsetX = localX * radiusX;
    const offsetZ = localZ * radiusZ;
    const radial = Math.min(1, Math.hypot(localX, localZ));
    return {
      id: `lake-islet-${kind}-${index + 1}`,
      role,
      x: center.x + offsetX * cosine - offsetZ * sine,
      y: lake.surfaceHeight + height * (1 - radial * 0.42),
      z: center.z + offsetX * sine + offsetZ * cosine,
      rotation: rotation + (stableFraction(`${key}:islet-anchor:${index}`) - 0.5) * 1.4,
      scale,
    };
  });
  return {
    enabled,
    kind,
    center,
    radiusX,
    radiusZ,
    rotation,
    height,
    detailAnchors,
  };
}

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

function point(x: number, z: number): WorldPlanPoint {
  return { x, z };
}

function closestPointOnSegment(
  subject: WorldPlanPoint,
  start: WorldPlanPoint,
  end: WorldPlanPoint,
): Readonly<{ distance: number; segmentProgress: number; point: WorldPlanPoint }> {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const segmentProgress =
    lengthSquared === 0
      ? 0
      : clamp(
          ((subject.x - start.x) * deltaX + (subject.z - start.z) * deltaZ) / lengthSquared,
          0,
          1,
        );
  const closest = point(start.x + deltaX * segmentProgress, start.z + deltaZ * segmentProgress);
  return {
    distance: Math.hypot(subject.x - closest.x, subject.z - closest.z),
    segmentProgress,
    point: closest,
  };
}

/** Minimum normalized distance between a segment and an axis-aligned ellipse. */
export function segmentToExpandedEllipseDistance(
  start: WorldPlanPoint,
  end: WorldPlanPoint,
  terrace: PhysicalWaterTerrace,
  clearance: number,
): number {
  const radiusX = terrace.radiusX + clearance;
  const radiusZ = terrace.radiusZ + clearance;
  const normalizedStart = point(
    (start.x - terrace.center.x) / radiusX,
    (start.z - terrace.center.z) / radiusZ,
  );
  const normalizedEnd = point(
    (end.x - terrace.center.x) / radiusX,
    (end.z - terrace.center.z) / radiusZ,
  );
  return closestPointOnSegment(point(0, 0), normalizedStart, normalizedEnd).distance;
}

export function routePhysicalCourseSegmentsAroundTerraces(
  points: ReadonlyArray<WorldPlanPoint>,
  terraces: ReadonlyArray<PhysicalWaterTerrace>,
  sourceWidth: number,
  envelope: WorldPlanEnvelope,
  outline: ReadonlyArray<WorldPlanPoint>,
  preferredSide: -1 | 1,
): ReadonlyArray<WorldPlanPoint> {
  const clearance = sourceWidth * 1.42 * 0.5 + 5.5;
  const clearsEveryTerrace = (start: WorldPlanPoint, end: WorldPlanPoint): boolean =>
    terraces.every(
      (terrace) => segmentToExpandedEllipseDistance(start, end, terrace, clearance) >= 1,
    );
  const pointClearsEveryTerrace = (sample: WorldPlanPoint): boolean =>
    clearsEveryTerrace(sample, sample);

  const orientation = (first: WorldPlanPoint, second: WorldPlanPoint, third: WorldPlanPoint) =>
    (second.x - first.x) * (third.z - first.z) - (second.z - first.z) * (third.x - first.x);
  const segmentsProperlyIntersect = (
    firstStart: WorldPlanPoint,
    firstEnd: WorldPlanPoint,
    secondStart: WorldPlanPoint,
    secondEnd: WorldPlanPoint,
  ): boolean => {
    const firstSideStart = orientation(firstStart, firstEnd, secondStart);
    const firstSideEnd = orientation(firstStart, firstEnd, secondEnd);
    const secondSideStart = orientation(secondStart, secondEnd, firstStart);
    const secondSideEnd = orientation(secondStart, secondEnd, firstEnd);
    return (
      firstSideStart * firstSideEnd < -0.000_001 && secondSideStart * secondSideEnd < -0.000_001
    );
  };
  const segmentStaysOnLand = (start: WorldPlanPoint, end: WorldPlanPoint): boolean => {
    if (!polygonContains(start, outline) || !polygonContains(end, outline)) return false;
    return outline.every(
      (boundaryStart, index) =>
        !segmentsProperlyIntersect(
          start,
          end,
          boundaryStart,
          outline[(index + 1) % outline.length]!,
        ),
    );
  };
  const validEdge = (start: WorldPlanPoint, end: WorldPlanPoint): boolean =>
    clearsEveryTerrace(start, end) && segmentStaysOnLand(start, end);
  const invalidRoute = (
    reason: string,
    details: Readonly<Record<string, string | number | boolean | null>>,
  ): KingdomError => {
    return new KingdomError(
      "WORLD_INVALID",
      "The generated world could not place a valid water course.",
      {
        retryable: false,
        details: { reason, ...details },
      },
    );
  };

  const requestedStart = points[0];
  const requestedTarget = points.at(-1);
  if (!requestedStart || !requestedTarget || points.length < 2) {
    throw invalidRoute("course-input", { pointCount: points.length });
  }
  const uniqueSorted = (values: ReadonlyArray<number>): ReadonlyArray<number> =>
    [...new Set(values.map((value) => Math.round(value * 100_000) / 100_000))].sort(
      (first, second) => first - second,
    );
  const normalizeEndpoint = (requested: WorldPlanPoint, endpoint: "start" | "target") => {
    if (pointClearsEveryTerrace(requested) && polygonContains(requested, outline)) return requested;
    const candidates = uniqueSorted([
      requested.x,
      envelope.center.x,
      envelope.minX + envelope.safeMargin * 1.25,
      envelope.maxX - envelope.safeMargin * 1.25,
      ...terraces.flatMap((terrace) => {
        const radiusX = terrace.radiusX + clearance;
        const radiusZ = terrace.radiusZ + clearance;
        const normalizedZ = Math.abs(requested.z - terrace.center.z) / radiusZ;
        if (normalizedZ >= 1) return [];
        const forbiddenHalfWidth = radiusX * Math.sqrt(1 - normalizedZ * normalizedZ);
        return [
          terrace.center.x - forbiddenHalfWidth - 0.5,
          terrace.center.x + forbiddenHalfWidth + 0.5,
        ];
      }),
    ])
      .filter((x) => x >= envelope.minX + 1 && x <= envelope.maxX - 1)
      .map((x) => point(x, requested.z))
      .filter(
        (candidate) => pointClearsEveryTerrace(candidate) && polygonContains(candidate, outline),
      )
      .sort((first, second) => {
        const firstSide = Math.sign(first.x - envelope.center.x) === preferredSide ? 0 : 1;
        const secondSide = Math.sign(second.x - envelope.center.x) === preferredSide ? 0 : 1;
        return (
          firstSide - secondSide ||
          Math.abs(first.x - requested.x) - Math.abs(second.x - requested.x) ||
          first.x - second.x
        );
      });
    const chosen = candidates[0];
    if (!chosen) {
      throw invalidRoute("course-endpoint-normalization", {
        endpoint,
        terraceCount: terraces.length,
      });
    }
    return chosen;
  };
  const start = normalizeEndpoint(requestedStart, "start");
  const target = normalizeEndpoint(requestedTarget, "target");
  const normalizedGuide = [start, ...points.slice(1, -1), target];
  const requiredMeanderSpan = envelope.width * 0.09;
  const normalizedGuideSpan =
    Math.max(...normalizedGuide.map(({ x }) => x)) - Math.min(...normalizedGuide.map(({ x }) => x));
  // The authored course has at most twelve samples. Keep that curvature when
  // every authored chord is already valid: a shortest-path solver would
  // otherwise collapse a clear meander to the direct start-to-target edge. A
  // safe but narrow guide continues through the same graph so every repository
  // retains a readable watershed rather than a nearly straight drainage cut.
  if (
    normalizedGuide.length <= 16 &&
    normalizedGuideSpan + 0.000_01 >= requiredMeanderSpan &&
    normalizedGuide.slice(1).every((sample, index) => validEdge(normalizedGuide[index]!, sample))
  ) {
    return normalizedGuide;
  }
  // Overlapping expanded terraces can form a coast-to-coast wall whose only
  // valid route passes around the front of an obstacle and briefly reverses Z,
  // so this must remain a general visibility graph rather than a monotonic DAG.
  // Sixteen samples at 1.04 scale are analytically chord-safe because
  // 1.04 * cos(pi / 16) > 1 in each ellipse's normalized coordinate space.
  const safetyScale = 1.04;
  const boundaryCandidates = terraces.flatMap((terrace) =>
    Array.from({ length: 16 }, (_, index) => {
      const angle = (index / 16) * Math.PI * 2;
      return point(
        terrace.center.x + Math.cos(angle) * (terrace.radiusX + clearance) * safetyScale,
        terrace.center.z + Math.sin(angle) * (terrace.radiusZ + clearance) * safetyScale,
      );
    }),
  );
  const meanderCandidates = [0.18, 0.34, 0.5, 0.66, 0.82].flatMap((progress) =>
    [0.12, 0.18, 0.24].flatMap((magnitude) =>
      [preferredSide, -preferredSide].map((side) =>
        point(
          envelope.center.x + side * envelope.width * magnitude,
          mix(start.z, target.z, progress),
        ),
      ),
    ),
  );
  const candidates = [
    start,
    target,
    ...normalizedGuide.slice(1, -1),
    ...meanderCandidates,
    ...boundaryCandidates,
  ];
  const nodes = candidates.filter((candidate, index) => {
    if (index < 2) return true;
    return (
      candidate.x >= envelope.minX + 1 &&
      candidate.x <= envelope.maxX - 1 &&
      pointClearsEveryTerrace(candidate) &&
      polygonContains(candidate, outline) &&
      candidates.findIndex(
        (other) =>
          Math.abs(other.x - candidate.x) <= 0.000_01 &&
          Math.abs(other.z - candidate.z) <= 0.000_01,
      ) === index
    );
  });

  // Every shortest-route query uses the same immutable visibility graph.
  // Cache each symmetric edge once so the meander fallback does not repeat
  // full terrace and coastline geometry checks for every candidate anchor.
  const visibleEdges = nodes.map(() => nodes.map(() => false));
  for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex += 1) {
      const visible = validEdge(nodes[firstIndex]!, nodes[secondIndex]!);
      visibleEdges[firstIndex]![secondIndex] = visible;
      visibleEdges[secondIndex]![firstIndex] = visible;
    }
  }

  const shortestRouteIndices = (
    sourceIndex: number,
    destinationIndex: number,
  ): ReadonlyArray<number> | null => {
    const distances = nodes.map(() => Number.POSITIVE_INFINITY);
    const previous = nodes.map(() => -1);
    const visited = nodes.map(() => false);
    distances[sourceIndex] = 0;
    for (let visit = 0; visit < nodes.length; visit += 1) {
      let currentIndex = -1;
      for (let index = 0; index < nodes.length; index += 1) {
        if (visited[index]) continue;
        if (
          currentIndex < 0 ||
          distances[index]! < distances[currentIndex]! - 0.000_001 ||
          (Math.abs(distances[index]! - distances[currentIndex]!) <= 0.000_001 &&
            index < currentIndex)
        ) {
          currentIndex = index;
        }
      }
      if (currentIndex < 0 || !Number.isFinite(distances[currentIndex]!)) break;
      if (currentIndex === destinationIndex) break;
      visited[currentIndex] = true;
      const current = nodes[currentIndex]!;
      for (let nextIndex = 0; nextIndex < nodes.length; nextIndex += 1) {
        if (visited[nextIndex] || nextIndex === currentIndex) continue;
        const next = nodes[nextIndex]!;
        if (!visibleEdges[currentIndex]![nextIndex]) continue;
        const sidePenalty =
          Math.sign(next.x - envelope.center.x) === preferredSide ? 0 : envelope.width * 0.000_1;
        const candidateDistance =
          distances[currentIndex]! +
          Math.hypot(next.x - current.x, next.z - current.z) +
          sidePenalty;
        if (
          candidateDistance < distances[nextIndex]! - 0.000_001 ||
          (Math.abs(candidateDistance - distances[nextIndex]!) <= 0.000_001 &&
            currentIndex < previous[nextIndex]!)
        ) {
          distances[nextIndex] = candidateDistance;
          previous[nextIndex] = currentIndex;
        }
      }
    }
    if (!Number.isFinite(distances[destinationIndex]!)) return null;
    const route: number[] = [];
    let routeIndex = destinationIndex;
    for (let step = 0; step <= nodes.length; step += 1) {
      route.push(routeIndex);
      if (routeIndex === sourceIndex) break;
      routeIndex = previous[routeIndex]!;
    }
    if (route.at(-1) !== sourceIndex) return null;
    return route.reverse();
  };

  const directRouteIndices = shortestRouteIndices(0, 1);
  if (!directRouteIndices) {
    throw invalidRoute("course-visibility-graph", {
      candidateCount: nodes.length,
      terraceCount: terraces.length,
    });
  }
  const resolved = directRouteIndices.map((index) => nodes[index]!);

  const resolvedSpan =
    Math.max(...resolved.map(({ x }) => x)) - Math.min(...resolved.map(({ x }) => x));
  if (resolvedSpan + 0.000_01 < requiredMeanderSpan) {
    const guideAnchor = normalizedGuide
      .slice(1, -1)
      .filter((candidate) => {
        const span =
          Math.max(start.x, candidate.x, target.x) - Math.min(start.x, candidate.x, target.x);
        return (
          span + 0.000_01 >= requiredMeanderSpan &&
          validEdge(start, candidate) &&
          validEdge(candidate, target)
        );
      })
      .sort((first, second) => {
        const firstSpan =
          Math.max(start.x, first.x, target.x) - Math.min(start.x, first.x, target.x);
        const secondSpan =
          Math.max(start.x, second.x, target.x) - Math.min(start.x, second.x, target.x);
        return secondSpan - firstSpan || first.z - second.z || first.x - second.x;
      })[0];
    if (guideAnchor) {
      resolved.splice(1, Math.max(0, resolved.length - 2), guideAnchor);
    } else {
      // A shortest visibility route can safely skim one side of a terrace yet
      // flatten a broad authored river into a nearly straight shortcut. Route
      // through the shortest reachable lateral anchor instead. Both halves use
      // the same proven graph, so every returned chord retains the exact land
      // and expanded-terrace guarantees of the ordinary fallback.
      const authoredAnchors = new Set(normalizedGuide.slice(1, -1));
      const generatedMeanderAnchors = new Set(meanderCandidates);
      const meanderRoutes = nodes
        .map((anchor, anchorIndex) => ({ anchor, anchorIndex }))
        .filter(({ anchor, anchorIndex }) => {
          if (anchorIndex <= 1) return false;
          if (!authoredAnchors.has(anchor) && !generatedMeanderAnchors.has(anchor)) return false;
          const span =
            Math.max(start.x, anchor.x, target.x) - Math.min(start.x, anchor.x, target.x);
          return span + 0.000_01 >= requiredMeanderSpan;
        })
        .flatMap(({ anchor, anchorIndex }) => {
          const firstHalf = shortestRouteIndices(0, anchorIndex);
          const secondHalf = shortestRouteIndices(anchorIndex, 1);
          if (!firstHalf || !secondHalf) return [];
          const indices = [...firstHalf, ...secondHalf.slice(1)];
          if (indices.length > 16 || new Set(indices).size !== indices.length) return [];
          const points = indices.map((index) => nodes[index]!);
          const span =
            Math.max(...points.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x));
          if (span + 0.000_01 < requiredMeanderSpan) return [];
          const length = points.slice(1).reduce((total, sample, index) => {
            const previousPoint = points[index]!;
            return total + Math.hypot(sample.x - previousPoint.x, sample.z - previousPoint.z);
          }, 0);
          return [
            {
              points,
              authored: authoredAnchors.has(anchor),
              preferred: Math.sign(anchor.x - envelope.center.x) === preferredSide,
              length,
              anchorIndex,
            },
          ];
        })
        .sort(
          (first, second) =>
            Number(second.authored) - Number(first.authored) ||
            Number(second.preferred) - Number(first.preferred) ||
            first.length - second.length ||
            first.anchorIndex - second.anchorIndex,
        );
      const meanderRoute = meanderRoutes[0];
      if (meanderRoute) resolved.splice(0, resolved.length, ...meanderRoute.points);
    }
  }
  for (let index = 1; index < resolved.length; index += 1) {
    if (!validEdge(resolved[index - 1]!, resolved[index]!)) {
      throw invalidRoute("course-returned-edge", {
        pointCount: resolved.length,
        segmentIndex: index - 1,
      });
    }
  }
  const resolvedStart = resolved[0];
  const resolvedTarget = resolved.at(-1);
  if (
    !resolvedStart ||
    !resolvedTarget ||
    resolvedStart.x !== start.x ||
    resolvedStart.z !== start.z ||
    resolvedTarget.x !== target.x ||
    resolvedTarget.z !== target.z
  ) {
    throw invalidRoute("course-endpoint-contract", {
      pointCount: resolved.length,
      startPreserved: resolvedStart?.x === start.x && resolvedStart?.z === start.z,
      targetPreserved: resolvedTarget?.x === target.x && resolvedTarget?.z === target.z,
    });
  }
  return resolved;
}

export function samplePhysicalCoursePolyline(
  points: ReadonlyArray<WorldPlanPoint>,
  progress: number,
): WorldPlanPoint {
  const clampedProgress = clamp(progress, 0, 1);
  const scaled = clampedProgress * Math.max(1, points.length - 1);
  const segmentIndex = Math.min(Math.max(0, points.length - 2), Math.floor(scaled));
  const localProgress = scaled - segmentIndex;
  const start = points[segmentIndex] ?? points[0] ?? point(0, 0);
  const end = points[segmentIndex + 1] ?? start;
  return point(mix(start.x, end.x, localProgress), mix(start.z, end.z, localProgress));
}

function boundaryParameters(
  key: string,
): Readonly<{ phaseA: number; phaseB: number; phaseC: number }> {
  return {
    phaseA: stableFraction(`${key}:boundary:a`) * Math.PI * 2,
    phaseB: stableFraction(`${key}:boundary:b`) * Math.PI * 2,
    phaseC: stableFraction(`${key}:boundary:c`) * Math.PI * 2,
  };
}

function parametricTerrainPoint(
  envelope: WorldPlanEnvelope,
  parameters: ReturnType<typeof boundaryParameters>,
  signedX: number,
  progressZ: number,
  topologyFamily?: RepositoryTopologyFamily,
): WorldPlanPoint {
  const s = clamp(signedX, -1, 1);
  const t = clamp(progressZ, 0, 1);
  const side = s < 0 ? -1 : 1;
  const widthWave =
    Math.sin(t * Math.PI * 2.17 + parameters.phaseA) * 0.045 +
    Math.sin(t * Math.PI * 5.03 + parameters.phaseB) * 0.021 +
    Math.sin(t * Math.PI * 8.1 + parameters.phaseC) * 0.006;
  // Families bend the canonical coast without sacrificing the broad land
  // envelope that guarantees physical settlement support.
  const basinProgress = mix(0.8, topologyFamily?.coast.basinProgress ?? 0.8, 0.14);
  const waistProgress = mix(0.53, topologyFamily?.coast.waistProgress ?? 0.53, 0.14);
  const valleySwell =
    Math.exp(-(((t - 0.23) / 0.22) ** 2)) * 0.13 +
    Math.exp(-(((t - basinProgress) / 0.2) ** 2)) * 0.2;
  const leftBay = -Math.exp(-(((t - 0.61) / 0.18) ** 2)) * 0.14;
  const leftPeninsula = Math.exp(-(((t - 0.82) / 0.15) ** 2)) * 0.12;
  const rightBay = -Math.exp(-(((t - 0.37) / 0.16) ** 2)) * 0.09;
  const rightPeninsula = Math.exp(-(((t - 0.7) / 0.17) ** 2)) * 0.2;
  const asymmetricCoast =
    valleySwell + (side < 0 ? leftBay + leftPeninsula : rightBay + rightPeninsula);
  const authoredWidthProfile =
    -Math.exp(-(((t - (waistProgress - 0.11)) / 0.13) ** 2)) * 0.1 -
    Math.exp(-(((t - (waistProgress + 0.06)) / 0.105) ** 2)) * 0.11 +
    Math.exp(-(((t - (basinProgress + 0.03)) / 0.14) ** 2)) * 0.105;
  const endTaper =
    1 - 0.22 * Math.exp(-(((t - 0.03) / 0.13) ** 2)) - 0.1 * Math.exp(-(((t - 0.96) / 0.12) ** 2));
  const halfWidth =
    (envelope.width / 2 - envelope.safeMargin * 0.88) *
    (endTaper + widthWave + asymmetricCoast + authoredWidthProfile);
  const centerShift =
    envelope.width *
    (Math.sin(t * Math.PI * 1.43 + parameters.phaseC) * 0.025 +
      Math.sin(t * Math.PI * 3.61 + parameters.phaseA) * 0.018 +
      Math.exp(-(((t - basinProgress) / 0.14) ** 2)) *
        (0.035 + (topologyFamily?.coast.frontOpeningX ?? 0.2) * 0.008));
  const interiorWarp =
    (1 - Math.abs(s)) *
    envelope.width *
    0.019 *
    Math.sin(t * Math.PI * 3.2 + s * 2.1 + parameters.phaseB);
  const x = clamp(
    envelope.center.x + centerShift + s * halfWidth + interiorWarp,
    envelope.minX + envelope.safeMargin * 0.2,
    envelope.maxX - envelope.safeMargin * 0.2,
  );
  const normalizedX = (s + 1) / 2;
  const openingX = mix(0.72, ((topologyFamily?.coast.frontOpeningX ?? 0.44) + 1) * 0.5, 0.22);
  const rearInset =
    envelope.safeMargin * 0.47 +
    envelope.depth *
      (0.012 +
        0.023 * Math.sin(normalizedX * Math.PI * 2.7 + parameters.phaseB) +
        0.014 * Math.sin(normalizedX * Math.PI * 6.1 + parameters.phaseC));
  const frontInset =
    envelope.safeMargin * 0.56 +
    envelope.depth *
      (0.019 +
        0.034 * Math.sin(normalizedX * Math.PI * 2.3 + parameters.phaseA) +
        0.018 * Math.sin(normalizedX * Math.PI * 5.7 + parameters.phaseC) -
        0.029 * Math.exp(-(((normalizedX - openingX) / 0.11) ** 2)) -
        0.015 * Math.exp(-(((normalizedX - (1 - openingX)) / 0.1) ** 2)));
  const rearZ = envelope.minZ + clamp(rearInset, envelope.safeMargin * 0.2, envelope.depth * 0.07);
  const frontZ =
    envelope.maxZ - clamp(frontInset, envelope.safeMargin * 0.25, envelope.depth * 0.085);
  const zBow =
    Math.sin(s * Math.PI * 1.35 + parameters.phaseA) *
    envelope.depth *
    0.014 *
    Math.sin(t * Math.PI);
  return point(x, mix(rearZ, frontZ, t) + zBow);
}

/** Canonical terrain sampler shared by outline validation and render geometry. */
export function createPhysicalTerrainPointSampler(
  envelope: WorldPlanEnvelope,
  key: string,
  topologyFamily?: RepositoryTopologyFamily,
): (signedX: number, progressZ: number) => WorldPlanPoint {
  const parameters = boundaryParameters(key);
  return (signedX, progressZ) =>
    parametricTerrainPoint(envelope, parameters, signedX, progressZ, topologyFamily);
}

export function buildPhysicalTerrainOutline(
  envelope: WorldPlanEnvelope,
  key: string,
  samplesPerEdge = 32,
  topologyFamily?: RepositoryTopologyFamily,
): ReadonlyArray<WorldPlanPoint> {
  const sample = createPhysicalTerrainPointSampler(envelope, key, topologyFamily);
  const result: WorldPlanPoint[] = [];
  for (let index = 0; index <= samplesPerEdge; index += 1) {
    result.push(sample(-1 + (index / samplesPerEdge) * 2, 0));
  }
  for (let index = 1; index <= samplesPerEdge; index += 1) {
    result.push(sample(1, index / samplesPerEdge));
  }
  for (let index = 1; index <= samplesPerEdge; index += 1) {
    result.push(sample(1 - (index / samplesPerEdge) * 2, 1));
  }
  for (let index = 1; index < samplesPerEdge; index += 1) {
    result.push(sample(-1, 1 - index / samplesPerEdge));
  }
  return result;
}

function polygonContains(subject: WorldPlanPoint, polygon: ReadonlyArray<WorldPlanPoint>): boolean {
  let inside = false;
  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current++
  ) {
    const first = polygon[current]!;
    const second = polygon[previous]!;
    if (
      first.z > subject.z !== second.z > subject.z &&
      subject.x < ((second.x - first.x) * (subject.z - first.z)) / (second.z - first.z) + first.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Proves that a circular footprint is fully contained by the canonical land
 * polygon. This is shared by planning so settlement capacity cannot depend on
 * a renderer-only outline approximation.
 */
export function physicalTerrainCircleIsContained(
  outline: ReadonlyArray<WorldPlanPoint>,
  center: WorldPlanPoint,
  radius: number,
  clearance = 0,
): boolean {
  if (!polygonContains(center, outline)) return false;
  const requiredDistance = radius + clearance;
  const edges = preparePolygonEdges(outline);
  return edges.every(
    (edge) => Math.sqrt(squaredDistanceToEdge(edge, center.x, center.z)) >= requiredDistance,
  );
}

function angularDistance(first: number, second: number): number {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
}

function lakeLocalToWorld(
  lake: Pick<PhysicalLakeContract, "center" | "rotation">,
  localX: number,
  localZ: number,
): WorldPlanPoint {
  const cosine = Math.cos(lake.rotation);
  const sine = Math.sin(lake.rotation);
  return point(
    lake.center.x + localX * cosine - localZ * sine,
    lake.center.z + localX * sine + localZ * cosine,
  );
}

function lakeWorldToLocal(
  lake: Pick<PhysicalLakeContract, "center" | "rotation">,
  x: number,
  z: number,
): WorldPlanPoint {
  const deltaX = x - lake.center.x;
  const deltaZ = z - lake.center.z;
  const cosine = Math.cos(lake.rotation);
  const sine = Math.sin(lake.rotation);
  return point(deltaX * cosine + deltaZ * sine, -deltaX * sine + deltaZ * cosine);
}

function lakeRadiusMultiplier(contract: PhysicalWaterContract, angle: number): number {
  const phaseA = stableFraction(`${contract.key}:lake-edge:a`) * Math.PI * 2;
  const phaseB = stableFraction(`${contract.key}:lake-edge:b`) * Math.PI * 2;
  const inletDistance = angularDistance(angle, contract.lake.inletAngle);
  const firstForkDistance = angularDistance(angle, contract.lake.inletAngle - 0.34);
  const secondForkDistance = angularDistance(angle, contract.lake.inletAngle + 0.39);
  const westernLobeDistance = angularDistance(angle, contract.lake.inletAngle - 2.05);
  const easternCoveDistance = angularDistance(angle, contract.lake.inletAngle + 1.68);
  let multiplier = clamp(
    1 +
      Math.sin(angle * 3 + phaseA) * 0.145 +
      Math.sin(angle * 5 - phaseB) * 0.075 +
      Math.sin(angle * 9 + phaseA * 0.7) * 0.032 +
      Math.exp(-((inletDistance / 0.27) ** 2)) * 0.19 +
      Math.exp(-((firstForkDistance / 0.17) ** 2)) * 0.09 +
      Math.exp(-((secondForkDistance / 0.19) ** 2)) * 0.105 +
      Math.exp(-((westernLobeDistance / 0.42) ** 2)) * 0.15 -
      Math.exp(-((easternCoveDistance / 0.32) ** 2)) * 0.14,
    0.67,
    1.3,
  );
  const directionX = Math.cos(angle);
  const directionZ = Math.sin(angle);
  const worldDirection = lakeLocalToWorld(
    { center: point(0, 0), rotation: contract.lake.rotation },
    directionX * contract.lake.radiusX,
    directionZ * contract.lake.radiusZ,
  );
  for (const terrace of contract.terraces) {
    const radiusX = terrace.radiusX + PHYSICAL_LAKE_TERRACE_CLEARANCE;
    const radiusZ = terrace.radiusZ + PHYSICAL_LAKE_TERRACE_CLEARANCE;
    const centerX = terrace.center.x - contract.lake.center.x;
    const centerZ = terrace.center.z - contract.lake.center.z;
    const a = worldDirection.x ** 2 / radiusX ** 2 + worldDirection.z ** 2 / radiusZ ** 2;
    const b =
      (-2 * worldDirection.x * centerX) / radiusX ** 2 +
      (-2 * worldDirection.z * centerZ) / radiusZ ** 2;
    const c = centerX ** 2 / radiusX ** 2 + centerZ ** 2 / radiusZ ** 2 - 1;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) continue;
    const nearIntersection = (-b - Math.sqrt(discriminant)) / (2 * a);
    if (nearIntersection > 0) multiplier = Math.min(multiplier, nearIntersection);
  }
  return clamp(multiplier, 0.36, 1.3);
}

function fittedLakeRadiusMultiplier(contract: PhysicalWaterContract, angle: number): number {
  const requested = lakeRadiusMultiplier(contract, angle);
  const pointAt = (multiplier: number) =>
    lakeLocalToWorld(
      contract.lake,
      Math.cos(angle) * contract.lake.radiusX * multiplier,
      Math.sin(angle) * contract.lake.radiusZ * multiplier,
    );
  if (polygonContains(pointAt(requested), contract.outline)) return requested;
  let lower = 0;
  let upper = requested;
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (polygonContains(pointAt(middle), contract.outline)) lower = middle;
    else upper = middle;
  }
  return Math.max(0, lower * 0.995);
}

type PreparedPolygonEdge = Readonly<{
  start: WorldPlanPoint;
  deltaX: number;
  deltaZ: number;
  lengthSquared: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}>;

const preparedPolygonCache = new WeakMap<
  ReadonlyArray<WorldPlanPoint>,
  ReadonlyArray<PreparedPolygonEdge>
>();

function preparePolygonEdges(
  polygon: ReadonlyArray<WorldPlanPoint>,
): ReadonlyArray<PreparedPolygonEdge> {
  const cached = preparedPolygonCache.get(polygon);
  if (cached) return cached;
  const edges = polygon.map((start, index) => {
    const end = polygon[(index + 1) % polygon.length]!;
    const deltaX = end.x - start.x;
    const deltaZ = end.z - start.z;
    return {
      start,
      deltaX,
      deltaZ,
      lengthSquared: deltaX * deltaX + deltaZ * deltaZ,
      minX: Math.min(start.x, end.x),
      maxX: Math.max(start.x, end.x),
      minZ: Math.min(start.z, end.z),
      maxZ: Math.max(start.z, end.z),
    };
  });
  preparedPolygonCache.set(polygon, edges);
  return edges;
}

function squaredDistanceToEdge(edge: PreparedPolygonEdge, x: number, z: number): number {
  const progress =
    edge.lengthSquared === 0
      ? 0
      : clamp(
          ((x - edge.start.x) * edge.deltaX + (z - edge.start.z) * edge.deltaZ) /
            edge.lengthSquared,
          0,
          1,
        );
  const deltaX = x - (edge.start.x + edge.deltaX * progress);
  const deltaZ = z - (edge.start.z + edge.deltaZ * progress);
  return deltaX * deltaX + deltaZ * deltaZ;
}

function squaredDistanceToEdgeBounds(edge: PreparedPolygonEdge, x: number, z: number): number {
  const deltaX = x < edge.minX ? edge.minX - x : x > edge.maxX ? x - edge.maxX : 0;
  const deltaZ = z < edge.minZ ? edge.minZ - z : z > edge.maxZ ? z - edge.maxZ : 0;
  return deltaX * deltaX + deltaZ * deltaZ;
}

function polygonSignedDistance(
  polygon: ReadonlyArray<WorldPlanPoint>,
  center: WorldPlanPoint,
  x: number,
  z: number,
): number {
  const edges = preparePolygonEdges(polygon);
  if (edges.length === 0) return Number.POSITIVE_INFINITY;
  const angle = Math.atan2(z - center.z, x - center.x);
  const normalizedAngle = angle < 0 ? angle + Math.PI * 2 : angle;
  const nearbyIndex = Math.floor((normalizedAngle / (Math.PI * 2)) * edges.length) % edges.length;
  let minimumSquared = Number.POSITIVE_INFINITY;
  for (const offset of [-1, 0, 1]) {
    const edge = edges[(nearbyIndex + offset + edges.length) % edges.length]!;
    minimumSquared = Math.min(minimumSquared, squaredDistanceToEdge(edge, x, z));
  }
  for (const edge of edges) {
    if (squaredDistanceToEdgeBounds(edge, x, z) >= minimumSquared) continue;
    minimumSquared = Math.min(minimumSquared, squaredDistanceToEdge(edge, x, z));
  }
  const minimum = Math.sqrt(minimumSquared);
  return polygonContains(point(x, z), polygon) ? -minimum : minimum;
}

/** Exact radial ratio inside the canonical triangle-fan shoreline. */
export function canonicalLakeNormalizedRadius(
  lake: PhysicalLakeContract,
  x: number,
  z: number,
): number {
  const deltaX = x - lake.center.x;
  const deltaZ = z - lake.center.z;
  const worldSubjectRadius = Math.hypot(deltaX, deltaZ);
  if (worldSubjectRadius <= Number.EPSILON || lake.perimeter.length === 0) return 0;
  const directionX = deltaX / worldSubjectRadius;
  const directionZ = deltaZ / worldSubjectRadius;
  // The perimeter fan is sampled at equal angles in the lake's normalized
  // ellipse space, not at equal world-space angles. Recover that same
  // parameter before selecting the shoreline chord; world-space angles pick
  // the wrong edge whenever radiusX and radiusZ differ substantially.
  const local = lakeWorldToLocal(lake, x, z);
  const angle = Math.atan2(local.z / lake.radiusZ, local.x / lake.radiusX);
  const normalizedAngle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const index =
    Math.floor((normalizedAngle / (Math.PI * 2)) * lake.perimeter.length) % lake.perimeter.length;
  const first = lake.perimeter[index]!;
  const second = lake.perimeter[(index + 1) % lake.perimeter.length]!;
  const segmentX = second.x - first.x;
  const segmentZ = second.z - first.z;
  const denominator = directionX * segmentZ - directionZ * segmentX;
  if (Math.abs(denominator) <= Number.EPSILON) return 1;
  const fromCenterX = first.x - lake.center.x;
  const fromCenterZ = first.z - lake.center.z;
  const boundaryRadius = (fromCenterX * segmentZ - fromCenterZ * segmentX) / denominator;
  return worldSubjectRadius / Math.max(Number.EPSILON, boundaryRadius);
}

export function physicalLakePolygonArea(perimeter: ReadonlyArray<WorldPlanPoint>): number {
  let doubledArea = 0;
  for (let index = 0; index < perimeter.length; index += 1) {
    const current = perimeter[index]!;
    const next = perimeter[(index + 1) % perimeter.length]!;
    doubledArea += current.x * next.z - next.x * current.z;
  }
  return Math.abs(doubledArea) / 2;
}

function courseHalfWidth(contract: PhysicalWaterContract, progress: number): number {
  const phase = stableFraction(`${contract.key}:course-width`) * Math.PI * 2;
  const widening = 0.58 + progress * 0.71;
  const variation = Math.sin(progress * Math.PI * 5.2 + phase) * 0.1;
  return contract.course.sourceWidth * clamp(widening + variation, 0.48, 1.42) * 0.5;
}

function queryCourse(contract: PhysicalWaterContract, x: number, z: number) {
  const subject = point(x, z);
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestProgress = 0;
  const segmentCount = Math.max(1, contract.course.points.length - 1);
  for (let index = 1; index < contract.course.points.length; index += 1) {
    const result = closestPointOnSegment(
      subject,
      contract.course.points[index - 1]!,
      contract.course.points[index]!,
    );
    if (result.distance < bestDistance) {
      bestDistance = result.distance;
      bestProgress = (index - 1 + result.segmentProgress) / segmentCount;
    }
  }
  const halfWidth = courseHalfWidth(contract, bestProgress);
  return {
    distance: bestDistance,
    halfWidth,
    shoreHalfWidth: halfWidth + mix(2.8, 4.8, bestProgress),
  };
}

export function queryPhysicalWaterDistance(
  contract: PhysicalWaterContract,
  x: number,
  z: number,
): PhysicalWaterDistance {
  const course = queryCourse(contract, x, z);
  const courseDistance = course.distance - course.halfWidth;
  const lakeDistance = polygonSignedDistance(contract.lake.perimeter, contract.lake.center, x, z);
  return {
    signedDistance: Math.min(courseDistance, lakeDistance),
    shoreDistance: Math.min(course.distance - course.shoreHalfWidth, lakeDistance - 4),
    courseDistance,
    lakeDistance,
  };
}

/**
 * Conservatively proves that a circular habitat footprint clears the exact
 * rendered wet surface and shore. Expanding the canonical lake polygon and
 * every river segment by the habitat radius turns the whole-footprint proof
 * into one bounded O(lake edges + course segments) center-distance query.
 */
export function physicalWaterCircleHasClearance(
  contract: PhysicalWaterContract,
  center: WorldPlanPoint,
  radius: number,
  clearance: number,
): boolean {
  const lakeClearance = polygonSignedDistance(
    contract.lake.perimeter,
    contract.lake.center,
    center.x,
    center.z,
  );
  if (lakeClearance < radius + clearance + 4) return false;

  // `courseHalfWidth` is capped at sourceWidth * 1.42 / 2 and the authored
  // bank grows to at most 4.8 world units. Using that maximum for every
  // segment is conservative across all progress-dependent widening phases.
  const maximumCourseShoreHalfWidth = contract.course.sourceWidth * 1.42 * 0.5 + 4.8;
  for (let index = 1; index < contract.course.points.length; index += 1) {
    const distance = closestPointOnSegment(
      center,
      contract.course.points[index - 1]!,
      contract.course.points[index]!,
    ).distance;
    if (distance < radius + clearance + maximumCourseShoreHalfWidth) return false;
  }
  return true;
}

export function createPhysicalWaterContract(
  input: CreatePhysicalWaterContractInput,
): PhysicalWaterContract {
  const { key, envelope, courseMask, lakeMask, terraces, topologyFamily } = input;
  const outline = buildPhysicalTerrainOutline(envelope, key, 32, topologyFamily);
  const targetLakeArea =
    envelope.width * envelope.depth * (0.135 + stableFraction(`${key}:lake-area`) * 0.025);
  const aspect = clamp(topologyFamily?.lake.aspect ?? envelope.width / envelope.depth, 0.68, 1.58);
  const rotation = topologyFamily?.lake.rotation ?? lakeMask.rotation;
  const headwaterSurfaceHeight = 4.25;
  const outletSurfaceHeight = -0.35;
  const targetRadiusX = Math.sqrt((targetLakeArea * aspect) / Math.PI);
  const targetRadiusZ = targetLakeArea / (Math.PI * targetRadiusX);
  const baseRadiusX = targetRadiusX * PHYSICAL_LAKE_BASE_RADIUS_SCALE;
  const baseRadiusZ = targetRadiusZ * PHYSICAL_LAKE_BASE_RADIUS_SCALE;
  const course: PhysicalWaterCourseContract = {
    points: [],
    sourceWidth: courseMask.width,
    headwaterSurfaceHeight,
    outletSurfaceHeight,
    basinEntryProgress: 0,
  };
  const lakeAtScale = (scale: number): PhysicalLakeContract => {
    const radiusX = baseRadiusX * scale;
    const radiusZ = baseRadiusZ * scale;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const extentX = Math.sqrt(radiusX ** 2 * cosine ** 2 + radiusZ ** 2 * sine ** 2);
    const extentZ = Math.sqrt(radiusX ** 2 * sine ** 2 + radiusZ ** 2 * cosine ** 2);
    const preferredLakeCenter = point(
      mix(lakeMask.center.x, envelope.center.x, 0.04),
      clamp(
        mix(lakeMask.center.z, envelope.center.z, 0.04),
        envelope.minZ + envelope.depth * 0.43,
        envelope.maxZ - envelope.safeMargin - extentZ - envelope.depth * 0.01,
      ),
    );
    const center = point(
      clamp(
        preferredLakeCenter.x,
        envelope.minX + envelope.safeMargin + extentX * 1.08,
        envelope.maxX - envelope.safeMargin - extentX * 1.08,
      ),
      preferredLakeCenter.z,
    );
    return {
      center,
      radiusX,
      radiusZ,
      rotation,
      surfaceHeight: 0,
      area: 0,
      footprintRatio: 0,
      inletAngle: 0,
      perimeter: [],
      islet: {
        enabled: false,
        kind: "grove",
        center,
        radiusX: 0,
        radiusZ: 0,
        rotation,
        height: 0,
        detailAnchors: [],
      },
    };
  };
  const sourceGuide = courseMask.points[0] ?? point(envelope.center.x, envelope.minZ);
  const measureLakeAtScale = (scale: number): PhysicalLakeContract => {
    const unmeasuredLake = lakeAtScale(scale);
    const sourceGuideLocal = lakeWorldToLocal(unmeasuredLake, sourceGuide.x, sourceGuide.z);
    const estimatedInletAngle = Math.atan2(
      sourceGuideLocal.z / unmeasuredLake.radiusZ,
      sourceGuideLocal.x / unmeasuredLake.radiusX,
    );
    const inletAngle = estimatedInletAngle + (stableFraction(`${key}:inlet-angle`) - 0.5) * 0.08;
    const angledLake = { ...unmeasuredLake, inletAngle };
    const contract: PhysicalWaterContract = {
      key,
      envelope,
      outline,
      terraces,
      lake: angledLake,
      course,
    };
    const perimeter = Array.from({ length: PHYSICAL_LAKE_PERIMETER_SEGMENTS }, (_, index) => {
      const angle = (index / PHYSICAL_LAKE_PERIMETER_SEGMENTS) * Math.PI * 2;
      const multiplier = fittedLakeRadiusMultiplier(contract, angle);
      return lakeLocalToWorld(
        angledLake,
        Math.cos(angle) * angledLake.radiusX * multiplier,
        Math.sin(angle) * angledLake.radiusZ * multiplier,
      );
    });
    const area = physicalLakePolygonArea(perimeter);
    return {
      ...angledLake,
      perimeter,
      area,
      footprintRatio: area / (envelope.width * envelope.depth),
      islet: createPhysicalLakeIslet(key, angledLake, area, topologyFamily),
    };
  };
  const desiredFootprintRatio = 0.122 + stableFraction(`${key}:fitted-lake-area`) * 0.004;
  let lakeScale = 1;
  let provisionalLake = measureLakeAtScale(lakeScale);
  let bestLake = provisionalLake;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const correctedScale = clamp(
      lakeScale *
        Math.sqrt(desiredFootprintRatio / Math.max(0.001, provisionalLake.footprintRatio)),
      0.48,
      1.9,
    );
    const correctedLake = measureLakeAtScale(correctedScale);
    if (
      Math.abs(correctedLake.footprintRatio - desiredFootprintRatio) >=
      Math.abs(provisionalLake.footprintRatio - desiredFootprintRatio)
    ) {
      if (bestLake.footprintRatio >= 0.1) break;
      lakeScale = Math.min(1.9, lakeScale * 1.08);
      provisionalLake = measureLakeAtScale(lakeScale);
      if (
        Math.abs(provisionalLake.footprintRatio - desiredFootprintRatio) <
        Math.abs(bestLake.footprintRatio - desiredFootprintRatio)
      ) {
        bestLake = provisionalLake;
      }
      continue;
    }
    lakeScale = correctedScale;
    provisionalLake = correctedLake;
    bestLake = correctedLake;
  }
  if (bestLake.footprintRatio < 0.1) {
    for (let iteration = 0; iteration < 8 && lakeScale < 1.9; iteration += 1) {
      lakeScale = Math.min(1.9, lakeScale * 1.08);
      const expandedLake = measureLakeAtScale(lakeScale);
      if (expandedLake.footprintRatio > bestLake.footprintRatio) bestLake = expandedLake;
      if (bestLake.footprintRatio >= 0.1) break;
    }
  }
  if (bestLake.footprintRatio > 0.14) {
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const correctedScale = clamp(
        lakeScale * Math.sqrt(desiredFootprintRatio / bestLake.footprintRatio),
        0.48,
        1.9,
      );
      const correctedLake = measureLakeAtScale(correctedScale);
      if (correctedLake.footprintRatio >= 0.1 && correctedLake.footprintRatio <= 0.14) {
        bestLake = correctedLake;
        break;
      }
      lakeScale = correctedScale;
      if (
        correctedLake.footprintRatio <= 0.14 &&
        (bestLake.footprintRatio > 0.14 ||
          Math.abs(correctedLake.footprintRatio - desiredFootprintRatio) <
            Math.abs(bestLake.footprintRatio - desiredFootprintRatio))
      ) {
        bestLake = correctedLake;
      }
    }
  }
  const scaleProbes = Array.from({ length: 25 }, (_, index) => 0.5 + index * 0.058);
  for (const candidateScale of scaleProbes) {
    const candidateLake = measureLakeAtScale(candidateScale);
    const candidateValid =
      candidateLake.footprintRatio >= 0.1 && candidateLake.footprintRatio <= 0.14;
    const bestValid = bestLake.footprintRatio >= 0.1 && bestLake.footprintRatio <= 0.14;
    if (
      (candidateValid && !bestValid) ||
      (candidateValid === bestValid &&
        Math.abs(candidateLake.footprintRatio - desiredFootprintRatio) <
          Math.abs(bestLake.footprintRatio - desiredFootprintRatio))
    ) {
      bestLake = candidateLake;
    }
  }
  if (bestLake.footprintRatio > 0.14) {
    for (let probe = 0; probe <= 48; probe += 1) {
      const candidateScale = 0.25 + probe * 0.041;
      const candidateLake = measureLakeAtScale(candidateScale);
      const candidateValid =
        candidateLake.footprintRatio >= 0.1 && candidateLake.footprintRatio <= 0.14;
      const bestValid = bestLake.footprintRatio >= 0.1 && bestLake.footprintRatio <= 0.14;
      if (
        (candidateValid && !bestValid) ||
        (candidateValid === bestValid &&
          Math.abs(candidateLake.footprintRatio - desiredFootprintRatio) <
            Math.abs(bestLake.footprintRatio - desiredFootprintRatio))
      ) {
        bestLake = candidateLake;
      }
    }
  }
  provisionalLake = bestLake;
  const { center: lakeCenter, radiusX, radiusZ } = provisionalLake;
  const baseContract: PhysicalWaterContract = {
    key,
    envelope,
    outline,
    terraces,
    lake: provisionalLake,
    course,
  };
  const inletAngle = provisionalLake.inletAngle;
  const inletRadius = fittedLakeRadiusMultiplier(baseContract, inletAngle);
  const inletPoint = lakeLocalToWorld(
    baseContract.lake,
    Math.cos(inletAngle) * radiusX * inletRadius * 1.01,
    Math.sin(inletAngle) * radiusZ * inletRadius * 1.01,
  );
  const rearFaceZ = input.horizonZ + envelope.depth * 0.025;
  // Start inside the central rear watershed band. Repository-scale/v2 can
  // widen the semantic guide substantially; carrying that full lateral offset
  // into the source produced edge-biased headwaters rather than a readable
  // mountain-to-basin course.
  const headwaterX = clamp(
    sourceGuide.x + (stableFraction(`${key}:headwater-x`) - 0.5) * envelope.width * 0.025,
    envelope.center.x - envelope.width * 0.139,
    envelope.center.x + envelope.width * 0.139,
  );
  const headwaterZ = rearFaceZ + envelope.depth * 0.035;
  const coursePhase = stableFraction(`${key}:course-meander`) * Math.PI * 2;
  const semanticCourseSide =
    courseMask.points.reduce((total, sample) => total + sample.x, 0) >=
    envelope.center.x * Math.max(1, courseMask.points.length)
      ? 1
      : -1;
  const routeXAroundTerraces = (candidateX: number, z: number): number => {
    const routeLimit = envelope.width * 0.35;
    let routedX = clamp(candidateX, envelope.center.x - routeLimit, envelope.center.x + routeLimit);
    for (let iteration = 0; iteration < 3; iteration += 1) {
      for (const terrace of terraces) {
        const clearance = courseMask.width / 2 + 5.5;
        const expandedX = terrace.radiusX + clearance;
        const expandedZ = terrace.radiusZ + clearance;
        const normalizedZ = Math.abs(z - terrace.center.z) / expandedZ;
        if (normalizedZ >= 1) continue;
        const forbiddenHalfWidth = expandedX * Math.sqrt(1 - normalizedZ * normalizedZ);
        const minimum = terrace.center.x - forbiddenHalfWidth;
        const maximum = terrace.center.x + forbiddenHalfWidth;
        if (routedX <= minimum || routedX >= maximum) continue;
        const options = [minimum - 0.25, maximum + 0.25]
          .filter(
            (option) =>
              option >= envelope.center.x - routeLimit && option <= envelope.center.x + routeLimit,
          )
          .sort((first, second) => (semanticCourseSide > 0 ? second - first : first - second));
        routedX = options[0] ?? routedX;
      }
    }
    return routedX;
  };
  const guidedCoursePoints = Array.from({ length: 12 }, (_, index) => {
    const progress = index / 11;
    const meanderEnvelope = Math.sin(progress * Math.PI);
    const meander =
      // Keep one complete, phase-independent bend in every repository course.
      // The keyed harmonics vary its shoulders, but cannot cancel the broad
      // mountain-to-basin meander when a composition key happens to align the
      // two random phases.
      Math.sin(progress * Math.PI * 2) * envelope.width * 0.05 +
      Math.sin(progress * Math.PI * 3.4 + coursePhase) * envelope.width * 0.058 +
      Math.sin(progress * Math.PI * 6.2 - coursePhase * 0.5) * envelope.width * 0.018;
    const semanticGuide = samplePhysicalCoursePolyline(courseMask.points, progress);
    const linearX = mix(headwaterX, inletPoint.x, progress);
    const guidedX = mix(linearX, semanticGuide.x, Math.sin(progress * Math.PI) * 0.72);
    const z = mix(headwaterZ, inletPoint.z, progress);
    return point(routeXAroundTerraces(guidedX + meander * meanderEnvelope, z), z);
  });
  const plannedCoursePoints = routePhysicalCourseSegmentsAroundTerraces(
    guidedCoursePoints,
    terraces,
    courseMask.width,
    envelope,
    outline,
    semanticCourseSide,
  );
  let lakeClosestProgress = 0.76;
  let minimum = Number.POSITIVE_INFINITY;
  const segmentCount = Math.max(1, plannedCoursePoints.length - 1);
  for (let index = 1; index < plannedCoursePoints.length; index += 1) {
    const result = closestPointOnSegment(
      lakeCenter,
      plannedCoursePoints[index - 1]!,
      plannedCoursePoints[index]!,
    );
    if (result.distance < minimum) {
      minimum = result.distance;
      lakeClosestProgress = (index - 1 + result.segmentProgress) / segmentCount;
    }
  }
  const surfaceHeight = mix(
    headwaterSurfaceHeight,
    outletSurfaceHeight,
    smoothstep(0, 1, lakeClosestProgress),
  );
  const unmeasuredLake: PhysicalLakeContract = {
    ...provisionalLake,
    surfaceHeight,
  };
  const radialContract: PhysicalWaterContract = {
    ...baseContract,
    lake: unmeasuredLake,
    course: { ...baseContract.course, points: plannedCoursePoints },
  };
  const perimeter = Array.from({ length: PHYSICAL_LAKE_PERIMETER_SEGMENTS }, (_, index) => {
    const angle = (index / PHYSICAL_LAKE_PERIMETER_SEGMENTS) * Math.PI * 2;
    const multiplier = fittedLakeRadiusMultiplier(radialContract, angle);
    return lakeLocalToWorld(
      radialContract.lake,
      Math.cos(angle) * radiusX * multiplier,
      Math.sin(angle) * radiusZ * multiplier,
    );
  });
  const fittedLakeArea = physicalLakePolygonArea(perimeter);
  const lake: PhysicalLakeContract = {
    ...unmeasuredLake,
    perimeter,
    area: fittedLakeArea,
    footprintRatio: fittedLakeArea / (envelope.width * envelope.depth),
    // The fitted lake receives its physical surface height only after the
    // routed course is known. Rebuild habitat anchors here so their world Y
    // follows that final surface instead of the zero-height sizing probe.
    islet: createPhysicalLakeIslet(key, unmeasuredLake, fittedLakeArea, topologyFamily),
  };
  const temporaryContract: PhysicalWaterContract = { ...radialContract, lake };
  let basinEntryProgress = clamp(lakeClosestProgress - 0.08, 0.35, 0.88);
  let previousProgress = 0;
  let previousRadius = Number.POSITIVE_INFINITY;
  for (let step = 1; step <= 160; step += 1) {
    const progress = step / 160;
    const coursePoint = samplePhysicalCoursePolyline(plannedCoursePoints, progress);
    const courseLocal = lakeWorldToLocal(lake, coursePoint.x, coursePoint.z);
    const normalizedRadius =
      Math.hypot(courseLocal.x / lake.radiusX, courseLocal.z / lake.radiusZ) /
      fittedLakeRadiusMultiplier(
        temporaryContract,
        Math.atan2(courseLocal.z / lake.radiusZ, courseLocal.x / lake.radiusX),
      );
    if (normalizedRadius <= 1.16 && previousRadius > 1.16) {
      let lower = previousProgress;
      let upper = progress;
      for (let iteration = 0; iteration < 14; iteration += 1) {
        const middle = (lower + upper) / 2;
        const middlePoint = samplePhysicalCoursePolyline(plannedCoursePoints, middle);
        const middleLocal = lakeWorldToLocal(lake, middlePoint.x, middlePoint.z);
        const normalizedX = middleLocal.x / lake.radiusX;
        const normalizedZ = middleLocal.z / lake.radiusZ;
        const middleRadius =
          Math.hypot(normalizedX, normalizedZ) /
          fittedLakeRadiusMultiplier(temporaryContract, Math.atan2(normalizedZ, normalizedX));
        if (middleRadius <= 1.16) upper = middle;
        else lower = middle;
      }
      basinEntryProgress = lower;
      break;
    }
    previousProgress = progress;
    previousRadius = normalizedRadius;
  }
  return {
    ...temporaryContract,
    course: { ...temporaryContract.course, basinEntryProgress },
  };
}
