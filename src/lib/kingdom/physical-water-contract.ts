import { stableFraction } from "./hash";
import type {
  CorridorRegionMask,
  EllipseRegionMask,
  WorldPlanEnvelope,
  WorldPlanPoint,
} from "./world-plan";

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
  surfaceHeight: number;
  area: number;
  footprintRatio: number;
  inletAngle: number;
  perimeter: ReadonlyArray<WorldPlanPoint>;
  islet: Readonly<{
    center: WorldPlanPoint;
    radiusX: number;
    radiusZ: number;
    rotation: number;
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
}>;

export const PHYSICAL_LAKE_PERIMETER_SEGMENTS = 96;

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
): WorldPlanPoint {
  const s = clamp(signedX, -1, 1);
  const t = clamp(progressZ, 0, 1);
  const side = s < 0 ? -1 : 1;
  const widthWave =
    Math.sin(t * Math.PI * 2.17 + parameters.phaseA) * 0.045 +
    Math.sin(t * Math.PI * 5.03 + parameters.phaseB) * 0.021 +
    Math.sin(t * Math.PI * 8.1 + parameters.phaseC) * 0.006;
  const valleySwell =
    Math.exp(-(((t - 0.23) / 0.22) ** 2)) * 0.13 + Math.exp(-(((t - 0.8) / 0.2) ** 2)) * 0.2;
  const leftBay = -Math.exp(-(((t - 0.61) / 0.18) ** 2)) * 0.14;
  const leftPeninsula = Math.exp(-(((t - 0.82) / 0.15) ** 2)) * 0.12;
  const rightBay = -Math.exp(-(((t - 0.37) / 0.16) ** 2)) * 0.09;
  const rightPeninsula = Math.exp(-(((t - 0.7) / 0.17) ** 2)) * 0.2;
  const asymmetricCoast =
    valleySwell + (side < 0 ? leftBay + leftPeninsula : rightBay + rightPeninsula);
  const authoredWidthProfile =
    -Math.exp(-(((t - 0.42) / 0.13) ** 2)) * 0.1 -
    Math.exp(-(((t - 0.59) / 0.105) ** 2)) * 0.11 +
    Math.exp(-(((t - 0.81) / 0.14) ** 2)) * 0.105;
  const endTaper =
    1 - 0.22 * Math.exp(-(((t - 0.03) / 0.13) ** 2)) - 0.1 * Math.exp(-(((t - 0.96) / 0.12) ** 2));
  const halfWidth =
    (envelope.width / 2 - envelope.safeMargin * 0.88) *
    (endTaper + widthWave + asymmetricCoast + authoredWidthProfile);
  const centerShift =
    envelope.width *
    (Math.sin(t * Math.PI * 1.43 + parameters.phaseC) * 0.025 +
      Math.sin(t * Math.PI * 3.61 + parameters.phaseA) * 0.018 +
      Math.exp(-(((t - 0.76) / 0.14) ** 2)) * 0.035);
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
        0.025 * Math.exp(-(((normalizedX - 0.72) / 0.11) ** 2)) -
        0.018 * Math.exp(-(((normalizedX - 0.28) / 0.09) ** 2)));
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

