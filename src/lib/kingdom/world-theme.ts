import type { FileCategory } from "./types";

export const KINGDOM_WORLD_THEMES = ["kingdom-valley", "enchanted-forest"] as const;

export type KingdomWorldTheme = (typeof KINGDOM_WORLD_THEMES)[number];

export const DEFAULT_KINGDOM_WORLD_THEME: KingdomWorldTheme = "kingdom-valley";

export const KINGDOM_WORLD_THEME_LABELS: Readonly<Record<KingdomWorldTheme, string>> = {
  "kingdom-valley": "Kingdom Valley",
  "enchanted-forest": "Enchanted Forest",
};

export const KINGDOM_WORLD_THEME_DESCRIPTIONS: Readonly<Record<KingdomWorldTheme, string>> = {
  "kingdom-valley":
    "An open highland kingdom of river valleys, mountain walls, hamlets, farms, and wildlife.",
  "enchanted-forest":
    "A denser woodland realm of ancient trees, mossy settlements, mushroom circles, runestones, and fireflies.",
};

const kingdomWorldThemeSet = new Set<string>(KINGDOM_WORLD_THEMES);

const VISUAL_LANGUAGES = new Set([
  "Astro",
  "CSS",
  "HTML",
  "MDX",
  "PNG",
  "SCSS",
  "SVG",
  "Svelte",
  "Vue",
]);

export type KingdomWorldThemeEvidence = Readonly<{
  repositoryId: number;
  categories: ReadonlyArray<Readonly<{ category: FileCategory; files: number; bytes: number }>>;
  languages: ReadonlyArray<Readonly<{ name: string; files: number; bytes: number }>>;
}>;

export function isKingdomWorldTheme(value: unknown): value is KingdomWorldTheme {
  return typeof value === "string" && kingdomWorldThemeSet.has(value);
}

export function kingdomWorldThemeOrDefault(value: unknown): KingdomWorldTheme {
  return isKingdomWorldTheme(value) ? value : DEFAULT_KINGDOM_WORLD_THEME;
}

/**
 * Chooses an explainable initial style from repository evidence. The user can
 * always override it; the same evidence always returns the same choice.
 */
export function deriveDefaultKingdomWorldTheme(
  evidence: KingdomWorldThemeEvidence,
): KingdomWorldTheme {
  const totalFiles = evidence.categories.reduce((total, entry) => total + entry.files, 0);
  const totalBytes = evidence.categories.reduce((total, entry) => total + entry.bytes, 0);
  if (totalFiles === 0) return DEFAULT_KINGDOM_WORLD_THEME;

  const expressiveCategories = evidence.categories.filter(
    (entry) => entry.category === "asset" || entry.category === "docs",
  );
  const expressiveFiles = expressiveCategories.reduce((total, entry) => total + entry.files, 0);
  const expressiveBytes = expressiveCategories.reduce((total, entry) => total + entry.bytes, 0);
  const visualFiles = evidence.languages
    .filter((language) => VISUAL_LANGUAGES.has(language.name))
    .reduce((total, language) => total + language.files, 0);

  const expressiveFileShare = expressiveFiles / totalFiles;
  const expressiveByteShare = totalBytes === 0 ? 0 : expressiveBytes / totalBytes;
  const visualFileShare = visualFiles / totalFiles;

  return expressiveFileShare >= 0.28 || expressiveByteShare >= 0.32 || visualFileShare >= 0.34
    ? "enchanted-forest"
    : "kingdom-valley";
}
