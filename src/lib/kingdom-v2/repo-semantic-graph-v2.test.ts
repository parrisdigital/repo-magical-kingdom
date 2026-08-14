import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { KingdomWorld } from "../kingdom/types";
import {
  assertRepoSemanticGraphV2Integrity,
  createRepoSemanticGraphV2,
  REPO_SEMANTIC_GRAPH_V2_COMPILER_REVISION,
  REPO_SEMANTIC_GRAPH_V2_SCHEMA,
} from "./repo-semantic-graph-v2";

const LARGE_FIXTURE_URL = new URL(
  "../../components/kingdom/test-fixtures/nextjs-large-world.json",
  import.meta.url,
);

function fixture(): KingdomWorld {
  return JSON.parse(readFileSync(LARGE_FIXTURE_URL, "utf8")) as KingdomWorld;
}

describe("RepoSemanticGraphV2", () => {
  it("creates a traceable graph without inventing dependency evidence", () => {
    const world = fixture();
    const graph = createRepoSemanticGraphV2(world);

    expect(graph.schema).toBe(REPO_SEMANTIC_GRAPH_V2_SCHEMA);
    expect(graph.compilerRevision).toBe(REPO_SEMANTIC_GRAPH_V2_COMPILER_REVISION);
    expect(graph.repository).toEqual({
      id: world.source.repositoryId,
      owner: world.source.owner,
      name: world.source.repository,
      commitSha: world.source.commitSha,
    });
    expect(graph.nodes.filter((node) => node.kind === "repository")).toHaveLength(1);
    expect(graph.nodes.filter((node) => node.kind === "region")).toHaveLength(
      world.provinces.length,
    );
    expect(graph.nodes.filter((node) => node.kind === "entity")).toHaveLength(
      world.entities.length,
    );
    expect(graph.edges.some((edge) => edge.kind === "dependency")).toBe(false);
    expect(graph.coverage).toEqual(world.coverage);
    expect(graph.warnings).toEqual([]);
    expect(graph.sourceCompilerVersion).toBe(world.compilerVersion);
    expect(Object.isFrozen(graph)).toBe(true);
    expect(Object.isFrozen(graph.nodes)).toBe(true);
    expect(Object.isFrozen(graph.nodes[0]!.magnitude)).toBe(true);
    expect(() => assertRepoSemanticGraphV2Integrity(graph)).not.toThrow();

    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    for (const edge of graph.edges) {
      expect(nodeIds.has(edge.from), edge.id).toBe(true);
      expect(nodeIds.has(edge.to), edge.id).toBe(true);
    }
  });

  it("rejects stale keys after cached semantic or provenance mutation", () => {
    const graph = structuredClone(createRepoSemanticGraphV2(fixture()));
    const entity = graph.nodes.find((node) => node.kind === "entity")!;
    (entity.magnitude as { normalized: number }).normalized = 0.123456;
    expect(() => assertRepoSemanticGraphV2Integrity(graph)).toThrow(
      /semantic metadata|key does not match/u,
    );

    const provenance = structuredClone(createRepoSemanticGraphV2(fixture()));
    (provenance.nodes[0] as { sourceUrl: string }).sourceUrl += "?mutated=1";
    expect(() => assertRepoSemanticGraphV2Integrity(provenance)).toThrow(/key does not match/u);

    const edgeEvidence = structuredClone(createRepoSemanticGraphV2(fixture()));
    (edgeEvidence.edges[0]!.evidence as { reference: string }).reference = "";
    expect(() => assertRepoSemanticGraphV2Integrity(edgeEvidence)).toThrow(
      /invalid evidence or identity/u,
    );
  });

  it("keeps entity height monotonic with represented byte magnitude", () => {
    const graph = createRepoSemanticGraphV2(fixture());
    const entities = graph.nodes
      .filter((node) => node.kind === "entity")
      .sort(
        (first, second) =>
          first.magnitude.bytes - second.magnitude.bytes || first.id.localeCompare(second.id),
      );

    for (let index = 1; index < entities.length; index += 1) {
      expect(entities[index]!.magnitude.heightScale).toBeGreaterThanOrEqual(
        entities[index - 1]!.magnitude.heightScale,
      );
    }
    expect(entities.at(-1)!.magnitude.heightScale).toBeGreaterThan(
      entities[0]!.magnitude.heightScale,
    );
  });

  it("is structurally invariant across season and visual theme changes", () => {
    const world = fixture();
    const summerForest: KingdomWorld = {
      ...world,
      season: "summer",
      worldTheme: "enchanted-forest",
    };
    const winterValley: KingdomWorld = {
      ...world,
      season: "winter",
      worldTheme: "kingdom-valley",
    };

    expect(createRepoSemanticGraphV2(summerForest)).toEqual(
      createRepoSemanticGraphV2(winterValley),
    );
  });

  it("invalidates its key for every repository semantic used by composition", () => {
    const world = fixture();
    const baseline = createRepoSemanticGraphV2(world);
    const entityIndex = world.entities.findIndex((entity) => !entity.aggregate);
    const regionIndex = world.provinces.findIndex(
      (province) =>
        province.role === "province" &&
        world.entities.some(
          (entity) => entity.provinceId === province.id && entity.path.includes("/"),
        ),
    );
    expect(entityIndex).toBeGreaterThanOrEqual(0);
    expect(regionIndex).toBeGreaterThanOrEqual(0);

    const entity = world.entities[entityIndex]!;
    const region = world.provinces[regionIndex]!;
    const replaceEntity = (update: Partial<(typeof world.entities)[number]>): KingdomWorld => ({
      ...world,
      entities: world.entities.map((candidate, index) =>
        index === entityIndex ? { ...candidate, ...update } : candidate,
      ),
    });
    const replaceRegion = (update: Partial<(typeof world.provinces)[number]>): KingdomWorld => ({
      ...world,
      provinces: world.provinces.map((candidate, index) =>
        index === regionIndex ? { ...candidate, ...update } : candidate,
      ),
    });

    const mutations: ReadonlyArray<Readonly<{ label: string; world: KingdomWorld }>> = [
      {
        label: "entity category",
        world: replaceEntity({ category: entity.category === "source" ? "docs" : "source" }),
      },
      {
        label: "entity language",
        world: replaceEntity({ language: `${entity.language}-identity-mutation` }),
      },
      {
        label: "entity aggregate metadata",
        world: replaceEntity({ aggregate: !entity.aggregate }),
      },
      {
        label: "region category",
        world: replaceRegion({
          dominantCategory: region.dominantCategory === "source" ? "docs" : "source",
        }),
      },
      {
        label: "region role",
        world: replaceRegion({ role: region.role === "province" ? "frontier" : "province" }),
      },
      {
        label: "represented region path depth",
        world: {
          ...world,
          entities: world.entities.map((candidate) =>
            candidate.provinceId === region.id
              ? { ...candidate, path: `nested/${candidate.path}` }
              : candidate,
          ),
        },
      },
    ];

    for (const mutation of mutations) {
      const graph = createRepoSemanticGraphV2(mutation.world);
      expect(graph.key, mutation.label).not.toBe(baseline.key);
      expect(
        graph.nodes.map((node) => node.id),
        `${mutation.label} must preserve deterministic node ids`,
      ).toEqual(baseline.nodes.map((node) => node.id));
      expect(graph.coverage, `${mutation.label} must preserve coverage`).toEqual(baseline.coverage);
    }

    const baselineRegion = baseline.nodes.find(
      (node) => node.kind === "region" && node.provinceId === region.id,
    );
    const deeperRegion = createRepoSemanticGraphV2(mutations.at(-1)!.world).nodes.find(
      (node) => node.kind === "region" && node.provinceId === region.id,
    );
    expect(baselineRegion?.path).toBeTruthy();
    expect(deeperRegion?.path.split("/")).toHaveLength(baselineRegion!.path.split("/").length + 1);
  });

  it("adds only explicit, resolved manifest dependency edges", () => {
    const world = fixture();
    const first = world.entities.find((entity) => entity.path.length > 0);
    const second = world.entities.find(
      (entity) => entity.path.length > 0 && entity.path !== first?.path,
    );
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const graph = createRepoSemanticGraphV2(world, {
      dependencies: [
        {
          fromPath: first!.path,
          toPath: second!.path,
          reference: "package.json#dependencies",
        },
        {
          fromPath: "missing/from.ts",
          toPath: "missing/to.ts",
          reference: "fixture",
        },
      ],
    });

    const dependencies = graph.edges.filter((edge) => edge.kind === "dependency");
    expect(dependencies).toHaveLength(1);
    const resolvedFrom = graph.nodes.find(
      (node) => node.kind === "entity" && node.id === dependencies[0]?.from,
    );
    const resolvedTo = graph.nodes.find(
      (node) => node.kind === "entity" && node.id === dependencies[0]?.to,
    );
    expect(dependencies[0]).toMatchObject({
      evidence: { source: "manifest", reference: "package.json#dependencies" },
    });
    expect(resolvedFrom).toMatchObject({ kind: "entity", path: first!.path });
    expect(resolvedTo).toMatchObject({ kind: "entity", path: second!.path });
    expect(graph.warnings).toEqual([
      expect.objectContaining({ code: "UNRESOLVED_DEPENDENCY_HINT" }),
    ]);
  });

  it("deduplicates exact dependency evidence and rejects blank evidence", () => {
    const world = fixture();
    const first = world.entities.find((entity) => entity.path.length > 0)!;
    const second = world.entities.find(
      (entity) => entity.path.length > 0 && entity.path !== first.path,
    )!;
    const dependency = {
      fromPath: first.path,
      toPath: second.path,
      reference: "package.json#dependencies",
    } as const;
    const graph = createRepoSemanticGraphV2(world, {
      dependencies: [dependency, dependency],
    });

    expect(graph.edges.filter(({ kind }) => kind === "dependency")).toHaveLength(1);
    expect(() =>
      createRepoSemanticGraphV2(world, {
        dependencies: [{ ...dependency, reference: "   " }],
      }),
    ).toThrow(/non-empty paths and evidence/u);
  });
});
