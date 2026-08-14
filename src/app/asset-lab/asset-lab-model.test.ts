import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseCustomAssetCatalogV1 } from "@/lib/world-assets-v2";

import {
  ASSET_LAB_LINEUP_POSITIONS,
  ASSET_LAB_LOD_REVIEW_MODES,
  ASSET_LAB_LOD_SLOTS,
  ASSET_LAB_MATERIAL_MODES,
  ASSET_LAB_NAVIGATION_MODES,
  assetLabLodIndex,
  createAssetLabCollisionGeometry,
  createAssetLabLodTransition,
  createAssetLabMetrics,
  DEFAULT_ASSET_LAB_CONTROLS,
  formatAssetLabBytes,
} from "./asset-lab-model";

const catalog = parseCustomAssetCatalogV1(
  JSON.parse(
    readFileSync(resolve(process.cwd(), "public/assets/world-v2/catalog-v1.json"), "utf8"),
  ),
);

describe("asset lab model", () => {
  it("exposes the complete navigation, LOD, and material-channel review matrix", () => {
    expect(ASSET_LAB_NAVIGATION_MODES).toEqual(["turntable", "orbit", "walk"]);
    expect(ASSET_LAB_LOD_SLOTS).toEqual(["lod0", "lod1", "lod2"]);
    expect(ASSET_LAB_LOD_REVIEW_MODES).toEqual(["single", "crossfade"]);
    expect(ASSET_LAB_MATERIAL_MODES).toEqual([
      "beauty",
      "albedo",
      "normal",
      "roughness",
      "metalness",
      "emissive",
    ]);
    expect(DEFAULT_ASSET_LAB_CONTROLS).toMatchObject({
      navigation: "turntable",
      lod: "lod0",
      lodReview: "single",
      lodBlend: 0.5,
      material: "beauty",
      contactShadows: true,
      animation: true,
    });
  });

  it("places all five proof families at non-overlapping orbit and walk distances", () => {
    expect(ASSET_LAB_LINEUP_POSITIONS).toHaveLength(5);
    for (let index = 1; index < ASSET_LAB_LINEUP_POSITIONS.length; index += 1) {
      expect(
        ASSET_LAB_LINEUP_POSITIONS[index]![0] - ASSET_LAB_LINEUP_POSITIONS[index - 1]![0],
      ).toBeGreaterThanOrEqual(9);
    }
  });

  it("reports catalog metrics including the bounded KTX2 sampler and decoded-memory budget", () => {
    const archive = createAssetLabMetrics(catalog, "archive-spire", "lod0");
    const fox = createAssetLabMetrics(catalog, "patch-fox", "lod2");

    expect(archive).toMatchObject({
      kind: "hero-building",
      lod: "lod0",
      triangles: 1668,
      textureSamplers: 3,
      collisionNodes: 1,
      footprintShape: "rectangle",
      footprintDimensionsMeters: [9.6, 9.6],
      footprintClearanceMeters: 1.5,
      primaryBiome: "settlement",
      compatibleBiomes: ["settlement", "work-yard", "garden"],
      animation: "BeaconPulse",
      quality: "proof-not-aaa",
      silhouetteEnvelopeDeltaPercent: 0,
      silhouetteExtentDeltaPercent: 0,
      silhouetteCenterDriftPercent: 0,
    });
    expect(archive.textureShippedBytes).toBe(676_830);
    expect(archive.textureDecodedGpuBytes).toBe(4_194_300);
    expect(fox).toMatchObject({
      kind: "animal",
      lod: "lod2",
      textureSamplers: 0,
      animation: "TrotLoop",
    });
    expect(assetLabLodIndex("lod0")).toBe(0);
    expect(assetLabLodIndex("lod2")).toBe(2);
    expect(formatAssetLabBytes(4_194_300)).toBe("4.00 MiB");
    expect(() => createAssetLabMetrics(catalog, "missing", "lod0")).toThrow(/Unknown/iu);
  });

  it("defines bounded manual crossfades for both adjacent LOD transitions", () => {
    expect(createAssetLabLodTransition("lod0", 0.25)).toEqual({
      from: "lod0",
      to: "lod1",
      blend: 0.25,
      fromOpacity: 0.75,
      toOpacity: 0.25,
    });
    expect(createAssetLabLodTransition("lod1", 0.75)).toEqual({
      from: "lod1",
      to: "lod2",
      blend: 0.75,
      fromOpacity: 0.25,
      toOpacity: 0.75,
    });
    expect(createAssetLabLodTransition("lod2", 2)).toMatchObject({
      from: "lod1",
      to: "lod2",
      blend: 1,
    });
    expect(() => createAssetLabLodTransition("lod0", Number.NaN)).toThrow(/finite/iu);
  });

  it("renders Commit Ridge from its catalog-authored box proxy without inventing a hull", () => {
    const ridge = catalog.families.find((family) => family.id === "commit-ridge")!;
    const proxy = ridge.collision.nodes[0]!;

    expect(proxy).toMatchObject({
      name: "COLLIDER_commit_ridge_mass",
      shape: "box",
      center: [0, 2.5, 0],
      halfExtents: [4.2, 2.5, 3.3],
    });
    expect(createAssetLabCollisionGeometry(proxy)).toEqual({
      shape: "box",
      args: [8.4, 5, 6.6],
    });
  });
});
