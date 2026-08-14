import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { beforeAll, describe, expect, it } from "vitest";

import type { KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan, type WorldPlan } from "@/lib/kingdom/world-plan";

import { createLandUseWalkObstacles, createWalkNavigationGrid } from "./kingdom-navigation-model";
import {
  createRepositoryWalkInteraction,
  findLivingWalkSpawn,
} from "./kingdom-walk-experience-model";
import {
  createPlannedHamletPathCorridors,
  queryPlannedHamletPathCorridorDistance,
} from "./planned-hamlet-paths";
import { createPlannedLandUse } from "./planned-land-use";
import {
  createPlannedRegionalExperiencePlan,
  isPlannedRegionalExperienceRenderable,
  PLANNED_REGIONAL_EXPERIENCE_BUDGET,
  type PlannedRegionalExperienceInput,
  type PlannedRegionalExperiencePlan,
} from "./planned-regional-experience-model";
import { createPlannedScatter } from "./planned-scatter";
import { classifyPlannedTerrainRegion, queryPlannedWaterDistance } from "./planned-terrain-model";
import { createPlannedVisualEnrichment } from "./planned-visual-enrichment";
import { createPlannedWalkDetailPlan } from "./planned-walk-detail-model";

const NEXTJS_FIXTURE_URL = new URL("./test-fixtures/nextjs-large-world.json", import.meta.url);
const MODEL_SOURCE_URL = new URL("./planned-regional-experience-model.ts", import.meta.url);

let input: PlannedRegionalExperienceInput;
let regional: PlannedRegionalExperiencePlan;
let coldMilliseconds = Number.POSITIVE_INFINITY;

beforeAll(() => {
  const world = JSON.parse(readFileSync(NEXTJS_FIXTURE_URL, "utf8")) as KingdomWorld;
  const plan = createWorldPlan(world);
  const scatter = createPlannedScatter(world, plan);
  const enrichment = createPlannedVisualEnrichment(plan, scatter);
  const landUse = createPlannedLandUse(plan, scatter, enrichment);
  const interaction = createRepositoryWalkInteraction(world, plan, scatter);
  const obstacles = [
    ...[...scatter.buildings, ...scatter.landmarks].map((structure) => ({
      x: structure.transform.position.x,
      z: structure.transform.position.z,
      radius: structure.footprintRadius,
    })),
    ...createLandUseWalkObstacles(landUse),
  ];
  const navigationGrid = createWalkNavigationGrid(plan, obstacles, landUse);
  const livingSpawn = findLivingWalkSpawn(
    plan,
    obstacles,
    interaction.structures,
    interaction.targets,
    landUse,
    navigationGrid,
  );
  const detail = createPlannedWalkDetailPlan(
    plan,
    landUse,
    obstacles,
    interaction.structures,
    interaction.targets,
    { navigationGrid, livingSpawn },
  );
  input = {
    plan,
    landUse,
    scatter,
    enrichment,
    livingSpawn,
    detail,
  };
  const started = performance.now();
  regional = createPlannedRegionalExperiencePlan(input)!;
  coldMilliseconds = performance.now() - started;
}, 45_000);

