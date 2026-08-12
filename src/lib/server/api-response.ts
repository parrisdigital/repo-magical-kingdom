import { KingdomError, toKingdomError } from "@/lib/kingdom";

import type { KingdomErrorCode } from "@/lib/kingdom/errors";
import type { RateLimitDecision } from "./rate-limit";

export const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

const IMMUTABLE_SUCCESS_HEADERS = {
  "Cache-Control": "public, max-age=60, s-maxage=300, immutable",
  "CDN-Cache-Control": "public, s-maxage=300, immutable",
  "X-Content-Type-Options": "nosniff",
  Vary: "Accept-Encoding",
} as const;

const SAFE_MESSAGES: Readonly<Record<KingdomErrorCode, string>> = {
  INVALID_INPUT: "The request is not valid.",
  NOT_FOUND: "The requested public GitHub resource was not found.",
  PRIVATE_REPOSITORY: "The requested public GitHub resource was not found.",
  EMPTY_REPOSITORY: "This GitHub repository is empty.",
  GITHUB_RATE_LIMITED: "GitHub's request limit has been reached. Try again later.",
  GITHUB_TIMEOUT: "GitHub took too long to respond.",
  GITHUB_UNAVAILABLE: "GitHub is temporarily unavailable.",
  GITHUB_RESPONSE_INVALID: "GitHub returned an unexpected response.",
  SOURCE_TOO_LARGE: "This repository is too large to process safely in one request.",
  ABORTED: "The request was cancelled.",
  WORLD_INVALID: "The generated world package was invalid.",
  INTERNAL_ERROR: "The kingdom could not be forged.",
};

export function successHeaders(cacheableImmutableRequest: boolean): HeadersInit {
  return cacheableImmutableRequest ? IMMUTABLE_SUCCESS_HEADERS : NO_STORE_HEADERS;
}

export function rateLimitedResponse(decision: RateLimitDecision): Response {
  return Response.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests for this repository. Try again shortly.",
        retryable: true,
      },
    },
    {
      status: 429,
      headers: {
        ...NO_STORE_HEADERS,
        "Retry-After": String(decision.retryAfterSeconds),
        "RateLimit-Limit": String(decision.limit),
        "RateLimit-Remaining": String(decision.remaining),
      },
    },
  );
}

function retryAfterForGithub(error: KingdomError): string | null {
  if (error.code !== "GITHUB_RATE_LIMITED") return null;
  const resetAt = error.details?.resetAt;
  const resetSeconds = typeof resetAt === "string" ? Number.parseInt(resetAt, 10) : Number.NaN;
  if (!Number.isFinite(resetSeconds)) return "60";
  return String(Math.min(3_600, Math.max(1, Math.ceil(resetSeconds - Date.now() / 1_000))));
}

export function apiErrorResponse(errorInput: unknown, routeTimedOut = false): Response {
  const original = toKingdomError(errorInput);
  const error = routeTimedOut
    ? new KingdomError("GITHUB_TIMEOUT", SAFE_MESSAGES.GITHUB_TIMEOUT, { retryable: true })
    : original;
  const hiddenPrivateResource = error.code === "PRIVATE_REPOSITORY";
  const code = hiddenPrivateResource ? "NOT_FOUND" : error.code;
  const status = hiddenPrivateResource ? 404 : error.status;
  const retryAfter = retryAfterForGithub(error);

  return Response.json(
    {
      error: {
        code,
        message: error.code === "INVALID_INPUT" ? error.message : SAFE_MESSAGES[error.code],
        retryable: hiddenPrivateResource ? false : error.retryable,
      },
    },
    {
      status,
      headers: {
        ...NO_STORE_HEADERS,
        ...(retryAfter ? { "Retry-After": retryAfter } : {}),
      },
    },
  );
}
