import { stableFraction, stableHash } from "@/lib/kingdom/hash";
import type {
  CorridorRegionMask,
  EllipseRegionMask,
  HamletRegion,
  WorldPlan,
  WorldPlanEnvelope,
  WorldPlanPoint,
} from "@/lib/kingdom/world-plan";

export type PlannedTerrainMaterialZone =
  | "low-meadow"
  | "high-meadow"
  | "path-soil"
  | "settlement-soil"
  | "shore"
  | "river-bed"
  | "lake-bed"
  | "cliff-stone"
  | "scree"
  | "side-cliff"
  | "outside";

export type PlannedTerrainRegion = Readonly<{
  inside: boolean;
  height: number;
  slopeDegrees: number;
  material: PlannedTerrainMaterialZone;
  water: "river" | "lake" | null;
  waterSurfaceHeight: number | null;
}>;

export type PlannedMountainPeak = Readonly<{
  x: number;
  z: number;
  amplitude: number;
  radiusX: number;
  radiusZ: number;
}>;

export type PlannedLake = Readonly<{
  center: WorldPlanPoint;
  radiusX: number;
  radiusZ: number;
  surfaceHeight: number;
  area: number;
  footprintRatio: number;
  inletAngle: number;
  islet: Readonly<{
    center: WorldPlanPoint;
    radiusX: number;
    radiusZ: number;
    rotation: number;
  }>;
}>;

export type PlannedWaterCourse = Readonly<{
  points: ReadonlyArray<WorldPlanPoint>;
  sourceWidth: number;
  headwaterSurfaceHeight: number;
  outletSurfaceHeight: number;
  basinEntryProgress: number;
}>;

export type PlannedHamletTerrace = Readonly<{
  id: string;
  center: WorldPlanPoint;
  radiusX: number;
  radiusZ: number;
  targetHeight: number;
}>;

export type PlannedTerrainDefinition = Readonly<{
  key: string;
  envelope: WorldPlanEnvelope;
  outline: ReadonlyArray<WorldPlanPoint>;
  rearFaceZ: number;
  ordinaryHouseHeight: number;
  peaks: ReadonlyArray<PlannedMountainPeak>;
  terraces: ReadonlyArray<PlannedHamletTerrace>;
  water: Readonly<{
    course: PlannedWaterCourse;
    lake: PlannedLake;
  }>;
}>;

export type PlannedGeometryData = Readonly<{
  positions: Float32Array;
  indices: Uint32Array;
  materialZones: Uint8Array;
  vertexCount: number;
  triangleCount: number;
}>;

export type PlannedWaterGeometryRanges = Readonly<{
  courseTriangles: number;
  lakeTriangles: number;
}>;

export type PlannedTerrainGeometry = Readonly<{
  surface: PlannedGeometryData;
  sideCliffs: PlannedGeometryData;
  islet: PlannedGeometryData;
}>;

export type PlannedWaterGeometry = PlannedGeometryData &
  Readonly<{ ranges: PlannedWaterGeometryRanges }>;

export type PlannedTerrainModel = Readonly<{
  schema: "planned-global-terrain/v1";
  key: string;
  definition: PlannedTerrainDefinition;
  terrain: PlannedTerrainGeometry;
  water: PlannedWaterGeometry;
}>;

export type PlannedTerrainBuildOptions = Readonly<{
  segmentsX?: number;
  segmentsZ?: number;
  courseSegments?: number;
  courseCrossSegments?: number;
  lakeSegments?: number;
}>;

/** Minimum level settlement radius needed for 3–6 final-scale building assemblies. */
export function requiredHamletVisualRadius(hamlet: HamletRegion): number {
  const buildingCount = Math.min(6, Math.max(3, hamlet.maxBuildings));
  return Math.max(hamlet.mask.radiusX, hamlet.mask.radiusZ, 9.5 + buildingCount * 1.5);
}

/**
 * Returns the buildable visual settlement envelope. Semantic province and hit
 * masks intentionally remain at their repository-derived coordinates.
 */
export function getHamletVisualPlacementMask(
  plan: WorldPlan,
  hamlet: HamletRegion,
): EllipseRegionMask {
  const radius = requiredHamletVisualRadius(hamlet);
  const { envelope } = plan.topology;
  const rearFaceZ = plan.topology.camera.horizonZ + envelope.depth * 0.025;
  const minimumSmoothCenterZ = rearFaceZ + radius * 2.55;
  const needsEscarpmentClearance = hamlet.mask.center.z < minimumSmoothCenterZ;
  const lateralDirection = hamlet.mask.center.x <= envelope.center.x ? 1 : -1;
  const center = needsEscarpmentClearance
    ? point(
        clamp(
          hamlet.mask.center.x + lateralDirection * radius * 4.75,
          envelope.minX + envelope.safeMargin + radius,
          envelope.maxX - envelope.safeMargin - radius,
        ),
        clamp(
          minimumSmoothCenterZ,
          envelope.minZ + envelope.safeMargin + radius,
          envelope.maxZ - envelope.safeMargin - radius,
        ),
      )
    : hamlet.mask.center;
  return {
    ...hamlet.mask,
    center,
    radiusX: radius,
    radiusZ: radius,
  };
}

const MATERIAL_ZONE_CODE: Readonly<Record<PlannedTerrainMaterialZone, number>> = {
  "low-meadow": 0,
  "high-meadow": 1,
  "path-soil": 2,
  "settlement-soil": 3,
  shore: 4,
  "river-bed": 5,
  "lake-bed": 6,
  "cliff-stone": 7,
  scree: 8,
  "side-cliff": 9,
  outside: 10,
};

const definitionCache = new WeakMap<WorldPlan, PlannedTerrainDefinition>();

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

function smootherstep(value: number): number {
  const normalized = clamp(value, 0, 1);
  return normalized * normalized * normalized * (normalized * (normalized * 6 - 15) + 10);
}

