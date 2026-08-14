import type { KingdomWorld } from "../kingdom/types";
import { createWorldPlan, type WorldPlan } from "../kingdom/world-plan";
import {
  createRepoSemanticGraphV2,
  type CreateRepoSemanticGraphV2Options,
  type RepoSemanticGraphV2,
} from "./repo-semantic-graph-v2";
import { createTerrainArtifactV2, type TerrainArtifactV2 } from "./terrain-artifact-v2";
import { createWorldDesignSpecV3, type WorldDesignSpecV3 } from "./world-design-spec-v3";
import {
  createWorldRenderTerrainSummaryV2,
  type WorldRenderTerrainSummaryV2,
} from "./world-render-manifest-v2";

export const REPOSITORY_WORLD_FOUNDATION_V2_SCHEMA = "repository-world-foundation/v2" as const;

export type RepositoryWorldFoundationV2 = Readonly<{
  schema: typeof REPOSITORY_WORLD_FOUNDATION_V2_SCHEMA;
  semanticGraph: RepoSemanticGraphV2;
  sourcePlan: WorldPlan;
  design: WorldDesignSpecV3;
  terrain: TerrainArtifactV2;
  terrainSummary: WorldRenderTerrainSummaryV2;
}>;

/**
 * Canonical pure build boundary for the first Worlds V2 worker stage. It is
 * intentionally free of React, Three.js, storage, and network calls.
 */
export function createRepositoryWorldFoundationV2(
  world: KingdomWorld,
  semanticOptions: CreateRepoSemanticGraphV2Options = {},
): RepositoryWorldFoundationV2 {
  const semanticGraph = createRepoSemanticGraphV2(world, semanticOptions);
  const sourcePlan = createWorldPlan(world);
  const design = createWorldDesignSpecV3(world, sourcePlan, semanticGraph);
  const terrain = createTerrainArtifactV2({ plan: sourcePlan, design });
  const terrainSummary = createWorldRenderTerrainSummaryV2(terrain);

  return {
    schema: REPOSITORY_WORLD_FOUNDATION_V2_SCHEMA,
    semanticGraph,
    sourcePlan,
    design,
    terrain,
    terrainSummary,
  };
}
