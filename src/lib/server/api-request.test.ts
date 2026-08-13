import { describe, expect, it } from "vitest";

import { parseCanonicalKingdomRequest, parseCanonicalUniverseRequest } from "./api-request";

const SHA = "ABCDEF0123456789ABCDEF0123456789ABCDEF01";

function kingdomUrl(
  repository: string,
  revision?: string,
  season = "spring",
  worldTheme?: string,
): string {
  const parameters = new URLSearchParams({ repository });
  if (worldTheme !== undefined) parameters.set("world", worldTheme);
  parameters.set("season", season);
  if (revision !== undefined) parameters.set("revision", revision);
  return `https://example.test/api/kingdom?${parameters.toString()}`;
}

describe("canonical API request parsing", () => {
  it("normalizes repository identity, revision SHA, and the in-flight key", () => {
    const parsed = parseCanonicalKingdomRequest(new Request(kingdomUrl("Owner/Repository", SHA)));

    expect(parsed.reference).toEqual({
      owner: "owner",
      repository: "repository",
      revision: SHA.toLowerCase(),
    });
    expect(parsed.repositoryKey).toBe("owner/repository");
    expect(parsed.season).toBe("spring");
    expect(parsed.requestKey).toBe(
      `kingdom:owner/repository@${SHA.toLowerCase()}?world=<auto>&season=spring`,
    );
    expect(parsed.cacheableImmutableRequest).toBe(false);
  });

  it("marks only the exact normalized full-commit query as publicly cacheable", () => {
    const revision = SHA.toLowerCase();
    const canonical = parseCanonicalKingdomRequest(
      new Request(kingdomUrl("owner/repository", revision)),
    );
    const githubAlias = parseCanonicalKingdomRequest(
      new Request(kingdomUrl("https://github.com/owner/repository.git", revision)),
    );
    const mutable = parseCanonicalKingdomRequest(
      new Request(kingdomUrl("owner/repository", "main")),
    );

    expect(canonical.cacheableImmutableRequest).toBe(true);
    expect(githubAlias.cacheableImmutableRequest).toBe(false);
    expect(mutable.cacheableImmutableRequest).toBe(false);
  });

  it.each(["spring", "summer", "autumn", "winter"])(
    "includes the %s season in canonical and in-flight identity",
    (season) => {
      const parsed = parseCanonicalKingdomRequest(
        new Request(kingdomUrl("owner/repository", SHA.toLowerCase(), season)),
      );

      expect(parsed.season).toBe(season);
      expect(parsed.requestKey).toContain(`season=${season}`);
      expect(parsed.cacheableImmutableRequest).toBe(true);
    },
  );

  it.each(["kingdom-valley", "enchanted-forest"])(
    "includes the explicit %s world in canonical and in-flight identity",
    (worldTheme) => {
      const parsed = parseCanonicalKingdomRequest(
        new Request(kingdomUrl("owner/repository", SHA.toLowerCase(), "spring", worldTheme)),
      );

      expect(parsed.worldTheme).toBe(worldTheme);
      expect(parsed.requestKey).toContain(`world=${worldTheme}`);
      expect(parsed.cacheableImmutableRequest).toBe(true);
    },
  );

  it.each([
    "https://github.com/owner/repository?tab=readme",
    "https://github.com/owner/repository#readme",
    "https://github.com/owner/repository/tree/main",
    "https://user:password@github.com/owner/repository",
    "https://github.com:444/owner/repository",
  ])("rejects ignored or ambiguous GitHub URL content in %s", (repository) => {
    expect(() => parseCanonicalKingdomRequest(new Request(kingdomUrl(repository)))).toThrow();
  });

  it.each([
    "https://example.test/api/kingdom?repository=owner%2Frepo&debug=1",
    "https://example.test/api/kingdom?repository=owner%2Frepo&season=spring&repository=owner%2Fother",
    "https://example.test/api/kingdom?repository=owner%2Frepo&season=spring&revision=",
    "https://example.test/api/kingdom?repository=owner%2Frepo",
    "https://example.test/api/kingdom?repository=owner%2Frepo&season=monsoon",
    "https://example.test/api/kingdom?repository=owner%2Frepo&season=spring&season=winter",
    "https://example.test/api/kingdom?repository=owner%2Frepo&world=&season=spring",
    "https://example.test/api/kingdom?repository=owner%2Frepo&world=space-opera&season=spring",
    "https://example.test/api/kingdom?repository=owner%2Frepo&world=kingdom-valley&world=enchanted-forest&season=spring",
  ])("rejects cache-key aliases from unsupported, duplicate, or empty parameters", (url) => {
    expect(() => parseCanonicalKingdomRequest(new Request(url))).toThrow();
  });

  it("rejects an oversized request URL before parsing repository input", () => {
    const request = new Request(
      `https://example.test/api/kingdom?repository=owner%2Frepo&ignored=${"x".repeat(2_100)}`,
    );

    try {
      parseCanonicalKingdomRequest(request);
      throw new Error("Expected oversized URL to be rejected");
    } catch (error) {
      expect(error).toMatchObject({ code: "INVALID_INPUT", status: 414 });
    }
  });

  it.each(["Owner", "@Owner", "https://github.com/Owner", "github.com/Owner/"])(
    "canonicalizes universe owner form %s",
    (owner) => {
      const parameters = new URLSearchParams({ owner });
      expect(
        parseCanonicalUniverseRequest(
          new Request(`https://example.test/api/universe?${parameters.toString()}`),
        ),
      ).toEqual({ owner: "owner", ownerKey: "owner", requestKey: "universe:owner" });
    },
  );

  it("rejects profile URL navigation paths and query strings", () => {
    for (const owner of [
      "https://github.com/owner/repositories",
      "https://github.com/owner?tab=repositories",
    ]) {
      const parameters = new URLSearchParams({ owner });
      expect(() =>
        parseCanonicalUniverseRequest(
          new Request(`https://example.test/api/universe?${parameters.toString()}`),
        ),
      ).toThrow();
    }
  });
});