describe("planned regional Walk experience", () => {
  it("builds an authored spawn-to-settlement-to-water corridor from prepared Walk data", () => {
    expect(regional.schema).toBe("repo-regional-experience/v1");
    expect(regional.route.structureId).toBe(input.livingSpawn?.structureId);
    expect(regional.route.spawn).toEqual(input.livingSpawn?.position);
    expect(regional.route.waterFocus).toEqual(input.livingSpawn?.waterFocus);
    expect(regional.chunks.map((chunk) => [chunk.role, chunk.mount])).toEqual([
      ["arrival-edge", "near"],
      ["settlement-yard", "near"],
      ["waterside-overlook", "far"],
    ]);
    expect(regional.chunks).toHaveLength(3);
    expect(regional.sourceCoverage.landUseIds.length).toBeGreaterThan(0);
    expect(regional.sourceCoverage.scatterIds.length).toBeGreaterThan(0);
    expect(regional.sourceCoverage.enrichmentIds.length).toBeGreaterThan(0);
    expect(regional.sourceCoverage.walkDetailIds.length).toBeGreaterThan(0);
  });

  it("keeps each chunk spatially legible with edge bands, clumps, clear pockets, and landmarks", () => {
    const [arrival, settlement, waterside] = regional.chunks;
    expect(arrival?.composition.edgeBandInstanceCount).toBeGreaterThanOrEqual(8);
    expect(arrival?.composition.clusterCount).toBeGreaterThanOrEqual(6);
    expect(settlement?.composition.clumpInstanceCount).toBeGreaterThanOrEqual(6);
    expect(settlement?.composition.landmarkInstanceCount).toBeGreaterThanOrEqual(5);
    expect(
      (settlement?.composition.roleCounts.fence ?? 0) +
        (settlement?.composition.roleCounts.waylight ?? 0),
    ).toBeGreaterThanOrEqual(4);
    expect(settlement?.composition.roleCounts.waylight).toBeGreaterThanOrEqual(1);
    expect(waterside?.composition.roleCounts.reed).toBeGreaterThanOrEqual(6);
    expect(waterside?.composition.landmarkInstanceCount).toBeGreaterThanOrEqual(3);
    expect(waterside?.composition.roleCounts.waylight).toBeGreaterThanOrEqual(1);

    for (const chunk of regional.chunks) {
      expect(Math.max(chunk.bounds.width, chunk.bounds.depth), chunk.id).toBeGreaterThanOrEqual(16);
      expect(Math.min(chunk.bounds.width, chunk.bounds.depth), chunk.id).toBeGreaterThanOrEqual(4);
      for (const instance of regional.instances.filter(
        (candidate) => candidate.chunkId === chunk.id,
      )) {
        expect(
          Math.hypot(instance.position.x - chunk.center.x, instance.position.z - chunk.center.z),
          instance.id,
        ).toBeGreaterThanOrEqual(chunk.clearPocketRadius);
      }
    }
    expect(new Set(regional.chunks.map((chunk) => chunk.instanceIds.length)).size).toBeGreaterThan(
      1,
    );
    expect(regional.validation.allChunksReadable).toBe(true);
  });

  it("validates terrain contact, dry land, structure clearance, and primary-road clearance", () => {
    expect(regional.validation).toMatchObject({
      allTerrainSafe: true,
      allWaterClear: true,
      allStructuresClear: true,
      allPathsClear: true,
      allContactsAligned: true,
      findings: [],
    });
    const localPathCorridors = createPlannedHamletPathCorridors(input.plan, input.scatter);
    const localPathClearance = {
      grass: 0.28,
      flower: 0.38,
      reed: 0.25,
      stone: 0.42,
      fence: 0.5,
      waylight: 0.18,
    } as const;
    for (const instance of regional.instances) {
      const region = classifyPlannedTerrainRegion(
        input.plan,
        instance.position.x,
        instance.position.z,
      );
      const water = queryPlannedWaterDistance(input.plan, instance.position.x, instance.position.z);
      expect(region.inside, instance.id).toBe(true);
      expect(region.water, instance.id).toBeNull();
      expect(water.signedDistance, instance.id).toBeGreaterThanOrEqual(0.2 - 0.001);
      expect(instance.position.y, instance.id).toBeCloseTo(region.height + 0.035, 2);
      expect(instance.validation.pathEdgeDistance, instance.id).toBeGreaterThan(0);
      expect(
        queryPlannedHamletPathCorridorDistance(instance.position, localPathCorridors).distance,
        instance.id,
      ).toBeGreaterThanOrEqual(localPathClearance[instance.role] - 0.002);
      expect(instance.validation.minimumStructureClearance, instance.id).toBeGreaterThan(0);
    }
  });

  it("fails closed unless every generated validation gate passes", () => {
    expect(isPlannedRegionalExperienceRenderable(regional)).toBe(true);
    expect(isPlannedRegionalExperienceRenderable(null)).toBe(false);
    expect(isPlannedRegionalExperienceRenderable(undefined)).toBe(false);

    const booleanGates = [
      "allTerrainSafe",
      "allWaterClear",
      "allStructuresClear",
      "allPathsClear",
      "allContactsAligned",
      "allChunksReadable",
      "withinBudget",
    ] as const;
    for (const gate of booleanGates) {
      const invalid = {
        ...regional,
        validation: { ...regional.validation, [gate]: false, findings: [gate] },
      } satisfies PlannedRegionalExperiencePlan;
      expect(isPlannedRegionalExperienceRenderable(invalid), gate).toBe(false);
    }
    expect(
      isPlannedRegionalExperienceRenderable({
        ...regional,
        validation: { ...regional.validation, findings: ["synthetic-invalid-plan"] },
      }),
    ).toBe(false);
  });

  it("stays inside strict per-mount and aggregate renderer budgets", () => {
    expect(regional.mounts.near.instances).toBeLessThanOrEqual(
      PLANNED_REGIONAL_EXPERIENCE_BUDGET.maximumInstances.near,
    );
    expect(regional.mounts.far.instances).toBeLessThanOrEqual(
      PLANNED_REGIONAL_EXPERIENCE_BUDGET.maximumInstances.far,
    );
    expect(regional.mounts.near.drawCalls).toBeLessThanOrEqual(
      PLANNED_REGIONAL_EXPERIENCE_BUDGET.maximumDrawCalls.near,
    );
    expect(regional.mounts.far.drawCalls).toBeLessThanOrEqual(
      PLANNED_REGIONAL_EXPERIENCE_BUDGET.maximumDrawCalls.far,
    );
    expect(regional.mounts.near.drawCalls).toBe(2);
    expect(regional.mounts.far.drawCalls).toBe(1);
    expect(regional.mounts.near.drawCalls + regional.mounts.far.drawCalls).toBe(3);
    expect(regional.mounts.near.triangles).toBeLessThanOrEqual(
      PLANNED_REGIONAL_EXPERIENCE_BUDGET.maximumTriangles.near,
    );
    expect(regional.mounts.far.triangles).toBeLessThanOrEqual(
      PLANNED_REGIONAL_EXPERIENCE_BUDGET.maximumTriangles.far,
    );
    expect(regional.mounts.near.triangles + regional.mounts.far.triangles).toBeLessThanOrEqual(
      20_000,
    );
    expect(regional.validation.withinBudget).toBe(true);
  });

  it("is deterministic, season-invariant by geometry ID, and below the 20ms cold ceiling", () => {
    const repeated = createPlannedRegionalExperiencePlan(input)!;
    const seasonalPlan = {
      ...input.plan,
      appearance: { ...input.plan.appearance, season: "winter" as const },
    } satisfies WorldPlan;
    const seasonal = createPlannedRegionalExperiencePlan({ ...input, plan: seasonalPlan })!;

    expect(repeated).toEqual(regional);
    expect(seasonal.instances.map((instance) => instance.geometryId)).toEqual(
      regional.instances.map((instance) => instance.geometryId),
    );
    expect(
      regional.instances.every((instance) =>
        instance.geometryId.startsWith(input.plan.placementKey),
      ),
    ).toBe(true);
    expect(seasonal.chunks.map((chunk) => chunk.id)).toEqual(
      regional.chunks.map((chunk) => chunk.id),
    );
    expect(coldMilliseconds).toBeLessThan(20);
  });

  it("rejects incoherent prepared Walk inputs before regional sampling", () => {
    expect(() =>
      createPlannedRegionalExperiencePlan({
        ...input,
        detail: {
          ...input.detail,
          waterFocus: { x: input.detail.waterFocus!.x + 1, z: input.detail.waterFocus!.z },
        },
      }),
    ).toThrowError("prepared detail and living spawn to agree");
  });

  it("does not import or call navigation preparation", () => {
    const source = readFileSync(MODEL_SOURCE_URL, "utf8");
    expect(source).not.toContain("createWalkNavigationGrid");
    expect(source).not.toContain("findLivingWalkSpawn");
    expect(source).not.toContain("findWalkSpawn");
    expect(source).not.toContain("navigationGrid");
    expect(source).not.toContain("useFrame");
  });
});
