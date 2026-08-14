import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { clearPlannedLandUseCacheForTests, createPlannedLandUse } from "./planned-land-use";
import {
  buildPlannedLandUseGeometryBundle,
  disposePlannedLandUseGeometryBundle,
} from "./planned-land-use-layer";
import {
  assertPlannedSceneRenderBudget,
  estimatePlannedSceneRenderBudget,
  PLANNED_SCENE_DESKTOP_ARCHITECTURE_TARGET,
  SHIPPED_GLTF_RENDER_STATS,
} from "./planned-render-budget";
import { clearPlannedScatterTopologyCacheForTests, createPlannedScatter } from "./planned-scatter";
import {
  PLANNED_THEME_LOD_CONTRACT,
  plannedThemeTreeTrianglesPerInstance,
} from "./planned-theme-lod";
import { PLANNED_TREE_LOD_CONTRACT, plannedTreeLodPaletteFor } from "./planned-tree-lod";
import { createPlannedVisualEnrichment } from "./planned-visual-enrichment";
import { createPlannedWorldThemeLayer } from "./planned-world-theme-model";

const NEXTJS_FIXTURE_URL = new URL("./test-fixtures/nextjs-large-world.json", import.meta.url);
const SCENE_SOURCE_URL = new URL("./kingdom-scene-planned.tsx", import.meta.url);

type GltfAccessor = Readonly<{ count: number }>;
type GltfPrimitive = Readonly<{
  indices?: number;
  attributes: Readonly<{ POSITION: number }>;
  mode?: number;
}>;
type Gltf = Readonly<{
  scene?: number;
  scenes?: ReadonlyArray<Readonly<{ nodes?: ReadonlyArray<number> }>>;
  nodes?: ReadonlyArray<Readonly<{ mesh?: number; children?: ReadonlyArray<number> }>>;
  meshes?: ReadonlyArray<Readonly<{ primitives?: ReadonlyArray<GltfPrimitive> }>>;
  accessors?: ReadonlyArray<GltfAccessor>;
}>;

function readGlbJson(path: string): Gltf {
  const buffer = readFileSync(path);
  expect(buffer.toString("ascii", 0, 4)).toBe("glTF");
  expect(buffer.readUInt32LE(4)).toBe(2);
  let offset = 12;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === "JSON") {
      return JSON.parse(
        buffer.toString("utf8", offset + 8, offset + 8 + length).replace(/[\0 ]+$/u, ""),
      ) as Gltf;
    }
    offset += 8 + length;
  }
  throw new Error(`${path} has no GLB JSON chunk.`);
}

