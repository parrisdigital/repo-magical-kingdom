import type { WorldPlan } from "@/lib/kingdom/world-plan";

import { getHamletVisualPlacementMask, samplePlannedWatershedPoint } from "./planned-terrain-model";
import {
  ARCHITECTURE_FOOTPRINT_COVERAGE,
  ARCHITECTURE_RECIPE_HORIZONTAL_ENVELOPES,
  assignRepositoryAssetRecipes,
  createRepositoryAssetVocabulary,
  type ArchitectureRecipeId,
  type ArchitectureSemanticRole,
  type RepositoryCompoundIdentity,
  type RepositoryStructureArrangement,
} from "./repo-asset-vocabulary";

export const REPOSITORY_ARCHITECTURE_PLAN_SCHEMA = "repo-architecture-plan/v1" as const;

export type RepositoryArchitectureStructureInput = Readonly<{
  id: string;
  hamletId: string | null;
  assetRole: ArchitectureSemanticRole;
  arrangement: RepositoryStructureArrangement;
  landmark: boolean;
  sourceHorizontalScale: number;
  sourceMagnitudeScale: number;
}>;

export type RepositoryArchitectureStructurePlan = Readonly<{
  schema: typeof REPOSITORY_ARCHITECTURE_PLAN_SCHEMA;
  structureId: string;
  recipeId: ArchitectureRecipeId;
  hero: boolean;
  compoundIdentity: RepositoryCompoundIdentity;
  renderedRole: ArchitectureSemanticRole;
  /** Seeded horizontal variety used for X/Z scale and packing only. */
  sourceHorizontalScale: number;
  /** Bounded repository magnitude before role-level hero emphasis. */
  sourceMagnitudeScale: number;
  /** Horizontal X/Z scale reserved by the architecture footprint. */
  desiredVisualScale: number;
  /** Vertical Y scale derived from repository file magnitude. */
  desiredHeightScale: number;
  localEnvelopeRadius: number;
  coverageRadius: number;
  footprintRadius: number;
}>;

function watershedDistance(plan: WorldPlan, point: Readonly<{ x: number; z: number }>): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= 24; index += 1) {
    const water = samplePlannedWatershedPoint(plan, index / 24);
    nearest = Math.min(nearest, Math.hypot(point.x - water.x, point.z - water.z));
  }
  return nearest;
}

/**
 * Chooses each hamlet's architectural language from immutable topology. This
 * is the former renderer rule, promoted into planning so packing and drawing
 * cannot disagree about which structure is civic, productive, or village.
 */
export function assignRepositoryHamletCompoundIdentities(
  plan: WorldPlan,
  landmarkHamletIds: ReadonlySet<string>,
): ReadonlyMap<string, RepositoryCompoundIdentity> {
  const hamlets = plan.topology.hamlets.map((hamlet) => ({
    hamlet,
    mask: getHamletVisualPlacementMask(plan, hamlet),
  }));
  const primaryHamlets = hamlets.filter(({ hamlet }) => hamlet.role !== "commons-hamlet");
  const remaining = new Set(primaryHamlets.map(({ hamlet }) => hamlet.id));
  const result = new Map<string, RepositoryCompoundIdentity>(
    hamlets
      .filter(({ hamlet }) => hamlet.role === "commons-hamlet")
      .map(({ hamlet }) => [hamlet.id, "village"] as const),
  );
  const assign = (
    identity: RepositoryCompoundIdentity,
    score: (candidate: (typeof hamlets)[number]) => number,
  ) => {
    const candidate = primaryHamlets
      .filter(({ hamlet }) => remaining.has(hamlet.id))
      .sort(
        (first, second) =>
          score(second) - score(first) || first.hamlet.id.localeCompare(second.hamlet.id),
      )[0];
    if (!candidate) return;
    remaining.delete(candidate.hamlet.id);
    result.set(candidate.hamlet.id, identity);
  };

  assign("civic", ({ hamlet }) => {
    const civicRole = /crown|archive|observatory|warden/.test(hamlet.role);
    return (
      (landmarkHamletIds.has(hamlet.id) ? 1_000 : 0) +
      (civicRole ? 400 : 0) +
      hamlet.representedFiles
    );
  });
  assign("productive", ({ hamlet, mask }) => {
    const productiveRole = /maker|crossroads/.test(hamlet.role);
    return (productiveRole ? 500 : 0) - watershedDistance(plan, mask.center);
  });
  assign("village", ({ hamlet }) => hamlet.representedFiles);
  for (const hamletId of remaining) result.set(hamletId, "village");
  return result;
}

