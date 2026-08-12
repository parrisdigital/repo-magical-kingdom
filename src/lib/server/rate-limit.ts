import { isIP } from "node:net";

export type RateLimitDecision = Readonly<{
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}>;

export type TokenBucketOptions = Readonly<{
  capacity: number;
  refillIntervalMs: number;
  maxEntries: number;
  idleTtlMs: number;
}>;

type Bucket = {
  tokens: number;
  updatedAt: number;
  lastSeenAt: number;
};

const DEFAULT_OPTIONS: TokenBucketOptions = {
  capacity: 12,
  refillIntervalMs: 10_000,
  maxEntries: 4_096,
  idleTtlMs: 10 * 60_000,
};

/**
 * A bounded abuse-control baseline for a single warm server process. It is not a
 * distributed quota: serverless instances and cold starts do not share state.
 */
export class TokenBucketRateLimiter {
  readonly #buckets = new Map<string, Bucket>();
  readonly #options: TokenBucketOptions;
  #requestsSinceSweep = 0;

  constructor(options: Partial<TokenBucketOptions> = {}) {
    this.#options = { ...DEFAULT_OPTIONS, ...options };
    if (
      this.#options.capacity <= 0 ||
      this.#options.refillIntervalMs <= 0 ||
      this.#options.maxEntries <= 0 ||
      this.#options.idleTtlMs <= 0
    ) {
      throw new TypeError("Token-bucket limits must be positive.");
    }
  }

  consume(key: string, now = Date.now()): RateLimitDecision {
    this.#requestsSinceSweep += 1;
    if (this.#requestsSinceSweep >= 128) this.#sweep(now);

    const existing = this.#buckets.get(key);
    const elapsedMs = existing ? Math.max(0, now - existing.updatedAt) : 0;
    const replenished = existing
      ? Math.min(
          this.#options.capacity,
          existing.tokens + elapsedMs / this.#options.refillIntervalMs,
        )
      : this.#options.capacity;
    const allowed = replenished >= 1;
    const tokens = allowed ? replenished - 1 : replenished;
    const bucket: Bucket = { tokens, updatedAt: now, lastSeenAt: now };

    // Refresh insertion order so bounded eviction approximates LRU behavior.
    if (existing) this.#buckets.delete(key);
    else if (this.#buckets.size >= this.#options.maxEntries) {
      const oldestKey = this.#buckets.keys().next().value as string | undefined;
      if (oldestKey) this.#buckets.delete(oldestKey);
    }
    this.#buckets.set(key, bucket);

    return {
      allowed,
      limit: this.#options.capacity,
      remaining: Math.max(0, Math.floor(tokens)),
      retryAfterSeconds: allowed
        ? 0
        : Math.max(1, Math.ceil(((1 - tokens) * this.#options.refillIntervalMs) / 1_000)),
    };
  }

  get size(): number {
    return this.#buckets.size;
  }

  #sweep(now: number): void {
    this.#requestsSinceSweep = 0;
    for (const [key, bucket] of this.#buckets) {
      if (now - bucket.lastSeenAt >= this.#options.idleTtlMs) this.#buckets.delete(key);
    }

    while (this.#buckets.size > this.#options.maxEntries) {
      const oldestKey = this.#buckets.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.#buckets.delete(oldestKey);
    }
  }
}

function normalizeIpCandidate(candidate: string): string | null {
  let value = candidate.trim();
  if (!value || value.length > 64) return null;

  if (value.startsWith("[")) {
    const closingBracket = value.indexOf("]");
    if (closingBracket > 0) value = value.slice(1, closingBracket);
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) {
    value = value.slice(0, value.lastIndexOf(":"));
  }

  return isIP(value) ? value.toLowerCase() : null;
}

function firstValidForwardedIp(value: string | null): string | null {
  if (!value || value.length > 512) return null;
  const candidates = value.split(",", 8);
  for (const candidate of candidates) {
    const parsed = normalizeIpCandidate(candidate);
    if (parsed) return parsed;
  }
  return null;
}

/** Reads only bounded, syntactically valid proxy IP values and never echoes them. */
export function extractClientIp(headers: Headers): string {
  return (
    firstValidForwardedIp(headers.get("x-vercel-forwarded-for")) ??
    firstValidForwardedIp(headers.get("x-forwarded-for")) ??
    normalizeIpCandidate(headers.get("x-real-ip") ?? "") ??
    "unattributed"
  );
}

export function rateLimitKey(request: Request, resourceKey: string): string {
  return `${extractClientIp(request.headers)}|${resourceKey}`;
}

export const ingestionRateLimiter = new TokenBucketRateLimiter();
