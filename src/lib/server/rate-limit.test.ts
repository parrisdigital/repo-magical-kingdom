import { describe, expect, it } from "vitest";

import { extractClientIp, rateLimitKey, TokenBucketRateLimiter } from "./rate-limit";

describe("TokenBucketRateLimiter", () => {
  it("allows a bounded burst, returns retry timing, and refills over time", () => {
    const limiter = new TokenBucketRateLimiter({
      capacity: 2,
      refillIntervalMs: 1_000,
      maxEntries: 10,
      idleTtlMs: 60_000,
    });

    expect(limiter.consume("client|repo", 0)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.consume("client|repo", 0)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.consume("client|repo", 0)).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1,
    });
    expect(limiter.consume("client|repo", 1_000)).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("keeps process memory bounded while retaining recently used buckets", () => {
    const limiter = new TokenBucketRateLimiter({
      capacity: 1,
      refillIntervalMs: 1_000,
      maxEntries: 2,
      idleTtlMs: 60_000,
    });

    limiter.consume("one", 0);
    limiter.consume("two", 0);
    expect(limiter.consume("two", 0).allowed).toBe(false);
    limiter.consume("three", 0);

    expect(limiter.size).toBe(2);
    expect(limiter.consume("two", 0).allowed).toBe(false);
  });
});

describe("client IP extraction", () => {
  it("accepts only bounded, syntactically valid proxy addresses", () => {
    expect(
      extractClientIp(
        new Headers({ "x-vercel-forwarded-for": "not-an-ip, 203.0.113.7, 198.51.100.3" }),
      ),
    ).toBe("203.0.113.7");
    expect(extractClientIp(new Headers({ "x-forwarded-for": "[2001:db8::1]:443" }))).toBe(
      "2001:db8::1",
    );
    expect(extractClientIp(new Headers({ "x-forwarded-for": "attacker-controlled" }))).toBe(
      "unattributed",
    );
  });

  it("combines the validated address with the canonical resource identity", () => {
    const request = new Request("https://example.test/api/kingdom", {
      headers: { "x-forwarded-for": "203.0.113.7" },
    });
    expect(rateLimitKey(request, "kingdom:owner/repo")).toBe("203.0.113.7|kingdom:owner/repo");
  });
});
