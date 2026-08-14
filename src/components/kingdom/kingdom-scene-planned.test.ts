import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildRetracedWildlifeMotion, wildlifeMotionStartDistance } from "./wildlife-motion";

const SCENE_SOURCE = readFileSync(new URL("./kingdom-scene-planned.tsx", import.meta.url), "utf8");
const PICKING_SOURCE = readFileSync(new URL("./planned-scene-picking.ts", import.meta.url), "utf8");
const PATH_SOURCE = readFileSync(new URL("./planned-hamlet-paths.ts", import.meta.url), "utf8");
const WALK_DETAIL_SOURCE = readFileSync(
  new URL("./planned-walk-detail.tsx", import.meta.url),
  "utf8",
);
const WALK_RUNTIME_SOURCE = readFileSync(
  new URL("./planned-walk-runtime-model.ts", import.meta.url),
  "utf8",
);

describe("buildRetracedWildlifeMotion", () => {
  it("uses only adjacent validated edges and retraces them to loop", () => {
    const first = [0, 1, 0] as const;
    const second = [3, 2, 4] as const;
    const third = [8, 3, 4] as const;

    const motion = buildRetracedWildlifeMotion([first, second, third]);

    expect(motion?.segments).toEqual([
      { start: first, end: second, length: 5 },
      { start: second, end: third, length: 5 },
      { start: third, end: second, length: 5 },
      { start: second, end: first, length: 5 },
    ]);
    expect(motion?.segments).not.toContainEqual({ start: third, end: first, length: 8 });
    expect(motion?.totalLength).toBe(20);
  });

  it("ignores zero-length edges and requires one usable segment", () => {
    const point = [2, 0, 2] as const;
    expect(buildRetracedWildlifeMotion([])).toBeNull();
    expect(buildRetracedWildlifeMotion([point, point])).toBeNull();
  });

  it("derives a fresh deterministic distance when the route changes", () => {
    const shortMotion = buildRetracedWildlifeMotion([
      [0, 0, 0],
      [3, 0, 4],
    ]);
    const longMotion = buildRetracedWildlifeMotion([
      [0, 0, 0],
      [6, 0, 8],
    ]);

    expect(wildlifeMotionStartDistance(shortMotion, 0.25)).toBe(2.5);
    expect(wildlifeMotionStartDistance(longMotion, 0.25)).toBe(5);
    expect(wildlifeMotionStartDistance(null, 0.25)).toBe(0);
  });
});

