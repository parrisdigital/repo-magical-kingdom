import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { KingdomWorld } from "../kingdom/types";
import { createWorldPlan } from "../kingdom/world-plan";
import {
  parseCustomAssetCatalogV1,
  type CustomAssetCatalogV1,
} from "../world-assets-v2/custom-asset-catalog-v1";
import { createRepoSemanticGraphV2, type RepoSemanticEntityNode } from "./repo-semantic-graph-v2";
import { createTerrainArtifactV2 } from "./terrain-artifact-v2";
import { createWorldDesignSpecV3 } from "./world-design-spec-v3";
import {
  createWorldRenderManifestV2,
  createWorldRenderTerrainSummaryV2,
  deriveWorldRenderArchitectureProfileV2,
  deriveWorldRenderCollisionRevisionV2,
  WORLD_RENDERER_V2_REVISION,
  WORLD_RENDER_MANIFEST_V2_SCHEMA,
  type CreateWorldRenderManifestV2Input,
  type WorldRenderInstanceV2,
  type WorldRenderRoadV2,
  type WorldRenderTerrainSummaryV2,
  type WorldRenderWildlifeRouteV2,
} from "./world-render-manifest-v2";

const LARGE_FIXTURE_URL = new URL(
  "../../components/kingdom/test-fixtures/nextjs-large-world.json",
  import.meta.url,
);
const CATALOG_PATH = resolve(process.cwd(), "public/assets/world-v2/catalog-v1.json");

function fixture(): KingdomWorld {
  return JSON.parse(readFileSync(LARGE_FIXTURE_URL, "utf8")) as KingdomWorld;
}

function catalogFixture(): CustomAssetCatalogV1 {
  return parseCustomAssetCatalogV1(JSON.parse(readFileSync(CATALOG_PATH, "utf8")));
}

let cachedManifestInput: CreateWorldRenderManifestV2Input | undefined;