function roundUp(value: number): number {
  return Math.ceil((value - Number.EPSILON) * 1_000) / 1_000;
}

function renderedRole(
  structure: RepositoryArchitectureStructureInput,
  hero: boolean,
  compoundIdentity: RepositoryCompoundIdentity,
): ArchitectureSemanticRole {
  if (!hero) return structure.assetRole;
  if (compoundIdentity === "civic") return "repository-crown";
  if (compoundIdentity === "productive") return "forge";
  return "manor";
}

/**
 * Assigns recipes before packing and reserves their full intended horizontal
 * envelope. Horizontal variety and repository magnitude deliberately remain
 * separate: file size changes height, never the reserved packing footprint.
 */
export function createRepositoryArchitecturePlan(
  plan: WorldPlan,
  structures: ReadonlyArray<RepositoryArchitectureStructureInput>,
): ReadonlyArray<RepositoryArchitectureStructurePlan> {
  if (structures.length === 0) return [];
  const landmarkHamletIds = new Set(
    structures
      .filter((structure) => structure.landmark && structure.hamletId !== null)
      .map((structure) => structure.hamletId!),
  );
  const compoundIdentities = assignRepositoryHamletCompoundIdentities(plan, landmarkHamletIds);
  const heroByHamlet = new Map<string, string>();
  for (const hamlet of plan.topology.hamlets) {
    // Commons are deliberately subordinate satellite settlements. Their
    // smaller population must not be visually promoted back to primary scale
    // by the hero recipe multiplier.
    if (hamlet.role === "commons-hamlet") continue;
    const candidate = structures
      .filter((structure) => structure.hamletId === hamlet.id)
      .sort(
        (first, second) =>
          Number(second.landmark) - Number(first.landmark) ||
          (second.assetRole === "manor" || second.assetRole === "workshop" ? 1 : 0) -
            (first.assetRole === "manor" || first.assetRole === "workshop" ? 1 : 0) ||
          first.id.localeCompare(second.id),
      )[0];
    if (candidate) heroByHamlet.set(hamlet.id, candidate.id);
  }
  const contexts = structures.map((structure) => {
    const compoundIdentity = structure.hamletId
      ? (compoundIdentities.get(structure.hamletId) ?? "village")
      : "village";
    const hero = structure.hamletId
      ? heroByHamlet.get(structure.hamletId) === structure.id
      : structure.landmark;
    return {
      structure,
      hero,
      compoundIdentity,
      renderedRole: renderedRole(structure, hero, compoundIdentity),
    };
  });
  const vocabulary = createRepositoryAssetVocabulary({
    placementKey: plan.placementKey,
    geographyId: plan.topology.geography.id,
    archetype: plan.identity.archetype,
    repositoryIdentity: `${plan.repository.id}:${plan.repository.owner}/${plan.repository.name}:${plan.repository.commitSha}`,
  });
  const recipeByStructure = new Map(
    assignRepositoryAssetRecipes(
      vocabulary,
      contexts.map(({ structure, hero, compoundIdentity, renderedRole }) => ({
        id: structure.id,
        role: renderedRole,
        arrangement: structure.arrangement,
        compound: compoundIdentity,
        hero,
        landmarkCompound: structure.hamletId !== null && landmarkHamletIds.has(structure.hamletId),
      })),
    ).map((assignment) => [assignment.structureId, assignment.recipeId]),
  );

  return contexts.map(({ structure, hero, compoundIdentity, renderedRole }) => {
    const recipeId = recipeByStructure.get(structure.id)!;
    const roleScale = hero ? 1.52 : structure.landmark ? 1.44 : 1.28;
    const desiredVisualScale = structure.sourceHorizontalScale * roleScale;
    const desiredHeightScale = structure.sourceMagnitudeScale * roleScale;
    const envelope = ARCHITECTURE_RECIPE_HORIZONTAL_ENVELOPES[recipeId];
    const localEnvelopeRadius = hero ? envelope.heroRadius : envelope.standardRadius;
    const coverageRadius = localEnvelopeRadius * desiredVisualScale;
    return {
      schema: REPOSITORY_ARCHITECTURE_PLAN_SCHEMA,
      structureId: structure.id,
      recipeId,
      hero,
      compoundIdentity,
      renderedRole,
      sourceHorizontalScale: structure.sourceHorizontalScale,
      sourceMagnitudeScale: structure.sourceMagnitudeScale,
      desiredVisualScale,
      desiredHeightScale,
      localEnvelopeRadius,
      coverageRadius,
      footprintRadius: roundUp(coverageRadius / ARCHITECTURE_FOOTPRINT_COVERAGE),
    };
  });
}
