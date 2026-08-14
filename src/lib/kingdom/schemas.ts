import { z } from "zod";

import { FILE_CATEGORIES, KINGDOM_SEASONS, REALM_BIOMES, REALM_THEMES } from "./types";
import { KINGDOM_WORLD_THEMES } from "./world-theme";

const vec3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});
const categorySchema = z.enum(FILE_CATEGORIES);
const seasonSchema = z.enum(KINGDOM_SEASONS);
const biomeSchema = z.enum(REALM_BIOMES);
const githubUrlSchema = z.url({
  protocol: /^https$/,
  hostname: /^(?:www\.)?github\.com$/i,
});
const avatarUrlSchema = z.url({
  protocol: /^https$/,
  hostname: /^(?:avatars\.githubusercontent\.com|github\.com)$/i,
});

const kingdomWorldObjectSchema = z.object({
  schema: z.literal("repo-kingdom/v1"),
  compilerVersion: z.literal("1.0.0"),
  buildKey: z.string().min(1),
  seed: z.string().min(1),
  source: z.object({
    provider: z.literal("github"),
    owner: z.string(),
    repository: z.string(),
    repositoryId: z.number().int().nonnegative(),
    commitSha: z.string().regex(/^[a-f0-9]{40}$/i),
    defaultBranch: z.string(),
    visibility: z.literal("public"),
    canonicalUrl: githubUrlSchema,
    license: z.string().nullable(),
    revisionUrl: githubUrlSchema,
  }),
  title: z.string(),
  description: z.string().nullable(),
  generatedAt: z.string(),
  season: seasonSchema,
  worldTheme: z.enum(KINGDOM_WORLD_THEMES),
  theme: z.object({
    id: z.enum(REALM_THEMES),
    label: z.string().min(1),
    description: z.string().min(1),
  }),
  bounds: z.object({ radius: z.number().positive(), height: z.number().positive() }),
  provinces: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      biome: biomeSchema,
      season: seasonSchema,
      position: vec3Schema,
      radius: z.number().positive(),
      representedFiles: z.number().int().nonnegative(),
      representedBytes: z.number().nonnegative(),
      dominantCategory: categorySchema,
      description: z.string(),
      sourceUrl: githubUrlSchema,
      role: z.enum(["nexus", "province", "frontier"]),
    }),
  ),
  entities: z.array(
    z.object({
      id: z.string(),
      provinceId: z.string(),
      label: z.string(),
      path: z.string(),
      category: categorySchema,
      language: z.string(),
      size: z.number().nonnegative(),
      representedFiles: z.number().int().positive(),
      aggregate: z.boolean(),
      position: vec3Schema,
      scale: vec3Schema,
      sourceUrl: githubUrlSchema,
    }),
  ),
  routes: z.array(
    z.object({
      id: z.string(),
      from: vec3Schema,
      to: vec3Schema,
      kind: z.literal("root-path"),
      provinceId: z.string(),
    }),
  ),
  portals: z.array(
    z.object({
      id: z.string(),
      owner: z.string(),
      repository: z.string(),
      description: z.string().nullable(),
      language: z.string().nullable(),
      stars: z.number().int().nonnegative(),
      forks: z.number().int().nonnegative(),
      updatedAt: z.string(),
      canonicalUrl: githubUrlSchema,
      defaultBranch: z.string(),
      position: vec3Schema,
    }),
  ),
  coverage: z.object({
    discoveredFiles: z.number().int().nonnegative(),
    eligibleFiles: z.number().int().nonnegative(),
    representedFiles: z.number().int().nonnegative(),
    directEntities: z.number().int().nonnegative(),
    aggregateEntities: z.number().int().nonnegative(),
    omittedFiles: z.number().int().nonnegative(),
    treeTruncated: z.boolean(),
    treeRecovered: z.boolean(),
    sourceComplete: z.boolean(),
    omissions: z.array(
      z.object({
        reason: z.enum(["generated", "vendored", "lockfile", "minified", "source-map"]),
        files: z.number().int().nonnegative(),
        bytes: z.number().nonnegative(),
      }),
    ),
  }),
  statistics: z.object({
    files: z.number().int().nonnegative(),
    bytes: z.number().nonnegative(),
    provinces: z.number().int().nonnegative(),
    languages: z.array(z.object({ name: z.string(), files: z.number().int(), bytes: z.number() })),
    categories: z.array(
      z.object({ category: categorySchema, files: z.number().int(), bytes: z.number() }),
    ),
  }),
  warnings: z.array(z.object({ code: z.string(), message: z.string() })),
});

