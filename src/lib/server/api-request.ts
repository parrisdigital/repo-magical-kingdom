import { parseGithubOwner, parseRepositoryReference } from "@/lib/github";
import { isKingdomSeason, KingdomError } from "@/lib/kingdom";

import type { RepositoryReference } from "@/lib/github";
import type { KingdomSeason } from "@/lib/kingdom";

export const MAX_REQUEST_URL_BYTES = 2_048;

const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/i;

type ParsedRequestUrl = Readonly<{
  url: URL;
  parameters: Readonly<Record<string, string>>;
}>;

export type CanonicalKingdomRequest = Readonly<{
  reference: RepositoryReference;
  repositoryKey: string;
  season: KingdomSeason;
  requestKey: string;
  cacheableImmutableRequest: boolean;
}>;

export type CanonicalUniverseRequest = Readonly<{
  owner: string;
  ownerKey: string;
  requestKey: string;
}>;

function invalidInput(message: string, status = 400): KingdomError {
  return new KingdomError("INVALID_INPUT", message, {
    retryable: false,
    status,
  });
}

function parseRequestUrl(
  request: Request,
  allowedParameters: ReadonlyArray<string>,
  requiredParameters: ReadonlyArray<string>,
): ParsedRequestUrl {
  if (new TextEncoder().encode(request.url).byteLength > MAX_REQUEST_URL_BYTES) {
    throw invalidInput("The request URL is too long.", 414);
  }

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    throw invalidInput("The request URL is not valid.");
  }

  if (url.hash) {
    throw invalidInput("URL fragments are not accepted by this endpoint.");
  }

  const allowed = new Set(allowedParameters);
  const parameters: Record<string, string> = {};

  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) {
      throw invalidInput(`Unsupported query parameter: ${key}.`);
    }
  }

  for (const key of allowedParameters) {
    const values = url.searchParams.getAll(key);
    if (values.length > 1) {
      throw invalidInput(`Query parameter ${key} may only be provided once.`);
    }
    if (values.length === 1) parameters[key] = values[0] ?? "";
  }

  for (const key of requiredParameters) {
    if (!(key in parameters) || !parameters[key]?.trim()) {
      throw invalidInput(`Query parameter ${key} is required.`);
    }
  }

  return { url, parameters };
}

function parseGithubUrlLike(input: string, expectedSegments: 1 | 2): ReadonlyArray<string> | null {
  const candidate = input.trim();
  const isAbsoluteUrl = /^https?:\/\//i.test(candidate);
  const isGithubShorthand = /^github\.com\//i.test(candidate);

  if (!isAbsoluteUrl && !isGithubShorthand) return null;

  let url: URL;
  try {
    url = new URL(isGithubShorthand ? `https://${candidate}` : candidate);
  } catch {
    throw invalidInput("The GitHub URL is not valid.");
  }

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.hostname.toLowerCase() !== "github.com"
  ) {
    throw invalidInput("Only github.com URLs are supported.");
  }

  if (url.username || url.password || url.port) {
    throw invalidInput("GitHub URLs may not contain credentials or a custom port.");
  }

  if (url.search || url.hash) {
    throw invalidInput("GitHub URLs may not contain a query string or fragment.");
  }

  const pathname = url.pathname.replace(/^\/+|\/+$/g, "");
  const segments = pathname ? pathname.split("/") : [];
  if (segments.length !== expectedSegments || segments.some((segment) => !segment)) {
    throw invalidInput(
      expectedSegments === 2
        ? "Use a GitHub repository URL without branch, file, or navigation paths."
        : "Use a GitHub profile URL without additional paths.",
    );
  }

  return segments;
}

function normalizeRepositoryInput(input: string): string {
  const urlSegments = parseGithubUrlLike(input, 2);
  if (!urlSegments) return input;

  const [owner, rawRepository] = urlSegments;
  const repository = rawRepository?.replace(/\.git$/i, "");
  return `${owner ?? ""}/${repository ?? ""}`;
}

function normalizeOwnerInput(input: string): string {
  const urlSegments = parseGithubUrlLike(input, 1);
  return urlSegments?.[0] ?? input;
}

function canonicalQuery(parameters: Readonly<Record<string, string>>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) query.set(key, value);
  return query.toString();
}

export function parseCanonicalKingdomRequest(request: Request): CanonicalKingdomRequest {
  const { url, parameters } = parseRequestUrl(
    request,
    ["repository", "season", "revision"],
    ["repository", "season"],
  );
  const repositoryInput = parameters.repository ?? "";
  const seasonInput = parameters.season;
  const hasExplicitRevision = "revision" in parameters;
  const revisionInput = hasExplicitRevision ? (parameters.revision ?? "") : null;

  if (!isKingdomSeason(seasonInput)) {
    throw invalidInput("Query parameter season must be spring, summer, autumn, or winter.");
  }
  if (hasExplicitRevision && !revisionInput?.trim()) {
    throw invalidInput("Query parameter revision may not be empty.");
  }

  const parsed = parseRepositoryReference(normalizeRepositoryInput(repositoryInput), revisionInput);
  const owner = parsed.owner.toLowerCase();
  const repository = parsed.repository.toLowerCase();
  const revision = parsed.revision
    ? FULL_COMMIT_SHA.test(parsed.revision)
      ? parsed.revision.toLowerCase()
      : parsed.revision
    : undefined;
  const reference: RepositoryReference = {
    owner,
    repository,
    ...(revision ? { revision } : {}),
  };
  const repositoryKey = `${owner}/${repository}`;
  const immutableRevision = Boolean(revision && FULL_COMMIT_SHA.test(revision));
  const expectedQuery = canonicalQuery({
    repository: repositoryKey,
    season: seasonInput,
    ...(revision ? { revision } : {}),
  });

  return {
    reference,
    repositoryKey,
    season: seasonInput,
    requestKey: `kingdom:${repositoryKey}@${revision ?? "<default>"}?season=${seasonInput}`,
    cacheableImmutableRequest:
      hasExplicitRevision && immutableRevision && url.search.slice(1) === expectedQuery,
  };
}

export function parseCanonicalUniverseRequest(request: Request): CanonicalUniverseRequest {
  const { parameters } = parseRequestUrl(request, ["owner"], ["owner"]);
  const owner = parseGithubOwner(normalizeOwnerInput(parameters.owner ?? "")).toLowerCase();

  return {
    owner,
    ownerKey: owner,
    requestKey: `universe:${owner}`,
  };
}