describe("planned architecture source contract", () => {
  it("never replaces available authored architecture texture references", () => {
    const start = SCENE_SOURCE.indexOf('surfaceStyle === "architecture"');
    const end = SCENE_SOURCE.indexOf('surfaceStyle === "rock"', start);
    const architectureBranch = SCENE_SOURCE.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(architectureBranch).toContain("ARCHITECTURE_MATERIAL_POLICY.texturedTintMix");
    expect(architectureBranch).toContain("material.color.lerp");
    expect(architectureBranch).not.toMatch(/material\.(?:aoMap|emissiveMap|map|normalMap)\s*=/u);
  });

  it("registers every formerly dormant modular architecture GLB", () => {
    for (const assetName of [
      "Corner_Exterior_Brick",
      "Corner_Exterior_Wood",
      "DoorFrame_Round_Brick",
      "Door_1_Round",
      "Roof_RoundTiles_8x8",
      "WindowShutters_Wide_Round_Open",
      "Window_Wide_Round1",
    ]) {
      expect(SCENE_SOURCE, assetName).toContain(assetName);
    }
  });

  it("consumes planner-sized modular recipes and validates detached props", () => {
    expect(SCENE_SOURCE).toContain("structure.architecture");
    expect(SCENE_SOURCE).toContain("desiredVisualScale");
    expect(SCENE_SOURCE).toContain("desiredHeightScale");
    expect(SCENE_SOURCE).toMatch(
      /\[\s*desiredVisualScale,\s*desiredHeightScale,\s*desiredVisualScale,?\s*\]/u,
    );
    expect(PICKING_SOURCE).toMatch(
      /new THREE\.Vector3\(\s*4\.8 \* horizontalScale,\s*6\.2 \* heightScale,\s*4\.8 \* horizontalScale,?\s*\)/u,
    );
    expect(SCENE_SOURCE).toContain("new PlannedScenePickProxy(records)");
    expect(SCENE_SOURCE).not.toContain("<boxGeometry");
    expect(SCENE_SOURCE).toContain("structure.architecture.compoundIdentity");
    expect(SCENE_SOURCE).not.toContain("fitArchitectureRecipeToFootprint(");
    expect(SCENE_SOURCE).not.toContain('assign("civic"');
    expect(SCENE_SOURCE).not.toContain("function watershedDistance(");
    expect(SCENE_SOURCE).toContain("validCompoundPropFootprint(");
    expect(SCENE_SOURCE).toContain("radius + structure.footprintRadius + 0.35");
    expect(SCENE_SOURCE).toContain("stairs: 1.5");
    expect(SCENE_SOURCE).toContain("wagon: 3.35");
    expect(SCENE_SOURCE).not.toContain("matrixAt(3.1, 0, 0.8");
  });

  it("raises negative-pivot vine meshes above the building base", () => {
    expect(SCENE_SOURCE).toContain("matrixAt(-1.1, 1.78, 2.02, 0, 0.82)");
    expect(SCENE_SOURCE).toContain("recipe.stories > 1 ? 2.85 : 1.64");
    expect(SCENE_SOURCE).not.toContain("matrixAt(-1.1, 0.12, 2.02");
  });

  it("enables audited surface detail and dedicated window emission only for high Walk", () => {
    expect(SCENE_SOURCE).toContain("loadPlannedArchitectureDetailRuntimeTextures");
    expect(SCENE_SOURCE).toContain("finalizePlannedArchitectureMaterial");
    expect(SCENE_SOURCE).toContain("detailEnabled: true");
    expect(SCENE_SOURCE).toContain("runtimeTextures: architectureDetail.runtimeTextures");
    expect(SCENE_SOURCE).toContain("color: plan.appearance.architecture.windowGlow");
    expect(SCENE_SOURCE).toContain("intensity: 0.72");
    expect(SCENE_SOURCE).toContain("mountedRef.current = true");
    expect(SCENE_SOURCE).toContain("mountedRef.current = false");
    expect(SCENE_SOURCE).toContain("[materials, matrices, primitive.sourceMatrix]");
  });

  it("keeps authored rock maps non-emissive under cinematic lighting", () => {
    const start = SCENE_SOURCE.indexOf('surfaceStyle === "rock"');
    const end = SCENE_SOURCE.indexOf('surfaceStyle === "rune"', start);
    const rockBranch = SCENE_SOURCE.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(rockBranch).toContain("material.emissiveMap = null");
    expect(rockBranch).toContain('material.emissive.set("#000000")');
    expect(rockBranch).not.toContain("material.emissiveMap = material.map");
  });
});

describe("planned land-use scene contract", () => {
  it("plans land use once and renders it as the only primary road network", () => {
    expect(SCENE_SOURCE).toContain("createPlannedLandUse(plan, scatter, enrichment)");
    expect(SCENE_SOURCE).toContain(
      "<PlannedLandUseLayer plan={plan} landUse={landUse} season={season} />",
    );
    expect(SCENE_SOURCE).not.toContain('kind: "main"');
    expect(SCENE_SOURCE).not.toContain('type PlannedPathKind = "main"');
    expect(PATH_SOURCE).toContain('type PlannedPathKind = "lane" | "courtyard"');
    expect(SCENE_SOURCE).toContain("createPlannedHamletPathBatch(plan, scatter)");
    expect(SCENE_SOURCE).not.toContain("paths.flatMap(");
    expect(SCENE_SOURCE).toContain("...createLandUseWalkObstacles(landUse)");
    expect(SCENE_SOURCE).toContain("landUse={landUse}");
  });
});

