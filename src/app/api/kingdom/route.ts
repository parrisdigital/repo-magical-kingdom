import { createGithubClient } from "@/lib/github";
import { compileKingdom } from "@/lib/kingdom";
import {
  apiErrorResponse,
  createRequestDeadline,
  InFlightRegistry,
  ingestionRateLimiter,
  parseCanonicalKingdomRequest,
  rateLimitedResponse,
  rateLimitKey,
  successHeaders,
  waitWithSignal,
} from "@/lib/server";

import type { KingdomWorld } from "@/lib/kingdom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE_DEADLINE_MS = 54_000;
const inFlightKingdoms = new InFlightRegistry<KingdomWorld>();

export async function GET(request: Request): Promise<Response> {
  let deadline: ReturnType<typeof createRequestDeadline> | undefined;

  try {
    const canonical = parseCanonicalKingdomRequest(request);
    const rateLimit = ingestionRateLimiter.consume(
      rateLimitKey(request, `kingdom:${canonical.repositoryKey}`),
    );
    if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);

    deadline = createRequestDeadline(request.signal, ROUTE_DEADLINE_MS);
    const worldPromise = inFlightKingdoms.run(canonical.requestKey, async () => {
      const github = createGithubClient({ token: process.env.GITHUB_TOKEN });
      const snapshot = await github.getRepositorySnapshot(canonical.reference, deadline?.signal);
      return compileKingdom(snapshot, {
        season: canonical.season,
        ...(canonical.worldTheme ? { worldTheme: canonical.worldTheme } : {}),
      });
    });
    const world = await waitWithSignal(worldPromise, deadline.signal);
    const cacheableImmutableRequest = Boolean(
      canonical.cacheableImmutableRequest &&
      canonical.reference.revision &&
      world.source.commitSha.toLowerCase() === canonical.reference.revision.toLowerCase(),
    );

    return Response.json(world, {
      headers: {
        ...successHeaders(cacheableImmutableRequest),
        "X-Canonical-Commit": world.source.commitSha,
      },
    });
  } catch (unknownError) {
    return apiErrorResponse(unknownError, deadline?.didTimeOut() ?? false);
  } finally {
    deadline?.dispose();
  }
}
