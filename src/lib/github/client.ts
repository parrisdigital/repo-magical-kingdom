import type { z } from "zod";

import { KingdomError } from "@/lib/kingdom/errors";

import {
  commitSchema,
  gitTreeSchema,
  profileSchema,
  repositoryListSchema,
  repositorySchema,
} from "./schemas";
import type {
  ProfileRepository,
  ProfileSnapshot,
  RelatedRepository,
  RepositoryReference,
  RepositorySnapshot,
  SourceFile,
} from "./types";

const GITHUB_API = "https://api.github.com";
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_TREE_REQUESTS = 80;
const MAX_TOTAL_TREE_TIME_MS = 42_000;
const MAX_SOURCE_FILES = 150_000;
const MAX_UNIVERSE_REPOSITORIES = 100;

function isPublicRepository(
  repository: Readonly<{ private: boolean; visibility?: string }>,
): boolean {
  return !repository.private && (!repository.visibility || repository.visibility === "public");
}

export type FetchAdapter = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type GithubClientOptions = Readonly<{
  token?: string;
  fetch?: FetchAdapter;
  timeoutMs?: number;
}>;

export type GithubClient = Readonly<{
  getRepositorySnapshot(
    reference: RepositoryReference,
    signal?: AbortSignal,
  ): Promise<RepositorySnapshot>;
  getProfileSnapshot(owner: string, signal?: AbortSignal): Promise<ProfileSnapshot>;
}>;

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function joinSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function mapRepository(repository: z.infer<typeof repositorySchema>): ProfileRepository {
  return {
    id: repository.id,
    owner: repository.owner.login,
    repository: repository.name,
    description: repository.description,
    language: repository.language,
    stars: repository.stargazers_count,
    forks: repository.forks_count,
    updatedAt: repository.updated_at,
    defaultBranch: repository.default_branch,
    license: repository.license?.spdx_id ?? null,
    canonicalUrl: repository.html_url,
  };
}

