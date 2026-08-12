import { z } from "zod";

import { FILE_CATEGORIES, KINGDOM_SEASONS, REALM_BIOMES, REALM_THEMES } from "./types";

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

export const kingdomWorldSchema = z.object({
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
    }),
  ),
});
