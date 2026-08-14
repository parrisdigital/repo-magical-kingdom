import type { WorldPlan } from "@/lib/kingdom/world-plan";

import type {
  PlannedLandUse,
  PlannedLandUsePoint,
  PlannedRoadCrossing,
  PlannedRoadSegment,
} from "./planned-land-use";
import {
  classifyPlannedTerrainRegion,
  samplePlannedTerrainHeight,
  type PlannedTerrainRegion,
} from "./planned-terrain-model";
import type {
  PlannedRegionalAssetInstance,
  PlannedRegionalExperiencePlan,
} from "./planned-regional-experience-model";

export type KingdomNavigationMode = "orbit" | "walk";

export type WalkInputState = Readonly<{
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
}>;

export type WalkObstacle = Readonly<{
  x: number;
  z: number;
  radius: number;
}>;

export type WalkPosition = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type WalkBlockReason = "outside" | "water" | "shore" | "steep" | "structure";
export type WalkStepResolution = "full" | "x" | "z" | "blocked";

export type WalkMotionState = {
  velocityX: number;
  velocityZ: number;
  speed: number;
  stridePhase: number;
  bobY: number;
  swayX: number;
};

export type WalkNavigationGrid = Readonly<{
  minX: number;
  minZ: number;
  stepX: number;
  stepZ: number;
  columns: number;
  rows: number;
  allowed: Uint8Array;
  heights: Float32Array;
  primaryRoadNetworkId: string;
  primaryRoadSegmentIds: ReadonlyArray<string>;
  roadSurfaces: ReadonlyArray<WalkNavigationRoadSurface>;
  obstacles: ReadonlyArray<WalkObstacle>;
}>;

export type WalkNavigationRoadSurface = Readonly<{
  segmentId: string;
  edgeIndex: number;
  kind: "ordinary-road" | PlannedRoadCrossing["kind"];
  width: number;
  start: WalkPosition;
  end: WalkPosition;
}>;

export const WALK_EYE_HEIGHT = 1.72;
export const WALK_BODY_RADIUS = 0.58;
export const WALK_MAX_SLOPE_DEGREES = 24;
export const WALK_SPRINT_MULTIPLIER = 1.55;
export const WALK_MAX_BOB_Y = 0.052;
export const WALK_MAX_SWAY_X = 0.026;

const EMPTY_WALK_INPUT: WalkInputState = Object.freeze({
  forward: false,
  backward: false,
  left: false,
  right: false,
  sprint: false,
});

type WalkAction = keyof WalkInputState;

/**
 * Every rendered land-use anchor owns a physical footprint. Keeping this
 * conversion beside the navigation model makes the visible prop catalog and
 * Walk collision consume the same canonical placement data.
 */
export function createLandUseWalkObstacles(landUse: PlannedLandUse): ReadonlyArray<WalkObstacle> {
  return landUse.anchors.map((anchor) => ({
    x: anchor.position.x,
    z: anchor.position.z,
    radius: anchor.clearanceRadius,
  }));
}

function plannedRegionalObstacleRadius(instance: PlannedRegionalAssetInstance): number {
  if (instance.role === "fence") {
    // The shipped fence is normalized by height at render time. A 0.9:1
    // radius-to-height ratio conservatively encloses its long horizontal rail.
    return Math.max(0.72, instance.targetHeight * 0.9);
  }
  // A waylight is a narrow post; body clearance is added separately by the
  // navigation query, so this encloses the rendered cap without a false wall.
  return Math.max(0.2, instance.targetHeight * 0.18);
}

/** Physical footprints for every fence and waylight rendered by the regional plan. */
export function createPlannedRegionalWalkObstacles(
  regional: Pick<PlannedRegionalExperiencePlan, "instances">,
): ReadonlyArray<WalkObstacle> {
  return regional.instances
    .filter((instance) => instance.role === "fence" || instance.role === "waylight")
    .sort((first, second) => first.id.localeCompare(second.id))
    .map((instance) => ({
      x: instance.position.x,
      z: instance.position.z,
      radius: plannedRegionalObstacleRadius(instance),
    }));
}

/**
 * Adds late-authored obstacles to an already-prepared worker grid. Terrain,
 * road surfaces, and heights are copied verbatim; only collision occupancy is
 * rasterized into a fresh allowed array.
 */
