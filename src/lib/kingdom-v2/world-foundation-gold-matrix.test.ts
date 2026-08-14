import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { legacyKingdomWorldSchema } from "../kingdom/schemas";
import type { KingdomWorld } from "../kingdom/types";
import { createWorldPlan } from "../kingdom/world-plan";
import { createRepoSemanticGraphV2 } from "./repo-semantic-graph-v2";
import { createWorldDesignSpecV3 } from "./world-design-spec-v3";

const FIXTURES = [
  {
    scale: "compact",
    file: "../../components/kingdom/test-fixtures/repository-city-live-world.json",
  },
  {
    scale: "medium",
    file: "../../components/kingdom/test-fixtures/magical-kingdom-medium-world.json",
  },
  {
    scale: "vast",
    file: "../../components/kingdom/test-fixtures/nextjs-large-world.json",
  },
] as const;

function loadFixture(file: string): KingdomWorld {
  const candidate = JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
  return legacyKingdomWorldSchema.parse({
    ...candidate,
    worldTheme: candidate.worldTheme ?? "enchanted-forest",
  });
}

describe("Repository Worlds V2 gold foundation", () => {
  it("creates three materially different repository-driven designs", () => {
    const designs = FIXTURES.map(({ file, scale }) => {
      const world = loadFixture(file);
      const graph = createRepoSemanticGraphV2(world);
      const plan = createWorldPlan(world);
      return { graph, plan, scale, world, design: createWorldDesignSpecV3(world, plan, graph) };
    });

    const areas = designs.map(({ design }) =>
      Math.round(design.terrain.envelope.width * design.terrain.envelope.depth),
    );
    expect(areas[0]).toBeLessThan(areas[1]!);
    expect(areas[1]).toBeLessThan(areas[2]!);

    expect(new Set(designs.map(({ design }) => design.structureKey)).size).toBe(3);
    expect(new Set(designs.map(({ design }) => design.terrain.morphology.signature)).size).toBe(3);
    expect(
      new Set(
        designs.map(({ design }) =>
          [
            design.terrain.morphology.coastOpening,
            design.terrain.morphology.ridgeBranches,
            design.terrain.morphology.shorelineLobes,
            design.terrain.morphology.ridgeBearingRadians.toFixed(3),
            design.terrain.morphology.basinCount,
            design.terrain.morphology.watershedBranches,
            design.terrain.morphology.relief.toFixed(3),
          ].join(":"),
        ),
      ).size,
    ).toBe(3);
    const settlementCounts = designs.map(
      ({ design }) => design.regions.filter((region) => region.hierarchy !== "ecological").length,
    );
    expect(settlementCounts[0]).toBeLessThanOrEqual(settlementCounts[1]!);
    expect(settlementCounts[1]).toBeLessThanOrEqual(settlementCounts[2]!);
    expect(settlementCounts[2]).toBeGreaterThan(settlementCounts[0]!);

    for (const { design, graph, scale, world } of designs) {
      expect(design.repository).toMatchObject({
        id: world.source.repositoryId,
        owner: world.source.owner,
        name: world.source.repository,
        commitSha: world.source.commitSha,
      });
      expect(design.regions.length, scale).toBeGreaterThan(0);
      expect(graph.coverage.representedFiles, scale).toBe(world.coverage.representedFiles);
      expect(graph.nodes.every((node) => node.sourceUrl.includes(world.source.commitSha))).toBe(
        true,
      );
    }
  });

  it("preserves monotonic file-height evidence in every gold repository", () => {
    for (const { file, scale } of FIXTURES) {
      const entities = createRepoSemanticGraphV2(loadFixture(file))
        .nodes.filter((node) => node.kind === "entity")
        .sort(
          (first, second) =>
            first.magnitude.bytes - second.magnitude.bytes || first.id.localeCompare(second.id),
        );

      expect(entities.length, scale).toBeGreaterThan(1);
      for (let index = 1; index < entities.length; index += 1) {
        expect(entities[index]!.magnitude.heightScale, scale).toBeGreaterThanOrEqual(
          entities[index - 1]!.magnitude.heightScale,
        );
      }
      expect(entities.at(-1)!.magnitude.heightScale, scale).toBeGreaterThan(
        entities[0]!.magnitude.heightScale,
      );
    }
  });

  it("keeps structural identity stable when only season changes", () => {
    for (const { file, scale } of FIXTURES) {
      const summer = loadFixture(file);
      const winter: KingdomWorld = { ...summer, season: "winter" };
      const summerGraph = createRepoSemanticGraphV2(summer);
      const winterGraph = createRepoSemanticGraphV2(winter);
      const summerDesign = createWorldDesignSpecV3(summer, createWorldPlan(summer), summerGraph);
      const winterDesign = createWorldDesignSpecV3(winter, createWorldPlan(winter), winterGraph);

      expect(winterDesign.structureKey, scale).toBe(summerDesign.structureKey);
      expect(winterDesign.appearanceKey, scale).not.toBe(summerDesign.appearanceKey);
    }
  });
});
