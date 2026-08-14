import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./kingdom-scene-planned.tsx", import.meta.url), "utf8");

describe("planned tree LOD renderer source contract", () => {
  it("uses overview batches in Orbit and a bounded near-detail hybrid in Walk", () => {
    expect(source).toContain("const treeMode = plannedTreeLodMode(navigationMode)");
    expect(source).toContain('treeMode === "overview-lod"');
    expect(source).toContain("createPlannedTreeLodBatches(");
    expect(source).toContain("createTreeLodInstances(scatter, plan, enrichment, themeLayer)");
    expect(source).toContain("selectPlannedWalkTreeHybrid(instances, focus)");
    expect(source).toContain("createPlannedWalkTreeLodBatches(hybrid.far)");
    expect(source).toContain("createTreeGroups(hybrid.detail)");
    expect(source).toContain("<OverviewTreeLodBatch");
    expect(source).toContain("<WalkTreeLodFamilyBatch");
    expect(source).toContain("livingSpawn={runtime.livingSpawn}");
    expect(source).toContain("navigationMode={renderedNavigationMode}");
    expect(source).toContain('navigationMode === "walk" && preparedWalkRuntime.status !== "ready"');
  });

  it("keeps one trunk and canopy instanced draw per active overview palette", () => {
    const start = source.indexOf("function OverviewTreeLodBatch(");
    const end = source.indexOf("function WalkTreeLodFamilyBatch(", start);
    const renderer = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(renderer.match(/<instancedMesh/gu)).toHaveLength(2);
    expect(renderer).toContain("args={[geometry.trunk, undefined, batch.matrices.length]}");
    expect(renderer).toContain("args={[geometry.canopy, undefined, batch.matrices.length]}");
    expect(renderer).toContain("castShadow");
    expect(renderer).not.toContain("useFrame");
  });

  it("keeps one trunk and canopy draw per active Walk silhouette family", () => {
    const start = source.indexOf("function WalkTreeLodFamilyBatch(");
    const end = source.indexOf("function createGroundGroups(", start);
    const renderer = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(renderer.match(/<instancedMesh/gu)).toHaveLength(2);
    expect(renderer).toContain("setColorAt(index, color)");
    expect(renderer).toContain("computeBoundingBox()");
    expect(renderer).toContain("computeBoundingSphere()");
    expect(renderer).not.toContain("frustumCulled={false}");
    expect(renderer).not.toContain("useFrame");
  });
});
