import { describe, expect, it, vi } from "vitest";

import { KingdomError } from "@/lib/kingdom/errors";

import { createGithubClient, type FetchAdapter } from "./client";

const COMMIT_SHA = "1111111111111111111111111111111111111111";
const TREE_SHA = "2222222222222222222222222222222222222222";

function json(payload: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}

function repositoryPayload(privateRepository = false, visibility?: string) {
  return {
    id: 42,
    name: "repo",
    full_name: "owner/repo",
    private: privateRepository,
    visibility: visibility ?? (privateRepository ? "private" : "public"),
    description: "A repository",
    default_branch: "main",
    html_url: "https://github.com/owner/repo",
    language: "TypeScript",
    stargazers_count: 12,
    forks_count: 3,
    updated_at: "2026-08-12T10:00:00.000Z",
    pushed_at: "2026-08-12T09:00:00.000Z",
    fork: false,
    owner: { login: "owner" },
    license: { spdx_id: "MIT" },
  };
}

function commitPayload() {
  return {
    sha: COMMIT_SHA,
    html_url: `https://github.com/owner/repo/commit/${COMMIT_SHA}`,
    commit: {
      tree: { sha: TREE_SHA },
      committer: { date: "2026-08-12T08:00:00.000Z" },
      author: { date: "2026-08-12T08:00:00.000Z" },
    },
  };
}

function entry(path: string, type: "blob" | "tree", sha: string, size?: number) {
  return {
    path,
    mode: type === "blob" ? "100644" : "040000",
    type,
    sha,
    ...(size === undefined ? {} : { size }),
    url: `https://api.github.com/tree/${sha}`,
  };
}

