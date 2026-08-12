import { z } from "zod";

const githubWebUrlSchema = z.url({
  protocol: /^https$/,
  hostname: /^(?:www\.)?github\.com$/i,
});
const githubApiUrlSchema = z.url({ protocol: /^https$/, hostname: /^api\.github\.com$/i });
const githubAvatarUrlSchema = z.url({
  protocol: /^https$/,
  hostname: /^(?:avatars\.githubusercontent\.com|github\.com)$/i,
});

const licenseSchema = z
  .object({
    spdx_id: z.string().nullable(),
  })
  .nullable();

const ownerSchema = z.object({
  login: z.string(),
});

export const repositorySchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string(),
  full_name: z.string(),
  private: z.boolean(),
  visibility: z.string().optional(),
  description: z.string().nullable(),
  default_branch: z.string(),
  html_url: githubWebUrlSchema,
  language: z.string().nullable(),
  stargazers_count: z.number().int().nonnegative(),
  forks_count: z.number().int().nonnegative(),
  updated_at: z.string(),
  pushed_at: z.string().nullable(),
  fork: z.boolean(),
  owner: ownerSchema,
  license: licenseSchema,
});

export const commitSchema = z.object({
  sha: z.string().regex(/^[a-f0-9]{40}$/i),
  html_url: githubWebUrlSchema,
  commit: z.object({
    tree: z.object({
      sha: z.string().regex(/^[a-f0-9]{40}$/i),
    }),
    committer: z.object({ date: z.string() }).nullable(),
    author: z.object({ date: z.string() }).nullable(),
  }),
});

export const gitTreeEntrySchema = z.object({
  path: z.string(),
  mode: z.string(),
  type: z.enum(["blob", "tree", "commit"]),
  sha: z.string(),
  size: z.number().int().nonnegative().optional(),
  url: githubApiUrlSchema,
});

export const gitTreeSchema = z.object({
  sha: z.string(),
  truncated: z.boolean(),
  tree: z.array(gitTreeEntrySchema),
});

export const repositoryListSchema = z.array(repositorySchema);

export const profileSchema = z.object({
  login: z.string(),
  name: z.string().nullable(),
  avatar_url: githubAvatarUrlSchema,
  html_url: githubWebUrlSchema,
  public_repos: z.number().int().nonnegative(),
  type: z.string(),
});
