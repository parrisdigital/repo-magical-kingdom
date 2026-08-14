import { readFileSync } from "node:fs";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import {
  addWalkNavigationGridObstacles,
  createLandUseWalkObstacles,
  createPlannedRegionalWalkObstacles,
  createWalkNavigationGrid,
  walkNavigationGridAllows,
  type WalkObstacle,
} from "./kingdom-navigation-model";
import {
  createRepositoryWalkInteraction,
  findLivingWalkSpawn,
} from "./kingdom-walk-experience-model";
import { createPlannedLandUse } from "./planned-land-use";
import {
  createPlannedRegionalExperiencePlan,
  isPlannedRegionalExperienceRenderable,
} from "./planned-regional-experience-model";
import { createPlannedScatter } from "./planned-scatter";
import { createPlannedVisualEnrichment } from "./planned-visual-enrichment";
import { createPlannedWalkDetailPlan } from "./planned-walk-detail-model";
import {
  createPlannedWalkRuntimePlan,
  plannedWalkRuntimeKey,
  type PlannedWalkRuntimeInput,
  type PlannedWalkRuntimePlan,
} from "./planned-walk-runtime-model";
import {
  PLANNED_WALK_RUNTIME_WORKER_SCHEMA,
  type PlannedWalkRuntimeWorkerRequest,
  type PlannedWalkRuntimeWorkerResponse,
} from "./planned-walk-runtime-protocol";
import {
  clearPlannedWalkRuntimeCacheForTests,
  getCachedPlannedWalkRuntime,
  preparePlannedWalkRuntime,
  type WalkRuntimeWorkerFactory,
} from "./use-planned-walk-runtime";

const WORKER_SOURCE = readFileSync(
  new URL("./planned-walk-runtime.worker.ts", import.meta.url),
  "utf8",
);
const CLIENT_SOURCE = readFileSync(
  new URL("./use-planned-walk-runtime.ts", import.meta.url),
  "utf8",
);
const SCENE_SOURCE = readFileSync(new URL("./kingdom-scene-planned.tsx", import.meta.url), "utf8");

let input: PlannedWalkRuntimeInput;
let runtime: PlannedWalkRuntimePlan;

beforeAll(() => {
  const world = createDemoKingdom("summer", "enchanted-forest");
  const plan = createWorldPlan(world);
  const scatter = createPlannedScatter(world, plan);
  const enrichment = createPlannedVisualEnrichment(plan, scatter);
  const landUse = createPlannedLandUse(plan, scatter, enrichment);
  const interaction = createRepositoryWalkInteraction(world, plan, scatter);
  const obstacles: WalkObstacle[] = [
    ...[...scatter.buildings, ...scatter.landmarks].map((structure) => ({
      x: structure.transform.position.x,
      z: structure.transform.position.z,
      radius: structure.footprintRadius,
    })),
    ...createLandUseWalkObstacles(landUse),
  ];
  input = {
    plan,
    landUse,
    scatter,
    enrichment,
    obstacles,
    structures: interaction.structures,
    targets: interaction.targets.map(({ id, x, y, z }) => ({ id, x, y, z })),
  };
  runtime = createPlannedWalkRuntimePlan(input);
}, 30_000);

beforeEach(() => {
  clearPlannedWalkRuntimeCacheForTests();
});

