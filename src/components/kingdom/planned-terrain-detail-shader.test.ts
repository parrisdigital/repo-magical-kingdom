import { readFileSync } from "node:fs";

import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { plannedTerrainMaterialCode, type PlannedGeometryData } from "./planned-terrain-model";
import {
  applyTerrainDetailShader,
  configurePlannedTerrainAtlasTexture,
  createPlannedTerrainLayerWeights,
  disposePlannedTerrainResources,
  PLANNED_TERRAIN_ATLAS_CONTRACTS,
  PLANNED_TERRAIN_ATLAS_UV_PARAMETERS,
  PLANNED_TERRAIN_LAYER_ATTRIBUTE,
  PLANNED_TERRAIN_PROGRAM_CACHE_KEY,
  PLANNED_TERRAIN_SHADER_HASH_SIN_BUDGET,
  PLANNED_TERRAIN_SHADER_TEXTURE_READ_BUDGET,
  PLANNED_TERRAIN_TOP_PROJECTIONS,
  resolvePlannedTerrainAtlasUvParameters,
  resolvePlannedTerrainFlatNormalDirection,
  resolvePlannedTerrainProgramCacheKey,
  type PlannedTerrainQuality,
  type TerrainShaderUniforms,
} from "./planned-terrain";

function createShader() {
  return {
    vertexShader: "#include <common>\n#include <worldpos_vertex>",
    fragmentShader: [
      "#include <common>",
      "#include <color_fragment>",
      "#include <roughnessmap_fragment>",
      "#include <normal_fragment_maps>",
      "#include <aomap_fragment>",
    ].join("\n"),
    uniforms: {},
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
}

function createUniforms(): TerrainShaderUniforms {
  return {
    albedoAtlas: { value: new THREE.Texture() },
    normalAtlas: { value: new THREE.Texture() },
    roughnessAtlas: { value: new THREE.Texture() },
  };
}

function countMatches(source: string, expression: RegExp) {
  return source.match(expression)?.length ?? 0;
}

function createPatchedShader(quality: PlannedTerrainQuality) {
  const shader = createShader();
  applyTerrainDetailShader(shader, 0.9, createUniforms(), quality);
  return shader;
}

function resolveShaderReadBudget(shader: THREE.WebGLProgramParametersWithUniforms) {
  const layeredStart = shader.fragmentShader.indexOf("vec4 kingdomSampleLayeredTerrainAtlas(");
  const layeredEnd = shader.fragmentShader.indexOf(
    "vec3 kingdomTerrainUnpackNormal(",
    layeredStart,
  );
  const normalStart = shader.fragmentShader.indexOf("vec3 kingdomSampleLayeredTerrainNormal(");
  const normalEnd = shader.fragmentShader.indexOf("#include <color_fragment>", normalStart);
  const layeredSource = shader.fragmentShader.slice(layeredStart, layeredEnd);
  const normalSource = shader.fragmentShader.slice(normalStart, normalEnd);
  const layeredReads = countMatches(layeredSource, /kingdomTerrainAtlasSample\(/g);
  const normalReads = countMatches(normalSource, /kingdomTerrainAtlasSample\(/g);
  const layeredInvocations =
    countMatches(shader.fragmentShader, /kingdomSampleLayeredTerrainAtlas\(/g) - 1;
  const normalInvocations =
    countMatches(shader.fragmentShader, /kingdomSampleLayeredTerrainNormal\(/g) - 1;

  return {
    layeredInvocations,
    layeredReads,
    normalInvocations,
    normalReads,
    runtimeReads: layeredReads * layeredInvocations + normalReads * normalInvocations,
  };
}

function resolveShaderHashSinBudget(shader: THREE.WebGLProgramParametersWithUniforms) {
  const valueNoiseStart = shader.fragmentShader.indexOf("float kingdomTerrainValueNoise(");
  const valueNoiseEnd = shader.fragmentShader.indexOf("float kingdomTerrainFbm(", valueNoiseStart);
  const fbmStart = valueNoiseEnd;
  const fbmEnd = shader.fragmentShader.indexOf("vec2 kingdomTerrainRotate(", fbmStart);
  const valueNoiseSource = shader.fragmentShader.slice(valueNoiseStart, valueNoiseEnd);
  const fbmSource = shader.fragmentShader.slice(fbmStart, fbmEnd);
  const hashesPerValueNoise = countMatches(valueNoiseSource, /kingdomTerrainHash\(/g);
  const valueNoiseCallsPerFbm = countMatches(fbmSource, /kingdomTerrainValueNoise\(/g);
  const runtimeFbmCalls = countMatches(shader.fragmentShader, /kingdomTerrainFbm\(/g) - 1;

  return {
    hashesPerValueNoise,
    runtimeFbmCalls,
    valueNoiseCallsPerFbm,
    runtimeHashSinEvaluations: hashesPerValueNoise * valueNoiseCallsPerFbm * runtimeFbmCalls,
  };
}

describe("planned terrain layered PBR shader", () => {
  it("binds authored material layers before color, roughness, normal, and contact shading", () => {
    const shader = createShader();
    const uniforms = createUniforms();

    applyTerrainDetailShader(shader, 0.9, uniforms);

    expect(shader.uniforms.uKingdomTerrainAlbedoAtlas).toBe(uniforms.albedoAtlas);
    expect(shader.uniforms.uKingdomTerrainNormalAtlas).toBe(uniforms.normalAtlas);
    expect(shader.uniforms.uKingdomTerrainRoughnessAtlas).toBe(uniforms.roughnessAtlas);
    expect(shader.vertexShader).toContain(`attribute vec4 ${PLANNED_TERRAIN_LAYER_ATTRIBUTE}`);
    expect(shader.vertexShader).toContain(
      `vKingdomTerrainLayers = ${PLANNED_TERRAIN_LAYER_ATTRIBUTE}`,
    );
    expect(shader.fragmentShader).toContain("vec4 kingdomLayerWeights =");
    expect(shader.fragmentShader).toContain("kingdomTerrainSlopeRock");
    expect(shader.fragmentShader).toContain("kingdomTerrainAltitude");
    expect(shader.fragmentShader).toContain("kingdomSampleLayeredTerrainAtlas");
    expect(shader.fragmentShader).toContain("kingdomSampleLayeredTerrainNormal");
    expect(shader.fragmentShader).toContain(
      "kingdomTerrainTopNormal(grassMap, worldNormal, grassAxis)",
    );
    expect(shader.fragmentShader).toContain(
      "kingdomTerrainTopNormal(soilMap, worldNormal, soilAxis)",
    );
    expect(shader.fragmentShader).toContain(
      "kingdomTerrainTopNormal(shoreMap, worldNormal, shoreAxis)",
    );
    for (const layer of ["grass", "soil", "shore"] as const) {
      const axis = PLANNED_TERRAIN_TOP_PROJECTIONS[layer].rotationAxis
        .map((value) => value.toFixed(6))
        .join(", ");
      expect(shader.fragmentShader.split(`vec2 ${layer}Axis = vec2(${axis});`)).toHaveLength(3);
      expect(shader.fragmentShader).toContain(`kingdomTerrainAtlasSample(atlas, ${layer}Uv`);
    }
    expect(shader.fragmentShader).toContain("roughnessFactor = clamp(");
    expect(shader.fragmentShader).toContain("kingdomTerrainContact * 0.2");

    const layerDeclaration = shader.fragmentShader.indexOf("vec4 kingdomLayerWeights =");
    const albedoSample = shader.fragmentShader.indexOf("vec3 kingdomTerrainAlbedoSample =");
    const roughnessUse = shader.fragmentShader.indexOf("float kingdomTerrainMaterialRoughness =");
    const normalUse = shader.fragmentShader.indexOf("vec3 kingdomTerrainDetailWorldNormal =");
    const contactUse = shader.fragmentShader.indexOf("reflectedLight.indirectDiffuse *=");
    expect(layerDeclaration).toBeGreaterThan(-1);
    expect(layerDeclaration).toBeLessThan(albedoSample);
    expect(albedoSample).toBeLessThan(roughnessUse);
    expect(roughnessUse).toBeLessThan(normalUse);
    expect(normalUse).toBeLessThan(contactUse);
  });

  it("uses smooth domain-warped macro variation instead of visible hash cells", () => {
    const shader = createShader();

    applyTerrainDetailShader(shader, 0.9);

    expect(shader.fragmentShader).toContain("float kingdomTerrainValueNoise(vec2 point)");
    expect(shader.fragmentShader).toContain("vec2 eased = local * local * (3.0 - 2.0 * local)");
    expect(shader.fragmentShader).toContain("float kingdomTerrainFbm(vec2 point)");
    expect(shader.fragmentShader).toContain("kingdomTerrainWarp - 0.5");
    expect(shader.fragmentShader).toContain("texture2DGradEXT(");
    expect(shader.fragmentShader).toContain("dFdx(point) * atlasDerivativeScale");
    expect(shader.fragmentShader).not.toContain("kingdomHash(floor(");
    expect(shader.fragmentShader).not.toContain("uKingdomTerrainTime");
  });

  it("keeps authored albedo readable at Orbit distance without changing Walk detail", () => {
    const high = createPatchedShader("high");
    const low = createPatchedShader("low");

    expect(high.fragmentShader).toContain("vec3 kingdomTerrainDetailAlbedo =");
    expect(high.fragmentShader).toContain("vec3 kingdomTerrainAerialAlbedo =");
    expect(high.fragmentShader).toContain("float kingdomTerrainCameraDistance = length(");
    expect(high.fragmentShader).toContain("float kingdomTerrainAerialBlend = smoothstep(");
    expect(high.fragmentShader).toContain("kingdomTerrainAerialBlend\n);");
    expect(high.fragmentShader).toContain("vec4(0.48, 0.62, 0.78, 0.58)");
    expect(high.fragmentShader).toContain("kingdomTerrainTextureModulation, 0.76");
    expect(high.fragmentShader).toContain("kingdomLayerWeights,\n  1.0\n).rgb;");
    expect(high.fragmentShader).toContain("kingdomLayerWeights,\n  0.085\n).rgb;");
    expect(low.fragmentShader).not.toContain("kingdomTerrainAerialAlbedo");
    expect(low.fragmentShader).not.toContain("kingdomTerrainCameraDistance");
    expect(low.fragmentShader).not.toContain("kingdomTerrainAerialBlend");
  });

  it("stays within explicit, quality-specific texture and hash-sin ceilings", () => {
    const high = createPatchedShader("high");
    const low = createPatchedShader("low");
    const highReads = resolveShaderReadBudget(high);
    const lowReads = resolveShaderReadBudget(low);
    const highHashSin = resolveShaderHashSinBudget(high);
    const lowHashSin = resolveShaderHashSinBudget(low);

    expect(highReads).toEqual({
      layeredInvocations: 3,
      layeredReads: 6,
      normalInvocations: 1,
      normalReads: 6,
      runtimeReads: PLANNED_TERRAIN_SHADER_TEXTURE_READ_BUDGET.high,
    });
    expect(lowReads).toEqual({
      layeredInvocations: 2,
      layeredReads: 4,
      normalInvocations: 1,
      normalReads: 4,
      runtimeReads: PLANNED_TERRAIN_SHADER_TEXTURE_READ_BUDGET.low,
    });
    expect(highHashSin).toEqual({
      hashesPerValueNoise: 4,
      runtimeFbmCalls: 5,
      runtimeHashSinEvaluations: PLANNED_TERRAIN_SHADER_HASH_SIN_BUDGET.high,
      valueNoiseCallsPerFbm: 4,
    });
    expect(lowHashSin).toEqual({
      hashesPerValueNoise: 4,
      runtimeFbmCalls: 1,
      runtimeHashSinEvaluations: PLANNED_TERRAIN_SHADER_HASH_SIN_BUDGET.low,
      valueNoiseCallsPerFbm: 2,
    });
    expect(lowReads.runtimeReads).toBeLessThan(highReads.runtimeReads);
    expect(lowHashSin.runtimeHashSinEvaluations).toBeLessThan(
      highHashSin.runtimeHashSinEvaluations,
    );
  });

  it("produces deterministic static shader source and uniform bindings per quality", () => {
    for (const quality of ["low", "high"] as const) {
      const uniforms = createUniforms();
      const first = createShader();
      const repeated = createShader();

      applyTerrainDetailShader(first, 1.18, uniforms, quality);
      applyTerrainDetailShader(repeated, 1.18, uniforms, quality);

      expect(repeated.vertexShader).toBe(first.vertexShader);
      expect(repeated.fragmentShader).toBe(first.fragmentShader);
      expect(repeated.uniforms).toEqual(first.uniforms);
    }
  });

  for (const quality of ["low", "high"] as const) {
    it(`patches each installed Three standard-material shader anchor exactly once for ${quality}`, () => {
      const shader = {
        vertexShader: THREE.ShaderLib.standard.vertexShader,
        fragmentShader: THREE.ShaderLib.standard.fragmentShader,
        uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
      } as unknown as THREE.WebGLProgramParametersWithUniforms;

      applyTerrainDetailShader(shader, 0.9, createUniforms(), quality);

      expect(shader.vertexShader.match(/attribute vec4 kingdomTerrainLayers;/g)).toHaveLength(1);
      expect(
        shader.vertexShader.match(/vKingdomTerrainLayers = kingdomTerrainLayers;/g),
      ).toHaveLength(1);
      expect(
        shader.fragmentShader.match(/uniform sampler2D uKingdomTerrainAlbedoAtlas;/g),
      ).toHaveLength(1);
      expect(shader.fragmentShader.match(/vec4 kingdomLayerWeights =/g)).toHaveLength(1);
      expect(shader.fragmentShader.match(/roughnessFactor = clamp\(/g)).toHaveLength(1);
      expect(shader.fragmentShader.match(/vec3 kingdomTerrainDetailWorldNormal =/g)).toHaveLength(
        1,
      );
      expect(shader.fragmentShader.match(/reflectedLight.indirectDiffuse \*=/g)).toHaveLength(1);
    });
  }

  it("specializes the material program cache by quality and surface", () => {
    const highSurface = resolvePlannedTerrainProgramCacheKey("high", "surface");
    const lowSurface = resolvePlannedTerrainProgramCacheKey("low", "surface");

    expect(highSurface).toBe(`${PLANNED_TERRAIN_PROGRAM_CACHE_KEY}:high:surface`);
    expect(lowSurface).toBe(`${PLANNED_TERRAIN_PROGRAM_CACHE_KEY}:low:surface`);
    expect(lowSurface).not.toBe(highSurface);
    expect(resolvePlannedTerrainProgramCacheKey("high", "side")).not.toBe(highSurface);
    expect(resolvePlannedTerrainProgramCacheKey("high", "islet")).not.toBe(highSurface);
  });

  it("pairs red and green tangent-normal channels with each rotated top-layer UV axis", () => {
    for (const layer of ["grass", "soil", "shore"] as const) {
      const [axisX, axisZ] = PLANNED_TERRAIN_TOP_PROJECTIONS[layer].rotationAxis;
      const redCapable = resolvePlannedTerrainFlatNormalDirection(layer, [1, 0.5, 0.75]);
      const redHorizontalLength = Math.hypot(redCapable.x, redCapable.z);
      const greenCapable = resolvePlannedTerrainFlatNormalDirection(layer, [0.5, 1, 0.75]);
      const greenHorizontalLength = Math.hypot(greenCapable.x, greenCapable.z);

      expect(redHorizontalLength).toBeGreaterThan(0);
      expect(redCapable.x / redHorizontalLength).toBeCloseTo(axisX, 5);
      expect(redCapable.z / redHorizontalLength).toBeCloseTo(axisZ, 5);
      expect(greenHorizontalLength).toBeGreaterThan(0);
      expect(greenCapable.x / greenHorizontalLength).toBeCloseTo(-axisZ, 5);
      expect(greenCapable.z / greenHorizontalLength).toBeCloseTo(axisX, 5);
    }
  });

  it("keeps terrain texture and shader work out of the render loop", () => {
    const source = readFileSync(new URL("./planned-terrain.tsx", import.meta.url), "utf8");
    const componentStart = source.indexOf("export function PlannedTerrain({");
    const componentEnd = source.indexOf("export function PlannedWatershed({", componentStart);
    const componentSource = source.slice(componentStart, componentEnd);

    expect(componentStart).toBeGreaterThan(-1);
    expect(componentEnd).toBeGreaterThan(componentStart);
    expect(componentSource).not.toContain("useFrame(");
    expect(componentSource).not.toContain("new THREE.");
    expect(componentSource).toContain("useMemo(");
    expect(componentSource).toContain(
      "applyTerrainDetailShader(shader, 0.9, terrainUniforms, quality)",
    );
    expect(componentSource).toContain('resolvePlannedTerrainProgramCacheKey(quality, "surface")');
  });
});

describe("planned terrain layer and texture resources", () => {
  it("encodes deterministic normalized grass, soil, rock, and shore weights", () => {
    const materialZones = new Uint8Array([
      plannedTerrainMaterialCode("low-meadow"),
      plannedTerrainMaterialCode("settlement-soil"),
      plannedTerrainMaterialCode("scree"),
      plannedTerrainMaterialCode("shore"),
      plannedTerrainMaterialCode("lake-bed"),
    ]);
    const data: PlannedGeometryData = {
      positions: new Float32Array(materialZones.length * 3),
      indices: new Uint32Array(0),
      materialZones,
      vertexCount: materialZones.length,
      triangleCount: 0,
    };

    const first = createPlannedTerrainLayerWeights(data);
    const repeated = createPlannedTerrainLayerWeights(data);

    expect(repeated).toEqual(first);
    expect(Array.from(first.slice(0, 4))).toEqual([255, 0, 0, 0]);
    expect(Array.from(first.slice(4, 8))).toEqual([84, 171, 0, 0]);
    expect(Array.from(first.slice(8, 12))).toEqual([0, 45, 210, 0]);
    expect(Array.from(first.slice(12, 16))).toEqual([0, 0, 0, 255]);
    expect(Array.from(first.slice(16, 20))).toEqual([0, 144, 0, 111]);
    for (let offset = 0; offset < first.length; offset += 4) {
      expect(first[offset]! + first[offset + 1]! + first[offset + 2]! + first[offset + 3]!).toBe(
        255,
      );
    }
  });

  it("keeps high and low atlas gutters equivalent and inside decoded texture budgets", () => {
    const high = PLANNED_TERRAIN_ATLAS_CONTRACTS.high;
    const low = PLANNED_TERRAIN_ATLAS_CONTRACTS.low;

    for (const contract of [low, high]) {
      expect(contract.cellSize * 4).toBe(contract.width);
      expect(contract.usableTileSize + contract.gutter * 2).toBe(contract.cellSize);
      expect(contract.bilinearSafeMipmapLevel).toBeGreaterThanOrEqual(6);
      expect(Object.values(contract.urls)).toHaveLength(3);
      expect(Object.values(contract.urls).every((url) => url.endsWith(".webp"))).toBe(true);
    }
    expect(low.gutter / low.width).toBe(high.gutter / high.width);
    expect(low.gutter / low.height).toBe(high.gutter / high.height);
    expect(low.usableTileSize / low.width).toBe(high.usableTileSize / high.width);
    expect(low.gutter).toBe(32);
    expect(high.gutter).toBe(64);
    expect(low.usableTileSize).toBe(448);
    expect(high.usableTileSize).toBe(896);
    expect(low.decodedBytesWithMipmaps).toBeLessThanOrEqual(16 * 1_024 * 1_024);
    expect(high.decodedBytesWithMipmaps).toBeLessThanOrEqual(64 * 1_024 * 1_024);
  });

  it("derives one shared shader UV transform from both atlas tiers", () => {
    const high = resolvePlannedTerrainAtlasUvParameters(PLANNED_TERRAIN_ATLAS_CONTRACTS.high);
    const low = resolvePlannedTerrainAtlasUvParameters(PLANNED_TERRAIN_ATLAS_CONTRACTS.low);
    const shader = createShader();

    applyTerrainDetailShader(shader, 0.9);

    expect(low).toEqual(high);
    expect(PLANNED_TERRAIN_ATLAS_UV_PARAMETERS).toEqual(high);
    expect(high).toEqual({
      slotSpan: 0.25,
      gutterU: 0.015625,
      gutterV: 0.0625,
      usableU: 0.21875,
      usableV: 0.875,
    });
    expect(shader.fragmentShader).toContain(
      `slot * ${high.slotSpan.toFixed(8)} + ${high.gutterU.toFixed(8)}`,
    );
    expect(shader.fragmentShader).toContain(
      `${high.gutterV.toFixed(8)} + tileUv.y * ${high.usableV.toFixed(8)}`,
    );
    expect(shader.fragmentShader).toContain(
      `vec2 atlasDerivativeScale = vec2(${high.usableU.toFixed(8)}, ${high.usableV.toFixed(8)})`,
    );
    expect(shader.fragmentShader).not.toContain("0.001953125");
    expect(shader.fragmentShader).not.toContain("0.984375");
  });

  it("configures color and data atlases without allowing outer-atlas wrapping", () => {
    const albedo = configurePlannedTerrainAtlasTexture(new THREE.Texture(), "albedo", "high");
    const normal = configurePlannedTerrainAtlasTexture(new THREE.Texture(), "normal", "low");

    expect(albedo.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(normal.colorSpace).toBe(THREE.NoColorSpace);
    expect(albedo.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(albedo.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(albedo.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(albedo.anisotropy).toBe(8);
    expect(normal.anisotropy).toBe(4);
  });

  it("disposes each owned geometry or atlas exactly once", () => {
    const first = { dispose: vi.fn() };
    const second = { dispose: vi.fn() };

    disposePlannedTerrainResources([first, second]);

    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
  });
});