type ParsedKingdomWorld = z.infer<typeof kingdomWorldObjectSchema>;

function representedEntityFiles(world: ParsedKingdomWorld): number {
  return world.entities.reduce((total, entity) => total + entity.representedFiles, 0);
}

function addCoverageIssue(
  context: z.RefinementCtx,
  path: ReadonlyArray<string | number>,
  message: string,
): void {
  context.addIssue({ code: "custom", path: [...path], message });
}

function validateEntityCoverage(
  world: ParsedKingdomWorld,
  context: z.RefinementCtx,
  strictCompilerOutput: boolean,
): void {
  const directEntities = world.entities.filter((entity) => !entity.aggregate).length;
  const aggregateEntities = world.entities.length - directEntities;
  const representedFiles = representedEntityFiles(world);
  if (world.coverage.directEntities !== directEntities) {
    addCoverageIssue(
      context,
      ["coverage", "directEntities"],
      `Expected ${directEntities} direct entities from the entity collection.`,
    );
  }
  if (world.coverage.aggregateEntities !== aggregateEntities) {
    addCoverageIssue(
      context,
      ["coverage", "aggregateEntities"],
      `Expected ${aggregateEntities} aggregate entities from the entity collection.`,
    );
  }
  if (world.coverage.representedFiles !== representedFiles) {
    addCoverageIssue(
      context,
      ["coverage", "representedFiles"],
      `Expected ${representedFiles} represented files from the entity collection.`,
    );
  }
  if (world.coverage.representedFiles > world.coverage.eligibleFiles) {
    addCoverageIssue(
      context,
      ["coverage", "representedFiles"],
      "Represented files cannot exceed eligible files.",
    );
  }
  if (!strictCompilerOutput) return;

  const omittedFiles = world.coverage.omissions.reduce(
    (total, omission) => total + omission.files,
    0,
  );
  const representedBytes = world.entities.reduce((total, entity) => total + entity.size, 0);
  const provinceFiles = world.provinces.reduce(
    (total, province) => total + province.representedFiles,
    0,
  );
  const provinceBytes = world.provinces.reduce(
    (total, province) => total + province.representedBytes,
    0,
  );
  if (representedFiles !== world.coverage.eligibleFiles) {
    addCoverageIssue(
      context,
      ["coverage", "eligibleFiles"],
      "Every eligible file must be represented by exactly one direct or aggregate entity.",
    );
  }
  if (world.coverage.omittedFiles !== omittedFiles) {
    addCoverageIssue(
      context,
      ["coverage", "omittedFiles"],
      `Expected ${omittedFiles} omitted files from the omission summaries.`,
    );
  }
  if (
    world.coverage.discoveredFiles !==
    world.coverage.eligibleFiles + world.coverage.omittedFiles
  ) {
    addCoverageIssue(
      context,
      ["coverage", "discoveredFiles"],
      "Discovered files must equal eligible plus intentionally omitted files.",
    );
  }
  if (world.statistics.files !== world.coverage.eligibleFiles) {
    addCoverageIssue(
      context,
      ["statistics", "files"],
      "Repository statistics must use the same eligible-file count as coverage.",
    );
  }
  if (world.statistics.bytes !== representedBytes) {
    addCoverageIssue(
      context,
      ["statistics", "bytes"],
      `Expected ${representedBytes} represented bytes from the entity collection.`,
    );
  }
  if (world.statistics.provinces !== world.provinces.length) {
    addCoverageIssue(
      context,
      ["statistics", "provinces"],
      `Expected ${world.provinces.length} provinces from the province collection.`,
    );
  }
  if (provinceFiles !== world.coverage.eligibleFiles) {
    addCoverageIssue(
      context,
      ["provinces"],
      "Province file totals must account for every eligible file exactly once.",
    );
  }
  if (provinceBytes !== world.statistics.bytes) {
    addCoverageIssue(
      context,
      ["provinces"],
      "Province byte totals must reconcile with repository statistics.",
    );
  }
}

