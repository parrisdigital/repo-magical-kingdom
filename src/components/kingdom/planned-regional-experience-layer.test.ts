import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import {
  createPlannedRegionalMergedGeometry,
  createPlannedRegionalRenderSelection,
  PLANNED_REGIONAL_PROP_ASSET_URL,
  PLANNED_REGIONAL_RENDER_LIMITS,
} from "./planned-regional-experience-layer";
import {
  PLANNED_REGIONAL_ASSET_COSTS,
  PLANNED_REGIONAL_EXPERIENCE_BUDGET,
  type PlannedRegionalAssetInstance,
  type PlannedRegionalAssetRole,
  type PlannedRegionalExperiencePlan,
  type PlannedRegionalMount,
} from "./planned-regional-experience-model";

const LAYER_SOURCE_URL = new URL("./planned-regional-experience-layer.tsx", import.meta.url);
const ROLES: ReadonlyArray<PlannedRegionalAssetRole> = [
  "grass",
  "flower",
  "reed",
  "stone",
  "fence",
  "waylight",
];

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

function instance(
  role: PlannedRegionalAssetRole,
  mount: PlannedRegionalMount,
  index: number,
): PlannedRegionalAssetInstance {
  const geometryId = `regional:${mount}:${role}:${index}`;
  return {
    id: `${geometryId}:spring`,
    geometryId,
    chunkId: `chunk:${mount}`,
    mount,
    role,
    clusterId: `${mount}:${role}:cluster-${index % 8}`,
    composition: role === "grass" || role === "reed" ? "edge-band" : "clump",
    position: {
      x: index * 1.7 + ROLES.indexOf(role) * 0.31,
      y: 0.035,
      z: (mount === "near" ? -8 : 12) + ROLES.indexOf(role) * 1.4,
    },
    rotationY: index * 0.23,
    targetHeight: PLANNED_REGIONAL_ASSET_COSTS[role].baseHeight,
    priority: index < 8 ? 0 : 1,
    sourceIds: [`source:${role}`],
    validation: {
      terrainSafe: true,
      waterClear: true,
      structureClear: true,
      pathClear: true,
      contactAligned: true,
      pathEdgeDistance: 1,
      waterDistance: mount === "far" ? 1.2 : 12,
      minimumStructureClearance: 2,
      slopeDegrees: 4,
    },
  };
}

function regionalFixture(): PlannedRegionalExperiencePlan {
  const instances = (["near", "far"] as const).flatMap((mount) =>
    ROLES.flatMap((role) => Array.from({ length: 32 }, (_, index) => instance(role, mount, index))),
  );
  return {
    schema: "repo-regional-experience/v1",
    key: "regional:test",
    route: {
      spawn: { x: 0, y: 0, z: -8 },
      settlement: { x: 12, y: 0, z: 0 },
      shore: { x: 24, y: 0, z: 12 },
      waterFocus: { x: 28, z: 14 },
      structureId: "structure:test",
    },
    chunks: [],
    instances,
    mounts: {
      near: { instances: 0, drawCalls: 0, triangles: 0 },
      far: { instances: 0, drawCalls: 0, triangles: 0 },
    },
    sourceCoverage: { landUseIds: [], scatterIds: [], enrichmentIds: [], walkDetailIds: [] },
    validation: {
      allTerrainSafe: true,
      allWaterClear: true,
      allStructuresClear: true,
      allPathsClear: true,
      allContactsAligned: true,
      allChunksReadable: true,
      withinBudget: true,
      findings: [],
    },
  };
}

