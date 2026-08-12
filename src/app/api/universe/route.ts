import { createGithubClient } from "@/lib/github";
import { compileUniverse } from "@/lib/kingdom";
import {
  apiErrorResponse,
  createRequestDeadline,
  InFlightRegistry,
  ingestionRateLimiter,
  NO_STORE_HEADERS,
  parseCanonicalUniverseRequest,
  rateLimitedResponse,
  rateLimitKey,
  waitWithSignal,
} from "@/lib/server";

import type { RepositoryUniverse } from "@/lib/kingdom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ROUTE_DEADLINE_MS = 25_000;
const inFlightUniverses = new InFlightRegistry<RepositoryUniverse>();

export async function GET(request: Request): Promise<Response> {
  let deadline: ReturnType<typeof createRequestDeadline> | undefined;

  try {
    const canonical = parseCanonicalUniverseRequest(request);
    const rateLimit = ingestionRateLimiter.consume(
      rateLimitKey(request, `universe:${canonical.ownerKey}`),
    );
    if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);

    deadline = createRequestDeadline(request.signal, ROUTE_DEADLINE_MS);
    const universePromise = inFlightUniverses.run(canonical.requestKey, async () => {
      const github = createGithubClient({ token: process.env.GITHUB_TOKEN });
      const snapshot = await github.getProfileSnapshot(canonical.owner, deadline?.signal);
      return compileUniverse(snapshot);
    });
    const universe = await waitWithSignal(universePromise, deadline.signal);

    return Response.json(universe, { headers: NO_STORE_HEADERS });
  } catch (unknownError) {
    return apiErrorResponse(unknownError, deadline?.didTimeOut() ?? false);
  } finally {
    deadline?.dispose();
  }
}
