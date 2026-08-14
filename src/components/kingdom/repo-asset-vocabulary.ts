import { stableDigest, stableFraction, stableHash } from "@/lib/kingdom/hash";
import type { RepositoryTopologyFamilyId } from "@/lib/kingdom/topology-family";
import type { RepositoryWorldArchetype } from "@/lib/kingdom/world-identity";

export const REPOSITORY_ASSET_VOCABULARY_SCHEMA = "repo-asset-vocabulary/v1" as const;

export const MEDIEVAL_MODULE_ROLES = [
  "plasterWall",
  "plasterDoor",
  "plasterWindow",
  "brickWall",
  "brickDoor",
  "brickWindow",
  "brickCorner",
  "woodCorner",
  "brickDoorframe",
  "standaloneDoor",
  "standaloneWindow",
  "shutters",
  "roofSmall",
  "roofWide",
  "roofLarge",
  "roofTower",
  "chimney",
  "wagon",
  "fence",
  "vine",
  "stairs",
  "balcony",
] as const;

export type MedievalModuleRole = (typeof MEDIEVAL_MODULE_ROLES)[number];

export const PREVIOUSLY_UNUSED_MEDIEVAL_MODULE_ROLES = [
  "brickCorner",
  "woodCorner",
  "brickDoorframe",
  "standaloneDoor",
  "standaloneWindow",
  "shutters",
  "roofLarge",
] as const satisfies ReadonlyArray<MedievalModuleRole>;

export const ARCHITECTURE_RECIPE_IDS = [
  "plaster-shutter-cottage",
  "brick-corner-workshop",
  "timber-longhall",
  "civic-gatehouse",
  "garden-manor",
  "stone-observatory",
] as const;

export type ArchitectureRecipeId = (typeof ARCHITECTURE_RECIPE_IDS)[number];
export type ArchitectureSemanticRole =
  | "plaster-cottage"
  | "brick-cottage"
  | "workshop"
  | "manor"
  | "repository-crown"
  | "forge"
  | "archive"
  | "watchtower"
  | "observatory"
  | "garden-sanctum"
  | "waystone";
export type RepositoryStructureArrangement = "courtyard" | "lane" | "garden" | "landmark";
export type RepositoryCompoundIdentity = "civic" | "productive" | "village";
export type ArchitectureAnnex = "none" | "plaster-wing" | "brick-wing" | "tower-wing";
export type GroundCompoundProp = Extract<MedievalModuleRole, "fence" | "stairs" | "wagon">;

export type ArchitectureRecipe = Readonly<{
  id: ArchitectureRecipeId;
  wall: Extract<MedievalModuleRole, "brickWall" | "plasterWall">;
  integratedDoor: Extract<MedievalModuleRole, "brickDoor" | "plasterDoor">;
  integratedWindow: Extract<MedievalModuleRole, "brickWindow" | "plasterWindow">;
  corner: Extract<MedievalModuleRole, "brickCorner" | "woodCorner"> | null;
  layeredPortal: boolean;
  layeredWindow: boolean;
  shutters: boolean;
  roof: Extract<MedievalModuleRole, "roofLarge" | "roofSmall" | "roofTower" | "roofWide">;
  roofScale: number;
  stories: 1 | 2;
  footprint: "compact" | "wide" | "tower";
  chimney: boolean;
  balcony: boolean;
  stairs: boolean;
  vine: boolean;
  annex: ArchitectureAnnex;
}>;

export type ArchitectureRecipeHorizontalEnvelope = Readonly<{
  /** Conservative local-space radius for the standard modular assembly. */
  standardRadius: number;
  /** Conservative local-space radius when the inset hero annex is present. */
  heroRadius: number;
}>;

export type FittedArchitectureRecipe = Readonly<{
  localEnvelopeRadius: number;
  visualScale: number;
  coverageRadius: number;
}>;

