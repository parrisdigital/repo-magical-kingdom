import { describe, expect, it } from "vitest";

import type { ProfileSnapshot } from "@/lib/github";

import { KINGDOM_SEASONS } from "./types";
import { compileUniverse, deriveRepositoryPlanetClass } from "./universe";

function profile(repositoryCount = 4): ProfileSnapshot {
  return {
    owner: "parrisdigital",
    displayName: "Parris Digital",
    avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
    profileUrl: "https://github.com/parrisdigital",
    publicRepositoryCount: repositoryCount,
    truncated: repositoryCount > 100,
    repositories: Array.from({ length: repositoryCount }, (_, index) => ({
      id: index + 1,
      owner: "parrisdigital",
      repository: `world-${String(index + 1).padStart(3, "0")}`,
      description: `Repository world ${index + 1}`,
      language: ["TypeScript", "Python", "Rust", "Go"][index % 4]!,
      stars: index % 13,
      forks: index % 5,
      updatedAt: new Date(Date.UTC(2026, 6, 1 + (index % 28))).toISOString(),
      defaultBranch: "main",
      license: "MIT",
      canonicalUrl: `https://github.com/parrisdigital/world-${String(index + 1).padStart(3, "0")}`,
    })),
  };
}

describe("compileUniverse", () => {
  it("creates deterministic seasonal repository worlds around a reserved profile star", () => {
    const first = compileUniverse(profile(16));
    const second = compileUniverse(profile(16));

    expect(first).toEqual(second);
    expect(first.repositories).toHaveLength(16);
    expect(first.repositories.every((repository) => repository.season !== undefined)).toBe(true);
    expect(new Set(first.repositories.map((repository) => repository.season))).toEqual(
      new Set(KINGDOM_SEASONS),
    );
    expect(
      new Set(first.repositories.map((repository) => repository.planetClass)).size,
    ).toBeGreaterThanOrEqual(3);
    expect(
      first.repositories.every(
        (repository) => Math.hypot(repository.position.x, repository.position.z) >= 23.9,
      ),
    ).toBe(true);
  });

  it("derives stable celestial classes with seasonal giant families", () => {
    expect(deriveRepositoryPlanetClass(42, "autumn")).toBe(
      deriveRepositoryPlanetClass(42, "autumn"),
    );
    expect(["gas-giant", "rocky"]).toContain(deriveRepositoryPlanetClass(42, "autumn"));
    expect(["ice-giant", "rocky"]).toContain(deriveRepositoryPlanetClass(42, "winter"));
  });

  it("keeps large profiles spatially bounded while preserving every returned repository", () => {
    const universe = compileUniverse(profile(160));
    const orbitalDistances = universe.repositories.map((repository) =>
      Math.hypot(repository.position.x, repository.position.z),
    );

    expect(universe.repositoryCount).toBe(160);
    expect(universe.truncated).toBe(true);
    expect(universe.repositories).toHaveLength(160);
    expect(Math.max(...orbitalDistances)).toBeLessThan(155);
    expect(
      Math.max(...universe.repositories.map((repository) => repository.radius)),
    ).toBeLessThanOrEqual(8);
  });
});
