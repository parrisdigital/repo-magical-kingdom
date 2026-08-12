import type { FileCategory, KingdomWorld } from "./types";

export const REPOSITORY_WORLD_ARCHETYPES = [
  "source-forge",
  "warden-reach",
  "archive-domain",
  "observatory-frontier",
  "garden-realm",
  "crossroads",
] as const;

export type RepositoryWorldArchetype = (typeof REPOSITORY_WORLD_ARCHETYPES)[number];
export type RepositoryScaleTier = "compact" | "established" | "expansive" | "vast";

export type RepositoryWorldIdentity = Readonly<{
  archetype: RepositoryWorldArchetype;
  label: string;
  description: string;
  scaleTier: RepositoryScaleTier;
  dominantCategory: FileCategory;
  topLanguages: ReadonlyArray<string>;
  languageDiversity: number;
  signals: Readonly<{
    sourceShare: number;
    testShare: number;
    docsShare: number;
    configShare: number;
    assetShare: number;
    settlementDensity: number;
    woodlandDensity: number;
    landmarkDensity: number;
  }>;
}>;

const CATEGORY_IDENTITY: Readonly<
  Record<
    FileCategory,
    Readonly<{ archetype: RepositoryWorldArchetype; label: string; description: string }>
  >
> = {
  source: {
    archetype: "source-forge",
    label: "Source Forge",
    description: "A productive realm shaped by implementation villages and maker compounds.",
  },
  test: {
    archetype: "warden-reach",
    label: "Warden Reach",
    description: "A guarded realm whose watchtowers and trails reflect verification work.",
  },
  docs: {
    archetype: "archive-domain",
    label: "Archive Domain",
    description: "A knowledge realm organized around archives, shrines, and civic landmarks.",
  },
  config: {
    archetype: "observatory-frontier",
    label: "Observatory Frontier",
    description:
      "A systems realm expressed through observatories, waystones, and sparse highlands.",
  },
  asset: {
    archetype: "garden-realm",
    label: "Garden Realm",
    description: "A visual realm with denser woodland, cultivated clearings, and garden sanctums.",
  },
  other: {
    archetype: "crossroads",
    label: "Crossroads",
    description: "A mixed repository realm where several source traditions meet.",
  },
};

const CATEGORY_PRIORITY: Readonly<Record<FileCategory, number>> = {
  source: 6,
  test: 5,
  docs: 4,
  config: 3,
  asset: 2,
  other: 1,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rounded(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function repositoryScale(files: number): RepositoryScaleTier {
  if (files < 64) return "compact";
  if (files < 512) return "established";
  if (files < 4_096) return "expansive";
  return "vast";
}

/**
 * Derives a season-independent identity from compiler evidence. The values tune
 * bounded composition decisions; they never replace source traceability or move
 * when a visitor switches seasons.
 */
export function deriveRepositoryWorldIdentity(world: KingdomWorld): RepositoryWorldIdentity {
  const categories = [...world.statistics.categories].sort(
    (first, second) =>
      second.files - first.files ||
      second.bytes - first.bytes ||
      CATEGORY_PRIORITY[second.category] - CATEGORY_PRIORITY[first.category],
  );
  const dominantCategory = categories[0]?.category ?? "other";
  const categoryFiles = new Map(categories.map((entry) => [entry.category, entry.files]));
  const representedFiles = Math.max(1, world.statistics.files);
  const share = (category: FileCategory) =>
    rounded((categoryFiles.get(category) ?? 0) / representedFiles);
  const sourceShare = share("source");
  const testShare = share("test");
  const docsShare = share("docs");
  const configShare = share("config");
  const assetShare = share("asset");
  const otherShare = share("other");
  const identity = CATEGORY_IDENTITY[dominantCategory];
  const topLanguages = [...world.statistics.languages]
    .sort(
      (first, second) =>
        second.files - first.files ||
        second.bytes - first.bytes ||
        first.name.localeCompare(second.name),
    )
    .slice(0, 3)
    .map((language) => language.name);

  return {
    ...identity,
    scaleTier: repositoryScale(world.statistics.files),
    dominantCategory,
    topLanguages,
    languageDiversity: world.statistics.languages.length,
    signals: {
      sourceShare,
      testShare,
      docsShare,
      configShare,
      assetShare,
      settlementDensity: rounded(clamp(0.78 + sourceShare * 0.62 + configShare * 0.1, 0.72, 1.35)),
      woodlandDensity: rounded(
        clamp(0.82 + assetShare * 0.58 + otherShare * 0.18 - configShare * 0.08, 0.72, 1.35),
      ),
      landmarkDensity: rounded(
        clamp(0.78 + docsShare * 0.5 + testShare * 0.32 + configShare * 0.22, 0.72, 1.35),
      ),
    },
  };
}
