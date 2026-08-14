import { readFileSync } from "node:fs";

import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import { createWorldPlan } from "@/lib/kingdom/world-plan";
import { createRepoSemanticGraphV2 } from "@/lib/kingdom-v2/repo-semantic-graph-v2";
import {
  createTerrainArtifactV2,
  createTerrainArtifactV2PreviewMeshData,
  type TerrainArtifactV2,
} from "@/lib/kingdom-v2/terrain-artifact-v2";
import { createWorldDesignSpecV3 } from "@/lib/kingdom-v2/world-design-spec-v3";

import {
  createTerrainV2PreviewResources,
  createTerrainV2PreviewVertexColors,
  disposeTerrainV2PreviewResources,
  TERRAIN_V2_DEFAULT_PROCEDURAL_PALETTE,
  type TerrainV2PreviewResources,
} from "./terrain-v2-layer";

const SOURCE = readFileSync(new URL("./terrain-v2-layer.tsx", import.meta.url), "utf8");

function createArtifact(): TerrainArtifactV2 {
  const world = createDemoKingdom("summer", "enchanted-forest");
  const plan = createWorldPlan(world);
  const design = createWorldDesignSpecV3(world, plan, createRepoSemanticGraphV2(world));
  return createTerrainArtifactV2({ plan, design });
}

describe("TerrainV2Layer preview resources", () => {
  let artifact: TerrainArtifactV2;
  let resources: TerrainV2PreviewResources;

  beforeAll(() => {
    artifact = createArtifact();
    resources = createTerrainV2PreviewResources(artifact, "far");
  });

  afterAll(() => {
    disposeTerrainV2PreviewResources(resources);
  });

  it("pins a bounded two-draw far preview with a natural horizon skirt", () => {
    expect(resources.metrics).toMatchObject({
      drawCalls: 2,
      terrainTriangles: 528_384,
      waterTriangles: 202_454,
      totalTriangles: 730_838,
      terrainSkirtTriangles: 4_096,
    });
    expect(resources.metrics.totalTriangles).toBe(
      resources.metrics.terrainTriangles + resources.metrics.waterTriangles,
    );
    expect(resources.metrics.totalTriangles).toBeLessThanOrEqual(750_000);

    const terrainPosition = resources.terrainGeometry.getAttribute("position");
    const waterPosition = resources.waterGeometry.getAttribute("position");
    expect(terrainPosition.count).toBe(265_221);
    expect(waterPosition.count).toBe(263_185);
    expect(resources.terrainGeometry.index?.count).toBe(1_585_152);
    expect(resources.terrainGeometry.boundingBox).not.toBeNull();
    expect(resources.terrainGeometry.boundingSphere).not.toBeNull();
    expect(resources.waterGeometry.boundingBox).not.toBeNull();
    expect(resources.waterGeometry.boundingSphere).not.toBeNull();
    expect(resources.waterGeometry.boundingBox!.min.x).toBeLessThan(
      artifact.envelope.minX - artifact.envelope.width,
    );
    expect(resources.waterGeometry.boundingBox!.max.x).toBeGreaterThan(
      artifact.envelope.maxX + artifact.envelope.width,
    );
    expect(resources.waterGeometry.boundingBox!.min.z).toBeLessThan(
      artifact.envelope.minZ - artifact.envelope.depth,
    );
    expect(resources.waterGeometry.boundingBox!.max.z).toBeGreaterThan(
      artifact.envelope.maxZ + artifact.envelope.depth,
    );
  });

  it("carries all semantic terrain and shared hydrology attributes without textures", () => {
    const weightsA = resources.terrainGeometry.getAttribute("terrainV2WeightsA");
    const weightsB = resources.terrainGeometry.getAttribute("terrainV2WeightsB");
    const landCoverage = resources.terrainGeometry.getAttribute("terrainV2LandCoverage");
    expect(weightsA).toMatchObject({ itemSize: 4, normalized: true, count: 265_221 });
    expect(weightsB).toMatchObject({ itemSize: 4, normalized: true, count: 265_221 });
    expect(landCoverage).toMatchObject({ itemSize: 1, normalized: true, count: 265_221 });
    expect(resources.terrainGeometry.getAttribute("color")).toMatchObject({
      itemSize: 3,
      count: 265_221,
    });
    expect(resources.waterGeometry.getAttribute("terrainV2WaterDepth")).toMatchObject({
      itemSize: 1,
      count: 263_185,
    });
    expect(resources.waterGeometry.getAttribute("terrainV2Wetness")).toMatchObject({
      itemSize: 1,
      normalized: true,
      count: 263_185,
    });
    expect(resources.waterGeometry.getAttribute("terrainV2Flow")).toMatchObject({
      itemSize: 2,
      count: 263_185,
    });
    expect(resources.terrainMaterial.map).toBeNull();
    expect(resources.waterMaterial.map).toBeNull();
    expect(resources.terrainMaterial.vertexColors).toBe(true);
  });

  it("blends original procedural weights deterministically into finite vertex colors", () => {
    const mesh = createTerrainArtifactV2PreviewMeshData(artifact, "far");
    const first = createTerrainV2PreviewVertexColors(mesh, TERRAIN_V2_DEFAULT_PROCEDURAL_PALETTE);
    const repeated = createTerrainV2PreviewVertexColors(
      mesh,
      TERRAIN_V2_DEFAULT_PROCEDURAL_PALETTE,
    );
    expect(first).toEqual(repeated);
    expect(first).toHaveLength(mesh.vertexCount * 3);
    for (const channel of first) {
      expect(Number.isFinite(channel)).toBe(true);
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });

  it("explicitly disposes every owned GPU resource", () => {
    const disposable = createTerrainV2PreviewResources(artifact, "far");
    const disposals = [
      vi.spyOn(disposable.terrainGeometry, "dispose"),
      vi.spyOn(disposable.waterGeometry, "dispose"),
      vi.spyOn(disposable.terrainMaterial, "dispose"),
      vi.spyOn(disposable.waterMaterial, "dispose"),
    ];
    disposeTerrainV2PreviewResources(disposable);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
  });

  it("keeps the R3F layer isolated, artifact-driven, and lifecycle-safe", () => {
    expect(SOURCE.match(/<mesh\b/gu)).toHaveLength(2);
    expect(SOURCE.match(/dispose=\{null\}/gu)).toHaveLength(2);
    expect(SOURCE).toContain("createTerrainArtifactV2PreviewMeshData(artifact, lod)");
    expect(SOURCE).toContain("createTerrainArtifactV2WaterMeshData(artifact, lod)");
    expect(SOURCE).toContain("disposeTerrainV2PreviewResources(resources)");
    expect(SOURCE).toContain('name="terrain-v2-surface-and-horizon-skirt"');
    expect(SOURCE).not.toMatch(/TextureLoader|useTexture|useLoader|GLTFLoader|\.gl(?:b|tf)/u);
    expect(SOURCE).not.toMatch(/planned-terrain|world-plan/u);
    expect(SOURCE).not.toMatch(/new THREE\.(?:DirectionalLight|PointLight|SpotLight)/u);
    expect(resources.terrainGeometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(resources.waterGeometry).toBeInstanceOf(THREE.BufferGeometry);
  });
});