function sceneAssetStats(gltf: Gltf): Readonly<{ sourcePrimitives: number; triangles: number }> {
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  const roots = scene?.nodes ?? [];
  let sourcePrimitives = 0;
  let triangles = 0;
  const visit = (nodeIndex: number) => {
    const node = gltf.nodes?.[nodeIndex];
    if (!node) throw new Error(`Missing GLB scene node ${nodeIndex}.`);
    if (node.mesh !== undefined) {
      const primitives = gltf.meshes?.[node.mesh]?.primitives ?? [];
      for (const primitive of primitives) {
        expect(primitive.mode ?? 4).toBe(4);
        const accessorIndex = primitive.indices ?? primitive.attributes.POSITION;
        const count = gltf.accessors?.[accessorIndex]?.count;
        if (count === undefined) throw new Error(`Missing GLB accessor ${accessorIndex}.`);
        sourcePrimitives += 1;
        triangles += Math.floor(count / 3);
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  for (const root of roots) visit(root);
  return { sourcePrimitives, triangles };
}

function capturedNextScene(
  worldTheme?: KingdomWorld["worldTheme"],
  season?: KingdomWorld["season"],
) {
  clearPlannedScatterTopologyCacheForTests();
  clearPlannedLandUseCacheForTests();
  const source = JSON.parse(readFileSync(NEXTJS_FIXTURE_URL, "utf8")) as KingdomWorld;
  const world: KingdomWorld = {
    ...source,
    ...(worldTheme ? { worldTheme } : {}),
    ...(season ? { season } : {}),
  };
  const plan = createWorldPlan(world);
  const scatter = createPlannedScatter(world, plan);
  const enrichment = createPlannedVisualEnrichment(plan, scatter);
  const landUse = createPlannedLandUse(plan, scatter, enrichment);
  return { world, plan, scatter, enrichment, landUse };
}

function overviewTreePalettes(input: ReturnType<typeof capturedNextScene>) {
  const theme = createPlannedWorldThemeLayer(input.plan, input.scatter);
  const ancientTreeIds = new Set(theme.ancientTreeIds);
  return [
    ...input.scatter.trees.map((tree) =>
      plannedTreeLodPaletteFor(input.plan.appearance.season, {
        paletteRole: tree.paletteRole,
        ancient: ancientTreeIds.has(tree.id),
      }),
    ),
    ...input.enrichment.supplementalTrees.map((tree) =>
      plannedTreeLodPaletteFor(input.plan.appearance.season, {
        paletteRole: tree.paletteRole,
        ancient: false,
      }),
    ),
  ];
}

function expectedOverviewTreeTriangles(input: ReturnType<typeof capturedNextScene>): number {
  return overviewTreePalettes(input).reduce(
    (total, palette) =>
      total + plannedThemeTreeTrianglesPerInstance(input.plan.worldTheme, palette),
    0,
  );
}

function previousOverviewTreeTriangles(input: ReturnType<typeof capturedNextScene>): number {
  return overviewTreePalettes(input).reduce(
    (total, palette) =>
      total + PLANNED_TREE_LOD_CONTRACT.overviewTrianglesPerInstanceByPalette[palette],
    0,
  );
}

describe("planned whole-scene renderer budget", () => {
  it("pins the count-sensitive renderer seams mirrored by the pure estimator", () => {
    const source = readFileSync(SCENE_SOURCE_URL, "utf8");
    for (const contractLine of [
      "template.primitives.map((primitive)",
      "const groups = useMemo(() => createArchitectureGroups(scatter, plan)",
      "const overviewTrees = useMemo(",
      "createPlannedThemeTreeLodGeometry(batch.palette, plan.worldTheme)",
      "createPlannedEnchantedOrbitGeometry(layer)",
      '"enchanted-runestone-glows-walk-batch"',
      '"enchanted-root-arches-walk-batch"',
      "createPlannedHamletPathBatch(plan, scatter)",
      "new PlannedScenePickProxy(records)",
      "<OverviewWildlifeRoleBatch",
      "<WalkWildlifeRoleBatch",
      "createPlannedWalkWildlifeLodGeometry(role)",
      "<AnimalActor",
      "<torusGeometry args={[1.55, 0.19, 10, 32]} />",
      "<circleGeometry args={[1.3, 32]} />",
    ]) {
      expect(source).toContain(contractLine);
    }
  });

  it("pins source primitives and triangles to every shipped renderer GLB", () => {
    expect(Object.keys(SHIPPED_GLTF_RENDER_STATS)).toHaveLength(69);
    for (const [url, expected] of Object.entries(SHIPPED_GLTF_RENDER_STATS)) {
      const gltf = readGlbJson(resolve(process.cwd(), "public", url.slice(1)));
      expect(sceneAssetStats(gltf), url).toEqual(expected);
    }
  });

  it("reports the honest captured Next.js overview within the desktop architecture budget", () => {
    const input = capturedNextScene();
    const estimate = estimatePlannedSceneRenderBudget({ ...input, quality: "high" });
    const landUseGeometry = buildPlannedLandUseGeometryBundle(input.plan, input.landUse);
    const landUseConsumer = estimate.consumers.find(
      (consumer) => consumer.id === "land-use.surfaces",
    );
    const walkEstimate = estimatePlannedSceneRenderBudget({
      ...input,
      quality: "high",
      navigationMode: "walk",
    });
    expect(landUseConsumer).toMatchObject({
      mainPassDrawCalls: landUseGeometry.surfaceDrawCallCount,
      visibleTriangles: landUseGeometry.generatedTriangleCount,
    });
    expect(estimate.lowerBound).toEqual({
      mainPassDrawCalls: 93,
      visibleTriangles: 131_418,
    });
    expect(estimate.estimated).toEqual({
      mainPassDrawCalls: 139,
      visibleTriangles: 683_035,
      shadowPassDrawCalls: 67,
      shadowTriangles: 481_782,
      wholeFrameDrawCalls: 206,
      wholeFrameTriangles: 1_164_817,
    });
    expect(estimate.projectedAfterBoundedBatching).toMatchObject({
      mainPassDrawCalls: 93,
      visibleTriangles: 683_035,
      withinBudget: true,
    });
    expect(estimate.triangleReductionPlan).toEqual({
      consumerId: "vegetation.trees",
      currentInstances: 240,
      currentTriangles: 73_592,
      maximumOverviewTrianglesPerInstance: 400,
      projectedConsumerTriangles: 73_592,
      projectedWholeSceneTriangles: 683_035,
      requiredReduction: 0,
      withinBudget: true,
      note: "The measured procedural overview LOD is active; shipped tree GLBs remain reserved for bounded Walk detail.",
    });
    expect(estimate.violations).toEqual([]);
    expect(estimate.consumers.find((consumer) => consumer.id === "vegetation.trees")).toMatchObject(
      {
        mainPassDrawCalls: 6,
        visibleTriangles: 73_592,
        shadowPassDrawCalls: 6,
        shadowTriangles: 73_592,
        assetInstances: 240,
        assetSourceBatches: 3,
      },
    );
    expect(estimate.withinBudget).toBe(true);
    expect(() => assertPlannedSceneRenderBudget(estimate)).not.toThrow();

    expect(
      walkEstimate.consumers.find((consumer) => consumer.id === "vegetation.trees"),
    ).toMatchObject({
      mainPassDrawCalls: 6,
      visibleTriangles: 89_592,
      assetInstances: 240,
      assetSourceBatches: 3,
    });
    expect(
      walkEstimate.consumers.find((consumer) => consumer.id === "wildlife.actors"),
    ).toMatchObject({
      mainPassDrawCalls: 9,
      visibleTriangles: 6_366,
      assetInstances: 12,
      assetSourceBatches: 4,
    });
    expect(walkEstimate.estimated).toEqual({
      mainPassDrawCalls: 138,
      visibleTriangles: 720_635,
      shadowPassDrawCalls: 62,
      shadowTriangles: 506_954,
      wholeFrameDrawCalls: 200,
      wholeFrameTriangles: 1_227_589,
    });
    expect(
      walkEstimate.consumers.find((consumer) => consumer.id === "walk-detail.soft"),
    ).toMatchObject({
      mainPassDrawCalls: 2,
      visibleTriangles: 11_160,
      shadowPassDrawCalls: 0,
    });
    expect(
      walkEstimate.consumers.find((consumer) => consumer.id === "walk-detail.solid"),
    ).toMatchObject({
      mainPassDrawCalls: 2,
      visibleTriangles: 34_200,
      shadowPassDrawCalls: 2,
    });
    expect(
      walkEstimate.consumers.find((consumer) => consumer.id === "regional-experience.far"),
    ).toMatchObject({ mainPassDrawCalls: 1, visibleTriangles: 1_256, shadowPassDrawCalls: 0 });
    expect(
      walkEstimate.consumers.find((consumer) => consumer.id === "regional-experience.near"),
    ).toMatchObject({ mainPassDrawCalls: 2, visibleTriangles: 2_464, shadowPassDrawCalls: 2 });
    expect(walkEstimate.withinBudget).toBe(true);
    expect(walkEstimate.violations).toEqual([]);
    expect(() => assertPlannedSceneRenderBudget(walkEstimate)).not.toThrow();
    disposePlannedLandUseGeometryBundle(landUseGeometry);
  }, 10_000);

  it("keeps both themes and all seasons within the actual Orbit budget with selection active", () => {
    const topologyKeysByTheme = new Map<KingdomWorld["worldTheme"], Set<string>>();
    const themeFeatureTopologies = new Map<KingdomWorld["worldTheme"], Set<string>>();
    const exactMatrix: Array<{
      theme: KingdomWorld["worldTheme"];
      season: KingdomWorld["season"];
      before: Readonly<{ draws: number; triangles: number }>;
      after: Readonly<{ draws: number; triangles: number }>;
      selected: Readonly<{ draws: number; triangles: number }>;
    }> = [];
    for (const worldTheme of ["kingdom-valley", "enchanted-forest"] as const) {
      const topologyKeys = new Set<string>();
      const featureTopologies = new Set<string>();
      topologyKeysByTheme.set(worldTheme, topologyKeys);
      themeFeatureTopologies.set(worldTheme, featureTopologies);
      for (const season of ["spring", "summer", "autumn", "winter"] as const) {
        const input = capturedNextScene(worldTheme, season);
        topologyKeys.add(input.plan.topologyKey);
        const estimate = estimatePlannedSceneRenderBudget({
          ...input,
          quality: "high",
          navigationMode: "orbit",
        });
        const selected = estimatePlannedSceneRenderBudget({
          ...input,
          quality: "high",
          navigationMode: "orbit",
          selectionMarkerActive: true,
        });
        const label = `${worldTheme}/${season}`;
        for (const candidate of [estimate, selected]) {
          expect(candidate.estimated.mainPassDrawCalls, `${label} draws`).toBeLessThanOrEqual(
            PLANNED_SCENE_DESKTOP_ARCHITECTURE_TARGET.maximumMainPassDrawCalls,
          );
          expect(candidate.estimated.visibleTriangles, `${label} triangles`).toBeLessThanOrEqual(
            PLANNED_SCENE_DESKTOP_ARCHITECTURE_TARGET.maximumVisibleTriangles,
          );
          expect(candidate.withinBudget, label).toBe(true);
          expect(candidate.violations, label).toEqual([]);
          expect(() => assertPlannedSceneRenderBudget(candidate), label).not.toThrow();
        }
        expect(selected.estimated.mainPassDrawCalls - estimate.estimated.mainPassDrawCalls).toBe(1);
        expect(selected.estimated.visibleTriangles - estimate.estimated.visibleTriangles).toBe(80);

        const tree = estimate.consumers.find((consumer) => consumer.id === "vegetation.trees");
        expect(tree, `${label} tree consumer`).toMatchObject({
          assetInstances: input.scatter.trees.length + input.enrichment.supplementalTrees.length,
          visibleTriangles: expectedOverviewTreeTriangles(input),
        });
        const theme = createPlannedWorldThemeLayer(input.plan, input.scatter);
        featureTopologies.add(
          JSON.stringify({
            ancientTreeIds: theme.ancientTreeIds,
            runestones: theme.runestones,
            mushrooms: theme.mushrooms,
            rootArches: theme.rootArches,
            fireflies: theme.fireflies,
          }),
        );
        exactMatrix.push({
          theme: worldTheme,
          season,
          before: {
            draws:
              estimate.estimated.mainPassDrawCalls +
              (worldTheme === "enchanted-forest"
                ? Math.max(0, theme.runestones.length - 1) +
                  Math.max(0, theme.rootArches.length - 1)
                : 0),
            triangles:
              estimate.estimated.visibleTriangles -
              expectedOverviewTreeTriangles(input) +
              previousOverviewTreeTriangles(input),
          },
          after: {
            draws: estimate.estimated.mainPassDrawCalls,
            triangles: estimate.estimated.visibleTriangles,
          },
          selected: {
            draws: selected.estimated.mainPassDrawCalls,
            triangles: selected.estimated.visibleTriangles,
          },
        });
        if (worldTheme === "kingdom-valley") {
          expect(estimate.consumers.some((consumer) => consumer.id.startsWith("theme."))).toBe(
            false,
          );
          continue;
        }

        expect(
          estimate.consumers.find((consumer) => consumer.id === "theme.runestone-glows"),
        ).toMatchObject({
          logicalItems: theme.runestones.length,
          mainPassDrawCalls: PLANNED_THEME_LOD_CONTRACT.maximumOrbitDrawCallsPerRepeatedFeature,
          visibleTriangles:
            theme.runestones.length * PLANNED_THEME_LOD_CONTRACT.runestoneGlowTrianglesPerInstance,
        });
        expect(
          estimate.consumers.find((consumer) => consumer.id === "theme.root-arches"),
        ).toMatchObject({
          logicalItems: theme.rootArches.length,
          mainPassDrawCalls: PLANNED_THEME_LOD_CONTRACT.maximumOrbitDrawCallsPerRepeatedFeature,
          visibleTriangles:
            theme.rootArches.length * PLANNED_THEME_LOD_CONTRACT.rootArchTrianglesPerInstance,
        });
        expect(
          estimate.consumers.find((consumer) => consumer.id === "theme.mushrooms"),
        ).toMatchObject({
          kind: "batched-assets",
          assetInstances: theme.mushrooms.length,
          mainPassDrawCalls:
            SHIPPED_GLTF_RENDER_STATS["/assets/world/quaternius/nature/Mushroom_Common.glb"]!
              .sourcePrimitives,
          visibleTriangles:
            theme.mushrooms.length *
            SHIPPED_GLTF_RENDER_STATS["/assets/world/quaternius/nature/Mushroom_Common.glb"]!
              .triangles,
        });
        expect(
          estimate.consumers.find((consumer) => consumer.id === "theme.fireflies"),
        ).toMatchObject({ kind: "points", mainPassDrawCalls: 1 });
      }
      expect(topologyKeys.size, `${worldTheme} season topology`).toBe(1);
      expect(featureTopologies.size, `${worldTheme} season feature topology`).toBe(1);
    }
    expect(topologyKeysByTheme.size).toBe(2);
    expect(themeFeatureTopologies.size).toBe(2);
    expect(exactMatrix).toEqual([
      {
        theme: "kingdom-valley",
        season: "spring",
        before: { draws: 139, triangles: 683_035 },
        after: { draws: 139, triangles: 683_035 },
        selected: { draws: 140, triangles: 683_115 },
      },
      {
        theme: "kingdom-valley",
        season: "summer",
        before: { draws: 142, triangles: 688_943 },
        after: { draws: 142, triangles: 688_943 },
        selected: { draws: 143, triangles: 689_023 },
      },
      {
        theme: "kingdom-valley",
        season: "autumn",
        before: { draws: 141, triangles: 681_605 },
        after: { draws: 141, triangles: 681_605 },
        selected: { draws: 142, triangles: 681_685 },
      },
      {
        theme: "kingdom-valley",
        season: "winter",
        before: { draws: 132, triangles: 619_201 },
        after: { draws: 132, triangles: 619_201 },
        selected: { draws: 133, triangles: 619_281 },
      },
      {
        theme: "enchanted-forest",
        season: "spring",
        before: { draws: 154, triangles: 721_455 },
        after: { draws: 144, triangles: 672_015 },
        selected: { draws: 145, triangles: 672_095 },
      },
      {
        theme: "enchanted-forest",
        season: "summer",
        before: { draws: 157, triangles: 727_363 },
        after: { draws: 147, triangles: 677_923 },
        selected: { draws: 148, triangles: 678_003 },
      },
      {
        theme: "enchanted-forest",
        season: "autumn",
        before: { draws: 156, triangles: 720_025 },
        after: { draws: 146, triangles: 670_585 },
        selected: { draws: 147, triangles: 670_665 },
      },
      {
        theme: "enchanted-forest",
        season: "winter",
        before: { draws: 147, triangles: 657_621 },
        after: { draws: 137, triangles: 657_621 },
        selected: { draws: 138, triangles: 657_701 },
      },
    ]);
  }, 120_000);

  it("keeps every selected theme and season within the Walk renderer budget", () => {
    const exactMatrix: Array<{
      theme: KingdomWorld["worldTheme"];
      season: KingdomWorld["season"];
      selected: Readonly<{ draws: number; triangles: number }>;
    }> = [];
    for (const worldTheme of ["kingdom-valley", "enchanted-forest"] as const) {
      for (const season of ["spring", "summer", "autumn", "winter"] as const) {
        const input = capturedNextScene(worldTheme, season);
        const selected = estimatePlannedSceneRenderBudget({
          ...input,
          quality: "high",
          navigationMode: "walk",
          selectionMarkerActive: true,
        });
        const label = `${worldTheme}/${season}`;
        expect(selected.estimated.mainPassDrawCalls, `${label} draws`).toBeLessThanOrEqual(
          PLANNED_SCENE_DESKTOP_ARCHITECTURE_TARGET.maximumMainPassDrawCalls,
        );
        expect(selected.estimated.visibleTriangles, `${label} triangles`).toBeLessThanOrEqual(
          PLANNED_SCENE_DESKTOP_ARCHITECTURE_TARGET.maximumVisibleTriangles,
        );
        expect(selected.withinBudget, label).toBe(true);
        expect(selected.violations, label).toEqual([]);
        expect(() => assertPlannedSceneRenderBudget(selected), label).not.toThrow();
        expect(
          selected.consumers.find((consumer) => consumer.id === "wildlife.actors"),
          `${label} wildlife`,
        ).toMatchObject({
          mainPassDrawCalls: 9,
          visibleTriangles: 6_366,
          assetInstances: input.scatter.wildlife.length,
          assetSourceBatches: 4,
        });
        exactMatrix.push({
          theme: worldTheme,
          season,
          selected: {
            draws: selected.estimated.mainPassDrawCalls,
            triangles: selected.estimated.visibleTriangles,
          },
        });
      }
    }
    expect(exactMatrix).toEqual([
      {
        theme: "kingdom-valley",
        season: "spring",
        selected: { draws: 139, triangles: 720_715 },
      },
      {
        theme: "kingdom-valley",
        season: "summer",
        selected: { draws: 142, triangles: 726_623 },
      },
      {
        theme: "kingdom-valley",
        season: "autumn",
        selected: { draws: 141, triangles: 719_285 },
      },
      {
        theme: "kingdom-valley",
        season: "winter",
        selected: { draws: 134, triangles: 656_881 },
      },
      {
        theme: "enchanted-forest",
        season: "spring",
        selected: { draws: 144, triangles: 709_695 },
      },
      {
        theme: "enchanted-forest",
        season: "summer",
        selected: { draws: 147, triangles: 715_603 },
      },
      {
        theme: "enchanted-forest",
        season: "autumn",
        selected: { draws: 146, triangles: 708_265 },
      },
      {
        theme: "enchanted-forest",
        season: "winter",
        selected: { draws: 139, triangles: 695_301 },
      },
    ]);
  }, 120_000);

  it("keeps bounded near-detail trees and full-count batched root/glow geometry in Walk", () => {
    const input = capturedNextScene("enchanted-forest", "spring");
    const theme = createPlannedWorldThemeLayer(input.plan, input.scatter);
    const walk = estimatePlannedSceneRenderBudget({
      ...input,
      quality: "high",
      navigationMode: "walk",
    });

    expect(walk.consumers.find((consumer) => consumer.id === "vegetation.trees")?.label).toContain(
      "Walk near-detail",
    );
    expect(
      walk.consumers.find((consumer) => consumer.id === "theme.runestone-glows"),
    ).toMatchObject({
      logicalItems: theme.runestones.length,
      mainPassDrawCalls: PLANNED_THEME_LOD_CONTRACT.maximumOrbitDrawCallsPerRepeatedFeature,
    });
    expect(walk.consumers.find((consumer) => consumer.id === "theme.root-arches")).toMatchObject({
      logicalItems: theme.rootArches.length,
      mainPassDrawCalls: PLANNED_THEME_LOD_CONTRACT.maximumOrbitDrawCallsPerRepeatedFeature,
    });
    expect(walk.consumers.find((consumer) => consumer.id === "theme.mushrooms")).toMatchObject({
      kind: "batched-assets",
      assetInstances: theme.mushrooms.length,
    });
  }, 20_000);
});