/**
 * Keeps visible architecture comfortably inside the collision circle used by
 * planned scatter. The spare six percent protects the >=1.5 world-space gap
 * from mesh extremities, source-bound rounding, and normal-map parallax.
 */
export const ARCHITECTURE_FOOTPRINT_COVERAGE = 0.94;

export const ARCHITECTURE_MATERIAL_POLICY = Object.freeze({
  preserveColorMap: true,
  preserveNormalMap: true,
  preserveAoMap: true,
  preserveEmissiveMap: true,
  texturedTintMix: 0.18,
  untexturedTintMix: 0.62,
  minimumRoughness: 0.72,
  supplementalEmissiveIntensity: 0.025,
});

export const ARCHITECTURE_RECIPES: Readonly<Record<ArchitectureRecipeId, ArchitectureRecipe>> = {
  "plaster-shutter-cottage": {
    id: "plaster-shutter-cottage",
    wall: "plasterWall",
    integratedDoor: "plasterDoor",
    integratedWindow: "plasterWindow",
    corner: "woodCorner",
    layeredPortal: false,
    layeredWindow: true,
    shutters: true,
    roof: "roofSmall",
    roofScale: 0.52,
    stories: 1,
    footprint: "compact",
    chimney: true,
    balcony: false,
    stairs: false,
    vine: true,
    annex: "none",
  },
  "brick-corner-workshop": {
    id: "brick-corner-workshop",
    wall: "brickWall",
    integratedDoor: "brickDoor",
    integratedWindow: "brickWindow",
    corner: "brickCorner",
    layeredPortal: true,
    layeredWindow: false,
    shutters: false,
    roof: "roofWide",
    roofScale: 0.54,
    stories: 1,
    footprint: "wide",
    chimney: true,
    balcony: false,
    stairs: false,
    vine: false,
    annex: "brick-wing",
  },
  "timber-longhall": {
    id: "timber-longhall",
    wall: "plasterWall",
    integratedDoor: "plasterDoor",
    integratedWindow: "plasterWindow",
    corner: "woodCorner",
    layeredPortal: false,
    layeredWindow: true,
    shutters: true,
    roof: "roofLarge",
    roofScale: 0.54,
    stories: 2,
    footprint: "wide",
    chimney: true,
    balcony: true,
    stairs: true,
    vine: false,
    annex: "plaster-wing",
  },
  "civic-gatehouse": {
    id: "civic-gatehouse",
    wall: "brickWall",
    integratedDoor: "brickDoor",
    integratedWindow: "brickWindow",
    corner: "brickCorner",
    layeredPortal: true,
    layeredWindow: false,
    shutters: false,
    roof: "roofTower",
    roofScale: 0.62,
    stories: 2,
    footprint: "tower",
    chimney: false,
    balcony: true,
    stairs: true,
    vine: true,
    annex: "tower-wing",
  },
  "garden-manor": {
    id: "garden-manor",
    wall: "plasterWall",
    integratedDoor: "plasterDoor",
    integratedWindow: "plasterWindow",
    corner: "woodCorner",
    layeredPortal: false,
    layeredWindow: true,
    shutters: true,
    roof: "roofWide",
    roofScale: 0.58,
    stories: 2,
    footprint: "wide",
    chimney: true,
    balcony: true,
    stairs: true,
    vine: true,
    annex: "plaster-wing",
  },
  "stone-observatory": {
    id: "stone-observatory",
    wall: "brickWall",
    integratedDoor: "brickDoor",
    integratedWindow: "brickWindow",
    corner: "brickCorner",
    layeredPortal: true,
    layeredWindow: true,
    shutters: false,
    roof: "roofTower",
    roofScale: 0.66,
    stories: 2,
    footprint: "tower",
    chimney: false,
    balcony: true,
    stairs: true,
    vine: false,
    annex: "none",
  },
};