export function addWalkNavigationGridObstacles(
  grid: WalkNavigationGrid,
  additions: ReadonlyArray<WalkObstacle>,
): WalkNavigationGrid {
  const added = additions.map((obstacle) => ({ ...obstacle }));
  const obstacles = [...grid.obstacles.map((obstacle) => ({ ...obstacle })), ...added];
  const allowed = grid.allowed.slice();
  const heights = grid.heights.slice();
  const conservativeBodyRadius = WALK_BODY_RADIUS + Math.hypot(grid.stepX, grid.stepZ) * 0.5;

  if (added.length > 0) {
    for (let row = 0; row < grid.rows; row += 1) {
      const z = grid.minZ + row * grid.stepZ;
      for (let column = 0; column < grid.columns; column += 1) {
        const index = row * grid.columns + column;
        if (allowed[index] === 0) continue;
        const x = grid.minX + column * grid.stepX;
        if (walkObstacleAt(added, x, z, conservativeBodyRadius)) allowed[index] = 0;
      }
    }
  }

  return { ...grid, allowed, heights, obstacles };
}

export function createWalkInputState(): WalkInputState {
  return EMPTY_WALK_INPUT;
}

export function walkActionForKey(key: string): WalkAction | null {
  switch (key.toLowerCase()) {
    case "w":
    case "arrowup":
      return "forward";
    case "s":
    case "arrowdown":
      return "backward";
    case "a":
    case "arrowleft":
      return "left";
    case "d":
    case "arrowright":
      return "right";
    case "shift":
      return "sprint";
    default:
      return null;
  }
}

export function updateWalkInputState(
  state: WalkInputState,
  key: string,
  pressed: boolean,
): WalkInputState {
  const action = walkActionForKey(key);
  if (!action || state[action] === pressed) return state;
  return { ...state, [action]: pressed };
}

export function clearWalkInputState(): WalkInputState {
  return EMPTY_WALK_INPUT;
}

export function walkRightAxis(state: WalkInputState): number {
  return Number(state.right) - Number(state.left);
}

export function walkForwardAxis(state: WalkInputState): number {
  return Number(state.forward) - Number(state.backward);
}

/** Prevents diagonal keyboard input from moving faster than a cardinal direction. */
export function normalizedWalkAxisScale(right: number, forward: number): number {
  const length = Math.hypot(right, forward);
  return length > 1 ? 1 / length : 1;
}

export function createWalkMotionState(): WalkMotionState {
  return {
    velocityX: 0,
    velocityZ: 0,
    speed: 0,
    stridePhase: 0,
    bobY: 0,
    swayX: 0,
  };
}

/**
 * Advances the high-frequency movement state in place. This is intentionally
 * renderer-agnostic and allocation-free so the R3F frame loop never needs to
 * use React state for acceleration, deceleration, or camera motion.
 */
export function advanceWalkMotion(
  state: WalkMotionState,
  desiredX: number,
  desiredZ: number,
  sprint: boolean,
  delta: number,
  baseSpeed: number,
  reducedMotion: boolean,
): void {
  const frameDelta = Math.min(0.05, Math.max(0, delta));
  const desiredLength = Math.hypot(desiredX, desiredZ);
  const hasInput = desiredLength > 0.000_1;
  const desiredScale = hasInput ? 1 / Math.max(1, desiredLength) : 0;
  const targetSpeed =
    Math.max(0, baseSpeed) * (sprint ? WALK_SPRINT_MULTIPLIER : 1) * Number(hasInput);
  const response = 1 - Math.exp(-(hasInput ? 8.5 : 11.5) * frameDelta);
  const targetVelocityX = desiredX * desiredScale * targetSpeed;
  const targetVelocityZ = desiredZ * desiredScale * targetSpeed;

  state.velocityX += (targetVelocityX - state.velocityX) * response;
  state.velocityZ += (targetVelocityZ - state.velocityZ) * response;
  if (!hasInput && Math.hypot(state.velocityX, state.velocityZ) < 0.012) {
    state.velocityX = 0;
    state.velocityZ = 0;
  }
  state.speed = Math.hypot(state.velocityX, state.velocityZ);

  if (reducedMotion) {
    state.bobY = 0;
    state.swayX = 0;
    return;
  }
  if (state.speed < 0.035 || frameDelta === 0) {
    const settle = 1 - Math.exp(-14 * frameDelta);
    state.bobY += (0 - state.bobY) * settle;
    state.swayX += (0 - state.swayX) * settle;
    return;
  }

  state.stridePhase =
    (state.stridePhase + state.speed * frameDelta * (sprint ? 1.34 : 1.12)) % (Math.PI * 2);
  const gait = Math.min(1, state.speed / Math.max(0.001, baseSpeed));
  state.bobY = Math.sin(state.stridePhase * 2) * WALK_MAX_BOB_Y * gait * (sprint ? 1 : 0.78);
  state.swayX = Math.sin(state.stridePhase) * WALK_MAX_SWAY_X * gait * (sprint ? 1 : 0.72);
}

