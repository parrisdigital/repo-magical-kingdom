import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  classifyPlannedArchitectureMaterialRole,
  classifyPlannedArchitectureSurface,
  createPlannedArchitectureDetailMaterial,
  createPlannedArchitectureWindowEmissiveMaterial,
  evaluatePlannedArchitectureDetailRuntimeGate,
  finalizePlannedArchitectureMaterial,
  loadPlannedArchitectureDetailRuntimeTextures,
  patchPlannedArchitectureDetailShader,
  PLANNED_ARCHITECTURE_DETAIL_ASSET_CONTRACT,
  PLANNED_ARCHITECTURE_DETAIL_DEFAULT_TUNING,
  PLANNED_ARCHITECTURE_DETAIL_PROGRAM_CACHE_KEY,
  type PlannedArchitectureDetailRuntimeGate,
  type PlannedArchitectureDetailRuntimeTextures,
} from "./planned-architecture-detail-material";

const HIGH_WALK_GATE: PlannedArchitectureDetailRuntimeGate = {
  detailEnabled: true,
  navigationMode: "walk",
  quality: "high",
};

const TUNING = {
  repeat: [8, 8] as const,
  normalStrength: 0.32,
  roughnessStrength: 0.14,
};

function createGeometry(withUv = true) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  if (withUv) geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0], 2));
  return geometry;
}

function createAuthoredMaterial(name = "MI_Plaster") {
  const material = new THREE.MeshStandardMaterial({
    color: "#cab89c",
    map: new THREE.Texture(),
    normalMap: new THREE.Texture(),
    normalScale: new THREE.Vector2(0.72, 0.81),
    roughness: 0.63,
    roughnessMap: new THREE.Texture(),
  });
  material.name = name;
  return material;
}

function createRuntimeTextures(): PlannedArchitectureDetailRuntimeTextures {
  return {
    normal: new THREE.Texture(),
    roughness: new THREE.Texture(),
  };
}

