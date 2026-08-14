import { stableDigest } from "@/lib/kingdom/hash";
import type { WorldPlan } from "@/lib/kingdom/world-plan";

import {
  addWalkNavigationGridObstacles,
  createPlannedRegionalWalkObstacles,
  createWalkNavigationGrid,
  walkNavigationGridAllows,
  type WalkNavigationGrid,
  type WalkObstacle,
} from "./kingdom-navigation-model";
import {
  findLivingWalkSpawn,
  type LivingWalkSpawn,
  type WalkSpawnStructure,
  type WalkSpawnTarget,
} from "./kingdom-walk-experience-model";
import type { PlannedLandUse } from "./planned-land-use";
import {
  createPlannedRegionalExperiencePlan,
  isPlannedRegionalExperienceRenderable,
  type PlannedRegionalExperiencePlan,
} from "./planned-regional-experience-model";
import type { PlannedScatter } from "./planned-scatter";
import type { PlannedVisualEnrichment } from "./planned-visual-enrichment";
import {
  createPlannedWalkDetailPlan,
  type PlannedWalkDetailPlan,
} from "./planned-walk-detail-model";

export const PLANNED_WALK_RUNTIME_SCHEMA = "repo-walk-runtime/v2" as const;

export type PlannedWalkRuntimeInput = Readonly<{
  plan: WorldPlan;
  landUse: PlannedLandUse;
  scatter: PlannedScatter;
  enrichment: PlannedVisualEnrichment;
  obstacles: ReadonlyArray<WalkObstacle>;
  structures: ReadonlyArray<WalkSpawnStructure>;
  targets: ReadonlyArray<WalkSpawnTarget>;
}>;

export type PlannedWalkRuntimePlan = Readonly<{
  schema: typeof PLANNED_WALK_RUNTIME_SCHEMA;
  key: string;
  navigationGrid: WalkNavigationGrid;
  livingSpawn: LivingWalkSpawn | null;
  detail: PlannedWalkDetailPlan;
  regional: PlannedRegionalExperiencePlan | null;
}>;

function pointSignature(point: Readonly<{ x: number; z: number }>): string {
  return `${point.x}:${point.z}`;
}

/**
 * The topology and placement keys are the primary identity. The digest keeps a
 * hot cache honest if collision clearances or repository target coordinates
 * change without changing the authored geography.
 */
export function plannedWalkRuntimeKey({
  plan,
  landUse,
  scatter,
  enrichment,
  obstacles,
  structures,
  targets,
}: PlannedWalkRuntimeInput): string {
  const dependencySignature = [
    plan.terrainKey,
    landUse.key,
    scatter.topologyKey,
    ...[...scatter.buildings, ...scatter.landmarks].map(
      (structure) =>
        `${structure.id}:${pointSignature(structure.transform.position)}:${structure.footprintRadius}`,
    ),
    ...scatter.ambientDetails.map(
      (detail) =>
        `${detail.id}:${detail.assetRole}:${pointSignature(detail.transform.position)}:${detail.footprintRadius}`,
    ),
    ...[...enrichment.meadowDetails, ...enrichment.shoreDetails].map(
      (detail) => `${detail.id}:${detail.assetRole}:${pointSignature(detail.position)}`,
    ),
    ...obstacles.map((obstacle) => `${pointSignature(obstacle)}:${obstacle.radius}`),
    ...structures.map(
      (structure) =>
        `${structure.id}:${structure.hamletId ?? "frontier"}:${pointSignature(structure)}:${structure.y}:${structure.radius}:${structure.targetId}`,
    ),
    ...targets.map((target) => `${target.id}:${pointSignature(target)}:${target.y}`),
  ].join("|");
  return `${plan.topologyKey}:${plan.placementKey}:walk-runtime:${stableDigest(dependencySignature)}`;
}

/**
 * Canonical expensive Walk preparation. Keeping the three stages together is
 * what lets a worker compute them once and guarantees detail consumes the same
 * exact navigation grid and living spawn as the camera controller.
 */
export function createPlannedWalkRuntimePlan(
  input: PlannedWalkRuntimeInput,
): PlannedWalkRuntimePlan {
  const { plan, landUse, scatter, enrichment, obstacles, structures, targets } = input;
  const baseNavigationGrid = createWalkNavigationGrid(plan, obstacles, landUse);
  const livingSpawn = findLivingWalkSpawn(
    plan,
    obstacles,
    structures,
    targets,
    landUse,
    baseNavigationGrid,
  );
  const preparedDetail = createPlannedWalkDetailPlan(
    plan,
    landUse,
    obstacles,
    structures,
    targets,
    {
      navigationGrid: baseNavigationGrid,
      livingSpawn,
    },
  );
  const regionalCandidate = createPlannedRegionalExperiencePlan({
    plan,
    landUse,
    scatter,
    enrichment,
    livingSpawn,
    detail: preparedDetail,
  });
  const renderableRegional = isPlannedRegionalExperienceRenderable(regionalCandidate)
    ? regionalCandidate
    : null;
  const regionalObstacles = renderableRegional
    ? createPlannedRegionalWalkObstacles(renderableRegional)
    : [];
  const regionalNavigationGrid =
    regionalObstacles.length > 0
      ? addWalkNavigationGridObstacles(baseNavigationGrid, regionalObstacles)
      : baseNavigationGrid;
  const regionalKeepsSpawnOpen =
    !livingSpawn ||
    walkNavigationGridAllows(
      regionalNavigationGrid,
      livingSpawn.position.x,
      livingSpawn.position.z,
    );
  const regional = regionalKeepsSpawnOpen ? renderableRegional : null;
  const navigationGrid = regional ? regionalNavigationGrid : baseNavigationGrid;
  const representedDetailIds = new Set(regional?.sourceCoverage.walkDetailIds ?? []);
  const detail = regional
    ? {
        ...preparedDetail,
        instances: preparedDetail.instances.filter(
          (instance) => !representedDetailIds.has(instance.id),
        ),
      }
    : preparedDetail;
  return {
    schema: PLANNED_WALK_RUNTIME_SCHEMA,
    key: plannedWalkRuntimeKey(input),
    navigationGrid,
    livingSpawn,
    detail,
    regional,
  };
}
