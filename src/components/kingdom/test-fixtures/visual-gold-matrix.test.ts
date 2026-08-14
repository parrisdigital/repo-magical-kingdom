import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { compiledKingdomWorldSchema, legacyKingdomWorldSchema } from "@/lib/kingdom/schemas";
import { deriveRepositoryWorldIdentity } from "@/lib/kingdom/world-identity";

const GOLD_CASES = [
  {
    fixture: "repository-city-live-world.json",
    repository: "parrisdigital/repository-city",
    commitSha: "0e61374af12387266c6fb13c273bee845b5f0864",
    buildKey: "5993479c558338a9",
    eligibleFiles: 62,
    representedFiles: 62,
    scaleTier: "compact",
  },
  {
    fixture: "magical-kingdom-medium-world.json",
    repository: "parrisdigital/repo-magical-kingdom",
    commitSha: "55f590e300e9f778f258a1fa5f32f2b669ddb4e4",
    buildKey: "c7db8899b96aedf6",
    eligibleFiles: 336,
    representedFiles: 336,
    scaleTier: "established",
  },
  {
    fixture: "nextjs-large-world.json",
    repository: "vercel/next.js",
    commitSha: "3782922bdd68fef4f8241424bc7372af838bd911",
    buildKey: "bd4b67f902d19164",
    eligibleFiles: 29_719,
    representedFiles: 29_053,
    scaleTier: "vast",
  },
] as const;

describe("visual gold repository-scale matrix", () => {
  for (const gold of GOLD_CASES) {
    it(`pins ${gold.repository} as ${gold.scaleTier}`, () => {
      const candidate = JSON.parse(readFileSync(new URL(gold.fixture, import.meta.url), "utf8"));
      const world = legacyKingdomWorldSchema.parse({
        ...candidate,
        worldTheme: candidate.worldTheme ?? "enchanted-forest",
      });

      expect(`${world.source.owner}/${world.source.repository}`).toBe(gold.repository);
      expect(world.source.commitSha).toBe(gold.commitSha);
      expect(world.buildKey).toBe(gold.buildKey);
      expect(world.coverage.eligibleFiles).toBe(gold.eligibleFiles);
      expect(world.coverage.representedFiles).toBe(gold.representedFiles);
      expect(deriveRepositoryWorldIdentity(world).scaleTier).toBe(gold.scaleTier);
      expect(world.source.revisionUrl).toContain(gold.commitSha);
      expect(world.entities.every((entity) => entity.sourceUrl.includes(gold.commitSha))).toBe(
        true,
      );
    });
  }

  it("documents the exact offline sentinel used by the medium local-Git capture", () => {
    const mediumCandidate: unknown = JSON.parse(
      readFileSync(new URL("magical-kingdom-medium-world.json", import.meta.url), "utf8"),
    );
    const medium = compiledKingdomWorldSchema.parse(mediumCandidate);

    expect(medium.source.repositoryId).toBe(0);
    expect(medium.warnings).toContainEqual({
      code: "OFFLINE_LOCAL_GIT_CAPTURE",
      message:
        "Visual-gold fixture compiled from the pinned local Git tree; repository id uses the documented zero sentinel.",
    });
  });
});
