import type { KingdomWorldTheme } from "./world-theme";

export const KINGDOM_SEASONS = ["spring", "summer", "autumn", "winter"] as const;

export type KingdomSeason = (typeof KINGDOM_SEASONS)[number];

export const DEFAULT_KINGDOM_SEASON: KingdomSeason = "spring";

/** @deprecated Use KINGDOM_SEASONS. Retained for repo-kingdom/v1 consumers. */
export const SEASONS = KINGDOM_SEASONS;

/** @deprecated Use KingdomSeason. Retained for repo-kingdom/v1 consumers. */
export type Season = KingdomSeason;

/** @deprecated Use KINGDOM_SEASONS. Retained for repo-kingdom/v1 consumers. */
export const REALM_BIOMES = [
  ...SEASONS,
  "highland",
  "tidewater",
  "volcanic",
  "desert",
  "canyon",
  "crystal",
  "marsh",
  "moonlit",
] as const;

/** @deprecated Use KingdomSeason. Retained for repo-kingdom/v1 consumers. */
export type RealmBiome = (typeof REALM_BIOMES)[number];

/** @deprecated Use KINGDOM_SEASONS. Retained for repo-kingdom/v1 consumers. */
export const REALM_THEMES = [
  "four-seasons",
  "archipelago",
  "emberlands",
  "highlands",
  "arcane-frontier",
] as const;

/** @deprecated Use KingdomSeason. Retained for repo-kingdom/v1 consumers. */
export type RealmTheme = (typeof REALM_THEMES)[number];

/** @deprecated Use KingdomWorld.season. Retained for repo-kingdom/v1 consumers. */
export type RealmThemeIdentity = Readonly<{
  id: RealmTheme;
  label: string;
  description: string;
}>;

export const FILE_CATEGORIES = ["source", "test", "docs", "config", "asset", "other"] as const;

export type FileCategory = (typeof FILE_CATEGORIES)[number];

export type Vec3 = Readonly<{ x: number; y: number; z: number }>;

export type SourceIdentity = Readonly<{
  provider: "github";
  owner: string;
  repository: string;
  repositoryId: number;
  commitSha: string;
  defaultBranch: string;
  visibility: "public";
  canonicalUrl: string;
  license: string | null;
  revisionUrl: string;
}>;

export type KingdomEntity = Readonly<{
  id: string;
  provinceId: string;
  label: string;
  path: string;
  category: FileCategory;
  language: string;
  size: number;
  representedFiles: number;
  aggregate: boolean;
  position: Vec3;
  scale: Vec3;
  sourceUrl: string;
}>;

export type Province = Readonly<{
  id: string;
  label: string;
  /** @deprecated Use KingdomWorld.season. Retained for repo-kingdom/v1 compatibility. */
  biome: RealmBiome;
  /** @deprecated Use KingdomWorld.season. Retained for repo-kingdom/v1 compatibility. */
  season: KingdomSeason;
  position: Vec3;
  radius: number;
  representedFiles: number;
  representedBytes: number;
  dominantCategory: FileCategory;
  description: string;
  sourceUrl: string;
  role: "nexus" | "province" | "frontier";
}>;

export type KingdomRoute = Readonly<{
  id: string;
  from: Vec3;
  to: Vec3;
  kind: "root-path";
  provinceId: string;
}>;

export type RepositoryPortal = Readonly<{
  id: string;
  owner: string;
  repository: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  updatedAt: string;
  canonicalUrl: string;
  defaultBranch: string;
  position: Vec3;
}>;

export type OmissionSummary = Readonly<{
  reason: "generated" | "vendored" | "lockfile" | "minified" | "source-map";
  files: number;
  bytes: number;
}>;

export type CoverageSummary = Readonly<{
  discoveredFiles: number;
  eligibleFiles: number;
  representedFiles: number;
  directEntities: number;
  aggregateEntities: number;
  omittedFiles: number;
  treeTruncated: boolean;
  treeRecovered: boolean;
  sourceComplete: boolean;
  omissions: ReadonlyArray<OmissionSummary>;
}>;

export type KingdomStatistics = Readonly<{
  files: number;
  bytes: number;
  provinces: number;
  languages: ReadonlyArray<Readonly<{ name: string; files: number; bytes: number }>>;
  categories: ReadonlyArray<Readonly<{ category: FileCategory; files: number; bytes: number }>>;
}>;

export type KingdomWorld = Readonly<{
  schema: "repo-kingdom/v1";
  compilerVersion: "1.0.0";
  buildKey: string;
  seed: string;
  source: SourceIdentity;
  title: string;
  description: string | null;
  generatedAt: string;
  /** The user-selected season for the entire repository world. */
  season: KingdomSeason;
  /** The selected geography, settlement, and ecology style. */
  worldTheme: KingdomWorldTheme;
  /** @deprecated Use season. Retained for repo-kingdom/v1 compatibility. */
  theme: RealmThemeIdentity;
  bounds: Readonly<{ radius: number; height: number }>;
  provinces: ReadonlyArray<Province>;
  entities: ReadonlyArray<KingdomEntity>;
  routes: ReadonlyArray<KingdomRoute>;
  portals: ReadonlyArray<RepositoryPortal>;
  coverage: CoverageSummary;
  statistics: KingdomStatistics;
  warnings: ReadonlyArray<Readonly<{ code: string; message: string }>>;
}>;

export type WorldPackage = KingdomWorld;

export type UniverseRepository = Readonly<{
  id: number;
  owner: string;
  repository: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  updatedAt: string;
  defaultBranch: string;
  license: string | null;
  position: Vec3;
  radius: number;
  hue: number;
  season: KingdomSeason;
  planetClass: RepositoryPlanetClass;
}>;

export const REPOSITORY_PLANET_CLASSES = [
  "terrestrial",
  "gas-giant",
  "ice-giant",
  "rocky",
] as const;

export type RepositoryPlanetClass = (typeof REPOSITORY_PLANET_CLASSES)[number];

export const REPOSITORY_PLANET_CLASS_LABELS: Readonly<Record<RepositoryPlanetClass, string>> = {
  terrestrial: "Terrestrial world",
  "gas-giant": "Ringed gas giant",
  "ice-giant": "Ice giant",
  rocky: "Rocky world",
};

export type RepositoryUniverse = Readonly<{
  schema: "repo-universe/v1";
  owner: string;
  displayName: string;
  avatarUrl: string;
  profileUrl: string;
  generatedAt: string;
  repositoryCount: number;
  truncated: boolean;
  repositories: ReadonlyArray<UniverseRepository>;
}>;

export type Selection =
  | Readonly<{ kind: "province"; province: Province }>
  | Readonly<{ kind: "entity"; entity: KingdomEntity }>
  | Readonly<{ kind: "portal"; portal: RepositoryPortal }>
  | Readonly<{ kind: "repository"; repository: UniverseRepository }>
  | null;