export function constrainWalkMotionForResolution(
  state: WalkMotionState,
  resolution: WalkStepResolution,
): void {
  if (resolution === "blocked") {
    state.velocityX = 0;
    state.velocityZ = 0;
  } else if (resolution === "x") {
    state.velocityZ = 0;
  } else if (resolution === "z") {
    state.velocityX = 0;
  }
  state.speed = Math.hypot(state.velocityX, state.velocityZ);
}

export function walkSurfaceBlockReason(
  surface: Pick<PlannedTerrainRegion, "inside" | "material" | "slopeDegrees" | "water">,
): Exclude<WalkBlockReason, "structure"> | null {
  if (!surface.inside || surface.material === "outside") return "outside";
  if (surface.water || surface.material === "lake-bed" || surface.material === "river-bed") {
    return "water";
  }
  if (surface.material === "shore") return "shore";
  if (
    surface.slopeDegrees > WALK_MAX_SLOPE_DEGREES ||
    surface.material === "cliff-stone" ||
    surface.material === "side-cliff"
  ) {
    return "steep";
  }
  return null;
}

export function walkObstacleAt(
  obstacles: ReadonlyArray<WalkObstacle>,
  x: number,
  z: number,
  bodyRadius = WALK_BODY_RADIUS,
): WalkObstacle | null {
  for (const obstacle of obstacles) {
    const clearance = Math.max(0, obstacle.radius) + bodyRadius;
    if ((x - obstacle.x) ** 2 + (z - obstacle.z) ** 2 < clearance ** 2) return obstacle;
  }
  return null;
}

export function walkPositionBlockReason(
  plan: WorldPlan,
  obstacles: ReadonlyArray<WalkObstacle>,
  x: number,
  z: number,
): WalkBlockReason | null {
  const surfaceReason = walkSurfaceBlockReason(classifyPlannedTerrainRegion(plan, x, z));
  if (surfaceReason) return surfaceReason;
  return walkObstacleAt(obstacles, x, z) ? "structure" : null;
}

export function isWalkPositionAllowed(
  plan: WorldPlan,
  obstacles: ReadonlyArray<WalkObstacle>,
  x: number,
  z: number,
): boolean {
  return walkPositionBlockReason(plan, obstacles, x, z) === null;
}

function crossingForRoadEdge(
  segment: PlannedRoadSegment,
  edgeIndex: number,
): PlannedRoadCrossing | null {
  return (
    segment.crossings.find((crossing) => {
      const firstCrossingEdge = Math.max(0, crossing.startPointIndex - 1);
      const lastCrossingEdge = Math.min(segment.points.length - 2, crossing.endPointIndex);
      return edgeIndex >= firstCrossingEdge && edgeIndex <= lastCrossingEdge;
    }) ?? null
  );
}

function bridgeDeckHeight(plan: WorldPlan, point: PlannedLandUsePoint): number {
  const region = classifyPlannedTerrainRegion(plan, point.x, point.z);
  return Math.max(point.y + 0.22, (region.waterSurfaceHeight ?? point.y) + 0.72);
}