export function buildPhysicalTerrainOutline(
  envelope: WorldPlanEnvelope,
  key: string,
  samplesPerEdge = 32,
): ReadonlyArray<WorldPlanPoint> {
  const parameters = boundaryParameters(key);
  const result: WorldPlanPoint[] = [];
  for (let index = 0; index <= samplesPerEdge; index += 1) {
    result.push(parametricTerrainPoint(envelope, parameters, -1 + (index / samplesPerEdge) * 2, 0));
  }
  for (let index = 1; index <= samplesPerEdge; index += 1) {
    result.push(parametricTerrainPoint(envelope, parameters, 1, index / samplesPerEdge));
  }
  for (let index = 1; index <= samplesPerEdge; index += 1) {
    result.push(parametricTerrainPoint(envelope, parameters, 1 - (index / samplesPerEdge) * 2, 1));
  }
  for (let index = 1; index < samplesPerEdge; index += 1) {
    result.push(parametricTerrainPoint(envelope, parameters, -1, 1 - index / samplesPerEdge));
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

function angularDistance(first: number, second: number): number {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
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
  for (const terrace of contract.terraces) {
    const centerX = (terrace.center.x - contract.lake.center.x) / contract.lake.radiusX;
    const centerZ = (terrace.center.z - contract.lake.center.z) / contract.lake.radiusZ;
    const clearance = Math.max(8, Math.max(terrace.radiusX, terrace.radiusZ) * 1.65 + 5);
    const radiusX = (terrace.radiusX + clearance) / contract.lake.radiusX;
    const radiusZ = (terrace.radiusZ + clearance) / contract.lake.radiusZ;
    const a = directionX ** 2 / radiusX ** 2 + directionZ ** 2 / radiusZ ** 2;
    const b =
      (-2 * directionX * centerX) / radiusX ** 2 + (-2 * directionZ * centerZ) / radiusZ ** 2;
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
    point(
      contract.lake.center.x + Math.cos(angle) * contract.lake.radiusX * multiplier,
      contract.lake.center.z + Math.sin(angle) * contract.lake.radiusZ * multiplier,
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
  const subjectRadius = Math.hypot(deltaX, deltaZ);
  if (subjectRadius <= Number.EPSILON || lake.perimeter.length === 0) return 0;
  const directionX = deltaX / subjectRadius;
  const directionZ = deltaZ / subjectRadius;
  const angle = Math.atan2(deltaZ, deltaX);
  const normalizedAngle = angle < 0 ? angle + Math.PI * 2 : angle;
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
  return subjectRadius / Math.max(Number.EPSILON, boundaryRadius);
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
  const { key, envelope, courseMask, lakeMask, terraces } = input;
  const outline = buildPhysicalTerrainOutline(envelope, key);
  const targetLakeArea =
    envelope.width * envelope.depth * (0.135 + stableFraction(`${key}:lake-area`) * 0.025);
  const aspect = clamp(envelope.width / envelope.depth, 0.78, 1.12);
  const inletAngle = -Math.PI / 2 - 0.16 + (stableFraction(`${key}:inlet-angle`) - 0.5) * 0.1;
  const headwaterSurfaceHeight = 4.25;
  const outletSurfaceHeight = -0.35;
  const baseRadiusX = Math.sqrt((targetLakeArea * aspect) / Math.PI);
  const baseRadiusZ = targetLakeArea / (Math.PI * baseRadiusX);
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
    const preferredLakeCenter = point(
      mix(lakeMask.center.x, envelope.center.x, 0.16),
      clamp(
        mix(lakeMask.center.z, envelope.center.z, 0.18),
        envelope.center.z + envelope.depth * 0.12,
        envelope.maxZ - envelope.safeMargin - radiusZ - envelope.depth * 0.01,
      ),
    );
    const center = point(
      clamp(
        preferredLakeCenter.x,
        envelope.minX + envelope.safeMargin + radiusX * 1.16,
        envelope.maxX - envelope.safeMargin - radiusX * 1.16,
      ),
      preferredLakeCenter.z,
    );
    return {
      center,
      radiusX,
      radiusZ,
      surfaceHeight: 0,
      area: 0,
      footprintRatio: 0,
      inletAngle,
      perimeter: [],
      islet: {
        center: point(center.x + radiusX * 0.17, center.z + radiusZ * 0.13),
        radiusX: clamp(radiusX * 0.105, 3.4, 5.2),
        radiusZ: clamp(radiusZ * 0.058, 2.6, 4.1),
        rotation: -0.48 + stableFraction(`${key}:islet-rotation`) * 0.34,
      },
    };
  };
  const baseContract: PhysicalWaterContract = {
    key,
    envelope,
    outline,
    terraces,
    lake: lakeAtScale(1),
    course,
  };
  const provisionalLake = baseContract.lake;
  const { center: lakeCenter, radiusX, radiusZ } = provisionalLake;
  const inletRadius = fittedLakeRadiusMultiplier(baseContract, inletAngle);
  const inletPoint = point(
    lakeCenter.x + Math.cos(inletAngle) * radiusX * inletRadius * 1.01,
    lakeCenter.z + Math.sin(inletAngle) * radiusZ * inletRadius * 1.01,
  );
  const rearFaceZ = input.horizonZ + envelope.depth * 0.025;
  const headwaterX =
    envelope.center.x +
    envelope.width * (-0.055 + (stableFraction(`${key}:headwater-x`) - 0.5) * 0.035);
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
  const plannedCoursePoints = Array.from({ length: 12 }, (_, index) => {
    const progress = index / 11;
    const meanderEnvelope = Math.sin(progress * Math.PI);
    const meander =
      Math.sin(progress * Math.PI * 3.4 + coursePhase) * envelope.width * 0.058 +
      Math.sin(progress * Math.PI * 6.2 - coursePhase * 0.5) * envelope.width * 0.018;
    const semanticGuide = samplePhysicalCoursePolyline(courseMask.points, progress);
    const linearX = mix(headwaterX, inletPoint.x, progress);
    const guidedX = mix(linearX, semanticGuide.x, Math.sin(progress * Math.PI) * 0.72);
    const z = mix(headwaterZ, inletPoint.z, progress);
    return point(routeXAroundTerraces(guidedX + meander * meanderEnvelope, z), z);
  });
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
    return point(
      lakeCenter.x + Math.cos(angle) * radiusX * multiplier,
      lakeCenter.z + Math.sin(angle) * radiusZ * multiplier,
    );
  });
  const fittedLakeArea = physicalLakePolygonArea(perimeter);
  const lake: PhysicalLakeContract = {
    ...unmeasuredLake,
    perimeter,
    area: fittedLakeArea,
    footprintRatio: fittedLakeArea / (envelope.width * envelope.depth),
  };
  const temporaryContract: PhysicalWaterContract = { ...radialContract, lake };
  let basinEntryProgress = clamp(lakeClosestProgress - 0.08, 0.35, 0.88);
  let previousProgress = 0;
  let previousRadius = Number.POSITIVE_INFINITY;
  for (let step = 1; step <= 160; step += 1) {
    const progress = step / 160;
    const coursePoint = samplePhysicalCoursePolyline(plannedCoursePoints, progress);
    const normalizedRadius =
      Math.hypot(
        (coursePoint.x - lake.center.x) / lake.radiusX,
        (coursePoint.z - lake.center.z) / lake.radiusZ,
      ) /
      fittedLakeRadiusMultiplier(
        temporaryContract,
        Math.atan2(
          (coursePoint.z - lake.center.z) / lake.radiusZ,
          (coursePoint.x - lake.center.x) / lake.radiusX,
        ),
      );
    if (normalizedRadius <= 1.16 && previousRadius > 1.16) {
      let lower = previousProgress;
      let upper = progress;
      for (let iteration = 0; iteration < 14; iteration += 1) {
        const middle = (lower + upper) / 2;
        const middlePoint = samplePhysicalCoursePolyline(plannedCoursePoints, middle);
        const normalizedX = (middlePoint.x - lake.center.x) / lake.radiusX;
        const normalizedZ = (middlePoint.z - lake.center.z) / lake.radiusZ;
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
