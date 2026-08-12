# API ingestion guardrails

The kingdom and universe endpoints read public GitHub metadata and are intentionally bounded.

## Canonical requests

- `/api/kingdom` accepts exactly one `repository`, exactly one lowercase `season` (`spring`,
  `summer`, `autumn`, or `winter`), and, optionally, one non-empty `revision`.
- `/api/universe` accepts exactly one `owner` parameter.
- Unknown and duplicate parameters, oversized request URLs, GitHub navigation subpaths, embedded
  GitHub query strings, and fragments are rejected before GitHub is contacted.
- Accepted URL and shorthand forms are normalized to a lowercase owner/repository identity before
  throttling and in-flight request coalescing.
- Season is part of the kingdom's in-flight request key, immutable-cache identity, and compiler
  build identity. The ingestion rate-limit bucket remains repository-scoped so requesting another
  season cannot bypass GitHub-read limits.

## Caching

Mutable repository and profile requests are `private, no-store`. A kingdom response can receive a
short public cache lifetime only when the request uses the exact canonical query shape, supplies a
full 40-character commit SHA, GitHub has confirmed the repository is public, and the resolved commit
matches that SHA. Stale-while-revalidate is deliberately disabled.

## Deadlines and coalescing

Each ingestion operation receives one route-level abort deadline with headroom below the hosting
platform's route duration. Concurrent requests for the same normalized repository/revision or owner
share one in-flight operation within a warm server process.

## Rate-limit scope

The token bucket is a small, bounded, per-process baseline keyed by a validated proxy IP plus the
canonical repository or owner. It returns `429` and `Retry-After` when exhausted.

This limiter is **not distributed**. Serverless instances and cold starts do not share its state, so
it is not a substitute for a platform firewall, a distributed rate-limit store, abuse monitoring, or
GitHub's own quota. Proxy headers must also be overwritten by the trusted deployment platform; the
parser only bounds and validates their syntax.