function steppedCutHeight(
  plan: WorldPlan,
  start: PlannedLandUsePoint,
  end: PlannedLandUsePoint,
  width: number,
): number {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const length = Math.max(0.000_1, Math.hypot(deltaX, deltaZ));
  const normalX = -deltaZ / length;
  const normalZ = deltaX / length;
  const halfWidth = width / 2;
  return (
    Math.max(
      samplePlannedTerrainHeight(
        plan,
        start.x + normalX * halfWidth,
        start.z + normalZ * halfWidth,
      ),
      samplePlannedTerrainHeight(
        plan,
        start.x - normalX * halfWidth,
        start.z - normalZ * halfWidth,
      ),
      samplePlannedTerrainHeight(plan, end.x + normalX * halfWidth, end.z + normalZ * halfWidth),
      samplePlannedTerrainHeight(plan, end.x - normalX * halfWidth, end.z - normalZ * halfWidth),
    ) + 0.16
  );
}

function createWalkNavigationRoadSurfaces(
  plan: WorldPlan,
  landUse: PlannedLandUse,
): ReadonlyArray<WalkNavigationRoadSurface> {
  return [...landUse.primaryRoad.segments]
    .sort((first, second) => first.id.localeCompare(second.id))
    .flatMap((segment) =>
      segment.points.slice(1).map((end, edgeIndex) => {
        const start = segment.points[edgeIndex]!;
        const crossing = crossingForRoadEdge(segment, edgeIndex);
        const kind = crossing?.kind ?? "ordinary-road";
        if (kind === "bridge") {
          return {
            segmentId: segment.id,
            edgeIndex,
            kind,
            width: segment.width,
            start: { x: start.x, y: bridgeDeckHeight(plan, start), z: start.z },
            end: { x: end.x, y: bridgeDeckHeight(plan, end), z: end.z },
          } satisfies WalkNavigationRoadSurface;
        }
        if (kind === "stepped-cut") {
          const height = steppedCutHeight(plan, start, end, segment.width);
          return {
            segmentId: segment.id,
            edgeIndex,
            kind,
            width: segment.width,
            start: { x: start.x, y: height, z: start.z },
            end: { x: end.x, y: height, z: end.z },
          } satisfies WalkNavigationRoadSurface;
        }
        return {
          segmentId: segment.id,
          edgeIndex,
          kind,
          width: segment.width,
          start: { x: start.x, y: start.y + 0.145, z: start.z },
          end: { x: end.x, y: end.y + 0.145, z: end.z },
        } satisfies WalkNavigationRoadSurface;
      }),
    );
}

function roadSurfaceAt(
  roadSurfaces: ReadonlyArray<WalkNavigationRoadSurface>,
  x: number,
  z: number,
  bodyRadius = WALK_BODY_RADIUS,
): Readonly<{ surface: WalkNavigationRoadSurface; height: number }> | null {
  let nearest: Readonly<{
    surface: WalkNavigationRoadSurface;
    height: number;
    distance: number;
  }> | null = null;
  for (const surface of roadSurfaces) {
    const deltaX = surface.end.x - surface.start.x;
    const deltaZ = surface.end.z - surface.start.z;
    const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
    const progress =
      lengthSquared <= 0.000_001
        ? 0
        : Math.min(
            1,
            Math.max(
              0,
              ((x - surface.start.x) * deltaX + (z - surface.start.z) * deltaZ) / lengthSquared,
            ),
          );
    const closestX = surface.start.x + deltaX * progress;
    const closestZ = surface.start.z + deltaZ * progress;
    const distance = Math.hypot(x - closestX, z - closestZ);
    const navigableHalfWidth = Math.max(0.15, surface.width / 2 - Math.max(0, bodyRadius));
    if (distance > navigableHalfWidth || (nearest && distance >= nearest.distance)) continue;
    nearest = {
      surface,
      height: surface.start.y + (surface.end.y - surface.start.y) * progress,
      distance,
    };
  }
  return nearest ? { surface: nearest.surface, height: nearest.height } : null;
}

/**
 * Precompiles the walkable terrain into typed arrays. The animation loop can
 * then resolve collision and eye height without classifying terrain or
 * allocating objects per frame.
 */
