import type { ProfileSnapshot } from "@/lib/github";

import { KingdomError } from "./errors";
import { stableFraction, stableHash } from "./hash";
import { repositoryUniverseSchema } from "./schemas";
import type { RepositoryUniverse } from "./types";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function compileUniverse(snapshot: ProfileSnapshot): RepositoryUniverse {
  const repositories = [...snapshot.repositories]
    .sort((a, b) => b.stars - a.stars || a.repository.localeCompare(b.repository))
    .map((repository, index) => {
      const angle = index * GOLDEN_ANGLE + stableFraction(`${repository.id}:angle`);
      const distance = index === 0 ? 0 : 12 + Math.sqrt(index) * 13;
      return {
        id: repository.id,
        owner: repository.owner,
        repository: repository.repository,
        description: repository.description,
        language: repository.language,
        stars: repository.stars,
        forks: repository.forks,
        updatedAt: repository.updatedAt,
        defaultBranch: repository.defaultBranch,
        license: repository.license,
        position: {
          x: Math.cos(angle) * distance,
          y: (stableFraction(`${repository.id}:height`) - 0.5) * 8,
          z: Math.sin(angle) * distance,
        },
        radius: Math.min(8, 2.8 + Math.log2(repository.stars + repository.forks + 2) * 0.7),
        hue: stableHash(repository.language ?? repository.repository) % 360,
      };
    });
  const generatedAt =
    [...snapshot.repositories]
      .map((repository) => repository.updatedAt)
      .sort()
      .at(-1) ?? "1970-01-01T00:00:00.000Z";
  const candidate: RepositoryUniverse = {
    schema: "repo-universe/v1",
    owner: snapshot.owner,
    displayName: snapshot.displayName,
    avatarUrl: snapshot.avatarUrl,
    profileUrl: snapshot.profileUrl,
    generatedAt,
    repositoryCount: snapshot.repositories.length,
    truncated: snapshot.truncated,
    repositories,
  };
  const parsed = repositoryUniverseSchema.safeParse(candidate);

  if (!parsed.success) {
    throw new KingdomError("WORLD_INVALID", "The generated universe package failed validation.", {
      retryable: false,
      cause: parsed.error,
    });
  }

  return parsed.data;
}