/**
 * Bounds were measured from the shipped GLBs and then rounded upward. They
 * include corners, layered doors/windows, shutters, roofs, stairs, balcony,
 * vines, and the inset (2.0, -0.35 at 0.34 scale) hero annex. A wagon is not
 * part of this envelope: wagons are terrain- and structure-validated compound
 * props instead of silently extending a building's collision footprint.
 */
export const ARCHITECTURE_RECIPE_HORIZONTAL_ENVELOPES: Readonly<
  Record<ArchitectureRecipeId, ArchitectureRecipeHorizontalEnvelope>
> = {
  "plaster-shutter-cottage": { standardRadius: 3.2, heroRadius: 3.2 },
  "brick-corner-workshop": { standardRadius: 3.5, heroRadius: 3.5 },
  "timber-longhall": { standardRadius: 3.95, heroRadius: 3.95 },
  "civic-gatehouse": { standardRadius: 3.6, heroRadius: 3.6 },
  "garden-manor": { standardRadius: 3.85, heroRadius: 3.85 },
  "stone-observatory": { standardRadius: 3.6, heroRadius: 3.6 },
};

export function fitArchitectureRecipeToFootprint(
  recipeId: ArchitectureRecipeId,
  desiredVisualScale: number,
  footprintRadius: number,
  hero: boolean,
): FittedArchitectureRecipe {
  const envelope = ARCHITECTURE_RECIPE_HORIZONTAL_ENVELOPES[recipeId];
  const localEnvelopeRadius = hero ? envelope.heroRadius : envelope.standardRadius;
  const maximumScale = (footprintRadius * ARCHITECTURE_FOOTPRINT_COVERAGE) / localEnvelopeRadius;
  const visualScale = Math.min(desiredVisualScale, maximumScale);
  return {
    localEnvelopeRadius,
    visualScale,
    coverageRadius: localEnvelopeRadius * visualScale,
  };
}

type RecipeWeights = Readonly<Record<ArchitectureRecipeId, number>>;
type CompoundPropWeights = Readonly<Record<GroundCompoundProp, number>>;

type GeographyVocabularyProfile = Readonly<{
  recipeWeights: RecipeWeights;
  propWeights: CompoundPropWeights;
}>;

function weights(values: readonly [number, number, number, number, number, number]): RecipeWeights {
  return Object.fromEntries(
    ARCHITECTURE_RECIPE_IDS.map((recipe, index) => [recipe, values[index]!]),
  ) as unknown as RecipeWeights;
}

const GEOGRAPHY_PROFILES: Readonly<Record<RepositoryTopologyFamilyId, GeographyVocabularyProfile>> =
  {
    "foreground-estuary": {
      recipeWeights: weights([1.48, 0.72, 1.12, 1.08, 1.38, 0.7]),
      propWeights: { fence: 1.2, stairs: 1.32, wagon: 0.78 },
    },
    "eastern-lake-run": {
      recipeWeights: weights([1.2, 0.88, 0.86, 1.25, 1.52, 1.08]),
      propWeights: { fence: 1.08, stairs: 1.44, wagon: 0.7 },
    },
    "western-basin-watershed": {
      recipeWeights: weights([0.82, 1.58, 1.36, 0.88, 0.76, 1.04]),
      propWeights: { fence: 1.38, stairs: 0.68, wagon: 1.5 },
    },
    "central-meander": {
      recipeWeights: weights([1.18, 1.18, 1.34, 1.32, 0.94, 1.22]),
      propWeights: { fence: 1.28, stairs: 1.04, wagon: 1.12 },
    },
  };

const ARCHETYPE_WEIGHTS: Readonly<Record<RepositoryWorldArchetype, RecipeWeights>> = {
  "source-forge": weights([0.82, 1.62, 1.28, 0.92, 0.72, 0.96]),
  "warden-reach": weights([0.9, 1.14, 0.96, 1.54, 0.78, 1.34]),
  "archive-domain": weights([1.02, 0.82, 1.26, 1.3, 1.38, 1.16]),
  "observatory-frontier": weights([0.76, 1.04, 0.9, 1.3, 0.74, 1.7]),
  "garden-realm": weights([1.38, 0.7, 1.1, 0.84, 1.62, 0.86]),
  crossroads: weights([1.14, 1.18, 1.16, 1.08, 1.04, 1.1]),
};

