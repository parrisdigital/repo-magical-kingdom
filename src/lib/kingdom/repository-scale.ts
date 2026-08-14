export const REPOSITORY_SCALE_SCHEMA = "repository-scale/v2" as const;

/**
 * Visual population reaches its authored large-world values before the land
 * envelope reaches its absolute ceiling. Keeping this as a continuous signal
 * prevents a named scale tier from switching composition algorithms.
 */
export const REPOSITORY_COMPOSITION_PROGRESS_CEILING = 0.68;

export const REPOSITORY_SCALE_LIMITS = Object.freeze({
  stableFileCeiling: 64,
  logarithmicFileCeiling: 1_000_000,
  envelope: Object.freeze({
    minimumWidth: 144,
    maximumWidth: 460,
    minimumDepth: 160,
    maximumDepth: 540,
  }),
  capacity: Object.freeze({
    minimumRegions: 3,
    maximumRegions: 10,
    minimumSettlements: 18,
    maximumSettlements: 48,
  }),
});

export type RepositoryViewBudget = Readonly<{
  maxRegions: number;
  maxBuildings: number;
  maxGroves: number;
  maxTrees: number;
  maxWildlifeActors: number;
  maxSurfaceScatter: number;
  maxDrawCalls: number;
  maxVisibleTriangles: number;
}>;