export function createWalkNavigationGrid(
  plan: WorldPlan,
  obstacles: ReadonlyArray<WalkObstacle>,
  landUse: PlannedLandUse,
): WalkNavigationGrid {
  const { envelope } = plan.topology;
  const columns = Math.min(241, Math.max(3, Math.ceil(envelope.width / 1.5) + 1));
  const rows = Math.min(241, Math.max(3, Math.ceil(envelope.depth / 1.5) + 1));
  const stepX = envelope.width / (columns - 1);
  const stepZ = envelope.depth / (rows - 1);
  const allowed = new Uint8Array(columns * rows);
  const heights = new Float32Array(columns * rows);
  const conservativeBodyRadius = WALK_BODY_RADIUS + Math.hypot(stepX, stepZ) * 0.5;
  const roadSurfaces = createWalkNavigationRoadSurfaces(plan, landUse);

  for (let row = 0; row < rows; row += 1) {
    const z = envelope.minZ + row * stepZ;
    for (let column = 0; column < columns; column += 1) {
      const x = envelope.minX + column * stepX;
      const index = row * columns + column;
      const surface = classifyPlannedTerrainRegion(plan, x, z);
      const road = roadSurfaceAt(roadSurfaces, x, z, conservativeBodyRadius);
      heights[index] = road?.height ?? surface.height;
      allowed[index] =
        (road !== null || walkSurfaceBlockReason(surface) === null) &&
        !walkObstacleAt(obstacles, x, z, conservativeBodyRadius)
          ? 1
          : 0;
    }
  }

  return {
    minX: envelope.minX,
    minZ: envelope.minZ,
    stepX,
    stepZ,
    columns,
    rows,
    allowed,
    heights,
    primaryRoadNetworkId: landUse.primaryRoad.id,
    primaryRoadSegmentIds: landUse.primaryRoad.segments.map((segment) => segment.id),
    roadSurfaces,
    obstacles,
  };
}

export function walkNavigationGridAllows(grid: WalkNavigationGrid, x: number, z: number): boolean {
  if (
    roadSurfaceAt(grid.roadSurfaces, x, z) &&
    !walkObstacleAt(grid.obstacles, x, z, WALK_BODY_RADIUS)
  ) {
    return true;
  }
  const column = (x - grid.minX) / grid.stepX;
  const row = (z - grid.minZ) / grid.stepZ;
  if (column < 0 || row < 0 || column > grid.columns - 1 || row > grid.rows - 1) return false;
  const column0 = Math.floor(column);
  const row0 = Math.floor(row);
  const column1 = Math.min(grid.columns - 1, column0 + 1);
  const row1 = Math.min(grid.rows - 1, row0 + 1);
  return (
    grid.allowed[row0 * grid.columns + column0] === 1 &&
    grid.allowed[row0 * grid.columns + column1] === 1 &&
    grid.allowed[row1 * grid.columns + column0] === 1 &&
    grid.allowed[row1 * grid.columns + column1] === 1
  );
}

export function sampleWalkNavigationHeight(grid: WalkNavigationGrid, x: number, z: number): number {
  const road = roadSurfaceAt(grid.roadSurfaces, x, z);
  if (road) return road.height;
  const column = (x - grid.minX) / grid.stepX;
  const row = (z - grid.minZ) / grid.stepZ;
  const column0 = Math.max(0, Math.min(grid.columns - 1, Math.floor(column)));
  const row0 = Math.max(0, Math.min(grid.rows - 1, Math.floor(row)));
  const column1 = Math.min(grid.columns - 1, column0 + 1);
  const row1 = Math.min(grid.rows - 1, row0 + 1);
  const mixX = Math.max(0, Math.min(1, column - column0));
  const mixZ = Math.max(0, Math.min(1, row - row0));
  const top =
    grid.heights[row0 * grid.columns + column0]! * (1 - mixX) +
    grid.heights[row0 * grid.columns + column1]! * mixX;
  const bottom =
    grid.heights[row1 * grid.columns + column0]! * (1 - mixX) +
    grid.heights[row1 * grid.columns + column1]! * mixX;
  return top * (1 - mixZ) + bottom * mixZ;
}

export function resolveWalkStep(
  currentX: number,
  currentZ: number,
  deltaX: number,
  deltaZ: number,
  canOccupy: (x: number, z: number) => boolean,
): WalkStepResolution {
  if (deltaX === 0 && deltaZ === 0) return "blocked";
  if (canOccupy(currentX + deltaX, currentZ + deltaZ)) return "full";
  if (deltaX !== 0 && canOccupy(currentX + deltaX, currentZ)) return "x";
  if (deltaZ !== 0 && canOccupy(currentX, currentZ + deltaZ)) return "z";
  return "blocked";
}