const ARCHETYPE_PROP_WEIGHTS: Readonly<Record<RepositoryWorldArchetype, CompoundPropWeights>> = {
  "source-forge": { fence: 1.04, stairs: 0.72, wagon: 1.62 },
  "warden-reach": { fence: 1.44, stairs: 1.16, wagon: 0.8 },
  "archive-domain": { fence: 0.92, stairs: 1.54, wagon: 0.74 },
  "observatory-frontier": { fence: 0.94, stairs: 1.48, wagon: 0.82 },
  "garden-realm": { fence: 1.42, stairs: 1.02, wagon: 0.7 },
  crossroads: { fence: 1.14, stairs: 1.02, wagon: 1.18 },
};

const ROLE_AFFINITIES: Readonly<Record<ArchitectureSemanticRole, RecipeWeights>> = {
  "plaster-cottage": weights([1.8, 0.52, 1.12, 0.52, 1.18, 0.5]),
  "brick-cottage": weights([0.54, 1.72, 0.76, 1.04, 0.5, 1.08]),
  workshop: weights([0.48, 1.86, 1.14, 0.74, 0.44, 0.88]),
  manor: weights([0.72, 0.58, 1.42, 0.92, 1.82, 0.7]),
  "repository-crown": weights([0.52, 0.72, 1.38, 1.88, 1.54, 1.46]),
  forge: weights([0.42, 1.92, 1.18, 1.08, 0.4, 1.02]),
  archive: weights([0.74, 0.6, 1.44, 1.22, 1.78, 1.18]),
  watchtower: weights([0.38, 0.82, 0.62, 1.86, 0.48, 1.58]),
  observatory: weights([0.34, 0.68, 0.56, 1.52, 0.5, 1.96]),
  "garden-sanctum": weights([1.14, 0.42, 1.16, 0.72, 1.94, 0.6]),
  waystone: weights([0.54, 0.78, 0.68, 1.34, 0.7, 1.64]),
};

const ARRANGEMENT_AFFINITIES: Readonly<Record<RepositoryStructureArrangement, RecipeWeights>> = {
  courtyard: weights([1.2, 0.92, 0.96, 1.14, 1.3, 0.86]),
  lane: weights([0.92, 1.36, 1.3, 0.94, 0.72, 1.08]),
  garden: weights([1.16, 0.66, 1.12, 0.78, 1.62, 0.72]),
  landmark: weights([0.58, 0.7, 1.18, 1.58, 1.2, 1.54]),
};

export type RepositoryAssetVocabularyInput = Readonly<{
  placementKey: string;
  geographyId: RepositoryTopologyFamilyId;
  archetype: RepositoryWorldArchetype;
  repositoryIdentity: string;
}>;

export type RepositoryAssetVocabulary = Readonly<{
  schema: typeof REPOSITORY_ASSET_VOCABULARY_SCHEMA;
  selectionKey: string;
  geographyId: RepositoryTopologyFamilyId;
  archetype: RepositoryWorldArchetype;
  familySignature: string;
  recipeWeights: RecipeWeights;
  compoundPropPriority: Readonly<
    Record<RepositoryCompoundIdentity, ReadonlyArray<GroundCompoundProp>>
  >;
}>;

export type RepositoryStructureVocabularyInput = Readonly<{
  id: string;
  role: ArchitectureSemanticRole;
  arrangement: RepositoryStructureArrangement;
  compound: RepositoryCompoundIdentity;
  hero: boolean;
  landmarkCompound?: boolean;
}>;