export type RepositoryPlanningScale = Readonly<{
  schema: typeof REPOSITORY_SCALE_SCHEMA;
  eligibleFiles: number;
  /** Smooth, bounded log-file signal. Zero keeps compact repositories unchanged. */
  logarithmicProgress: number;
  minimumEnvelope: Readonly<{
    width: number;
    depth: number;
    area: number;
  }>;
  /** Hierarchical semantic capacity; not a promise to render one object per region. */
  regionCapacity: number;
  /** Hierarchical settlement slots before per-view LOD budgets are applied. */
  settlementCapacity: number;
  /** Minimum spatial span reserved for settlements inside the larger land envelope. */
  settlementEnvelope: Readonly<{
    width: number;
    depth: number;
    area: number;
  }>;
  viewBudgets: Readonly<{
    overview: RepositoryViewBudget;
    orbit: RepositoryViewBudget;
    walk: RepositoryViewBudget;
  }>;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function interpolate(minimum: number, maximum: number, progress: number): number {
  return minimum + (maximum - minimum) * progress;
}

function interpolateInteger(minimum: number, maximum: number, progress: number): number {
  return Math.round(interpolate(minimum, maximum, progress));
}

export function repositoryCompositionProgress(
  scale: Pick<RepositoryPlanningScale, "logarithmicProgress">,
): number {
  return clamp(scale.logarithmicProgress / REPOSITORY_COMPOSITION_PROGRESS_CEILING, 0, 1);
}

export function interpolateRepositoryComposition(
  scale: Pick<RepositoryPlanningScale, "logarithmicProgress">,
  minimum: number,
  maximum: number,
): number {
  return interpolate(minimum, maximum, repositoryCompositionProgress(scale));
}

export function interpolateRepositoryCompositionInteger(
  scale: Pick<RepositoryPlanningScale, "logarithmicProgress">,
  minimum: number,
  maximum: number,
): number {
  return Math.round(interpolateRepositoryComposition(scale, minimum, maximum));
}

function viewBudget(
  progress: number,
  limits: Readonly<{
    regions: readonly [number, number];
    buildings: readonly [number, number];
    groves: readonly [number, number];
    trees: readonly [number, number];
    wildlife: readonly [number, number];
    scatter: readonly [number, number];
    drawCalls: number;
    triangles: number;
  }>,
): RepositoryViewBudget {
  return {
    maxRegions: interpolateInteger(...limits.regions, progress),
    maxBuildings: interpolateInteger(...limits.buildings, progress),
    maxGroves: interpolateInteger(...limits.groves, progress),
    maxTrees: interpolateInteger(...limits.trees, progress),
    maxWildlifeActors: interpolateInteger(...limits.wildlife, progress),
    maxSurfaceScatter: interpolateInteger(...limits.scatter, progress),
    maxDrawCalls: limits.drawCalls,
    maxVisibleTriangles: limits.triangles,
  };
}

/**
 * Pure repository-size contract shared by every structural planning decision.
 * The curve is continuous through the old 4,096-file boundary and eventually
 * caps at one million eligible files so world geometry and browser work remain
 * bounded even for monorepos with much larger source trees.
 */
export function deriveRepositoryPlanningScale(eligibleFiles: number): RepositoryPlanningScale {
  const files = Math.max(0, Math.floor(Number.isFinite(eligibleFiles) ? eligibleFiles : 0));
  const lower = REPOSITORY_SCALE_LIMITS.stableFileCeiling;
  const upper = REPOSITORY_SCALE_LIMITS.logarithmicFileCeiling;
  const logarithmic = clamp(
    Math.log2(Math.max(lower, files) / lower) / Math.log2(upper / lower),
    0,
    1,
  );
  const progress = logarithmic * logarithmic * (3 - 2 * logarithmic);
  // Population reaches its bounded overview ceiling sooner than land area.
  // This prevents large repositories from becoming progressively emptier as
  // their explorable geography grows, while never exceeding renderer budgets.
  const populationProgress = clamp(progress / 0.7, 0, 1);
  const minimumEnvelope = {
    width: round(
      interpolate(
        REPOSITORY_SCALE_LIMITS.envelope.minimumWidth,
        REPOSITORY_SCALE_LIMITS.envelope.maximumWidth,
        progress,
      ),
    ),
    depth: round(
      interpolate(
        REPOSITORY_SCALE_LIMITS.envelope.minimumDepth,
        REPOSITORY_SCALE_LIMITS.envelope.maximumDepth,
        progress,
      ),
    ),
  };
  const settlementShare = 0.42 + progress * 0.04;
  const settlementEnvelope = {
    width: round(minimumEnvelope.width * settlementShare),
    depth: round(minimumEnvelope.depth * settlementShare),
  };

  return {
    schema: REPOSITORY_SCALE_SCHEMA,
    eligibleFiles: files,
    logarithmicProgress: progress,
    minimumEnvelope: {
      ...minimumEnvelope,
      area: round(minimumEnvelope.width * minimumEnvelope.depth),
    },
    regionCapacity: interpolateInteger(
      REPOSITORY_SCALE_LIMITS.capacity.minimumRegions,
      REPOSITORY_SCALE_LIMITS.capacity.maximumRegions,
      progress,
    ),
    settlementCapacity: interpolateInteger(
      REPOSITORY_SCALE_LIMITS.capacity.minimumSettlements,
      REPOSITORY_SCALE_LIMITS.capacity.maximumSettlements,
      progress,
    ),
    settlementEnvelope: {
      ...settlementEnvelope,
      area: round(settlementEnvelope.width * settlementEnvelope.depth),
    },
    viewBudgets: {
      overview: {
        ...viewBudget(progress, {
          regions: [3, 6],
          buildings: [18, 32],
          groves: [5, 8],
          trees: [160, 240],
          wildlife: [8, 16],
          scatter: [300, 480],
          drawCalls: 150,
          triangles: 750_000,
        }),
        maxBuildings: interpolateInteger(18, 32, populationProgress),
        maxTrees: interpolateInteger(160, 240, populationProgress),
        maxWildlifeActors: interpolateInteger(8, 12, populationProgress),
      },
      orbit: viewBudget(progress, {
        regions: [3, 5],
        buildings: [16, 26],
        groves: [4, 7],
        trees: [130, 200],
        wildlife: [7, 13],
        scatter: [240, 390],
        drawCalls: 130,
        triangles: 650_000,
      }),
      walk: viewBudget(progress, {
        regions: [2, 2],
        buildings: [10, 14],
        groves: [3, 4],
        trees: [72, 96],
        wildlife: [5, 8],
        scatter: [130, 180],
        drawCalls: 110,
        triangles: 500_000,
      }),
    },
  };
}