function candidateWalkSpawn(
  plan: WorldPlan,
  obstacles: ReadonlyArray<WalkObstacle>,
  x: number,
  z: number,
  grid?: WalkNavigationGrid,
): WalkPosition | null {
  if (
    grid ? !walkNavigationGridAllows(grid, x, z) : !isWalkPositionAllowed(plan, obstacles, x, z)
  ) {
    return null;
  }
  const height = grid
    ? sampleWalkNavigationHeight(grid, x, z)
    : samplePlannedTerrainHeight(plan, x, z);
  return { x, y: height + WALK_EYE_HEIGHT, z };
}

/**
 * Finds a safe repository-derived starting point. Candidate order is fixed and
 * uses topology only, so changing season/materials cannot move the visitor.
 */
export function findWalkSpawn(
  plan: WorldPlan,
  obstacles: ReadonlyArray<WalkObstacle>,
  landUse: PlannedLandUse,
  grid?: WalkNavigationGrid,
): WalkPosition | null {
  for (const segment of [...landUse.primaryRoad.segments].sort((first, second) =>
    first.id.localeCompare(second.id),
  )) {
    for (let edgeIndex = 0; edgeIndex < segment.points.length - 1; edgeIndex += 1) {
      const start = segment.points[edgeIndex]!;
      const end = segment.points[edgeIndex + 1]!;
      const deltaX = end.x - start.x;
      const deltaZ = end.z - start.z;
      const length = Math.max(0.000_1, Math.hypot(deltaX, deltaZ));
      const normalX = -deltaZ / length;
      const normalZ = deltaX / length;
      for (const progress of [0.5, 0.25, 0.75] as const) {
        for (const lateral of [0, segment.width * 0.2, -segment.width * 0.2] as const) {
          const candidate = candidateWalkSpawn(
            plan,
            obstacles,
            start.x + deltaX * progress + normalX * lateral,
            start.z + deltaZ * progress + normalZ * lateral,
            grid,
          );
          if (candidate) return candidate;
        }
      }
    }
  }

  const hamlets = plan.topology.hamlets;
  for (const hamlet of hamlets) {
    const mask = hamlet.terrainMask ?? hamlet.mask;
    const maximumRadius = Math.max(2.5, Math.min(mask.radiusX, mask.radiusZ) * 0.78);
    const ringCount = 5;
    const angleCount = 16;
    for (let ring = 0; ring <= ringCount; ring += 1) {
      const radius = (ring / ringCount) * maximumRadius;
      for (let angleIndex = 0; angleIndex < angleCount; angleIndex += 1) {
        const angle = (angleIndex / angleCount) * Math.PI * 2 + mask.rotation;
        const candidate = candidateWalkSpawn(
          plan,
          obstacles,
          mask.center.x + Math.cos(angle) * radius,
          mask.center.z + Math.sin(angle) * radius,
          grid,
        );
        if (candidate) return candidate;
        if (ring === 0) break;
      }
    }
  }

  const { envelope } = plan.topology;
  const gridSize = 31;
  for (let ring = 0; ring <= Math.floor(gridSize / 2); ring += 1) {
    for (let row = -ring; row <= ring; row += 1) {
      for (let column = -ring; column <= ring; column += 1) {
        if (Math.max(Math.abs(row), Math.abs(column)) !== ring) continue;
        const x = envelope.center.x + (column / gridSize) * envelope.width;
        const z = envelope.center.z + (row / gridSize) * envelope.depth;
        const candidate = candidateWalkSpawn(plan, obstacles, x, z, grid);
        if (candidate) return candidate;
      }
    }
  }
  return null;
}

export function walkSpeedForPlan(plan: WorldPlan, reducedMotion: boolean): number {
  const progress = Math.min(1, Math.max(0, plan.topology.repositoryScale.logarithmicProgress));
  // Terrain units roughly track the authored building modules, so this stays
  // near a human walking pace instead of scaling up to a world-crossing sprint.
  const baseSpeed = 5.4 + progress * 1.8;
  return baseSpeed * (reducedMotion ? 0.72 : 1);
}