/**
 * Reconciles older captured/synthetic v1 payloads whose summary counters were
 * retained after their entity arrays were deliberately reduced. The mismatch
 * remains visible as a warning; compiler output uses the strict schema below
 * and can never rely on this compatibility path.
 */
export function migrateLegacyKingdomCoverage(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.entities) || typeof record.coverage !== "object") return value;
  const coverage = record.coverage as Record<string, unknown> | null;
  if (!coverage) return value;
  const entities = record.entities;
  if (
    !entities.every(
      (entity) =>
        typeof entity === "object" &&
        entity !== null &&
        typeof (entity as Record<string, unknown>).aggregate === "boolean" &&
        typeof (entity as Record<string, unknown>).representedFiles === "number",
    )
  ) {
    return value;
  }
  const directEntities = entities.filter(
    (entity) => !(entity as Record<string, unknown>).aggregate,
  ).length;
  const aggregateEntities = entities.length - directEntities;
  const representedFiles = entities.reduce(
    (total, entity) => total + Number((entity as Record<string, unknown>).representedFiles),
    0,
  );
  if (
    coverage.directEntities === directEntities &&
    coverage.aggregateEntities === aggregateEntities &&
    coverage.representedFiles === representedFiles
  ) {
    return value;
  }
  const warnings = Array.isArray(record.warnings) ? record.warnings : [];
  const alreadyWarned = warnings.some(
    (warning) =>
      typeof warning === "object" &&
      warning !== null &&
      (warning as Record<string, unknown>).code === "LEGACY_COVERAGE_RECONCILED",
  );
  return {
    ...record,
    coverage: {
      ...coverage,
      directEntities,
      aggregateEntities,
      representedFiles,
    },
    warnings: alreadyWarned
      ? warnings
      : [
          ...warnings,
          {
            code: "LEGACY_COVERAGE_RECONCILED",
            message:
              "Legacy summary counters were reconciled with the available entity collection; some eligible source details may be absent from this captured package.",
          },
        ],
  };
}

export const kingdomWorldSchema = kingdomWorldObjectSchema.superRefine((world, context) => {
  validateEntityCoverage(world, context, false);
});

/** Explicit opt-in parser for known legacy captured fixtures only. */
export const legacyKingdomWorldSchema = z.preprocess(
  migrateLegacyKingdomCoverage,
  kingdomWorldSchema,
);

/** Strict serialization gate for newly compiled repository worlds. */
export const compiledKingdomWorldSchema = kingdomWorldObjectSchema.superRefine((world, context) => {
  validateEntityCoverage(world, context, true);
});

export const repositoryUniverseSchema = z.object({
  schema: z.literal("repo-universe/v1"),
  owner: z.string(),
  displayName: z.string(),
  avatarUrl: avatarUrlSchema,
  profileUrl: githubUrlSchema,
  generatedAt: z.string(),
  repositoryCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  repositories: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      owner: z.string(),
      repository: z.string(),
      description: z.string().nullable(),
      language: z.string().nullable(),
      stars: z.number().int().nonnegative(),
      forks: z.number().int().nonnegative(),
      updatedAt: z.string(),
      defaultBranch: z.string(),
      license: z.string().nullable(),
      position: vec3Schema,
      radius: z.number().positive(),
      hue: z.number().min(0).max(359),
      season: seasonSchema.default("spring"),
      planetClass: z.enum(["terrestrial", "gas-giant", "ice-giant", "rocky"]),
    }),
  ),
});