function point(x: number, z: number): WorldPlanPoint {
  return { x, z };
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function latticeNoise(seed: number, x: number, z: number): number {
  const value = Math.sin(x * 127.1 + z * 311.7 + seed * 0.000_013) * 43_758.545_312_3;
  return fract(value) * 2 - 1;
}

function valueNoise(seed: number, x: number, z: number): number {
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const localX = smootherstep(x - cellX);
  const localZ = smootherstep(z - cellZ);
  const northWest = latticeNoise(seed, cellX, cellZ);
  const northEast = latticeNoise(seed, cellX + 1, cellZ);
  const southWest = latticeNoise(seed, cellX, cellZ + 1);
  const southEast = latticeNoise(seed, cellX + 1, cellZ + 1);
  return mix(mix(northWest, northEast, localX), mix(southWest, southEast, localX), localZ);
}

function fractalNoise(seed: number, x: number, z: number): number {
  return (
    valueNoise(seed, x * 0.032, z * 0.032) * 0.58 +
    valueNoise(seed + 17, x * 0.074, z * 0.074) * 0.28 +
    valueNoise(seed + 43, x * 0.16, z * 0.16) * 0.14
  );
}

function getWaterMasks(plan: WorldPlan): Readonly<{
  course: CorridorRegionMask;
  lake: EllipseRegionMask;
}> {
  const course = plan.topology.terrainZones.find(
    (zone) => zone.kind === "watershed" && zone.mask.shape === "corridor",
  )?.mask;
  const lake = plan.topology.terrainZones.find(
    (zone) => zone.kind === "lake" && zone.mask.shape === "ellipse",
  )?.mask;
  if (!course || course.shape !== "corridor" || !lake || lake.shape !== "ellipse") {
    throw new Error("The world plan must provide corridor and lake terrain zones.");
  }
  return { course, lake };
}

type BoundaryParameters = Readonly<{
  seed: number;
  phaseA: number;
  phaseB: number;
  phaseC: number;
}>;

function boundaryParameters(key: string): BoundaryParameters {
  return {
    seed: stableHash(`${key}:terrain`),
    phaseA: stableFraction(`${key}:boundary:a`) * Math.PI * 2,
    phaseB: stableFraction(`${key}:boundary:b`) * Math.PI * 2,
    phaseC: stableFraction(`${key}:boundary:c`) * Math.PI * 2,
  };
}

/**
 * Maps a rectangular sampling grid into one continuous, elongated landmass.
 * Its four independently warped edges avoid the radial/ring silhouette that
 * made the earlier renderer read like a chart instead of a world.
 */
function parametricTerrainPoint(
  envelope: WorldPlanEnvelope,
  parameters: BoundaryParameters,
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
    Math.exp(-(((t - 0.23) / 0.22) ** 2)) * 0.115 + Math.exp(-(((t - 0.8) / 0.2) ** 2)) * 0.045;
  const leftBay = -Math.exp(-(((t - 0.61) / 0.18) ** 2)) * 0.105;
  const leftPeninsula = Math.exp(-(((t - 0.82) / 0.15) ** 2)) * 0.062;
  const rightBay = -Math.exp(-(((t - 0.37) / 0.16) ** 2)) * 0.052;
  const rightPeninsula = Math.exp(-(((t - 0.7) / 0.17) ** 2)) * 0.082;
  const asymmetricCoast =
    valleySwell + (side < 0 ? leftBay + leftPeninsula : rightBay + rightPeninsula);
  const endTaper =
    1 - 0.22 * Math.exp(-(((t - 0.03) / 0.13) ** 2)) - 0.3 * Math.exp(-(((t - 0.96) / 0.12) ** 2));
  const halfWidth =
    (envelope.width / 2 - envelope.safeMargin * 0.88) * (endTaper + widthWave + asymmetricCoast);
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
        0.018 * Math.sin(normalizedX * Math.PI * 5.7 + parameters.phaseC) +
        0.026 * Math.exp(-(((normalizedX - 0.72) / 0.11) ** 2)) -
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

function buildOutline(
  envelope: WorldPlanEnvelope,
  parameters: BoundaryParameters,
  samplesPerEdge = 32,
): ReadonlyArray<WorldPlanPoint> {
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

function polygonContains(
  pointToTest: WorldPlanPoint,
  polygon: ReadonlyArray<WorldPlanPoint>,
): boolean {
  let inside = false;
  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current++
  ) {
    const first = polygon[current]!;
    const second = polygon[previous]!;
    if (
      first.z > pointToTest.z !== second.z > pointToTest.z &&
      pointToTest.x <
        ((second.x - first.x) * (pointToTest.z - first.z)) / (second.z - first.z) + first.x
    ) {
      inside = !inside;
    }
  }
  return inside;
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

type CourseQuery = Readonly<{
  distance: number;
  progress: number;
  point: WorldPlanPoint;
  halfWidth: number;
  shoreHalfWidth: number;
}>;

function courseHalfWidth(definition: PlannedTerrainDefinition, progress: number): number {
  const phase = stableFraction(`${definition.key}:course-width`) * Math.PI * 2;
  const widening = 0.58 + progress * 0.71;
  const variation = Math.sin(progress * Math.PI * 5.2 + phase) * 0.1;
  return definition.water.course.sourceWidth * clamp(widening + variation, 0.48, 1.42) * 0.5;
}

function queryCourse(definition: PlannedTerrainDefinition, x: number, z: number): CourseQuery {
  const subject = point(x, z);
  const points = definition.water.course.points;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestProgress = 0;
  let bestPoint = points[0] ?? point(x, z);
  const segmentCount = Math.max(1, points.length - 1);
  for (let index = 1; index < points.length; index += 1) {
    const result = closestPointOnSegment(subject, points[index - 1]!, points[index]!);
    if (result.distance < bestDistance) {
      bestDistance = result.distance;
      bestProgress = (index - 1 + result.segmentProgress) / segmentCount;
      bestPoint = result.point;
    }
  }
  const halfWidth = courseHalfWidth(definition, bestProgress);
  return {
    distance: bestDistance,
    progress: bestProgress,
    point: bestPoint,
    halfWidth,
    shoreHalfWidth: halfWidth + mix(2.8, 4.8, bestProgress),
  };
}

type LakeShapeDefinition = Pick<PlannedTerrainDefinition, "key" | "terraces"> &
  Readonly<{ water: Readonly<{ lake: PlannedLake }> }>;

function angularDistance(first: number, second: number): number {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
}

function lakeRadiusMultiplier(definition: LakeShapeDefinition, angle: number): number {
  const phaseA = stableFraction(`${definition.key}:lake-edge:a`) * Math.PI * 2;
  const phaseB = stableFraction(`${definition.key}:lake-edge:b`) * Math.PI * 2;
  const inletDistance = angularDistance(angle, definition.water.lake.inletAngle);
  const firstForkDistance = angularDistance(angle, definition.water.lake.inletAngle - 0.34);
  const secondForkDistance = angularDistance(angle, definition.water.lake.inletAngle + 0.39);
  const westernLobeDistance = angularDistance(angle, definition.water.lake.inletAngle - 2.05);
  const easternCoveDistance = angularDistance(angle, definition.water.lake.inletAngle + 1.68);
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
  for (const terrace of definition.terraces ?? []) {
    const lake = definition.water.lake;
    const centerX = (terrace.center.x - lake.center.x) / lake.radiusX;
    const centerZ = (terrace.center.z - lake.center.z) / lake.radiusZ;
    const clearance = Math.max(8, Math.max(terrace.radiusX, terrace.radiusZ) * 1.65 + 5);
    const radiusX = (terrace.radiusX + clearance) / lake.radiusX;
    const radiusZ = (terrace.radiusZ + clearance) / lake.radiusZ;
    const a = directionX ** 2 / radiusX ** 2 + directionZ ** 2 / radiusZ ** 2;
    const b =
      (-2 * directionX * centerX) / radiusX ** 2 + (-2 * directionZ * centerZ) / radiusZ ** 2;
    const c = centerX ** 2 / radiusX ** 2 + centerZ ** 2 / radiusZ ** 2 - 1;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) continue;
    const nearIntersection = (-b - Math.sqrt(discriminant)) / (2 * a);
    if (nearIntersection > 0) multiplier = Math.min(multiplier, nearIntersection);
  }
  return clamp(multiplier, 0.48, 1.3);
}

function lakeNormalizedRadius(definition: LakeShapeDefinition, x: number, z: number): number {
  const lake = definition.water.lake;
  const normalizedX = (x - lake.center.x) / lake.radiusX;
  const normalizedZ = (z - lake.center.z) / lake.radiusZ;
  const angle = Math.atan2(normalizedZ, normalizedX);
  return Math.hypot(normalizedX, normalizedZ) / lakeRadiusMultiplier(definition, angle);
}

function courseWaterHeight(definition: PlannedTerrainDefinition, progress: number): number {
  const eased = smoothstep(0, definition.water.course.basinEntryProgress, progress);
  return mix(
    definition.water.course.headwaterSurfaceHeight,
    definition.water.course.outletSurfaceHeight,
    eased,
  );
}

function sampleCoursePolyline(
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

function makeDefinition(plan: WorldPlan): PlannedTerrainDefinition {
  const { course: courseMask, lake: lakeMask } = getWaterMasks(plan);
  const envelope = plan.topology.envelope;
  const parameters = boundaryParameters(plan.terrainKey);
  const rearFaceZ = plan.topology.camera.horizonZ + envelope.depth * 0.025;
  // A connected lateral chain creates one dominant rear escarpment rather than
  // a few isolated mound primitives. Repository identity still jitters every
  // crest, saddle, and shoulder deterministically.
  const basePeakFractions = [-0.43, -0.28, -0.11, 0.07, 0.25, 0.42] as const;
  const peaks = basePeakFractions.map((fraction, index) => {
    const xJitter =
      (stableFraction(`${plan.terrainKey}:peak:${index}:x`) - 0.5) * envelope.width * 0.022;
    const zJitter =
      (stableFraction(`${plan.terrainKey}:peak:${index}:z`) - 0.5) * envelope.depth * 0.025;
    const heroLift = index === 3 ? 13.5 : index === 2 ? 7.2 : index === 4 ? 4.4 : 0;
    return {
      x: envelope.center.x + envelope.width * fraction + xJitter,
      z:
        envelope.minZ +
        envelope.depth *
          (0.095 + Math.sin(index * 1.37 + stableHash(plan.terrainKey) * 0.000_01) * 0.014) +
        zJitter,
      amplitude: 20.5 + stableFraction(`${plan.terrainKey}:peak:${index}:height`) * 8.5 + heroLift,
      radiusX:
        envelope.width * (0.075 + stableFraction(`${plan.terrainKey}:peak:${index}:rx`) * 0.022),
      radiusZ:
        envelope.depth * (0.105 + stableFraction(`${plan.terrainKey}:peak:${index}:rz`) * 0.025),
    } satisfies PlannedMountainPeak;
  });
  const terraces = plan.topology.hamlets.map((hamlet, index) => {
    const rearward =
      1 - clamp((hamlet.mask.center.z - envelope.minZ) / Math.max(1, envelope.depth * 0.5), 0, 1);
    const visualMask = getHamletVisualPlacementMask(plan, hamlet);
    return {
      id: hamlet.id,
      center: visualMask.center,
      radiusX: visualMask.radiusX,
      radiusZ: visualMask.radiusZ,
      targetHeight:
        2.15 + rearward * 2.1 + stableFraction(`${plan.terrainKey}:terrace:${index}`) * 0.45,
    } satisfies PlannedHamletTerrace;
  });

  const targetLakeArea =
    envelope.width *
    envelope.depth *
    (0.135 + stableFraction(`${plan.terrainKey}:lake-area`) * 0.025);
  const aspect = clamp(envelope.width / envelope.depth, 0.78, 1.12);
  const radiusX = Math.sqrt((targetLakeArea * aspect) / Math.PI);
  const radiusZ = targetLakeArea / (Math.PI * radiusX);
  const preferredLakeCenter = point(
    mix(lakeMask.center.x, envelope.center.x, 0.16),
    clamp(
      lakeMask.center.z + envelope.depth * 0.018,
      envelope.center.z + envelope.depth * 0.2,
      envelope.maxZ - envelope.safeMargin - radiusZ - envelope.depth * 0.01,
    ),
  );
  const lakeCenter = point(
    clamp(
      preferredLakeCenter.x,
      envelope.minX + envelope.safeMargin + radiusX * 1.16,
      envelope.maxX - envelope.safeMargin - radiusX * 1.16,
    ),
    preferredLakeCenter.z,
  );
  const inletAngle =
    -Math.PI / 2 - 0.16 + (stableFraction(`${plan.terrainKey}:inlet-angle`) - 0.5) * 0.1;
  const islet = {
    center: point(lakeCenter.x + radiusX * 0.17, lakeCenter.z + radiusZ * 0.13),
    radiusX: clamp(radiusX * 0.105, 3.4, 5.2),
    radiusZ: clamp(radiusZ * 0.058, 2.6, 4.1),
    rotation: -0.48 + stableFraction(`${plan.terrainKey}:islet-rotation`) * 0.34,
  } as const;
  const provisionalLake: PlannedLake = {
    center: lakeCenter,
    radiusX,
    radiusZ,
    surfaceHeight: 0,
    area: 0,
    footprintRatio: 0,
    inletAngle,
    islet,
  };
  const provisionalLakeShape = {
    key: plan.terrainKey,
    terraces,
    water: { lake: provisionalLake },
  } satisfies LakeShapeDefinition;
  const inletRadius = lakeRadiusMultiplier(provisionalLakeShape, inletAngle);
  const inletPoint = point(
    lakeCenter.x + Math.cos(inletAngle) * radiusX * inletRadius * 1.01,
    lakeCenter.z + Math.sin(inletAngle) * radiusZ * inletRadius * 1.01,
  );
  const headwaterX =
    envelope.center.x +
    envelope.width * (-0.055 + (stableFraction(`${plan.terrainKey}:headwater-x`) - 0.5) * 0.035);
  // Begin the visible course at the toe of the rear wall. The escarpment owns
  // the spring/waterfall above it; a single coplanar river strip must never
  // climb through the mountain as a blue ramp.
  const headwaterZ = rearFaceZ + envelope.depth * 0.035;
  const coursePhase = stableFraction(`${plan.terrainKey}:course-meander`) * Math.PI * 2;
  const plannedCoursePoints = Array.from({ length: 8 }, (_, index) => {
    const progress = index / 7;
    const meanderEnvelope = Math.sin(progress * Math.PI);
    const meander =
      Math.sin(progress * Math.PI * 3.4 + coursePhase) * envelope.width * 0.058 +
      Math.sin(progress * Math.PI * 6.2 - coursePhase * 0.5) * envelope.width * 0.018;
    return point(
      mix(headwaterX, inletPoint.x, progress) + meander * meanderEnvelope,
      mix(headwaterZ, inletPoint.z, progress),
    );
  });
  const lakeClosestProgress = (() => {
    let minimum = Number.POSITIVE_INFINITY;
    let progress = 0.76;
    const segmentCount = Math.max(1, plannedCoursePoints.length - 1);
    for (let index = 1; index < plannedCoursePoints.length; index += 1) {
      const result = closestPointOnSegment(
        lakeCenter,
        plannedCoursePoints[index - 1]!,
        plannedCoursePoints[index]!,
      );
      if (result.distance < minimum) {
        minimum = result.distance;
        progress = (index - 1 + result.segmentProgress) / segmentCount;
      }
    }
    return progress;
  })();
  const headwaterSurfaceHeight = 4.25;
  const outletSurfaceHeight = -0.35;
  const surfaceHeight = mix(
    headwaterSurfaceHeight,
    outletSurfaceHeight,
    smoothstep(0, 1, lakeClosestProgress),
  );
  const averageEdgeAreaFactor = 1.004;
  const lakeArea = Math.PI * radiusX * radiusZ * averageEdgeAreaFactor;

  const lakeDefinition: PlannedLake = {
    center: lakeCenter,
    radiusX,
    radiusZ,
    surfaceHeight,
    area: lakeArea,
    footprintRatio: lakeArea / (envelope.width * envelope.depth),
    inletAngle,
    islet,
  };
  const temporaryDefinition = {
    key: plan.terrainKey,
    terraces,
    water: { lake: lakeDefinition },
  } satisfies LakeShapeDefinition;
  const basinEntryProgress = (() => {
    const coarseSteps = 160;
    let previousProgress = 0;
    let previousRadius = Number.POSITIVE_INFINITY;
    for (let step = 1; step <= coarseSteps; step += 1) {
      const progress = step / coarseSteps;
      const coursePoint = sampleCoursePolyline(plannedCoursePoints, progress);
      const radius = lakeNormalizedRadius(temporaryDefinition, coursePoint.x, coursePoint.z);
      if (radius <= 1.16 && previousRadius > 1.16) {
        let lower = previousProgress;
        let upper = progress;
        for (let iteration = 0; iteration < 14; iteration += 1) {
          const middle = (lower + upper) / 2;
          const middlePoint = sampleCoursePolyline(plannedCoursePoints, middle);
          const middleRadius = lakeNormalizedRadius(
            temporaryDefinition,
            middlePoint.x,
            middlePoint.z,
          );
          if (middleRadius <= 1.16) upper = middle;
          else lower = middle;
        }
        return lower;
      }
      previousProgress = progress;
      previousRadius = radius;
    }
    return clamp(lakeClosestProgress - 0.08, 0.35, 0.88);
  })();

  const partial: Omit<PlannedTerrainDefinition, "outline"> = {
    key: plan.terrainKey,
    envelope,
    rearFaceZ,
    ordinaryHouseHeight: 7.5,
    peaks,
    terraces,
    water: {
      course: {
        points: plannedCoursePoints,
        sourceWidth: courseMask.width,
        headwaterSurfaceHeight,
        outletSurfaceHeight,
        basinEntryProgress,
      },
      lake: lakeDefinition,
    },
  };
  return {
    ...partial,
    outline: buildOutline(envelope, parameters),
  };
}

export function getPlannedTerrainDefinition(plan: WorldPlan): PlannedTerrainDefinition {
  const cached = definitionCache.get(plan);
  if (cached) return cached;
  const definition = makeDefinition(plan);
  definitionCache.set(plan, definition);
  return definition;
}

export function isInsidePlannedTerrain(plan: WorldPlan, x: number, z: number): boolean {
  return polygonContains(point(x, z), getPlannedTerrainDefinition(plan).outline);
}

function rawLandHeight(definition: PlannedTerrainDefinition, x: number, z: number): number {
  const envelope = definition.envelope;
  const seed = stableHash(`${definition.key}:height-field`);
  const broadRoll = fractalNoise(seed, x, z) * 1.72;
  const longSwell =
    Math.sin(x * 0.025 + z * 0.011 + seed * 0.000_001) * 0.66 +
    Math.cos(z * 0.031 - x * 0.009 + seed * 0.000_002) * 0.48;
  const normalizedX = Math.abs((x - envelope.center.x) / (envelope.width * 0.5));
  const frontLine =
    definition.rearFaceZ +
    Math.sin(x * 0.052 + seed * 0.000_004) * envelope.depth * 0.018 +
    Math.sin(x * 0.119 + seed * 0.000_009) * envelope.depth * 0.007;
  const rearFactor =
    1 - smoothstep(frontLine - envelope.depth * 0.035, frontLine + envelope.depth * 0.009, z);
  const escarpmentSpan = 1 - smoothstep(0.72, 1.01, normalizedX);
  const faceProfile = smoothstep(0, 1, rearFactor);
  const strataRelief =
    Math.sin(faceProfile * Math.PI * 6.2 + x * 0.052) * 0.5 +
    Math.sin(faceProfile * Math.PI * 12.5 - x * 0.031) * 0.22;
  const baseEscarpment = (faceProfile * 6.2 + strataRelief * rearFactor) * escarpmentSpan;
  const crestLine =
    envelope.minZ +
    envelope.depth *
      (0.105 +
        Math.sin(x * 0.031 + seed * 0.000_006) * 0.014 +
        Math.sin(x * 0.083 - seed * 0.000_003) * 0.006);
  const crestDistance = Math.abs(z - crestLine) / Math.max(1, envelope.depth * 0.17);
  const crestDepthProfile = Math.pow(Math.max(0, 1 - crestDistance), 1.1);
  const ridgeShelf =
    1 - smoothstep(frontLine - envelope.depth * 0.055, frontLine + envelope.depth * 0.007, z);
  const lateralCrestProfile =
    13.8 +
    Math.sin(x * 0.043 + seed * 0.000_006) * 2.7 +
    Math.sin(x * 0.097 - seed * 0.000_002) * 1.7 +
    valueNoise(seed + 71, x * 0.038, z * 0.024) * 2.4;
  const connectedRidge =
    Math.max(crestDepthProfile, ridgeShelf * 0.78) * escarpmentSpan * lateralCrestProfile;
  const peakContributions: number[] = [];
  for (const peak of definition.peaks) {
    const deltaX = (x - peak.x) / peak.radiusX;
    const deltaZ = (z - peak.z) / peak.radiusZ;
    const longitudinal = Math.max(0, 1 - Math.abs(deltaX));
    const shoulder = Math.pow(longitudinal, 2.35);
    const rearShoulder = Math.pow(Math.max(0, 1 - Math.abs(deltaZ)), 1.28);
    const crestShape = shoulder * rearShoulder;
    const brokenCrest =
      0.9 +
      valueNoise(seed + 113, x * 0.115, z * 0.045) * 0.07 +
      Math.sin(x * 0.17 + peak.z * 0.03) * 0.035;
    peakContributions.push(peak.amplitude * crestShape * brokenCrest);
  }
  peakContributions.sort((first, second) => second - first);
  const ridgeCrest =
    (peakContributions[0] ?? 0) +
    (peakContributions[1] ?? 0) * 0.3 +
    (peakContributions[2] ?? 0) * 0.08;
  const rockRibs =
    rearFactor *
    escarpmentSpan *
    Math.pow(
      Math.max(0, 1 - Math.abs(valueNoise(seed + 211, x * 0.082 + z * 0.012, z * 0.028))),
      2.1,
    ) *
    2.65;

  const headwater = definition.water.course.points[0] ?? point(0, envelope.minZ);
  const notchX = Math.exp(-(((x - headwater.x) / Math.max(5.5, envelope.width * 0.055)) ** 2));
  const notchZ = Math.exp(-(((z - headwater.z) / (envelope.depth * 0.13)) ** 2));
  const headwaterNotch = notchX * notchZ * (5.5 + rearFactor * 8.5);

  let height =
    1.75 +
    broadRoll +
    longSwell +
    baseEscarpment +
    Math.max(connectedRidge, ridgeCrest) +
    Math.min(connectedRidge, ridgeCrest) * 0.12 +
    rockRibs -
    headwaterNotch;
  let terraceTargetTotal = 0;
  let terraceWeightTotal = 0;
  let terraceInfluence = 0;
  const terraceDistances = definition.terraces
    .map((terrace) => ({
      terrace,
      normalizedDistance: Math.hypot(
        (x - terrace.center.x) / terrace.radiusX,
        (z - terrace.center.z) / terrace.radiusZ,
      ),
    }))
    .sort(
      (first, second) =>
        first.normalizedDistance - second.normalizedDistance ||
        first.terrace.id.localeCompare(second.terrace.id),
    );
  for (const { terrace, normalizedDistance } of terraceDistances) {
    if (normalizedDistance > 3.6) continue;
    // Blend overlapping settlement approaches together so adjacent visual
    // terraces never create a discontinuous nearest-terrace seam.
    const directionAngle = Math.atan2(
      (z - terrace.center.z) / terrace.radiusZ,
      (x - terrace.center.x) / terrace.radiusX,
    );
    const directionRadius = Math.hypot(
      terrace.radiusX * Math.cos(directionAngle),
      terrace.radiusZ * Math.sin(directionAngle),
    );
    const maximumGrade = Math.tan((8 * Math.PI) / 180) * directionRadius;
    const angularWarp =
      1 +
      Math.sin(directionAngle * 3 + stableHash(terrace.id) * 0.000_01) * 0.11 +
      Math.sin(directionAngle * 5 - stableHash(terrace.id) * 0.000_02) * 0.052;
    const gradedDistance = normalizedDistance * angularWarp;
    const radialTarget = terrace.targetHeight + maximumGrade * Math.max(0, gradedDistance - 0.82);
    const baseWeight = 1 - smoothstep(2.55, 3.6, gradedDistance);
    if (baseWeight <= 0) continue;
    // Normalized exponential dominance keeps a nearby terrace in control while
    // blending continuously through equal-distance settlement approaches.
    const targetWeight = baseWeight * Math.exp(-4 * gradedDistance);
    terraceTargetTotal +=
      (gradedDistance <= 0.82 ? terrace.targetHeight : radialTarget) * targetWeight;
    terraceWeightTotal += targetWeight;
    terraceInfluence = Math.max(terraceInfluence, baseWeight);
  }
  if (terraceWeightTotal > 0) {
    height = mix(height, terraceTargetTotal / terraceWeightTotal, terraceInfluence);
  }
  const exactTerraceCenter = terraceDistances.find(
    ({ normalizedDistance }) => normalizedDistance <= Number.EPSILON * 8,
  );
  if (exactTerraceCenter) height = exactTerraceCenter.terrace.targetHeight;
  return height;
}

function waterQuery(
  definition: PlannedTerrainDefinition,
  x: number,
  z: number,
): Readonly<{
  course: CourseQuery;
  lakeRadius: number;
  water: "river" | "lake" | null;
  shore: boolean;
  surfaceHeight: number | null;
}> {
  const course = queryCourse(definition, x, z);
  const lakeRadius = lakeNormalizedRadius(definition, x, z);
  const inLake = lakeRadius <= 1;
  const inCourse = course.distance <= course.halfWidth;
  const lakeShoreWidth = 4 / Math.max(definition.water.lake.radiusX, definition.water.lake.radiusZ);
  const shore =
    (!inLake && lakeRadius <= 1 + lakeShoreWidth) ||
    (!inCourse && course.distance <= course.shoreHalfWidth);
  if (inLake) {
    return {
      course,
      lakeRadius,
      water: "lake",
      shore,
      surfaceHeight: definition.water.lake.surfaceHeight,
    };
  }
  if (inCourse) {
    return {
      course,
      lakeRadius,
      water: "river",
      shore,
      surfaceHeight: courseWaterHeight(definition, course.progress),
    };
  }
  return { course, lakeRadius, water: null, shore, surfaceHeight: null };
}

function settlementSurfaceQuery(
  definition: PlannedTerrainDefinition,
  x: number,
  z: number,
): Readonly<{ withinGrading: boolean; soil: boolean }> {
  const seed = stableHash(`${definition.key}:settlement-surface`);
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestAngle = 0;
  let nearestId = "";
  for (const terrace of definition.terraces) {
    const normalizedX = (x - terrace.center.x) / terrace.radiusX;
    const normalizedZ = (z - terrace.center.z) / terrace.radiusZ;
    const normalizedDistance = Math.hypot(normalizedX, normalizedZ);
    if (normalizedDistance < nearestDistance) {
      nearestDistance = normalizedDistance;
      nearestAngle = Math.atan2(normalizedZ, normalizedX);
      nearestId = terrace.id;
    }
  }
  if (!Number.isFinite(nearestDistance)) return { withinGrading: false, soil: false };
  const organicCore =
    0.43 +
    Math.sin(nearestAngle * 3 + stableHash(nearestId) * 0.000_01) * 0.075 +
    Math.sin(nearestAngle * 5 - stableHash(nearestId) * 0.000_02) * 0.038 +
    valueNoise(seed, x * 0.09, z * 0.09) * 0.045;
  return {
    withinGrading: nearestDistance <= 4.85,
    soil: nearestDistance <= organicCore,
  };
}

function pathSurfaceDistance(definition: PlannedTerrainDefinition, x: number, z: number): number {
  if (definition.terraces.length < 2) return Number.POSITIVE_INFINITY;
  const ordered = [...definition.terraces].sort(
    (first, second) => first.center.z - second.center.z || first.id.localeCompare(second.id),
  );
  let minimum = Number.POSITIVE_INFINITY;
  const subject = point(x, z);
  for (let index = 1; index < ordered.length; index += 1) {
    minimum = Math.min(
      minimum,
      closestPointOnSegment(subject, ordered[index - 1]!.center, ordered[index]!.center).distance,
    );
  }
  return minimum;
}

export function samplePlannedWaterSurface(plan: WorldPlan, x: number, z: number): number | null {
  return waterQuery(getPlannedTerrainDefinition(plan), x, z).surfaceHeight;
}

/** Samples the continuous terrain, including the river cut and lake basin. */
export function samplePlannedTerrainHeight(plan: WorldPlan, x: number, z: number): number {
  const definition = getPlannedTerrainDefinition(plan);
  const rawHeight = rawLandHeight(definition, x, z);
  const query = waterQuery(definition, x, z);
  if (query.water === "lake") {
    const deepWater = 1 - smoothstep(0.18, 0.94, clamp(query.lakeRadius, 0, 1));
    const basinDepth = 0.16 + deepWater * 2.05;
    return Math.min(rawHeight, definition.water.lake.surfaceHeight - basinDepth);
  }
  if (query.water === "river" && query.surfaceHeight !== null) {
    const channelCenter = 1 - clamp(query.course.distance / query.course.halfWidth, 0, 1);
    const centerDepth = 0.14 + Math.pow(channelCenter, 1.45) * 1.28;
    return Math.min(rawHeight, query.surfaceHeight - centerDepth);
  }
  if (query.shore) {
    const lakeBank = query.lakeRadius > 1 ? smoothstep(1, 1.18, query.lakeRadius) : 1;
    const courseBank = smoothstep(
      query.course.halfWidth,
      query.course.shoreHalfWidth,
      query.course.distance,
    );
    const bankBlend = Math.min(lakeBank, courseBank);
    const nearbyWaterHeight =
      query.lakeRadius <= 1.2
        ? definition.water.lake.surfaceHeight
        : courseWaterHeight(definition, query.course.progress);
    return mix(Math.min(rawHeight, nearbyWaterHeight + 0.2), rawHeight, bankBlend);
  }
  return rawHeight;
}

export function classifyPlannedTerrainRegion(
  plan: WorldPlan,
  x: number,
  z: number,
): PlannedTerrainRegion {
  const definition = getPlannedTerrainDefinition(plan);
  const inside = polygonContains(point(x, z), definition.outline);
  const height = samplePlannedTerrainHeight(plan, x, z);
  if (!inside) {
    return {
      inside,
      height,
      slopeDegrees: 0,
      material: "outside",
      water: null,
      waterSurfaceHeight: null,
    };
  }
  const water = waterQuery(definition, x, z);
  const sampleDistance = Math.max(0.7, definition.envelope.width / 220);
  const deltaX =
    samplePlannedTerrainHeight(plan, x + sampleDistance, z) -
    samplePlannedTerrainHeight(plan, x - sampleDistance, z);
  const deltaZ =
    samplePlannedTerrainHeight(plan, x, z + sampleDistance) -
    samplePlannedTerrainHeight(plan, x, z - sampleDistance);
  const slope = Math.hypot(deltaX, deltaZ) / (sampleDistance * 2);
  const slopeDegrees = (Math.atan(slope) * 180) / Math.PI;
  const settlement = settlementSurfaceQuery(definition, x, z);
  const pathDistance = pathSurfaceDistance(definition, x, z);
  const pathEdge =
    1.2 + valueNoise(stableHash(`${definition.key}:path-edge`), x * 0.08, z * 0.08) * 0.32;
  let material: PlannedTerrainMaterialZone;
  if (water.water === "lake") material = "lake-bed";
  else if (water.water === "river") material = "river-bed";
  else if (water.shore) material = "shore";
  else if (settlement.soil && slopeDegrees < 12) material = "settlement-soil";
  else if (pathDistance <= pathEdge && slopeDegrees < 15) material = "path-soil";
  else if (settlement.withinGrading && slopeDegrees < 20) material = "high-meadow";
  else if (
    slopeDegrees >= 37 ||
    (z <= definition.rearFaceZ - definition.envelope.depth * 0.015 && height >= 15)
  ) {
    material = "cliff-stone";
  } else if (
    slopeDegrees >= 20 ||
    (z <= definition.rearFaceZ + definition.envelope.depth * 0.015 && height >= 7)
  ) {
    material = "scree";
  } else if (height >= 4.5) material = "high-meadow";
  else material = "low-meadow";
  return {
    inside,
    height,
    slopeDegrees,
    material,
    water: water.water,
    waterSurfaceHeight: water.surfaceHeight,
  };
}

export function samplePlannedWatershedPoint(
  plan: WorldPlan,
  progress: number,
): Readonly<WorldPlanPoint & { width: number; surfaceHeight: number }> {
  const definition = getPlannedTerrainDefinition(plan);
  const points = definition.water.course.points;
  const clampedProgress = clamp(progress, 0, 1);
  const scaled = clampedProgress * Math.max(1, points.length - 1);
  const segmentIndex = Math.min(Math.max(0, points.length - 2), Math.floor(scaled));
  const localProgress = scaled - segmentIndex;
  const start = points[segmentIndex] ?? points[0] ?? point(0, definition.envelope.minZ);
  const end = points[segmentIndex + 1] ?? start;
  return {
    x: mix(start.x, end.x, localProgress),
    z: mix(start.z, end.z, localProgress),
    width: courseHalfWidth(definition, clampedProgress) * 2,
    surfaceHeight: courseWaterHeight(definition, clampedProgress),
  };
}

function geometryData(
  positions: number[],
  indices: number[],
  materialZones: number[],
): PlannedGeometryData {
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    materialZones: new Uint8Array(materialZones),
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
  };
}

export function buildPlannedIsletGeometry(plan: WorldPlan): PlannedGeometryData {
  const definition = getPlannedTerrainDefinition(plan);
  const { islet, surfaceHeight } = definition.water.lake;
  const segments = 36;
  const positions: number[] = [islet.center.x, surfaceHeight + 0.34, islet.center.z];
  const indices: number[] = [];
  const zones: number[] = [MATERIAL_ZONE_CODE["high-meadow"]];
  const cosine = Math.cos(islet.rotation);
  const sine = Math.sin(islet.rotation);
  const appendRing = (scale: number, y: number, material: PlannedTerrainMaterialZone) => {
    for (let index = 0; index <= segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const edgeVariation =
        1 +
        Math.sin(angle * 3 + stableHash(definition.key) * 0.000_01) * 0.09 +
        Math.sin(angle * 7 - stableHash(definition.key) * 0.000_02) * 0.035;
      const localX = Math.cos(angle) * islet.radiusX * scale * edgeVariation;
      const localZ = Math.sin(angle) * islet.radiusZ * scale * edgeVariation;
      positions.push(
        islet.center.x + localX * cosine - localZ * sine,
        y,
        islet.center.z + localX * sine + localZ * cosine,
      );
      zones.push(MATERIAL_ZONE_CODE[material]);
    }
  };
  const innerStart = 1;
  appendRing(0.68, surfaceHeight + 0.27, "high-meadow");
  const outerStart = 1 + segments + 1;
  appendRing(1, surfaceHeight + 0.055, "shore");
  for (let index = 0; index < segments; index += 1) {
    indices.push(0, innerStart + index, innerStart + index + 1);
    indices.push(
      innerStart + index,
      outerStart + index,
      innerStart + index + 1,
      innerStart + index + 1,
      outerStart + index,
      outerStart + index + 1,
    );
  }
  return geometryData(positions, indices, zones);
}

export function buildPlannedTerrainGeometry(
  plan: WorldPlan,
  options: PlannedTerrainBuildOptions = {},
): PlannedTerrainGeometry {
  const definition = getPlannedTerrainDefinition(plan);
  const parameters = boundaryParameters(plan.terrainKey);
  const segmentsX = clamp(Math.round(options.segmentsX ?? 96), 16, 160);
  const segmentsZ = clamp(Math.round(options.segmentsZ ?? 112), 20, 180);
  const positions: number[] = [];
  const indices: number[] = [];
  const zones: number[] = [];
  const verticesPerRow = segmentsX + 1;

  for (let row = 0; row <= segmentsZ; row += 1) {
    const progressZ = row / segmentsZ;
    for (let column = 0; column <= segmentsX; column += 1) {
      const signedX = -1 + (column / segmentsX) * 2;
      const terrainPoint = parametricTerrainPoint(
        definition.envelope,
        parameters,
        signedX,
        progressZ,
      );
      const height = samplePlannedTerrainHeight(plan, terrainPoint.x, terrainPoint.z);
      const region = classifyPlannedTerrainRegion(plan, terrainPoint.x, terrainPoint.z);
      positions.push(terrainPoint.x, height, terrainPoint.z);
      zones.push(MATERIAL_ZONE_CODE[region.material]);
    }
  }
  for (let row = 0; row < segmentsZ; row += 1) {
    for (let column = 0; column < segmentsX; column += 1) {
      const northWest = row * verticesPerRow + column;
      const northEast = northWest + 1;
      const southWest = northWest + verticesPerRow;
      const southEast = southWest + 1;
      if ((row + column) % 2 === 0) {
        indices.push(northWest, southWest, northEast, northEast, southWest, southEast);
      } else {
        indices.push(northWest, southWest, southEast, northWest, southEast, northEast);
      }
    }
  }

  const outline = definition.outline;
  const sidePositions: number[] = [];
  const sideIndices: number[] = [];
  const sideZones: number[] = [];
  const cliffSeed = stableHash(`${plan.terrainKey}:side-cliff`);
  const { center } = definition.envelope;
  for (let index = 0; index < outline.length; index += 1) {
    const boundaryPoint = outline[index]!;
    const topHeight = samplePlannedTerrainHeight(plan, boundaryPoint.x, boundaryPoint.z);
    const localVariation =
      valueNoise(cliffSeed, boundaryPoint.x * 0.055, boundaryPoint.z * 0.055) * 0.16 +
      valueNoise(cliffSeed + 37, boundaryPoint.x * 0.13, boundaryPoint.z * 0.13) * 0.07;
    const frontProgress = clamp(
      (boundaryPoint.z - definition.envelope.minZ) / definition.envelope.depth,
      0,
      1,
    );
    const localDepth = clamp(1.08 + frontProgress * 0.18 + localVariation, 0.82, 1.48);
    const directionX = center.x - boundaryPoint.x;
    const directionZ = center.z - boundaryPoint.z;
    const directionLength = Math.max(0.000_1, Math.hypot(directionX, directionZ));
    const insetX = directionX / directionLength;
    const insetZ = directionZ / directionLength;
    const shoulderDepth = localDepth * 0.31;
    sidePositions.push(
      boundaryPoint.x,
      topHeight,
      boundaryPoint.z,
      boundaryPoint.x + insetX * 0.12,
      topHeight - shoulderDepth,
      boundaryPoint.z + insetZ * 0.12,
      boundaryPoint.x + insetX * 0.34,
      topHeight - localDepth,
      boundaryPoint.z + insetZ * 0.34,
    );
    sideZones.push(
      MATERIAL_ZONE_CODE.scree,
      MATERIAL_ZONE_CODE["side-cliff"],
      MATERIAL_ZONE_CODE["side-cliff"],
    );
  }
  for (let index = 0; index < outline.length; index += 1) {
    const next = (index + 1) % outline.length;
    const top = index * 3;
    const shoulder = top + 1;
    const bottom = top + 2;
    const nextTop = next * 3;
    const nextShoulder = nextTop + 1;
    const nextBottom = nextTop + 2;
    sideIndices.push(
      top,
      shoulder,
      nextTop,
      nextTop,
      shoulder,
      nextShoulder,
      shoulder,
      bottom,
      nextShoulder,
      nextShoulder,
      bottom,
      nextBottom,
    );
  }

  return {
    surface: geometryData(positions, indices, zones),
    sideCliffs: geometryData(sidePositions, sideIndices, sideZones),
    islet: buildPlannedIsletGeometry(plan),
  };
}

export function buildPlannedWaterGeometry(
  plan: WorldPlan,
  options: PlannedTerrainBuildOptions = {},
): PlannedWaterGeometry {
  const definition = getPlannedTerrainDefinition(plan);
  const courseSegments = clamp(Math.round(options.courseSegments ?? 64), 12, 120);
  const crossSegments = clamp(Math.round(options.courseCrossSegments ?? 4), 2, 8);
  const lakeSegments = clamp(Math.round(options.lakeSegments ?? 56), 20, 96);
  const positions: number[] = [];
  const indices: number[] = [];
  const zones: number[] = [];
  const verticesPerCourseRow = crossSegments + 1;
  const basinEntryProgress = definition.water.course.basinEntryProgress;
  const activeCourseRows = Math.max(2, Math.floor(courseSegments * basinEntryProgress));

  for (let row = 0; row <= activeCourseRows; row += 1) {
    const progress = Math.min(
      basinEntryProgress - 0.008,
      (row / activeCourseRows) * basinEntryProgress,
    );
    const center = samplePlannedWatershedPoint(plan, progress);
    const previous = samplePlannedWatershedPoint(plan, Math.max(0, progress - 1 / courseSegments));
    const next = samplePlannedWatershedPoint(plan, Math.min(1, progress + 1 / courseSegments));
    const tangentX = next.x - previous.x;
    const tangentZ = next.z - previous.z;
    const tangentLength = Math.max(0.000_1, Math.hypot(tangentX, tangentZ));
    const perpendicularX = -tangentZ / tangentLength;
    const perpendicularZ = tangentX / tangentLength;
    for (let column = 0; column <= crossSegments; column += 1) {
      const across = -1 + (column / crossSegments) * 2;
      const x = center.x + perpendicularX * center.width * 0.5 * across;
      const z = center.z + perpendicularZ * center.width * 0.5 * across;
      const y = center.surfaceHeight + Math.sin(progress * Math.PI * 8 + across * 2) * 0.018;
      positions.push(x, y + 0.035, z);
      zones.push(MATERIAL_ZONE_CODE["river-bed"]);
    }
  }
  for (let row = 0; row < activeCourseRows; row += 1) {
    for (let column = 0; column < crossSegments; column += 1) {
      const first = row * verticesPerCourseRow + column;
      const second = first + verticesPerCourseRow;
      indices.push(first, second, first + 1, first + 1, second, second + 1);
    }
  }
  const courseTriangles = indices.length / 3;

  const lakeCenterIndex = positions.length / 3;
  positions.push(
    definition.water.lake.center.x,
    definition.water.lake.surfaceHeight + 0.045,
    definition.water.lake.center.z,
  );
  zones.push(MATERIAL_ZONE_CODE["lake-bed"]);
  const perimeterStart = positions.length / 3;
  for (let index = 0; index <= lakeSegments; index += 1) {
    const angle = (index / lakeSegments) * Math.PI * 2;
    const multiplier = lakeRadiusMultiplier(definition, angle);
    positions.push(
      definition.water.lake.center.x + Math.cos(angle) * definition.water.lake.radiusX * multiplier,
      definition.water.lake.surfaceHeight + 0.045,
      definition.water.lake.center.z + Math.sin(angle) * definition.water.lake.radiusZ * multiplier,
    );
    zones.push(MATERIAL_ZONE_CODE["lake-bed"]);
  }
  for (let index = 0; index < lakeSegments; index += 1) {
    indices.push(lakeCenterIndex, perimeterStart + index, perimeterStart + index + 1);
  }
  return {
    ...geometryData(positions, indices, zones),
    ranges: { courseTriangles, lakeTriangles: lakeSegments },
  };
}

export function createPlannedTerrainModel(
  plan: WorldPlan,
  options: PlannedTerrainBuildOptions = {},
): PlannedTerrainModel {
  return {
    schema: "planned-global-terrain/v1",
    key: plan.terrainKey,
    definition: getPlannedTerrainDefinition(plan),
    terrain: buildPlannedTerrainGeometry(plan, options),
    water: buildPlannedWaterGeometry(plan, options),
  };
}

export function plannedTerrainMaterialCode(material: PlannedTerrainMaterialZone): number {
  return MATERIAL_ZONE_CODE[material];
}
