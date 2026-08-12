import { describe, expect, it } from "vitest";

import { KingdomError } from "@/lib/kingdom";

import { apiErrorResponse, rateLimitedResponse, successHeaders } from "./api-response";

describe("API response policy", () => {
  it("uses short immutable caching only when explicitly authorized", () => {
    expect(new Headers(successHeaders(true)).get("cache-control")).toBe(
      "public, max-age=60, s-maxage=300, immutable",
    );
    expect(new Headers(successHeaders(true)).get("cache-control")).not.toContain(
      "stale-while-revalidate",
    );
    expect(new Headers(successHeaders(false)).get("cache-control")).toBe("private, no-store");
  });

  it("hides private-resource existence and strips internal details", async () => {
    const response = apiErrorResponse(
      new KingdomError("PRIVATE_REPOSITORY", "A secret repository exists.", {
        details: { githubStatus: 403 },
      }),
    );
    const payload = (await response.json()) as {
      error: { code: string; message: string; details?: unknown };
    };

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("NOT_FOUND");
    expect(payload.error.message).not.toContain("secret");
    expect(payload.error.details).toBeUndefined();
  });

  it("returns a non-cacheable local 429 with Retry-After", async () => {
    const response = rateLimitedResponse({
      allowed: false,
      limit: 12,
      remaining: 0,
      retryAfterSeconds: 9,
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("9");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RATE_LIMITED", retryable: true },
    });
  });
});
