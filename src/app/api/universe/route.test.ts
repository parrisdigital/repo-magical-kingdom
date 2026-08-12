import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProfileSnapshot: vi.fn(),
  compileUniverse: vi.fn(),
}));

vi.mock("@/lib/github", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github")>();
  return {
    ...actual,
    createGithubClient: () => ({
      getRepositorySnapshot: vi.fn(),
      getProfileSnapshot: mocks.getProfileSnapshot,
    }),
  };
});

vi.mock("@/lib/kingdom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kingdom")>();
  return { ...actual, compileUniverse: mocks.compileUniverse };
});

import { GET } from "./route";

function request(owner: string, clientIp = "198.51.100.20"): Request {
  const parameters = new URLSearchParams({ owner });
  return new Request(`http://localhost/api/universe?${parameters.toString()}`, {
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

describe("GET /api/universe", () => {
  beforeEach(() => {
    mocks.getProfileSnapshot.mockReset().mockResolvedValue({ snapshot: true });
    mocks.compileUniverse.mockReset().mockReturnValue({ id: "universe" });
  });

  it("returns a typed non-cacheable validation error for missing input", async () => {
    const response = await GET(new Request("http://localhost/api/universe"));
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(payload.error.code).toBe("INVALID_INPUT");
    expect(mocks.getProfileSnapshot).not.toHaveBeenCalled();
  });

  it("canonicalizes profile URL aliases and coalesces them by owner", async () => {
    const snapshot = deferred<unknown>();
    mocks.getProfileSnapshot.mockReturnValue(snapshot.promise);

    const first = GET(request("@Owner", "198.51.100.21"));
    const second = GET(request("https://github.com/owner", "198.51.100.21"));
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.getProfileSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.getProfileSnapshot).toHaveBeenCalledWith("owner", expect.any(AbortSignal));

    snapshot.resolve({ snapshot: true });
    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstResponse.headers.get("cache-control")).toBe("private, no-store");
    expect(secondResponse.headers.get("cdn-cache-control")).toBe("no-store");
    expect(mocks.compileUniverse).toHaveBeenCalledTimes(1);
  });

  it("rejects profile navigation paths and unknown parameters before ingestion", async () => {
    const pathResponse = await GET(
      request("https://github.com/owner/repositories", "198.51.100.22"),
    );
    const parameterResponse = await GET(
      new Request("http://localhost/api/universe?owner=owner&page=2"),
    );

    expect(pathResponse.status).toBe(400);
    expect(parameterResponse.status).toBe(400);
    expect(mocks.getProfileSnapshot).not.toHaveBeenCalled();
  });
});