export function createGithubClient(options: GithubClientOptions = {}): GithubClient {
  const fetchAdapter = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const token = options.token?.trim();

  async function requestJson<Schema extends z.ZodType>(
    path: string,
    schema: Schema,
    signal?: AbortSignal,
  ): Promise<z.output<Schema>> {
    let response: Response;

    try {
      response = await fetchAdapter(`${GITHUB_API}${path}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "repo-magical-kingdom",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        cache: "no-store",
        signal: joinSignals(signal, timeoutMs),
      });
    } catch (error) {
      if (signal?.aborted) {
        throw new KingdomError("ABORTED", "The request was cancelled.", {
          retryable: false,
          cause: error,
        });
      }

      if (
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new KingdomError("GITHUB_TIMEOUT", "GitHub took too long to respond.", {
          cause: error,
        });
      }

      throw new KingdomError("GITHUB_UNAVAILABLE", "GitHub could not be reached.", {
        cause: error,
      });
    }

    const rawText = await response.text();
    let payload: unknown;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch (error) {
      throw new KingdomError("GITHUB_RESPONSE_INVALID", "GitHub returned an invalid response.", {
        cause: error,
        details: { status: response.status },
      });
    }

    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "message" in payload &&
        typeof payload.message === "string"
          ? payload.message
          : "GitHub request failed.";
      const rateLimited =
        response.status === 429 ||
        response.headers.has("retry-after") ||
        ((response.status === 403 || response.status === 401) &&
          response.headers.get("x-ratelimit-remaining") === "0");

      if (rateLimited) {
        throw new KingdomError(
          "GITHUB_RATE_LIMITED",
          "GitHub's request limit has been reached. Try again later.",
          {
            details: {
              resetAt: response.headers.get("x-ratelimit-reset"),
            },
          },
        );
      }

      if (response.status === 404) {
        throw new KingdomError("NOT_FOUND", "The requested GitHub resource was not found.", {
          retryable: false,
        });
      }

      if (response.status === 409 && /empty/i.test(message)) {
        throw new KingdomError("EMPTY_REPOSITORY", "This GitHub repository is empty.", {
          retryable: false,
        });
      }

      if (response.status === 401 || response.status === 403) {
        throw new KingdomError("GITHUB_UNAVAILABLE", "GitHub access is temporarily unavailable.", {
          status: 502,
          details: { githubStatus: response.status },
        });
      }

      throw new KingdomError("GITHUB_UNAVAILABLE", message, {
        status: response.status >= 500 ? 502 : response.status,
        details: { githubStatus: response.status },
      });
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new KingdomError(
        "GITHUB_RESPONSE_INVALID",
        "GitHub returned data in an unexpected format.",
        {
          cause: parsed.error,
        },
      );
    }

    return parsed.data;
  }

  async function recoverTree(
    owner: string,
    repository: string,
    rootTreeSha: string,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<SourceFile>> {
    const queue: Array<Readonly<{ sha: string; prefix: string; recursive: boolean }>> = [
      { sha: rootTreeSha, prefix: "", recursive: false },
    ];
    const files: SourceFile[] = [];
    let requests = 0;
    const startedAt = Date.now();

    while (queue.length > 0) {
      if (signal?.aborted) {
        throw new KingdomError("ABORTED", "The request was cancelled.", { retryable: false });
      }

      const current = queue.shift();
      if (!current) break;
      requests += 1;

      if (requests > MAX_TREE_REQUESTS) {
        throw new KingdomError(
          "SOURCE_TOO_LARGE",
          "This repository contains too many directory trees to process safely.",
          {
            retryable: false,
            details: { maxTreeRequests: MAX_TREE_REQUESTS },
          },
        );
      }

      if (Date.now() - startedAt > MAX_TOTAL_TREE_TIME_MS) {
        throw new KingdomError(
          "SOURCE_TOO_LARGE",
          "This repository tree could not be recovered within the synchronous request budget.",
          {
            retryable: false,
            details: { maxTreeTimeMs: MAX_TOTAL_TREE_TIME_MS },
          },
        );
      }

      const tree = await requestJson(
        `/repos/${encodePathSegment(owner)}/${encodePathSegment(repository)}/git/trees/${encodePathSegment(current.sha)}${current.recursive ? "?recursive=1" : ""}`,
        gitTreeSchema,
        signal,
      );

      if (tree.truncated) {
        if (current.recursive) {
          queue.push({ ...current, recursive: false });
          continue;
        }

        throw new KingdomError(
          "SOURCE_TOO_LARGE",
          "GitHub truncated an individual non-recursive directory response.",
          {
            retryable: false,
          },
        );
      }

      for (const entry of tree.tree) {
        const path = current.prefix ? `${current.prefix}/${entry.path}` : entry.path;
        if (entry.type === "tree" && !current.recursive) {
          queue.push({ sha: entry.sha, prefix: path, recursive: true });
        } else if (entry.type === "blob") {
          files.push({ path, size: entry.size ?? 0, sha: entry.sha });
        }
      }

      if (files.length > MAX_SOURCE_FILES) {
        throw new KingdomError(
          "SOURCE_TOO_LARGE",
          "This repository contains too many files to process safely.",
          {
            retryable: false,
            details: { maxSourceFiles: MAX_SOURCE_FILES },
          },
        );
      }
    }

    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  async function getFiles(
    owner: string,
    repository: string,
    treeSha: string,
    signal?: AbortSignal,
  ): Promise<
    Readonly<{ files: ReadonlyArray<SourceFile>; truncated: boolean; recovered: boolean }>
  > {
    const recursiveTree = await requestJson(
      `/repos/${encodePathSegment(owner)}/${encodePathSegment(repository)}/git/trees/${encodePathSegment(treeSha)}?recursive=1`,
      gitTreeSchema,
      signal,
    );

    if (recursiveTree.truncated) {
      return {
        files: await recoverTree(owner, repository, treeSha, signal),
        truncated: true,
        recovered: true,
      };
    }

    const files = recursiveTree.tree
      .filter((entry) => entry.type === "blob")
      .map((entry) => ({ path: entry.path, size: entry.size ?? 0, sha: entry.sha }))
      .sort((a, b) => a.path.localeCompare(b.path));

    if (files.length > MAX_SOURCE_FILES) {
      throw new KingdomError(
        "SOURCE_TOO_LARGE",
        "This repository contains too many files to process safely.",
        {
          retryable: false,
          details: { maxSourceFiles: MAX_SOURCE_FILES },
        },
      );
    }

    return { files, truncated: false, recovered: false };
  }

  async function getRelatedRepositories(
    owner: string,
    currentRepositoryId: number,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<RelatedRepository>> {
    const repositories = await requestJson(
      `/users/${encodePathSegment(owner)}/repos?type=owner&sort=updated&direction=desc&per_page=30&page=1`,
      repositoryListSchema,
      signal,
    );

    return repositories
      .filter(
        (repository) =>
          isPublicRepository(repository) &&
          !repository.fork &&
          repository.id !== currentRepositoryId,
      )
      .slice(0, 8)
      .map(mapRepository)
      .sort((a, b) => a.id - b.id);
  }

  return {
    async getRepositorySnapshot(reference, signal) {
      const owner = encodePathSegment(reference.owner);
      const repository = encodePathSegment(reference.repository);
      const metadata = await requestJson(`/repos/${owner}/${repository}`, repositorySchema, signal);

      if (!isPublicRepository(metadata)) {
        throw new KingdomError(
          "NOT_FOUND",
          "The requested public GitHub repository was not found.",
          {
            retryable: false,
          },
        );
      }

      const revision = reference.revision ?? metadata.default_branch;
      const canonicalOwner = metadata.owner.login;
      const canonicalRepository = metadata.name;
      const commit = await requestJson(
        `/repos/${encodePathSegment(canonicalOwner)}/${encodePathSegment(canonicalRepository)}/commits/${encodePathSegment(revision)}`,
        commitSchema,
        signal,
      );
      const tree = await getFiles(
        canonicalOwner,
        canonicalRepository,
        commit.commit.tree.sha,
        signal,
      );
      const warnings: Array<Readonly<{ code: string; message: string }>> = [];
      let relatedRepositories: ReadonlyArray<RelatedRepository> = [];

      try {
        relatedRepositories = await getRelatedRepositories(canonicalOwner, metadata.id, signal);
      } catch (error) {
        if (signal?.aborted) throw error;
        warnings.push({
          code: "PORTALS_UNAVAILABLE",
          message:
            "Related repository portals could not be loaded; the kingdom itself is complete.",
        });
      }

      if (tree.truncated && tree.recovered) {
        warnings.push({
          code: "TREE_RECOVERED",
          message:
            "GitHub truncated the recursive tree response, so the complete tree was recovered directory by directory.",
        });
      }

      return {
        repositoryId: metadata.id,
        owner: metadata.owner.login,
        repository: metadata.name,
        description: metadata.description,
        defaultBranch: metadata.default_branch,
        commitSha: commit.sha,
        commitTreeSha: commit.commit.tree.sha,
        committedAt:
          commit.commit.committer?.date ??
          commit.commit.author?.date ??
          metadata.pushed_at ??
          metadata.updated_at,
        canonicalUrl: metadata.html_url,
        license: metadata.license?.spdx_id ?? null,
        files: tree.files,
        treeTruncated: tree.truncated,
        treeRecovered: tree.recovered,
        relatedRepositories,
        warnings,
      };
    },

    async getProfileSnapshot(owner, signal) {
      const encodedOwner = encodePathSegment(owner);
      const [profile, repositories] = await Promise.all([
        requestJson(`/users/${encodedOwner}`, profileSchema, signal),
        requestJson(
          `/users/${encodedOwner}/repos?type=owner&sort=updated&direction=desc&per_page=${MAX_UNIVERSE_REPOSITORIES}&page=1`,
          repositoryListSchema,
          signal,
        ),
      ]);
      const publicRepositories = repositories
        .filter((repository) => isPublicRepository(repository) && !repository.fork)
        .slice(0, MAX_UNIVERSE_REPOSITORIES)
        .map(mapRepository);

      return {
        owner: profile.login,
        displayName: profile.name ?? profile.login,
        avatarUrl: profile.avatar_url,
        profileUrl: profile.html_url,
        publicRepositoryCount: profile.public_repos,
        repositories: publicRepositories,
        truncated: profile.public_repos > repositories.length,
      };
    },
  };
}