describe("GitHub repository ingestion", () => {
  it("resolves a revision to a commit and reads that commit's tree SHA", async () => {
    const urls: string[] = [];
    const fetchAdapter = vi.fn<FetchAdapter>(async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith("/repos/owner/repo")) return json(repositoryPayload());
      if (url.endsWith("/commits/release%2Fv1")) return json(commitPayload());
      if (url.includes(`/git/trees/${TREE_SHA}?recursive=1`)) {
        return json({
          sha: TREE_SHA,
          truncated: false,
          tree: [entry("src/index.ts", "blob", "blob-1", 1200)],
        });
      }
      if (url.includes("/users/owner/repos?")) return json([]);
      return json({ message: "Not Found" }, 404);
    });
    const client = createGithubClient({ fetch: fetchAdapter });

    const snapshot = await client.getRepositorySnapshot({
      owner: "owner",
      repository: "repo",
      revision: "release/v1",
    });

    expect(snapshot.commitSha).toBe(COMMIT_SHA);
    expect(snapshot.commitTreeSha).toBe(TREE_SHA);
    expect(snapshot.files).toEqual([{ path: "src/index.ts", size: 1200, sha: "blob-1" }]);
    expect(urls).toContain(`https://api.github.com/repos/owner/repo/commits/release%2Fv1`);
    expect(urls.some((url) => url.includes(`/git/trees/${TREE_SHA}?recursive=1`))).toBe(true);
    expect(urls.some((url) => url.includes(`/git/trees/${COMMIT_SHA}`))).toBe(false);
  });

  it("hides a visible private repository before reading its commit or tree", async () => {
    const fetchAdapter = vi.fn<FetchAdapter>(async () => json(repositoryPayload(true)));
    const client = createGithubClient({ fetch: fetchAdapter });

    await expect(
      client.getRepositorySnapshot({ owner: "owner", repository: "repo" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
    expect(fetchAdapter).toHaveBeenCalledTimes(1);
  });

  it("excludes internal repositories from a public kingdom and its portals", async () => {
    const internal = repositoryPayload(false, "internal");
    const fetchAdapter = vi.fn<FetchAdapter>(async (input) => {
      const url = String(input);
      if (url.endsWith("/repos/owner/repo")) return json(repositoryPayload());
      if (url.endsWith("/commits/main")) return json(commitPayload());
      if (url.includes(`/git/trees/${TREE_SHA}?recursive=1`)) {
        return json({ sha: TREE_SHA, truncated: false, tree: [] });
      }
      if (url.includes("/users/owner/repos?")) return json([internal]);
      return json({ message: "Not Found" }, 404);
    });
    const client = createGithubClient({ fetch: fetchAdapter });

    const snapshot = await client.getRepositorySnapshot({ owner: "owner", repository: "repo" });
    expect(snapshot.relatedRepositories).toEqual([]);

    const internalClient = createGithubClient({
      fetch: vi.fn<FetchAdapter>(async () => json(internal)),
    });
    await expect(
      internalClient.getRepositorySnapshot({ owner: "owner", repository: "repo" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("reports an empty repository without inventing a source revision", async () => {
    const fetchAdapter = vi.fn<FetchAdapter>(async (input) => {
      const url = String(input);
      if (url.endsWith("/repos/owner/repo")) return json(repositoryPayload());
      if (url.endsWith("/commits/main")) return json({ message: "Git Repository is empty." }, 409);
      if (url.includes("/users/owner/repos?")) return json([]);
      return json({ message: "Not Found" }, 404);
    });
    const client = createGithubClient({ fetch: fetchAdapter });

    await expect(
      client.getRepositorySnapshot({ owner: "owner", repository: "repo" }),
    ).rejects.toMatchObject({ code: "EMPTY_REPOSITORY", status: 409 });
  });

  it("recovers a truncated recursive response by walking every subtree", async () => {
    const SRC_SHA = "3333333333333333333333333333333333333333";
    const fetchAdapter = vi.fn<FetchAdapter>(async (input) => {
      const url = String(input);
      if (url.endsWith("/repos/owner/repo")) return json(repositoryPayload());
      if (url.endsWith("/commits/main")) return json(commitPayload());
      if (url.includes(`/git/trees/${TREE_SHA}?recursive=1`)) {
        return json({ sha: TREE_SHA, truncated: true, tree: [] });
      }
      if (url.endsWith(`/git/trees/${TREE_SHA}`)) {
        return json({
          sha: TREE_SHA,
          truncated: false,
          tree: [entry("README.md", "blob", "blob-readme", 200), entry("src", "tree", SRC_SHA)],
        });
      }
      if (url.endsWith(`/git/trees/${SRC_SHA}?recursive=1`)) {
        return json({
          sha: SRC_SHA,
          truncated: false,
          tree: [entry("index.ts", "blob", "blob-index", 400)],
        });
      }
      if (url.includes("/users/owner/repos?")) return json([]);
      return json({ message: "Not Found" }, 404);
    });
    const client = createGithubClient({ fetch: fetchAdapter });

    const snapshot = await client.getRepositorySnapshot({ owner: "owner", repository: "repo" });

    expect(snapshot.files.map((file) => file.path)).toEqual(["README.md", "src/index.ts"]);
    expect(snapshot.treeTruncated).toBe(true);
    expect(snapshot.treeRecovered).toBe(true);
    expect(snapshot.warnings).toContainEqual(expect.objectContaining({ code: "TREE_RECOVERED" }));
  });

  it("maps GitHub rate limits to a typed retryable error", async () => {
    const fetchAdapter = vi.fn<FetchAdapter>(async () =>
      json({ message: "rate limit" }, 403, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "123",
      }),
    );
    const client = createGithubClient({ fetch: fetchAdapter });

    await expect(
      client.getRepositorySnapshot({ owner: "owner", repository: "repo" }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<KingdomError>>({
        code: "GITHUB_RATE_LIMITED",
        status: 429,
        retryable: true,
      }),
    );
  });

  it("distinguishes caller cancellation from an upstream timeout", async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    const cancelledClient = createGithubClient({
      fetch: vi.fn<FetchAdapter>(async () => {
        throw new DOMException("cancelled", "AbortError");
      }),
    });
    const timeoutClient = createGithubClient({
      fetch: vi.fn<FetchAdapter>(async () => {
        throw new DOMException("timed out", "TimeoutError");
      }),
    });

    await expect(
      cancelledClient.getRepositorySnapshot(
        { owner: "owner", repository: "repo" },
        cancelled.signal,
      ),
    ).rejects.toMatchObject({ code: "ABORTED", retryable: false });
    await expect(
      timeoutClient.getRepositorySnapshot({ owner: "owner", repository: "repo" }),
    ).rejects.toMatchObject({ code: "GITHUB_TIMEOUT", retryable: true });
  });
});

describe("GitHub profile ingestion", () => {
  it("returns lightweight public, non-fork repository summaries", async () => {
    const fork = {
      ...repositoryPayload(),
      id: 43,
      name: "fork",
      full_name: "owner/fork",
      fork: true,
    };
    const fetchAdapter = vi.fn<FetchAdapter>(async (input) => {
      const url = String(input);
      if (url.endsWith("/users/owner")) {
        return json({
          login: "owner",
          name: "Owner Name",
          avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
          html_url: "https://github.com/owner",
          public_repos: 3,
          type: "User",
        });
      }
      if (url.includes("/users/owner/repos?")) return json([repositoryPayload(), fork]);
      return json({ message: "Not Found" }, 404);
    });
    const client = createGithubClient({ fetch: fetchAdapter });

    const snapshot = await client.getProfileSnapshot("owner");

    expect(snapshot.repositories).toHaveLength(1);
    expect(snapshot.repositories[0]?.repository).toBe("repo");
    expect(snapshot.truncated).toBe(true);
  });

  it("never includes internal repositories in public universe summaries", async () => {
    const fetchAdapter = vi.fn<FetchAdapter>(async (input) => {
      const url = String(input);
      if (url.endsWith("/users/owner")) {
        return json({
          login: "owner",
          name: null,
          avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
          html_url: "https://github.com/owner",
          public_repos: 1,
          type: "User",
        });
      }
      if (url.includes("/users/owner/repos?")) {
        return json([repositoryPayload(false, "internal")]);
      }
      return json({ message: "Not Found" }, 404);
    });
    const client = createGithubClient({ fetch: fetchAdapter });

    const snapshot = await client.getProfileSnapshot("owner");
    expect(snapshot.repositories).toEqual([]);
  });
});
