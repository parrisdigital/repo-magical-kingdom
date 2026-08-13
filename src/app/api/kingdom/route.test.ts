import { beforeEach, describe, expect, it, vi } from "vitest";

import { KingdomError } from "@/lib/kingdom";

const mocks = vi.hoisted(() => ({
  getRepositorySnapshot: vi.fn(),
  compileKingdom: vi.fn(),
}));

vi.mock("@/lib/github", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github")>();
  return {
    ...actual,
    createGithubClient: () => ({
      getRepositorySnapshot: mocks.getRepositorySnapshot,
      getProfileSnapshot: vi.fn(),
    }),
  };
});

vi.mock("@/lib/kingdom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kingdom")>();
  return { ...actual, compileKingdom: mocks.compileKingdom };
});

import { GET } from "./route";

const SHA = "1111111111111111111111111111111111111111";

function world(commitSha = SHA) {
  return { source: { commitSha }, id: "world" };
}

function request(
  repository: string,
  revision?: string,
  clientIp = "203.0.113.10",
  season = "spring",
  worldTheme?: string,
): Request {
  const parameters = new URLSearchParams({ repository });
  if (worldTheme !== undefined) parameters.set("world", worldTheme);
  parameters.set("season", season);
  if (revision !== undefined) parameters.set("revision", revision);
  return new Request(`http://localhost/api/kingdom?${parameters.toString()}`, {
    headers: { "x-forwarded-for": clientIp },
  });
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

describe("GET /api/kingdom", () => {
  beforeEach(() => {
    mocks.getRepositorySnapshot.mockReset().mockResolvedValue({ snapshot: true });
    mocks.compileKingdom.mockReset().mockReturnValue(world());
  });

  it("returns a typed non-cacheable validation error for missing input", async () => {
    const response = await GET(new Request("http://localhost/api/kingdom"));
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(payload.error.code).toBe("INVALID_INPUT");
    expect(mocks.getRepositorySnapshot).not.toHaveBeenCalled();
  });

  it("requires one canonical four-season value before GitHub ingestion", async () => {
    const missing = await GET(new Request("http://localhost/api/kingdom?repository=owner%2Frepo"));
    const invalid = await GET(
      new Request("http://localhost/api/kingdom?repository=owner%2Frepo&season=monsoon"),
    );
    const duplicate = await GET(
      new Request(
        "http://localhost/api/kingdom?repository=owner%2Frepo&season=spring&season=winter",
      ),
    );

    expect([missing.status, invalid.status, duplicate.status]).toEqual([400, 400, 400]);
    expect(mocks.getRepositorySnapshot).not.toHaveBeenCalled();
  });

  it("rejects unknown parameters and repository URL extras before GitHub ingestion", async () => {
    const unknown = await GET(
      new Request("http://localhost/api/kingdom?repository=owner%2Frepo&season=spring&debug=true"),
    );
    const hiddenQuery = await GET(
      request("https://github.com/owner/repo?tab=readme", undefined, "203.0.113.11"),
    );

    expect(unknown.status).toBe(400);
    expect(hiddenQuery.status).toBe(400);
    expect(mocks.getRepositorySnapshot).not.toHaveBeenCalled();
  });

  it("coalesces canonical aliases into one in-flight ingestion", async () => {
    const snapshot = deferred<unknown>();
    mocks.getRepositorySnapshot.mockReturnValue(snapshot.promise);

    const first = GET(request("owner/repo", "main", "203.0.113.12"));
    const second = GET(request("https://github.com/OWNER/REPO.git", "main", "203.0.113.12"));
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.getRepositorySnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.getRepositorySnapshot).toHaveBeenCalledWith(
      { owner: "owner", repository: "repo", revision: "main" },
      expect.any(AbortSignal),
    );

    snapshot.resolve({ snapshot: true });
    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(mocks.compileKingdom).toHaveBeenCalledTimes(1);
    expect(mocks.compileKingdom).toHaveBeenCalledWith({ snapshot: true }, { season: "spring" });
  });

  it("keeps concurrent seasons in distinct compilation identities", async () => {
    const snapshot = deferred<unknown>();
    mocks.getRepositorySnapshot.mockReturnValue(snapshot.promise);

    const spring = GET(request("owner/seasonal", "main", "203.0.113.17", "spring"));
    const winter = GET(request("owner/seasonal", "main", "203.0.113.17", "winter"));
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.getRepositorySnapshot).toHaveBeenCalledTimes(2);
    snapshot.resolve({ snapshot: true });
    await Promise.all([spring, winter]);
    expect(mocks.compileKingdom).toHaveBeenCalledWith({ snapshot: true }, { season: "spring" });
    expect(mocks.compileKingdom).toHaveBeenCalledWith({ snapshot: true }, { season: "winter" });
  });

  it("keeps explicit world themes in distinct compilation identities", async () => {
    const snapshot = deferred<unknown>();
    mocks.getRepositorySnapshot.mockReturnValue(snapshot.promise);

    const valley = GET(request("owner/themed", "main", "203.0.113.18", "spring", "kingdom-valley"));
    const forest = GET(
      request("owner/themed", "main", "203.0.113.18", "spring", "enchanted-forest"),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.getRepositorySnapshot).toHaveBeenCalledTimes(2);
    snapshot.resolve({ snapshot: true });
    await Promise.all([valley, forest]);
    expect(mocks.compileKingdom).toHaveBeenCalledWith(
      { snapshot: true },
      { season: "spring", worldTheme: "kingdom-valley" },
    );
    expect(mocks.compileKingdom).toHaveBeenCalledWith(
      { snapshot: true },
      { season: "spring", worldTheme: "enchanted-forest" },
    );
  });

  it("publicly caches only an exact full-commit request after the commit is validated", async () => {
    const canonical = await GET(request("owner/repo", SHA, "203.0.113.13"));
    const alias = await GET(request("https://github.com/owner/repo", SHA, "203.0.113.13"));
    const mutable = await GET(request("owner/repo", "main", "203.0.113.13"));

    expect(canonical.headers.get("cache-control")).toBe(
      "public, max-age=60, s-maxage=300, immutable",
    );
    expect(canonical.headers.get("cache-control")).not.toContain("stale-while-revalidate");
    expect(alias.headers.get("cache-control")).toBe("private, no-store");
    expect(mutable.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not cache a full-commit request when the resolved commit differs", async () => {
    mocks.compileKingdom.mockReturnValue(world("2222222222222222222222222222222222222222"));
    const response = await GET(request("owner/cache-mismatch", SHA, "203.0.113.14"));

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns a baseline per-process 429 with Retry-After", async () => {
    const responses: Response[] = [];
    for (let index = 0; index < 13; index += 1) {
      responses.push(await GET(request("owner/rate-limited", "main", "203.0.113.15")));
    }

    expect(responses.slice(0, 12).every((response) => response.status === 200)).toBe(true);
    expect(responses[12]?.status).toBe(429);
    expect(Number(responses[12]?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(responses[12]?.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getRepositorySnapshot).toHaveBeenCalledTimes(12);
  });

  it("never exposes private-repository existence or upstream details", async () => {
    mocks.getRepositorySnapshot.mockRejectedValue(
      new KingdomError("PRIVATE_REPOSITORY", "Private repository found.", {
        details: { githubStatus: 403 },
      }),
    );
    const response = await GET(request("owner/private", undefined, "203.0.113.16"));
    const payload = (await response.json()) as {
      error: { code: string; message: string; details?: unknown };
    };

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("NOT_FOUND");
    expect(payload.error.message).not.toContain("Private");
    expect(payload.error.details).toBeUndefined();
  });
});