export type RepositoryStructureRecipeAssignment = Readonly<{
  structureId: string;
  recipeId: ArchitectureRecipeId;
}>;

function combineRecipeWeights(geography: RecipeWeights, archetype: RecipeWeights): RecipeWeights {
  return Object.fromEntries(
    ARCHITECTURE_RECIPE_IDS.map((recipe) => [recipe, geography[recipe] * archetype[recipe]]),
  ) as unknown as RecipeWeights;
}

function compoundPropPriority(
  selectionKey: string,
  profile: GeographyVocabularyProfile,
  archetype: RepositoryWorldArchetype,
  identity: RepositoryCompoundIdentity,
): ReadonlyArray<GroundCompoundProp> {
  const identityBoost: Readonly<Record<RepositoryCompoundIdentity, CompoundPropWeights>> = {
    civic: { fence: 0.92, stairs: 1.6, wagon: 0.62 },
    productive: { fence: 1.18, stairs: 0.54, wagon: 1.72 },
    village: { fence: 1.32, stairs: 0.78, wagon: 1.08 },
  };
  return [...(["fence", "stairs", "wagon"] as const)].sort((first, second) => {
    const score = (prop: GroundCompoundProp) =>
      profile.propWeights[prop] *
        ARCHETYPE_PROP_WEIGHTS[archetype][prop] *
        identityBoost[identity][prop] +
      stableFraction(`${selectionKey}:${identity}:prop:${prop}`) * 0.08;
    return score(second) - score(first) || first.localeCompare(second);
  });
}

/**
 * Selects a repository's architecture language from immutable placement and
 * identity inputs. There is deliberately no season or appearance input.
 */
export function createRepositoryAssetVocabulary(
  input: RepositoryAssetVocabularyInput,
): RepositoryAssetVocabulary {
  const profile = GEOGRAPHY_PROFILES[input.geographyId];
  const selectionKey = stableDigest(
    `${REPOSITORY_ASSET_VOCABULARY_SCHEMA}:${input.placementKey}:${input.geographyId}:${input.archetype}:${input.repositoryIdentity}`,
  );
  const recipeWeights = combineRecipeWeights(
    profile.recipeWeights,
    ARCHETYPE_WEIGHTS[input.archetype],
  );
  return {
    schema: REPOSITORY_ASSET_VOCABULARY_SCHEMA,
    selectionKey,
    geographyId: input.geographyId,
    archetype: input.archetype,
    familySignature: stableDigest(
      JSON.stringify({
        geographyId: input.geographyId,
        recipeWeights: profile.recipeWeights,
        propWeights: profile.propWeights,
      }),
    ),
    recipeWeights,
    compoundPropPriority: {
      civic: compoundPropPriority(selectionKey, profile, input.archetype, "civic"),
      productive: compoundPropPriority(selectionKey, profile, input.archetype, "productive"),
      village: compoundPropPriority(selectionKey, profile, input.archetype, "village"),
    },
  };
}

function recipeScore(
  vocabulary: RepositoryAssetVocabulary,
  structure: RepositoryStructureVocabularyInput,
  recipe: ArchitectureRecipeId,
): number {
  const compoundBoost: Readonly<Record<RepositoryCompoundIdentity, Partial<RecipeWeights>>> = {
    civic: { "civic-gatehouse": 1.34, "garden-manor": 1.12, "stone-observatory": 1.28 },
    productive: { "brick-corner-workshop": 1.42, "timber-longhall": 1.18 },
    village: { "plaster-shutter-cottage": 1.26, "garden-manor": 1.08 },
  };
  const heroBoost = structure.hero
    ? recipe === "civic-gatehouse" ||
      recipe === "garden-manor" ||
      recipe === "stone-observatory" ||
      recipe === "timber-longhall"
      ? 1.34
      : 0.72
    : 1;
  return (
    vocabulary.recipeWeights[recipe] *
      ROLE_AFFINITIES[structure.role][recipe] *
      ARRANGEMENT_AFFINITIES[structure.arrangement][recipe] *
      (compoundBoost[structure.compound][recipe] ?? 1) *
      heroBoost +
    stableFraction(`${vocabulary.selectionKey}:${structure.id}:${recipe}`) * 0.12
  );
}

