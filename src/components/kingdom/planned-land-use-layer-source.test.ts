import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PLANNED_LAND_USE_ASSET_URLS } from "./planned-land-use-layer";

const source = readFileSync(new URL("./planned-land-use-layer.tsx", import.meta.url), "utf8");

describe("planned land-use renderer source contract", () => {
  it("consumes a preplanned model without duplicate planning or per-frame work", () => {
    expect(source).toContain("landUse: PlannedLandUse");
    expect(source).not.toContain("createPlannedLandUse(");
    expect(source).not.toContain("useFrame");
    expect(source).toContain("model-provided points");
    expect(source).toContain("preplanned anchors");
  });

  it("keeps authored GLB materials and URL-batched instances explicit", () => {
    expect(source).toContain("createPlannedLandUseAssetBatches(assets)");
    expect(source).toContain("<instancedMesh");
    expect(source).toContain("assetBatches.map((batch)");
    expect(source).toContain("primitive.material");
    expect(source).not.toContain("scene.clone(true)");
    expect(source).not.toContain("<primitive object={object}");
    expect(source).not.toMatch(/child\.material\s*=/);
    for (const url of PLANNED_LAND_USE_ASSET_URLS) {
      expect(url).toMatch(/^\/assets\/world\/(?:kenney|quaternius)\//);
    }
  });

  it("batches all semantic surfaces and renders honest crossing structures", () => {
    expect(source).toContain("PLANNED_DEVELOPED_ZONE_SIGNATURES.map");
    expect(source).toContain("PLANNED_LANDSCAPE_ROLES.map");
    expect(source).toContain('plannedCrossingKind = "bridge-supports"');
    expect(source).toContain('plannedCrossingKind = "stepped-retaining-walls"');
    expect(source).toContain("maximumSurfaceDrawCalls: 19");
    expect(source).toContain("maximumGeneratedTriangles: 24_000");
    expect(source).toContain("maximumExplicitAssets: 32");
    expect(source).toContain("maximumTotalDrawCalls: 115");
    expect(source).toContain("maximumTotalTriangles: 77_504");
  });

  it("uses polygon offset and releases every generated geometry on unmount", () => {
    expect(source).toContain("polygonOffset");
    expect(source).toContain("disposePlannedLandUseGeometryBundle(geometry)");
    expect(source).toContain("geometries.forEach((geometry) => geometry.dispose())");
  });

  it("fades terrain-following land-use edges and renders role-specific cultivation patterns", () => {
    expect(source).toContain('LAND_USE_INTERIOR_ATTRIBUTE = "kingdomLandUseInterior"');
    expect(source).toContain('pattern="developed"');
    expect(source).toContain("pattern={role}");
    expect(source).toContain('pattern === "field"');
    expect(source).toContain('pattern === "orchard"');
    expect(source).toContain('pattern === "garden"');
    expect(source).toContain("kingdomLandUseEdge");
    expect(source).toContain("depthWrite: !patterned");
  });
});
