import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { legacyKingdomWorldSchema } from "../kingdom/schemas";
import type { KingdomWorld } from "../kingdom/types";
import {
  createRepositoryWorldFoundationV2,
  REPOSITORY_WORLD_FOUNDATION_V2_SCHEMA,
} from "./repository-world-foundation-v2";

const MEDIUM_FIXTURE_URL = new URL(
  "../../components/kingdom/test-fixtures/magical-kingdom-medium-world.json",
  import.meta.url,
);

function fixture(): KingdomWorld {
  return legacyKingdomWorldSchema.parse(JSON.parse(readFileSync(MEDIUM_FIXTURE_URL, "utf8")));
}

describe("RepositoryWorldFoundationV2", () => {
  it("builds one coherent graph, design, terrain, and manifest reference chain", () => {
    const foundation = createRepositoryWorldFoundationV2(fixture());

    expect(foundation.schema).toBe(REPOSITORY_WORLD_FOUNDATION_V2_SCHEMA);
    expect(foundation.design.semanticGraphKey).toBe(foundation.semanticGraph.key);
    expect(foundation.terrain.structureKey).toBe(foundation.design.structureKey);
    expect(foundation.terrainSummary.key).toBe(foundation.terrain.key);
    expect(foundation.terrainSummary.structureKey).toBe(foundation.design.structureKey);
    expect(foundation.terrain.chunks).toHaveLength(16);
    expect(foundation.terrain.metrics.sampleCount).toBe(513 * 513);
  });

  it("keeps structure and terrain invariant across appearance-only seasons", () => {
    const summer = fixture();
    const winter: KingdomWorld = { ...summer, season: "winter" };
    const summerFoundation = createRepositoryWorldFoundationV2(summer);
    const winterFoundation = createRepositoryWorldFoundationV2(winter);

    expect(winterFoundation.semanticGraph.key).toBe(summerFoundation.semanticGraph.key);
    expect(winterFoundation.design.structureKey).toBe(summerFoundation.design.structureKey);
    expect(winterFoundation.design.appearanceKey).not.toBe(summerFoundation.design.appearanceKey);
    expect(winterFoundation.terrain.key).toBe(summerFoundation.terrain.key);
    expect(winterFoundation.terrain.metrics.checksums).toEqual(
      summerFoundation.terrain.metrics.checksums,
    );
  });
});