/**
 * Assigns a bounded, deterministic recipe mix. The hard cap prevents a large
 * repository from becoming a field of one cottage even when one semantic role
 * dominates its source tree.
 */
export function assignRepositoryAssetRecipes(
  vocabulary: RepositoryAssetVocabulary,
  structures: ReadonlyArray<RepositoryStructureVocabularyInput>,
): ReadonlyArray<RepositoryStructureRecipeAssignment> {
  if (structures.length === 0) return [];
  const maximumPerRecipe = Math.max(1, Math.floor(structures.length * 0.35));
  const ordered = [...structures].sort(
    (first, second) =>
      stableHash(`${vocabulary.selectionKey}:${first.id}:assignment-order`) -
        stableHash(`${vocabulary.selectionKey}:${second.id}:assignment-order`) ||
      first.id.localeCompare(second.id),
  );
  const counts = new Map<ArchitectureRecipeId, number>();
  const used = new Set<ArchitectureRecipeId>();
  const assignments = new Map<string, ArchitectureRecipeId>();
  const requiredDiversity = Math.min(4, ordered.length, ARCHITECTURE_RECIPE_IDS.length);

  for (const [index, structure] of ordered.entries()) {
    // Hero scale is intentionally prominent. Keep its base assembly within a
    // 3.6-unit local envelope so the full-size landmark and its neighboring
    // buildings can still form one readable compound without post-fit shrink.
    const structureRecipes =
      structure.hero || structure.landmarkCompound
        ? ARCHITECTURE_RECIPE_IDS.filter(
            (recipe) => ARCHITECTURE_RECIPE_HORIZONTAL_ENVELOPES[recipe].heroRadius <= 3.6,
          )
        : ARCHITECTURE_RECIPE_IDS;
    const eligible = structureRecipes.filter(
      (recipe) =>
        (counts.get(recipe) ?? 0) < maximumPerRecipe &&
        (index >= requiredDiversity || !used.has(recipe)),
    );
    const candidates = eligible.length > 0 ? eligible : structureRecipes;
    const recipe = [...candidates].sort((first, second) => {
      const normalizedScore = (candidate: ArchitectureRecipeId) =>
        recipeScore(vocabulary, structure, candidate) /
        (1 + ((counts.get(candidate) ?? 0) / maximumPerRecipe) * 0.5);
      return normalizedScore(second) - normalizedScore(first) || first.localeCompare(second);
    })[0]!;
    assignments.set(structure.id, recipe);
    counts.set(recipe, (counts.get(recipe) ?? 0) + 1);
    used.add(recipe);
  }

  return structures.map((structure) => ({
    structureId: structure.id,
    recipeId: assignments.get(structure.id)!,
  }));
}

export function architectureRecipeModuleRoles(
  recipe: ArchitectureRecipe,
): ReadonlyArray<MedievalModuleRole> {
  const modules: MedievalModuleRole[] = [
    recipe.wall,
    recipe.integratedDoor,
    recipe.integratedWindow,
    recipe.roof,
  ];
  if (recipe.corner) modules.push(recipe.corner);
  if (recipe.layeredPortal) modules.push("brickDoorframe", "standaloneDoor");
  if (recipe.layeredWindow) modules.push("standaloneWindow");
  if (recipe.shutters) modules.push("shutters");
  if (recipe.chimney) modules.push("chimney");
  if (recipe.balcony) modules.push("balcony");
  if (recipe.stairs) modules.push("stairs");
  if (recipe.vine) modules.push("vine");
  return [...new Set(modules)];
}