function manifestInput(): CreateWorldRenderManifestV2Input {
  if (cachedManifestInput) return cachedManifestInput;
  const world = fixture();
  const graph = createRepoSemanticGraphV2(world);
  const plan = createWorldPlan(world);
  const design = createWorldDesignSpecV3(world, plan, graph);
  const terrain = createWorldRenderTerrainSummaryV2(createTerrainArtifactV2({ plan, design }));
  const assetCatalog = catalogFixture();
  const building = assetCatalog.families.find((family) => family.id === "archive-spire")!;
  const animal = assetCatalog.families.find((family) => family.id === "patch-fox")!;
  const entity = graph.nodes.find(
    (node): node is RepoSemanticEntityNode => node.kind === "entity",
  )!;
  const instance: WorldRenderInstanceV2 = {
    id: "instance:hero",
    semanticNodeId: entity.id,
    assetId: building.id,
    role: "residential-hero",
    position: { x: 0, y: 1, z: 0 },
    rotationY: 0,
    scale: { x: 1, y: 1, z: 1 },
    semanticHeightScale: entity.magnitude.heightScale,
    architecture: deriveWorldRenderArchitectureProfileV2(entity.magnitude),
    lodGroup: "hero",
    collisionProxyId: building.collision.nodes[0]!.name,
  };
  const route = design.routes[0]!;
  const road: WorldRenderRoadV2 = {
    id: "road:fixture",
    routeIntentId: route.id,
    width: 4.5,
    points: [
      { x: -4, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ],
    surface: "road",
  };
  const collisionRevision = deriveWorldRenderCollisionRevisionV2({
    assetCatalog,
    placementKey: design.sourcePlan.placementKey,
    instances: [instance],
    roads: [road],
  });
  cachedManifestInput = {
    design,
    graph,
    terrain,
    assetCatalog,
    instances: [instance],
    roads: [road],
    wildlifeRoutes: [
      {
        id: "wildlife:fixture",
        habitatId: design.ecology.groves[0]!.id,
        animalRole: animal.id,
        points: [
          { x: 0, y: 0, z: 0 },
          { x: 8, y: 0, z: 4 },
        ],
        behavior: "wander",
      },
    ],
    navigation: {
      terrainArtifactKey: terrain.key,
      collisionRevision,
      walkEntry: {
        position: { x: 0, y: 1.7, z: 0 },
        target: { x: 8, y: 2, z: 4 },
      },
      waterRouteId: road.id,
    },
  };
  return cachedManifestInput;
}

function withTerrainChunks(
  input: CreateWorldRenderManifestV2Input,
  chunks: WorldRenderTerrainSummaryV2["chunks"],
): CreateWorldRenderManifestV2Input {
  return { ...input, terrain: { ...input.terrain, chunks } };
}

describe("WorldRenderManifestV2", () => {
  it("references the canonical worker terrain without duplicating its typed arrays", () => {
    const input = manifestInput();

    expect(input.terrain).toMatchObject({
      schema: "repo-terrain-artifact/v2",
      structureKey: input.design.structureKey,
      resolution: 513,
      chunkLods: [129, 65, 33],
    });
    expect(input.terrain.chunks).toHaveLength(16);
    expect(input.terrain.chunks.every((chunk) => chunk.maximumLod === 2)).toBe(true);
    expect(input.terrain.heightFieldKey).toContain(input.terrain.key);
    expect(input.terrain.materialWeightsKey).toContain(input.terrain.key);
    expect(input.terrain.hydrologyKey).toContain(input.terrain.key);
    expect(Object.values(input.terrain).some((value) => ArrayBuffer.isView(value))).toBe(false);
    expect(Object.isFrozen(input.terrain.chunks[0]!.bounds)).toBe(true);
  });

  it("pins deterministic render data to the renderer, parsed asset catalog, and provenance", () => {
    const input = manifestInput();
    const first = createWorldRenderManifestV2(input);
    const second = createWorldRenderManifestV2(input);

    expect(first).toEqual(second);
    expect(first.schema).toBe(WORLD_RENDER_MANIFEST_V2_SCHEMA);
    expect(first.rendererRevision).toBe(WORLD_RENDERER_V2_REVISION);
    expect(first.assetCatalog).toEqual({
      id: "repository-worlds-v2-original-assets",
      schemaVersion: 1,
      digest: expect.stringMatching(/^custom-asset-catalog-v1:[a-f0-9]+$/u),
    });
    expect(first.provenance).toEqual([
      expect.objectContaining({
        instanceId: "instance:hero",
        semanticNodeId: input.instances[0]!.semanticNodeId,
        sourceUrl: expect.stringContaining("github.com"),
      }),
    ]);
    expect(first.budgets).toEqual({
      status: "unmeasured",
      targets: {
        orbit: { maximumDrawCalls: 200, maximumVisibleTriangles: 2_000_000 },
        walk: { maximumDrawCalls: 220, maximumVisibleTriangles: 3_000_000 },
      },
    });
  });

  it("takes an immutable snapshot before digesting caller-owned render data", () => {
    const input = manifestInput();
    const mutableTerrain = JSON.parse(JSON.stringify(input.terrain)) as WorldRenderTerrainSummaryV2;
    const mutableInstances = JSON.parse(JSON.stringify(input.instances)) as WorldRenderInstanceV2[];
    const mutableRoads = JSON.parse(JSON.stringify(input.roads)) as WorldRenderRoadV2[];
    const mutableWildlife = JSON.parse(
      JSON.stringify(input.wildlifeRoutes),
    ) as WorldRenderWildlifeRouteV2[];
    const mutableNavigation = JSON.parse(JSON.stringify(input.navigation)) as {
      terrainArtifactKey: string;
      collisionRevision: string;
      walkEntry: {
        position: { x: number; y: number; z: number };
        target: { x: number; y: number; z: number };
      };
      waterRouteId: string | null;
    };
    const manifest = createWorldRenderManifestV2({
      ...input,
      terrain: mutableTerrain,
      instances: mutableInstances,
      roads: mutableRoads,
      wildlifeRoutes: mutableWildlife,
      navigation: mutableNavigation,
    });
    const originalKey = manifest.key;
    const originalSnapshot = JSON.stringify(manifest);

    (mutableTerrain.chunks[0]!.bounds as { minX: number }).minX -= 10;
    (mutableInstances[0]!.position as { x: number }).x += 10;
    (mutableRoads[0]!.points[0] as { z: number }).z += 10;
    (mutableWildlife[0]!.points[0] as { x: number }).x += 10;
    mutableNavigation.walkEntry.target.y += 10;

    expect(manifest.key).toBe(originalKey);
    expect(JSON.stringify(manifest)).toBe(originalSnapshot);
    expect(manifest.terrain).not.toBe(mutableTerrain);
    expect(manifest.instances).not.toBe(mutableInstances);
    expect(manifest.roads).not.toBe(mutableRoads);
    expect(manifest.wildlifeRoutes).not.toBe(mutableWildlife);
    expect(manifest.navigation).not.toBe(mutableNavigation);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.terrain.chunks[0]!.bounds)).toBe(true);
    expect(Object.isFrozen(manifest.instances[0]!.position)).toBe(true);
    expect(Object.isFrozen(manifest.roads[0]!.points[0])).toBe(true);
    expect(Object.isFrozen(manifest.wildlifeRoutes[0]!.points[0])).toBe(true);
    expect(Object.isFrozen(manifest.navigation.walkEntry.target)).toBe(true);
    expect(() => {
      (manifest.instances[0]!.position as { x: number }).x = 999;
    }).toThrow(TypeError);
  });

  it("fails closed on missing asset families, noncanonical catalog LODs, and foreign collisions", () => {
    const input = manifestInput();
    const instance = input.instances[0]!;
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        instances: [{ ...instance, assetId: "missing-family" }],
      }),
    ).toThrow(/missing custom asset/u);
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        instances: [{ ...instance, collisionProxyId: "COLLIDER_foreign" }],
      }),
    ).toThrow(/collision proxy does not belong/u);

    const family = input.assetCatalog.families[0]!;
    const noncanonicalCatalog = {
      ...input.assetCatalog,
      families: [
        { ...family, lods: [family.lods[1], family.lods[0], family.lods[2]] },
        ...input.assetCatalog.families.slice(1),
      ],
    } as unknown as CustomAssetCatalogV1;
    expect(() =>
      createWorldRenderManifestV2({ ...input, assetCatalog: noncanonicalCatalog }),
    ).toThrow(/Expected lod0|LOD distances must increase/u);
  });

  it("maps magnitude to modular storeys without stretching authored facade scale", () => {
    const input = manifestInput();
    const instance = input.instances[0]!;
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        instances: [{ ...instance, semanticHeightScale: 1 }],
      }),
    ).toThrow(/does not match repository magnitude/u);
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        instances: [
          {
            ...instance,
            architecture: {
              ...instance.architecture!,
              storeyCount: Math.min(5, instance.architecture!.storeyCount + 1) as 1 | 2 | 3 | 4 | 5,
            },
          },
        ],
      }),
    ).toThrow(/architecture assembly does not match/u);
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        instances: [{ ...instance, scale: { ...instance.scale, y: 1.25 } }],
      }),
    ).toThrow(/preserve authored Y scale/u);

    const profiles = [0, 0.2, 0.4, 0.6, 0.8, 1].map((normalized) =>
      deriveWorldRenderArchitectureProfileV2({
        bytes: Math.round(normalized * 1_000_000),
        representedFiles: 1,
        normalized,
        heightScale: 0.75 + normalized * 1.75,
      }),
    );
    expect(profiles.map(({ storeyCount }) => storeyCount)).toEqual([1, 2, 3, 4, 5, 5]);
    for (let index = 1; index < profiles.length; index += 1) {
      expect(profiles[index]!.targetHeightMeters).toBeGreaterThan(
        profiles[index - 1]!.targetHeightMeters,
      );
      expect(profiles[index]!.prominence).toBeGreaterThan(profiles[index - 1]!.prominence);
    }
  });

  it("rejects noncanonical terrain count, LODs, ids, and discontinuous coverage", () => {
    const input = manifestInput();
    expect(() =>
      createWorldRenderManifestV2(withTerrainChunks(input, input.terrain.chunks.slice(0, 15))),
    ).toThrow(/canonical 16-chunk 4x4/u);
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        terrain: {
          ...input.terrain,
          chunkLods: [129, 33, 65] as unknown as WorldRenderTerrainSummaryV2["chunkLods"],
        },
      }),
    ).toThrow(/canonical \[129, 65, 33\]/u);

    const duplicateIdChunks = input.terrain.chunks.map((chunk, index) =>
      index === 1 ? { ...chunk, id: input.terrain.chunks[0]!.id } : chunk,
    );
    expect(() => createWorldRenderManifestV2(withTerrainChunks(input, duplicateIdChunks))).toThrow(
      /Duplicate terrain chunk id/u,
    );

    const discontinuousChunks = input.terrain.chunks.map((chunk, index) =>
      index === 0 ? { ...chunk, bounds: { ...chunk.bounds, maxX: chunk.bounds.maxX - 1 } } : chunk,
    );
    expect(() =>
      createWorldRenderManifestV2(withTerrainChunks(input, discontinuousChunks)),
    ).toThrow(/contiguous canonical 4x4/u);
  });

  it("requires finite instance, road, wildlife, and navigation coordinates", () => {
    const input = manifestInput();
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        instances: [
          { ...input.instances[0]!, position: { ...input.instances[0]!.position, x: Number.NaN } },
        ],
      }),
    ).toThrow(/non-finite position/u);

    const road: WorldRenderRoadV2 = {
      ...input.roads[0]!,
      points: [input.roads[0]!.points[0]!, { x: 0, y: Number.POSITIVE_INFINITY, z: 0 }],
    };
    expect(() => createWorldRenderManifestV2({ ...input, roads: [road] })).toThrow(
      /Road .* non-finite position/u,
    );

    const wildlife: WorldRenderWildlifeRouteV2 = {
      ...input.wildlifeRoutes[0]!,
      points: [input.wildlifeRoutes[0]!.points[0]!, { x: 0, y: 0, z: Number.NEGATIVE_INFINITY }],
    };
    expect(() => createWorldRenderManifestV2({ ...input, wildlifeRoutes: [wildlife] })).toThrow(
      /Wildlife route .* non-finite position/u,
    );

    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        navigation: {
          ...input.navigation,
          walkEntry: {
            ...input.navigation.walkEntry,
            target: { x: Number.NaN, y: 0, z: 0 },
          },
        },
      }),
    ).toThrow(/Navigation walk target has a non-finite position/u);
  });

  it("rejects hostile deserialized values for every manifest input enum", () => {
    const input = manifestInput();
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        instances: [
          {
            ...input.instances[0]!,
            lodGroup: "cinematic" as unknown as WorldRenderInstanceV2["lodGroup"],
          },
        ],
      }),
    ).toThrow(/unsupported LOD group/u);
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        roads: [
          {
            ...input.roads[0]!,
            surface: "lava" as unknown as WorldRenderRoadV2["surface"],
          },
        ],
      }),
    ).toThrow(/unsupported surface/u);
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        wildlifeRoutes: [
          {
            ...input.wildlifeRoutes[0]!,
            behavior: "attack" as unknown as WorldRenderWildlifeRouteV2["behavior"],
          },
        ],
      }),
    ).toThrow(/unsupported behavior/u);
  });

  it("derives collision revision from catalog identity and the deterministic placement set", () => {
    const input = manifestInput();
    const expected = deriveWorldRenderCollisionRevisionV2({
      assetCatalog: input.assetCatalog,
      placementKey: input.design.sourcePlan.placementKey,
      instances: input.instances,
      roads: input.roads,
    });
    expect(input.navigation.collisionRevision).toBe(expected);
    expect(expected).toMatch(/^collision-revision-v2:[a-f0-9]+$/u);
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        navigation: { ...input.navigation, collisionRevision: "collision-revision-v2:invented" },
      }),
    ).toThrow(/catalog-placement-and-road-derived collision revision/u);

    const displacedInstances: WorldRenderInstanceV2[] = [
      {
        ...input.instances[0]!,
        position: { ...input.instances[0]!.position, x: input.instances[0]!.position.x + 1 },
      },
    ];
    const displacedRevision = deriveWorldRenderCollisionRevisionV2({
      assetCatalog: input.assetCatalog,
      placementKey: input.design.sourcePlan.placementKey,
      instances: displacedInstances,
      roads: input.roads,
    });
    expect(displacedRevision).not.toBe(expected);
    expect(() => createWorldRenderManifestV2({ ...input, instances: displacedInstances })).toThrow(
      /catalog-placement-and-road-derived collision revision/u,
    );
    expect(
      createWorldRenderManifestV2({
        ...input,
        instances: displacedInstances,
        navigation: { ...input.navigation, collisionRevision: displacedRevision },
      }).navigation.collisionRevision,
    ).toBe(displacedRevision);
    expect(
      deriveWorldRenderCollisionRevisionV2({
        assetCatalog: input.assetCatalog,
        placementKey: `${input.design.sourcePlan.placementKey}:changed`,
        instances: input.instances,
        roads: input.roads,
      }),
    ).not.toBe(expected);

    const widerRoads = [{ ...input.roads[0]!, width: input.roads[0]!.width + 1 }];
    const widerRoadRevision = deriveWorldRenderCollisionRevisionV2({
      assetCatalog: input.assetCatalog,
      placementKey: input.design.sourcePlan.placementKey,
      instances: input.instances,
      roads: widerRoads,
    });
    expect(widerRoadRevision).not.toBe(expected);
    expect(() => createWorldRenderManifestV2({ ...input, roads: widerRoads })).toThrow(
      /catalog-placement-and-road-derived collision revision/u,
    );
    expect(
      createWorldRenderManifestV2({
        ...input,
        roads: widerRoads,
        navigation: { ...input.navigation, collisionRevision: widerRoadRevision },
      }).navigation.collisionRevision,
    ).toBe(widerRoadRevision);
  });

  it("requires valid road, wildlife habitat/animal, collision, and water-route identities", () => {
    const input = manifestInput();
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        navigation: { ...input.navigation, collisionRevision: "  " },
      }),
    ).toThrow(/catalog-placement-and-road-derived collision revision/u);
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        navigation: { ...input.navigation, waterRouteId: "road:missing" },
      }),
    ).toThrow(/water route must reference a road/u);
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        wildlifeRoutes: [{ ...input.wildlifeRoutes[0]!, habitatId: "habitat:missing" }],
      }),
    ).toThrow(/region or ecology habitat/u);
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        wildlifeRoutes: [{ ...input.wildlifeRoutes[0]!, animalRole: "archive-spire" }],
      }),
    ).toThrow(/animal family/u);
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        roads: [{ ...input.roads[0]!, routeIntentId: "design-route:missing" }],
      }),
    ).toThrow(/route intent/u);
  });

  it("requires terrain, navigation, and design to share one structural artifact", () => {
    const input = manifestInput();
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        navigation: { ...input.navigation, terrainArtifactKey: "terrain:wrong" },
      }),
    ).toThrow(/same TerrainArtifactV2/u);
    expect(() =>
      createWorldRenderManifestV2({
        ...input,
        terrain: { ...input.terrain, structureKey: "design:wrong" },
      }),
    ).toThrow(/does not match the world design/u);
  });
});