describe("planned Walk runtime preparation", () => {
  it("preserves preparation parity and applies validated regional collision without mutation", () => {
    const baseNavigationGrid = createWalkNavigationGrid(input.plan, input.obstacles, input.landUse);
    const livingSpawn = findLivingWalkSpawn(
      input.plan,
      input.obstacles,
      input.structures,
      input.targets,
      input.landUse,
      baseNavigationGrid,
    );
    const preparedDetail = createPlannedWalkDetailPlan(
      input.plan,
      input.landUse,
      input.obstacles,
      input.structures,
      input.targets,
      { navigationGrid: baseNavigationGrid, livingSpawn },
    );
    const regionalCandidate = createPlannedRegionalExperiencePlan({
      plan: input.plan,
      landUse: input.landUse,
      scatter: input.scatter,
      enrichment: input.enrichment,
      livingSpawn,
      detail: preparedDetail,
    });
    const regional = isPlannedRegionalExperienceRenderable(regionalCandidate)
      ? regionalCandidate
      : null;
    const regionalObstacles = regional ? createPlannedRegionalWalkObstacles(regional) : [];
    const augmentedGrid =
      regionalObstacles.length > 0
        ? addWalkNavigationGridObstacles(baseNavigationGrid, regionalObstacles)
        : baseNavigationGrid;
    const expectedRegional =
      regional &&
      (!livingSpawn ||
        walkNavigationGridAllows(augmentedGrid, livingSpawn.position.x, livingSpawn.position.z))
        ? regional
        : null;
    const representedDetailIds = new Set(expectedRegional?.sourceCoverage.walkDetailIds ?? []);

    expect(runtime.schema).toBe("repo-walk-runtime/v2");
    expect(runtime.key).toBe(plannedWalkRuntimeKey(input));
    expect(runtime.livingSpawn).toEqual(livingSpawn);
    expect(runtime.regional).toEqual(expectedRegional);
    expect(runtime.navigationGrid).toEqual(expectedRegional ? augmentedGrid : baseNavigationGrid);
    expect(runtime.detail).toEqual(
      expectedRegional
        ? {
            ...preparedDetail,
            instances: preparedDetail.instances.filter(
              (instance) => !representedDetailIds.has(instance.id),
            ),
          }
        : preparedDetail,
    );
    expect(baseNavigationGrid.obstacles).toEqual(input.obstacles);
    if (livingSpawn) {
      expect(
        walkNavigationGridAllows(
          runtime.navigationGrid,
          livingSpawn.position.x,
          livingSpawn.position.z,
        ),
      ).toBe(true);
    }
  }, 30_000);

  it("keys reuse by topology and placement while guarding exact dependencies", () => {
    const key = plannedWalkRuntimeKey(input);
    const clonedInput = structuredClone(input);
    expect(key).toContain(input.plan.topologyKey);
    expect(key).toContain(input.plan.placementKey);
    expect(plannedWalkRuntimeKey(clonedInput)).toBe(key);
    expect(Object.keys(clonedInput.targets[0] ?? {}).sort()).toEqual(["id", "x", "y", "z"]);
    expect(
      plannedWalkRuntimeKey({
        ...input,
        plan: {
          ...input.plan,
          appearance: { ...input.plan.appearance, season: "winter" },
        },
      }),
    ).toBe(key);
    expect(
      plannedWalkRuntimeKey({
        ...input,
        obstacles: input.obstacles.map((obstacle, index) =>
          index === 0 ? { ...obstacle, radius: obstacle.radius + 0.01 } : obstacle,
        ),
      }),
    ).not.toBe(key);
    expect(
      plannedWalkRuntimeKey({
        ...input,
        enrichment: {
          ...input.enrichment,
          meadowDetails: input.enrichment.meadowDetails.map((detail, index) =>
            index === 0
              ? { ...detail, position: { ...detail.position, x: detail.position.x + 0.01 } }
              : detail,
          ),
        },
      }),
    ).not.toBe(key);
  });

  it("shares one in-flight worker request and reuses its bounded resolved cache", async () => {
    const terminate = vi.fn();
    const factory = vi.fn<WalkRuntimeWorkerFactory>(() => {
      const worker: ReturnType<WalkRuntimeWorkerFactory> = {
        onmessage: null,
        onmessageerror: null,
        onerror: null,
        terminate,
        postMessage(message: PlannedWalkRuntimeWorkerRequest) {
          queueMicrotask(() => {
            const response: PlannedWalkRuntimeWorkerResponse = {
              schema: PLANNED_WALK_RUNTIME_WORKER_SCHEMA,
              requestId: message.requestId,
              ok: true,
              result: runtime,
            };
            worker.onmessage?.({
              data: response,
            } as MessageEvent<PlannedWalkRuntimeWorkerResponse>);
          });
        },
      };
      return worker;
    });

    const first = preparePlannedWalkRuntime(input, factory);
    const second = preparePlannedWalkRuntime(input, factory);
    expect(first).toBe(second);
    await expect(first).resolves.toBe(runtime);
    expect(factory).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledOnce();
    expect(getCachedPlannedWalkRuntime(runtime.key)).toBe(runtime);
    await expect(preparePlannedWalkRuntime(input, factory)).resolves.toBe(runtime);
    expect(factory).toHaveBeenCalledOnce();
  });

  it("uses a Next-compatible module worker, transfers the grids, and never falls back synchronously", () => {
    expect(CLIENT_SOURCE).toContain(
      'new Worker(new URL("./planned-walk-runtime.worker.ts", import.meta.url)',
    );
    expect(CLIENT_SOURCE).toContain('type: "module"');
    expect(CLIENT_SOURCE).not.toContain("createPlannedWalkRuntimePlan(");
    expect(WORKER_SOURCE).toContain("createPlannedWalkRuntimePlan(data.input)");
    expect(WORKER_SOURCE).toContain("result.navigationGrid.allowed.buffer");
    expect(WORKER_SOURCE).toContain("result.navigationGrid.heights.buffer");
    expect(SCENE_SOURCE.indexOf("usePreparedPlannedWalkRuntime(")).toBeLessThan(
      SCENE_SOURCE.lastIndexOf('navigationMode === "walk" ? ('),
    );
    expect(SCENE_SOURCE).toContain("Preparing walkable world…");
    expect(SCENE_SOURCE).toContain('preparedWalkRuntime.status === "ready"');
    expect(SCENE_SOURCE).toContain(
      "walkInteraction.targets.map(({ id, x, y, z }) => ({ id, x, y, z }))",
    );
  });
});