function roleCounts(instances: ReadonlyArray<PlannedRegionalAssetInstance>) {
  return Object.fromEntries(
    ROLES.map((role) => [role, instances.filter((item) => item.role === role).length]),
  );
}

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
  const roots = gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? [];
  let sourcePrimitives = 0;
  let triangles = 0;
  const visit = (nodeIndex: number) => {
    const node = gltf.nodes?.[nodeIndex];
    if (!node) throw new Error(`Missing GLB scene node ${nodeIndex}.`);
    if (node.mesh !== undefined) {
      for (const primitive of gltf.meshes?.[node.mesh]?.primitives ?? []) {
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

describe("planned regional experience renderer", () => {
  it("keeps far to one merged draw and near to two draws within the combined ceiling", () => {
    const regional = regionalFixture();
    const highNear = createPlannedRegionalRenderSelection(regional, "near", "high");
    const highFar = createPlannedRegionalRenderSelection(regional, "far", "high");

    expect(roleCounts(highNear.instances)).toEqual(PLANNED_REGIONAL_RENDER_LIMITS.high.near);
    expect(roleCounts(highFar.instances)).toEqual(PLANNED_REGIONAL_RENDER_LIMITS.high.far);
    expect(highNear.budget.drawCalls).toBe(2);
    expect(highNear.propBatches).toHaveLength(1);
    expect(new Set(highNear.propBatches[0]?.instances.map((item) => item.role))).toEqual(
      new Set(["fence"]),
    );
    expect(highNear.mergedInstances.some((item) => item.role === "waylight")).toBe(true);
    expect(highFar.budget.drawCalls).toBe(1);
    expect(highFar.propBatches).toEqual([]);
    expect(highFar.mergedInstances).toEqual(highFar.instances);

    expect(highNear.budget.drawCalls + highFar.budget.drawCalls).toBe(3);
    expect(highNear.budget.drawCalls + highFar.budget.drawCalls).toBeLessThanOrEqual(
      PLANNED_REGIONAL_EXPERIENCE_BUDGET.maximumDrawCalls.total,
    );
    expect(highNear.budget.triangles + highFar.budget.triangles).toBeLessThanOrEqual(20_000);
  });

  it("selects a genuinely cheaper low tier while retaining authored cluster coverage", () => {
    const regional = regionalFixture();
    for (const mount of ["near", "far"] as const) {
      const high = createPlannedRegionalRenderSelection(regional, mount, "high");
      const low = createPlannedRegionalRenderSelection(regional, mount, "low");
      expect(low.instances.length).toBeLessThan(high.instances.length);
      expect(low.budget.triangles).toBeLessThan(high.budget.triangles);
      expect(low.budget.drawCalls).toBe(high.budget.drawCalls);
      expect(new Set(low.instances.map((item) => item.clusterId)).size).toBeGreaterThanOrEqual(4);
      expect(low.instances.every((item) => item.priority <= 1)).toBe(true);
    }
  });

  it("merges every procedural role into finite colored geometry with a bounded triangle count", () => {
    const plan = createWorldPlan(createDemoKingdom());
    const instances = ROLES.map((role, index) => instance(role, index < 4 ? "near" : "far", index));
    const geometry = createPlannedRegionalMergedGeometry(plan, instances);
    const position = geometry.getAttribute("position");
    const color = geometry.getAttribute("color");
    const emissive = geometry.getAttribute("kingdomRegionalEmissive");
    const triangles = position.count / 3;

    expect(geometry.index).toBeNull();
    expect(triangles).toBe(326);
    expect(triangles).toBeLessThanOrEqual(
      instances.reduce(
        (total, item) => total + PLANNED_REGIONAL_ASSET_COSTS[item.role].triangles,
        0,
      ),
    );
    expect(color.count).toBe(position.count);
    expect(emissive.count).toBe(position.count);
    expect(Array.from(emissive.array)).toContain(1);
    expect(Array.from(emissive.array)).toContain(0);
    expect(geometry.boundingBox).not.toBeNull();
    expect(geometry.boundingSphere).not.toBeNull();
    expect(Number.isFinite(geometry.boundingSphere?.radius)).toBe(true);
    geometry.dispose();
  });

  it("uses the shipped one-primitive fence within the declared prop cost", () => {
    expect(PLANNED_REGIONAL_PROP_ASSET_URL).toBe(
      "/assets/world/quaternius/medieval/Prop_WoodenFence_Single.glb",
    );
    const asset = resolve(
      process.cwd(),
      "public",
      PLANNED_REGIONAL_PROP_ASSET_URL.replace(/^\//u, ""),
    );
    expect(sceneAssetStats(readGlbJson(asset))).toEqual({
      sourcePrimitives: PLANNED_REGIONAL_ASSET_COSTS.fence.sourcePrimitives,
      triangles: PLANNED_REGIONAL_ASSET_COSTS.fence.triangles,
    });
  });

  it("has static allocation, preload, disposal, and explicit mount contracts in source", () => {
    const source = readFileSync(LAYER_SOURCE_URL, "utf8");
    expect(source).toContain("useGLTF.preload(PLANNED_REGIONAL_PROP_ASSET_URL)");
    expect(source).toContain("mergeGeometries(transformed, false)");
    expect(source).toContain("createPlannedWalkDetailGeometry(instance.role)");
    expect(source).toContain("geometry.computeBoundingSphere()");
    expect(source).toContain("geometry.dispose()");
    expect(source).toContain("material.dispose()");
    expect(source).toContain("repo-regional-waylight-emission/v1");
    expect(source).toContain("vKingdomRegionalEmissive");
    expect(source).not.toContain('emissive: mount === "far"');
    expect(source).toContain("dispose={null}");
    expect(source).toContain("mount: PlannedRegionalMount");
    expect(source).toContain('mount === "far" ? selected');
    expect(source.match(/<instancedMesh/gu)).toHaveLength(1);
    expect(source).not.toContain("useFrame(");
    expect(source).not.toContain("createWalkNavigationGrid");
    expect(source).not.toContain("findLivingWalkSpawn");
  });
});