describe("cinematic desktop vertical-slice scene contract", () => {
  it("uses one cinematic environment owner without the legacy light and sparkle rig", () => {
    expect(SCENE_SOURCE).toContain("<PlannedCinematicEnvironment");
    expect(SCENE_SOURCE).not.toContain("function Atmosphere(");
    expect(SCENE_SOURCE).not.toContain("<Atmosphere");
    expect(SCENE_SOURCE).not.toContain("<Sparkles");
    expect(SCENE_SOURCE).not.toContain("<ambientLight");
  });

  it("mounts the bounded detail field only with Walk controls", () => {
    const runtime = SCENE_SOURCE.slice(
      SCENE_SOURCE.indexOf("function PlannedWalkRuntime("),
      SCENE_SOURCE.indexOf("export function KingdomScenePlanned("),
    );
    const walkBranchStart = SCENE_SOURCE.lastIndexOf('navigationMode === "walk" ? (');
    const sceneWalkBranch = SCENE_SOURCE.slice(
      walkBranchStart,
      SCENE_SOURCE.indexOf("<OrbitCameraRig", walkBranchStart),
    );

    expect(sceneWalkBranch).toContain("<PlannedWalkRuntime");
    expect(runtime).toContain("<PlannedWalkDetail");
    expect(runtime).toContain("<KingdomWalkControls");
    expect(runtime.indexOf("<PlannedWalkDetail")).toBeLessThan(
      runtime.indexOf("<KingdomWalkControls"),
    );
    expect(WALK_DETAIL_SOURCE).toContain("grass: 400");
    expect(WALK_DETAIL_SOURCE).toContain("reed: 65");
    expect(WALK_DETAIL_SOURCE).toContain("createTuftGeometry");
    expect(WALK_DETAIL_SOURCE).toContain("customProgramCacheKey");
    expect(WALK_DETAIL_SOURCE).toContain("vertexColors:");
    expect(WALK_DETAIL_SOURCE).toContain(
      'quality === "high" && (kind === "grass" || kind === "reed")',
    );
    expect(WALK_DETAIL_SOURCE).toContain('color: "#ffffff"');
    expect(WALK_DETAIL_SOURCE).toContain("geometry.dispose()");
    expect(WALK_DETAIL_SOURCE).toContain("material.dispose()");
  });

  it("keeps the complete Orbit presentation mounted while the Walk worker is pending", () => {
    expect(SCENE_SOURCE).toContain(
      'navigationMode === "walk" && preparedWalkRuntime.status !== "ready"',
    );
    expect(SCENE_SOURCE).toContain("navigationMode={renderedNavigationMode}");
    expect(SCENE_SOURCE).toContain('renderedNavigationMode === "orbit"');
  });

  it("mounts bounded near tree and animated wildlife detail at the shared living spawn", () => {
    const runtime = SCENE_SOURCE.slice(
      SCENE_SOURCE.indexOf("function PlannedWalkRuntime("),
      SCENE_SOURCE.indexOf("function PlannedWalkPreparationState("),
    );

    expect(runtime).toContain("<WalkTreeHybridLayer");
    expect(runtime).toContain("<WildlifeLayer");
    expect(runtime.match(/livingSpawn=\{runtime\.livingSpawn\}/gu)).toHaveLength(3);
    expect(SCENE_SOURCE).toContain("selectPlannedWalkTreeHybrid(instances, focus)");
    expect(SCENE_SOURCE).toContain(
      "PLANNED_WALK_WILDLIFE_LOD_CONTRACT.maximumAnimatedSourcePrimitives",
    );
    expect(SCENE_SOURCE).toContain("selectWalkAnimatedWildlife(actors, livingSpawn)");
    expect(SCENE_SOURCE).toContain('navigationMode="walk"');
  });

  it("mounts disjoint regional route dressing only after prepared Walk data is ready", () => {
    expect(WALK_RUNTIME_SOURCE).toContain("createPlannedRegionalExperiencePlan");
    expect(WALK_RUNTIME_SOURCE).toContain("createPlannedRegionalWalkObstacles");
    expect(WALK_RUNTIME_SOURCE).toContain("addWalkNavigationGridObstacles");
    expect(WALK_RUNTIME_SOURCE).toContain("isPlannedRegionalExperienceRenderable");
    expect(SCENE_SOURCE).toContain("runtime.regional");
    expect(SCENE_SOURCE).toContain('mount="far"');
    expect(SCENE_SOURCE).toContain('mount="near"');
    expect(SCENE_SOURCE).toContain('preparedWalkRuntime.status === "ready"');
    expect(SCENE_SOURCE).toContain("detail={runtime.detail}");
  });

  it("computes instanced bounds and leaves static and moving batches frustum-cullable", () => {
    expect(SCENE_SOURCE).toContain("instance.current.computeBoundingBox()");
    expect(SCENE_SOURCE).toContain("instance.current.computeBoundingSphere()");
    expect(SCENE_SOURCE).toContain("mesh.computeBoundingBox()");
    expect(SCENE_SOURCE).toContain("mesh.computeBoundingSphere()");
    // Only deliberately unbounded animated life points opt out of culling.
    expect(SCENE_SOURCE.match(/frustumCulled=\{false\}/gu)).toHaveLength(1);
  });
});