function createShader() {
  return {
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
}

describe("planned architecture detail material", () => {
  it("classifies only audited exact modular-home material names", () => {
    expect(classifyPlannedArchitectureSurface("MI_Plaster")).toEqual({
      matched: true,
      materialName: "MI_Plaster",
      family: "plaster",
      slot: 0,
    });
    expect(classifyPlannedArchitectureSurface("MI_UnevenBrick")).toMatchObject({
      matched: true,
      family: "brick",
      slot: 1,
    });
    expect(classifyPlannedArchitectureSurface("MI_WoodTrim")).toMatchObject({
      matched: true,
      family: "wood",
      slot: 2,
    });
    expect(classifyPlannedArchitectureSurface("MI_RoundTiles")).toMatchObject({
      matched: true,
      family: "roof-tile",
      slot: 3,
    });
    expect(classifyPlannedArchitectureSurface("mi_plaster")).toMatchObject({ matched: false });
    expect(classifyPlannedArchitectureSurface("MI_Plaster.001")).toMatchObject({
      matched: false,
    });
    expect(classifyPlannedArchitectureSurface("MI_RockTrim")).toMatchObject({ matched: false });
    expect(classifyPlannedArchitectureMaterialRole("MI_WindowGlass")).toEqual({
      matched: true,
      materialName: "MI_WindowGlass",
      role: "window-glass",
      family: null,
      slot: null,
    });
    expect(classifyPlannedArchitectureMaterialRole("MI_Plaster")).toMatchObject({
      matched: true,
      role: "plaster",
      family: "plaster",
      slot: 0,
    });
  });

  it("hard-gates detail to explicitly enabled high-quality Walk", () => {
    expect(evaluatePlannedArchitectureDetailRuntimeGate(HIGH_WALK_GATE)).toBeNull();
    expect(
      evaluatePlannedArchitectureDetailRuntimeGate({
        ...HIGH_WALK_GATE,
        detailEnabled: false,
      }),
    ).toBe("detail-disabled");
    expect(
      evaluatePlannedArchitectureDetailRuntimeGate({
        ...HIGH_WALK_GATE,
        navigationMode: "orbit",
      }),
    ).toBe("orbit-mode");
    expect(
      evaluatePlannedArchitectureDetailRuntimeGate({ ...HIGH_WALK_GATE, quality: "low" }),
    ).toBe("low-quality");
    expect(PLANNED_ARCHITECTURE_DETAIL_ASSET_CONTRACT.runtimeGate).toMatchObject({
      orbitAddedTextureReads: 0,
      lowQualityAddedTextureReads: 0,
    });
  });

  it("does not touch the texture loader outside high-quality Walk", async () => {
    const loader = { loadAsync: vi.fn(async () => new THREE.Texture()) };

    for (const gate of [
      { ...HIGH_WALK_GATE, detailEnabled: false },
      { ...HIGH_WALK_GATE, navigationMode: "orbit" as const },
      { ...HIGH_WALK_GATE, quality: "low" as const },
    ]) {
      const result = await loadPlannedArchitectureDetailRuntimeTextures(gate, { loader });
      expect(result.status).toBe("disabled");
      expect(result.addedSamplers).toBe(0);
      expect(result.addedFragmentTextureReads).toBe(0);
    }

    expect(loader.loadAsync).not.toHaveBeenCalled();
  });

  it("loads only normal and roughness, configures them as linear mipmapped data, and owns disposal", async () => {
    const normal = new THREE.Texture();
    const roughness = new THREE.Texture();
    const normalDispose = vi.spyOn(normal, "dispose");
    const roughnessDispose = vi.spyOn(roughness, "dispose");
    const loader = {
      loadAsync: vi.fn(async (url: string) => (url.includes("normal-gl") ? normal : roughness)),
    };

    const result = await loadPlannedArchitectureDetailRuntimeTextures(HIGH_WALK_GATE, {
      loader,
      maximumAnisotropy: 32,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("expected detail textures");
    expect(loader.loadAsync.mock.calls.map(([url]) => url)).toEqual([
      PLANNED_ARCHITECTURE_DETAIL_ASSET_CONTRACT.tiers.high.urls.normal,
      PLANNED_ARCHITECTURE_DETAIL_ASSET_CONTRACT.tiers.high.urls.roughness,
    ]);
    expect(loader.loadAsync).not.toHaveBeenCalledWith(
      PLANNED_ARCHITECTURE_DETAIL_ASSET_CONTRACT.tiers.high.urls.albedo,
    );
    for (const texture of [normal, roughness]) {
      expect(texture.colorSpace).toBe(THREE.NoColorSpace);
      expect(texture.flipY).toBe(false);
      expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
      expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
      expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
      expect(texture.magFilter).toBe(THREE.LinearFilter);
      expect(texture.generateMipmaps).toBe(true);
      expect(texture.anisotropy).toBe(8);
    }
    expect(result.addedSamplers).toBe(2);
    expect(result.addedFragmentTextureReads).toBe(2);

    result.dispose();
    result.dispose();
    expect(normalDispose).toHaveBeenCalledOnce();
    expect(roughnessDispose).toHaveBeenCalledOnce();
  });

  it("disposes a partially loaded atlas pair and falls back when either load fails", async () => {
    const normal = new THREE.Texture();
    const normalDispose = vi.spyOn(normal, "dispose");
    const expectedError = new Error("roughness unavailable");
    const loader = {
      loadAsync: vi.fn(async (url: string) => {
        if (url.includes("roughness")) throw expectedError;
        return normal;
      }),
    };

    const result = await loadPlannedArchitectureDetailRuntimeTextures(HIGH_WALK_GATE, { loader });

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "texture-load-failed",
      error: expectedError,
      addedSamplers: 0,
      addedFragmentTextureReads: 0,
    });
    expect(normalDispose).toHaveBeenCalledOnce();
  });

  it("clones an eligible authored material, keeps its maps and values, and patches two reads", () => {
    const source = createAuthoredMaterial();
    const sourceMap = source.map;
    const sourceNormalMap = source.normalMap;
    const sourceRoughnessMap = source.roughnessMap;
    const sourceColor = source.color.getHex();
    const sourceNormalScale = source.normalScale.toArray();
    const sourceOnBeforeCompile = vi.fn();
    source.onBeforeCompile = sourceOnBeforeCompile;
    source.customProgramCacheKey = () => "authored-program";
    const runtimeTextures = createRuntimeTextures();
    const atlasNormalDispose = vi.spyOn(runtimeTextures.normal, "dispose");
    const atlasRoughnessDispose = vi.spyOn(runtimeTextures.roughness, "dispose");

    const result = createPlannedArchitectureDetailMaterial(HIGH_WALK_GATE, {
      sourceMaterial: source,
      geometry: createGeometry(),
      runtimeTextures,
      tuning: TUNING,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("expected enhanced material");
    expect(result.material).not.toBe(source);
    expect(result.classification).toMatchObject({ family: "plaster", slot: 0 });
    expect(result.material.map).toBe(sourceMap);
    expect(result.material.normalMap).toBe(sourceNormalMap);
    expect(result.material.roughnessMap).toBe(sourceRoughnessMap);
    expect(result.material.color.getHex()).toBe(sourceColor);
    expect(result.material.roughness).toBe(source.roughness);
    expect(result.material.normalScale.toArray()).toEqual(sourceNormalScale);
    expect(source.onBeforeCompile).toBe(sourceOnBeforeCompile);
    expect(result.material.customProgramCacheKey()).toBe(
      `authored-program|${PLANNED_ARCHITECTURE_DETAIL_PROGRAM_CACHE_KEY}`,
    );

    const shader = createShader();
    result.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(sourceOnBeforeCompile).toHaveBeenCalledOnce();
    expect(shader.fragmentShader.match(/PLANNED_ARCHITECTURE_DETAIL_SHADER_V1/g)).toHaveLength(1);
    expect(shader.fragmentShader).toContain("texture2DGradEXT(");
    expect(shader.fragmentShader).toContain("float detailFade = 1.0 - smoothstep(");
    expect(shader.fragmentShader).toContain("maximumFootprint / max(");
    expect(shader.fragmentShader).toContain("kingdomArchitectureDetailNormalVs");
    expect(shader.fragmentShader).toContain("kingdomArchitectureDetailRoughnessNeutral");
    expect(shader.uniforms.kingdomArchitectureDetailNormalAtlas!.value).toBe(
      runtimeTextures.normal,
    );
    expect(shader.uniforms.kingdomArchitectureDetailRoughnessAtlas!.value).toBe(
      runtimeTextures.roughness,
    );
    expect(shader.uniforms.kingdomArchitectureDetailSlot!.value).toBe(0);
    expect(shader.uniforms.kingdomArchitectureDetailMaximumMip!.value).toBe(7);
    expect(shader.uniforms.kingdomArchitectureDetailRoughnessNeutral!.value).toBeCloseTo(
      0.90710625,
    );
    expect(result.addedSamplers).toBe(2);
    expect(result.addedFragmentTextureReads).toBe(2);

    const cloneDispose = vi.spyOn(result.material, "dispose");
    const sourceDispose = vi.spyOn(source, "dispose");
    result.dispose();
    result.dispose();
    expect(cloneDispose).toHaveBeenCalledOnce();
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(atlasNormalDispose).not.toHaveBeenCalled();
    expect(atlasRoughnessDispose).not.toHaveBeenCalled();
  });

  it("returns the untouched authored material with zero added reads for every fail-closed gate", () => {
    const source = createAuthoredMaterial();
    const geometry = createGeometry();
    const runtimeTextures = createRuntimeTextures();
    const cases = [
      [{ ...HIGH_WALK_GATE, detailEnabled: false }, "detail-disabled"],
      [{ ...HIGH_WALK_GATE, navigationMode: "orbit" as const }, "orbit-mode"],
      [{ ...HIGH_WALK_GATE, quality: "low" as const }, "low-quality"],
    ] as const;

    for (const [gate, reason] of cases) {
      const result = createPlannedArchitectureDetailMaterial(gate, {
        sourceMaterial: source,
        geometry,
        runtimeTextures,
        tuning: TUNING,
      });
      expect(result).toMatchObject({
        status: "skipped",
        reason,
        material: source,
        ownsMaterial: false,
        addedSamplers: 0,
        addedFragmentTextureReads: 0,
      });
    }
  });

  it("fails closed for an unmatched role, missing UV0/maps, or object-space normal map", () => {
    const runtimeTextures = createRuntimeTextures();
    const create = (material: THREE.MeshStandardMaterial, geometry = createGeometry()) =>
      createPlannedArchitectureDetailMaterial(HIGH_WALK_GATE, {
        sourceMaterial: material,
        geometry,
        runtimeTextures,
        tuning: TUNING,
      });

    expect(create(createAuthoredMaterial("MI_RockTrim")).reason).toBe("unmatched-material");
    expect(create(createAuthoredMaterial(), createGeometry(false)).reason).toBe("missing-uv0");

    const noBase = createAuthoredMaterial();
    noBase.map = null;
    expect(create(noBase).reason).toBe("missing-authored-base-map");
    const noNormal = createAuthoredMaterial();
    noNormal.normalMap = null;
    expect(create(noNormal).reason).toBe("missing-authored-normal-map");
    const noRoughness = createAuthoredMaterial();
    noRoughness.roughnessMap = null;
    expect(create(noRoughness).reason).toBe("missing-authored-roughness-map");
    const objectSpace = createAuthoredMaterial();
    objectSpace.normalMapType = THREE.ObjectSpaceNormalMap;
    expect(create(objectSpace).reason).toBe("unsupported-normal-map-type");
  });

  it("patches current Three standard shader anchors and leaves incompatible shaders untouched", () => {
    const runtimeTextures = createRuntimeTextures();
    const shader = createShader();
    expect(
      patchPlannedArchitectureDetailShader(shader, {
        family: "brick",
        slot: 1,
        normalAtlas: runtimeTextures.normal,
        roughnessAtlas: runtimeTextures.roughness,
        tuning: TUNING,
      }),
    ).toBe(true);
    expect(shader.fragmentShader.match(/PLANNED_ARCHITECTURE_DETAIL_SHADER_V1/g)).toHaveLength(1);
    expect(shader.fragmentShader.match(/sampleKingdomArchitectureDetailAtlas\(/g)).toHaveLength(3);
    expect(shader.uniforms.kingdomArchitectureDetailSlot!.value).toBe(1);

    const incompatible = { fragmentShader: "void main() {}", uniforms: {} };
    const originalSource = incompatible.fragmentShader;
    expect(
      patchPlannedArchitectureDetailShader(incompatible, {
        family: "brick",
        slot: 1,
        normalAtlas: runtimeTextures.normal,
        roughnessAtlas: runtimeTextures.roughness,
        tuning: TUNING,
      }),
    ).toBe(false);
    expect(incompatible.fragmentShader).toBe(originalSource);
    expect(incompatible.uniforms).toEqual({});
  });

  it("uses one uniform-only program variant across surface roles and reports bounded memory", () => {
    const runtimeTextures = createRuntimeTextures();
    const create = (name: string) =>
      createPlannedArchitectureDetailMaterial(HIGH_WALK_GATE, {
        sourceMaterial: createAuthoredMaterial(name),
        geometry: createGeometry(),
        runtimeTextures,
        tuning: TUNING,
      });
    const plaster = create("MI_Plaster");
    const wood = create("MI_WoodTrim");

    expect(plaster.status).toBe("ready");
    expect(wood.status).toBe("ready");
    expect(plaster.material.customProgramCacheKey()).toBe(wood.material.customProgramCacheKey());
    expect(PLANNED_ARCHITECTURE_DETAIL_ASSET_CONTRACT.shaderBudget).toEqual({
      addedSamplers: 2,
      addedFragmentTextureReads: 2,
      albedoTextureReads: 0,
      sampledChannels: ["normal", "roughness"],
    });
    expect(
      PLANNED_ARCHITECTURE_DETAIL_ASSET_CONTRACT.memoryBudget.highRuntimeChannelsDecodedWithMipsMiB,
    ).toBeLessThan(
      PLANNED_ARCHITECTURE_DETAIL_ASSET_CONTRACT.memoryBudget.highAllChannelsDecodedWithMipsMiB,
    );

    plaster.dispose();
    wood.dispose();
  });

  it("exports conservative audited per-family defaults and applies them when tuning is omitted", () => {
    expect(PLANNED_ARCHITECTURE_DETAIL_DEFAULT_TUNING).toEqual({
      plaster: { repeat: [3, 3], normalStrength: 0.2, roughnessStrength: 0.08 },
      brick: { repeat: [1, 1], normalStrength: 0.1, roughnessStrength: 0.05 },
      wood: { repeat: [3, 3], normalStrength: 0.16, roughnessStrength: 0.08 },
      "roof-tile": { repeat: [1, 1], normalStrength: 0.09, roughnessStrength: 0.05 },
    });
    const result = createPlannedArchitectureDetailMaterial(HIGH_WALK_GATE, {
      sourceMaterial: createAuthoredMaterial("MI_RoundTiles"),
      geometry: createGeometry(),
      runtimeTextures: createRuntimeTextures(),
    });
    expect(result.status).toBe("ready");
    const shader = createShader();
    result.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(
      (shader.uniforms.kingdomArchitectureDetailRepeat!.value as THREE.Vector2).toArray(),
    ).toEqual([1, 1]);
    expect(shader.uniforms.kingdomArchitectureDetailNormalStrength!.value).toBe(0.09);
    expect(shader.uniforms.kingdomArchitectureDetailRoughnessStrength!.value).toBe(0.05);
    result.dispose();
  });

  it("adds bounded emissive warmth only to the dedicated window-glass primitive", () => {
    const source = new THREE.MeshStandardMaterial({
      color: "#7fa6bd",
      opacity: 0.58,
      transparent: true,
      side: THREE.DoubleSide,
    });
    source.name = "MI_WindowGlass";
    source.customProgramCacheKey = () => "window-authored";
    const result = createPlannedArchitectureWindowEmissiveMaterial(HIGH_WALK_GATE, {
      sourceMaterial: source,
      emissiveColor: "#ffb56a",
      emissiveIntensity: 0.68,
    });

    expect(result.status).toBe("ready");
    expect(result.material).not.toBe(source);
    expect(result.material.transparent).toBe(true);
    expect(result.material.opacity).toBe(source.opacity);
    expect(result.material.side).toBe(THREE.DoubleSide);
    expect(result.material.emissive.getHexString()).toBe(new THREE.Color("#ffb56a").getHexString());
    expect(result.material.emissiveIntensity).toBe(0.68);
    expect(result.material.customProgramCacheKey()).toBe("window-authored");
    expect(result).toMatchObject({
      addedDrawCalls: 0,
      addedSamplers: 0,
      addedFragmentTextureReads: 0,
    });
    expect(PLANNED_ARCHITECTURE_DETAIL_ASSET_CONTRACT.windowEmissive).toMatchObject({
      exactMaterialName: "MI_WindowGlass",
      wholeWallTreatmentAllowed: false,
    });

    const cloneDispose = vi.spyOn(result.material, "dispose");
    result.dispose();
    result.dispose();
    expect(cloneDispose).toHaveBeenCalledOnce();

    const wall = createAuthoredMaterial("MI_Plaster");
    const wallResult = createPlannedArchitectureWindowEmissiveMaterial(HIGH_WALK_GATE, {
      sourceMaterial: wall,
      emissiveColor: "#ffb56a",
      emissiveIntensity: 0.68,
    });
    expect(wallResult).toMatchObject({
      status: "skipped",
      reason: "unmatched-window-glass",
      material: wall,
    });
    const orbitResult = createPlannedArchitectureWindowEmissiveMaterial(
      { ...HIGH_WALK_GATE, navigationMode: "orbit" },
      {
        sourceMaterial: source,
        emissiveColor: "#ffb56a",
        emissiveIntensity: 0.68,
      },
    );
    expect(orbitResult).toMatchObject({ status: "skipped", reason: "orbit-mode" });
  });

  it("bounds dedicated window emission without allocating a clone", () => {
    const source = new THREE.MeshStandardMaterial();
    source.name = "MI_WindowGlass";
    expect(() =>
      createPlannedArchitectureWindowEmissiveMaterial(HIGH_WALK_GATE, {
        sourceMaterial: source,
        emissiveColor: "#ffb56a",
        emissiveIntensity: 1.51,
      }),
    ).toThrow("emissiveIntensity must be between 0 and 1.5");
  });

  it("finalizes an already-owned styled material without cloning or double disposal", () => {
    const owned = createAuthoredMaterial("MI_WoodTrim");
    owned.color.set("#76523a");
    const runtimeTextures = createRuntimeTextures();
    const normalAtlasDispose = vi.spyOn(runtimeTextures.normal, "dispose");
    const roughnessAtlasDispose = vi.spyOn(runtimeTextures.roughness, "dispose");
    const materialDispose = vi.spyOn(owned, "dispose");
    const result = finalizePlannedArchitectureMaterial(HIGH_WALK_GATE, {
      ownedMaterial: owned,
      geometry: createGeometry(),
      runtimeTextures,
      surfaceTuning: TUNING,
      windowEmissive: { color: "#ffb56a", intensity: 0.68 },
    });

    expect(result).toMatchObject({
      status: "surface-detail",
      reason: null,
      material: owned,
      ownsMaterial: true,
      addedDrawCalls: 0,
      addedSamplers: 2,
      addedFragmentTextureReads: 2,
    });
    expect(result.material.color.getHexString()).toBe(new THREE.Color("#76523a").getHexString());
    const shader = createShader();
    result.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.kingdomArchitectureDetailSlot!.value).toBe(2);

    result.dispose();
    result.dispose();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(normalAtlasDispose).not.toHaveBeenCalled();
    expect(roughnessAtlasDispose).not.toHaveBeenCalled();
  });

  it("routes owned window glass through zero-sampler emission and owns fallback materials", () => {
    const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.52 });
    glass.name = "MI_WindowGlass";
    const glassDispose = vi.spyOn(glass, "dispose");
    const window = finalizePlannedArchitectureMaterial(HIGH_WALK_GATE, {
      ownedMaterial: glass,
      geometry: createGeometry(false),
      runtimeTextures: null,
      surfaceTuning: TUNING,
      windowEmissive: { color: "#ffad5f", intensity: 0.74 },
    });
    expect(window).toMatchObject({
      status: "window-emissive",
      reason: null,
      material: glass,
      addedDrawCalls: 0,
      addedSamplers: 0,
      addedFragmentTextureReads: 0,
    });
    expect(glass.emissiveIntensity).toBe(0.74);
    window.dispose();
    window.dispose();
    expect(glassDispose).toHaveBeenCalledOnce();

    const orbitOwned = createAuthoredMaterial();
    const orbitDispose = vi.spyOn(orbitOwned, "dispose");
    const orbit = finalizePlannedArchitectureMaterial(
      { ...HIGH_WALK_GATE, navigationMode: "orbit" },
      {
        ownedMaterial: orbitOwned,
        geometry: createGeometry(),
        runtimeTextures: createRuntimeTextures(),
        surfaceTuning: TUNING,
        windowEmissive: { color: "#ffad5f", intensity: 0.74 },
      },
    );
    expect(orbit).toMatchObject({
      status: "authored-only",
      reason: "orbit-mode",
      material: orbitOwned,
      addedSamplers: 0,
      addedFragmentTextureReads: 0,
    });
    orbit.dispose();
    orbit.dispose();
    expect(orbitDispose).toHaveBeenCalledOnce();
  });

  it("rejects out-of-contract tuning before creating an owned material", () => {
    const source = createAuthoredMaterial();
    expect(() =>
      createPlannedArchitectureDetailMaterial(HIGH_WALK_GATE, {
        sourceMaterial: source,
        geometry: createGeometry(),
        runtimeTextures: createRuntimeTextures(),
        tuning: { ...TUNING, normalStrength: 1.01 },
      }),
    ).toThrow("normalStrength must be between 0 and 1");
  });
});
