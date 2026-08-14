import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import { REPOSITORY_TOPOLOGY_FAMILY_IDS } from "@/lib/kingdom/topology-family";
import { createWorldPlan, type WorldPlan } from "@/lib/kingdom/world-plan";

import {
  ARCHITECTURE_FOOTPRINT_COVERAGE,
  ARCHITECTURE_MATERIAL_POLICY,
  ARCHITECTURE_RECIPE_IDS,
  ARCHITECTURE_RECIPE_HORIZONTAL_ENVELOPES,
  ARCHITECTURE_RECIPES,
  PREVIOUSLY_UNUSED_MEDIEVAL_MODULE_ROLES,
  REPOSITORY_ASSET_VOCABULARY_SCHEMA,
  architectureRecipeModuleRoles,
  assignRepositoryAssetRecipes,
  createRepositoryAssetVocabulary,
  fitArchitectureRecipeToFootprint,
  type ArchitectureSemanticRole,
  type RepositoryAssetVocabularyInput,
  type RepositoryStructureArrangement,
  type RepositoryStructureVocabularyInput,
} from "./repo-asset-vocabulary";

function inputFromPlan(plan: WorldPlan): RepositoryAssetVocabularyInput {
  return {
    placementKey: plan.placementKey,
    geographyId: plan.topology.geography.id,
    archetype: plan.identity.archetype,
    repositoryIdentity: `${plan.repository.id}:${plan.repository.owner}/${plan.repository.name}:${plan.repository.commitSha}`,
  };
}

function structureFixture(count: number): ReadonlyArray<RepositoryStructureVocabularyInput> {
  const roles: ReadonlyArray<ArchitectureSemanticRole> = [
    "plaster-cottage",
    "brick-cottage",
    "workshop",
    "manor",
    "repository-crown",
    "forge",
    "archive",
    "watchtower",
    "observatory",
    "garden-sanctum",
    "waystone",
  ];
  const arrangements: ReadonlyArray<RepositoryStructureArrangement> = [
    "courtyard",
    "lane",
    "garden",
    "landmark",
  ];
  return Array.from({ length: count }, (_, index) => ({
    id: `structure-${index}`,
    role: roles[index % roles.length]!,
    arrangement: arrangements[index % arrangements.length]!,
    compound: index % 5 === 0 ? "civic" : index % 3 === 0 ? "productive" : "village",
    hero: index % 7 === 0,
  }));
}

describe("repository asset vocabulary", () => {
  it("publishes six modular recipes and consumes every previously unused medieval module", () => {
    expect(ARCHITECTURE_RECIPE_IDS).toHaveLength(6);
    expect(Object.values(ARCHITECTURE_RECIPES)).toHaveLength(6);

    const consumed = new Set(
      Object.values(ARCHITECTURE_RECIPES).flatMap((recipe) =>
        architectureRecipeModuleRoles(recipe),
      ),
    );
    for (const moduleRole of PREVIOUSLY_UNUSED_MEDIEVAL_MODULE_ROLES) {
      expect(consumed.has(moduleRole), moduleRole).toBe(true);
    }
  });

  it("derives four materially distinct family signatures", () => {
    const signatures = REPOSITORY_TOPOLOGY_FAMILY_IDS.map((geographyId) =>
      createRepositoryAssetVocabulary({
        placementKey: "stable-placement-key",
        geographyId,
        archetype: "crossroads",
        repositoryIdentity: "1:owner/repository:commit",
      }),
    );

    expect(signatures.every(({ schema }) => schema === REPOSITORY_ASSET_VOCABULARY_SCHEMA)).toBe(
      true,
    );
    expect(new Set(signatures.map(({ familySignature }) => familySignature)).size).toBe(4);
    expect(
      new Set(signatures.map(({ compoundPropPriority }) => JSON.stringify(compoundPropPriority)))
        .size,
    ).toBeGreaterThanOrEqual(3);
  });

  it("is deterministic and invariant when season changes", () => {
    const springPlan = createWorldPlan(createDemoKingdom("spring"));
    const winterPlan = createWorldPlan(createDemoKingdom("winter"));
    const spring = createRepositoryAssetVocabulary(inputFromPlan(springPlan));
    const winter = createRepositoryAssetVocabulary(inputFromPlan(winterPlan));

    expect(spring).toEqual(createRepositoryAssetVocabulary(inputFromPlan(springPlan)));
    expect(winter).toEqual(spring);
  });

  it("keeps a vast repository below the thirty-five-percent recipe ceiling", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const vocabulary = createRepositoryAssetVocabulary(inputFromPlan(plan));
    const structures = structureFixture(32);
    const assignments = assignRepositoryAssetRecipes(vocabulary, structures);
    const counts = new Map<string, number>();
    for (const assignment of assignments) {
      counts.set(assignment.recipeId, (counts.get(assignment.recipeId) ?? 0) + 1);
    }

    expect(assignments).toEqual(assignRepositoryAssetRecipes(vocabulary, structures));
    expect(new Set(assignments.map(({ recipeId }) => recipeId)).size).toBeGreaterThanOrEqual(4);
    expect(Math.max(...counts.values()) / assignments.length).toBeLessThanOrEqual(0.35);
  });

  it("fits every standard and hero recipe inside the planned collision footprint", () => {
    const smallestPlannedFootprint = 3.2;
    const desiredVisualScale = 1.7;

    for (const recipeId of ARCHITECTURE_RECIPE_IDS) {
      const envelope = ARCHITECTURE_RECIPE_HORIZONTAL_ENVELOPES[recipeId];
      expect(envelope.standardRadius).toBeLessThanOrEqual(3.95);
      expect(envelope.heroRadius).toBeLessThanOrEqual(3.95);

      for (const hero of [false, true]) {
        const fitted = fitArchitectureRecipeToFootprint(
          recipeId,
          desiredVisualScale,
          smallestPlannedFootprint,
          hero,
        );
        expect(fitted.visualScale).toBeGreaterThan(0);
        expect(fitted.visualScale).toBeLessThanOrEqual(desiredVisualScale);
        expect(fitted.coverageRadius).toBeLessThanOrEqual(
          smallestPlannedFootprint * ARCHITECTURE_FOOTPRINT_COVERAGE + Number.EPSILON,
        );
      }
    }
  });

  it("preserves any authored texture references while applying restrained tinting", () => {
    expect(ARCHITECTURE_MATERIAL_POLICY).toMatchObject({
      preserveColorMap: true,
      preserveNormalMap: true,
      preserveAoMap: true,
      preserveEmissiveMap: true,
    });
    expect(ARCHITECTURE_MATERIAL_POLICY.texturedTintMix).toBeLessThanOrEqual(0.2);
    expect(ARCHITECTURE_MATERIAL_POLICY.untexturedTintMix).toBeLessThan(0.7);
  });
});
