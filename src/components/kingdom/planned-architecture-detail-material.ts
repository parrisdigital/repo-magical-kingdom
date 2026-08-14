import * as THREE from "three";

export type PlannedArchitectureSurfaceFamily = "plaster" | "brick" | "wood" | "roof-tile";
export type PlannedArchitectureDetailQuality = "low" | "high";
export type PlannedArchitectureNavigationMode = "orbit" | "walk";

export type PlannedArchitectureSurfaceClassification =
  | Readonly<{
      matched: true;
      materialName: string;
      family: PlannedArchitectureSurfaceFamily;
      slot: number;
    }>
  | Readonly<{
      matched: false;
      materialName: string;
      family: null;
      slot: null;
    }>;

export type PlannedArchitectureMaterialRoleClassification =
  | Readonly<{
      matched: true;
      materialName: string;
      role: PlannedArchitectureSurfaceFamily;
      family: PlannedArchitectureSurfaceFamily;
      slot: number;
    }>
  | Readonly<{
      matched: true;
      materialName: "MI_WindowGlass";
      role: "window-glass";
      family: null;
      slot: null;
    }>
  | Readonly<{
      matched: false;
      materialName: string;
      role: null;
      family: null;
      slot: null;
    }>;

export type PlannedArchitectureDetailRuntimeGate = Readonly<{
  detailEnabled: boolean;
  navigationMode: PlannedArchitectureNavigationMode;
  quality: PlannedArchitectureDetailQuality;
}>;

export type PlannedArchitectureDetailTuning = Readonly<{
  repeat: readonly [number, number];
  normalStrength: number;
  roughnessStrength: number;
}>;

export const PLANNED_ARCHITECTURE_DETAIL_PROGRAM_CACHE_KEY =
  "planned-architecture-detail:v1:normal-roughness-two-sample";

const SURFACES_BY_EXACT_MATERIAL_NAME = Object.freeze({
  MI_Plaster: Object.freeze({ family: "plaster" as const, slot: 0 }),
  MI_UnevenBrick: Object.freeze({ family: "brick" as const, slot: 1 }),
  MI_WoodTrim: Object.freeze({ family: "wood" as const, slot: 2 }),
  MI_RoundTiles: Object.freeze({ family: "roof-tile" as const, slot: 3 }),
});

const ROUGHNESS_NEUTRAL_BY_FAMILY: Readonly<Record<PlannedArchitectureSurfaceFamily, number>> =
  Object.freeze({
    plaster: 0.90710625,
    brick: 0.79350803,
    wood: 0.23434074,
    "roof-tile": 0.67380019,
  });

export const PLANNED_ARCHITECTURE_DETAIL_DEFAULT_TUNING: Readonly<
  Record<PlannedArchitectureSurfaceFamily, PlannedArchitectureDetailTuning>
> = Object.freeze({
  plaster: Object.freeze({
    repeat: Object.freeze([3, 3] as const),
    normalStrength: 0.2,
    roughnessStrength: 0.08,
  }),
  brick: Object.freeze({
    repeat: Object.freeze([1, 1] as const),
    normalStrength: 0.1,
    roughnessStrength: 0.05,
  }),
  wood: Object.freeze({
    repeat: Object.freeze([3, 3] as const),
    normalStrength: 0.16,
    roughnessStrength: 0.08,
  }),
  "roof-tile": Object.freeze({
    repeat: Object.freeze([1, 1] as const),
    normalStrength: 0.09,
    roughnessStrength: 0.05,
  }),
});

export const PLANNED_ARCHITECTURE_DETAIL_ASSET_CONTRACT = Object.freeze({
  manifestUrl: "/assets/world/architecture/polyhaven/architecture-detail-atlas.json",
  sourceLicense: "CC0-1.0" as const,
  sourceProvider: "Poly Haven" as const,
  tiers: Object.freeze({
    high: Object.freeze({
      width: 4_096,
      height: 1_024,
      cellSize: 1_024,
      gutter: 64,
      usableTileSize: 896,
      bilinearSafeThroughMipLevel: 7,
      urls: Object.freeze({
        albedo: "/assets/world/architecture/polyhaven/architecture-detail-albedo-high.webp",
        normal: "/assets/world/architecture/polyhaven/architecture-detail-normal-gl-high.webp",
        roughness: "/assets/world/architecture/polyhaven/architecture-detail-roughness-high.webp",
      }),
    }),
    low: Object.freeze({
      width: 2_048,
      height: 512,
      cellSize: 512,
      gutter: 32,
      usableTileSize: 448,
      bilinearSafeThroughMipLevel: 6,
      urls: Object.freeze({
        albedo: "/assets/world/architecture/polyhaven/architecture-detail-albedo-low.webp",
        normal: "/assets/world/architecture/polyhaven/architecture-detail-normal-gl-low.webp",
        roughness: "/assets/world/architecture/polyhaven/architecture-detail-roughness-low.webp",
      }),
    }),
  }),
  runtimeGate: Object.freeze({
    navigationMode: "walk" as const,
    quality: "high" as const,
    detailEnabled: true as const,
    orbitAddedTextureReads: 0,
    lowQualityAddedTextureReads: 0,
  }),
  windowEmissive: Object.freeze({
    exactMaterialName: "MI_WindowGlass" as const,
    navigationMode: "walk" as const,
    quality: "high" as const,
    maximumIntensity: 1.5,
    addedDrawCalls: 0,
    addedSamplers: 0,
    addedFragmentTextureReads: 0,
    wholeWallTreatmentAllowed: false as const,
  }),
  shaderBudget: Object.freeze({
    addedSamplers: 2,
    addedFragmentTextureReads: 2,
    albedoTextureReads: 0,
    sampledChannels: Object.freeze(["normal", "roughness"] as const),
  }),
  memoryBudget: Object.freeze({
    shippedBundleBytes: 2_116_302,
    highAllChannelsDecodedBaseMiB: 48,
    highAllChannelsDecodedWithMipsMiB: 64,
    highRuntimeChannelsDecodedBaseMiB: 32,
    highRuntimeChannelsDecodedWithMipsMiB: 42.67,
    lowAllChannelsDecodedBaseMiB: 12,
    lowAllChannelsDecodedWithMipsMiB: 16,
    lowRuntimeChannelsDecodedBaseMiB: 8,
    lowRuntimeChannelsDecodedWithMipsMiB: 10.67,
  }),
  tuningLimits: Object.freeze({
    repeat: Object.freeze({ minimum: 0.25, maximum: 64 }),
    normalStrength: Object.freeze({ minimum: 0, maximum: 1 }),
    roughnessStrength: Object.freeze({ minimum: 0, maximum: 0.5 }),
  }),
  authoredBaseColorPolicy: "preserve" as const,
  atlasAlbedoRuntimeUsage: "audited-reference-only" as const,
});

type PlannedArchitectureDetailTextureLoader = Readonly<{
  loadAsync: (url: string) => Promise<THREE.Texture>;
}>;

export type PlannedArchitectureDetailRuntimeTextures = Readonly<{
  normal: THREE.Texture;
  roughness: THREE.Texture;
}>;

type PlannedArchitectureDetailRuntimeDisabled = Readonly<{
  status: "disabled";
  reason: "detail-disabled" | "orbit-mode" | "low-quality";
  textures: null;
  addedSamplers: 0;
  addedFragmentTextureReads: 0;
  dispose: () => void;
}>;

type PlannedArchitectureDetailRuntimeUnavailable = Readonly<{
  status: "unavailable";
  reason: "texture-load-failed";
  error: unknown;
  textures: null;
  addedSamplers: 0;
  addedFragmentTextureReads: 0;
  dispose: () => void;
}>;

export type PlannedArchitectureDetailRuntimeTextureOwner = Readonly<{
  status: "ready";
  reason: null;
  textures: PlannedArchitectureDetailRuntimeTextures;
  addedSamplers: 2;
  addedFragmentTextureReads: 2;
  dispose: () => void;
}>;

export type PlannedArchitectureDetailRuntimeTextureResult =
  | PlannedArchitectureDetailRuntimeDisabled
  | PlannedArchitectureDetailRuntimeUnavailable
  | PlannedArchitectureDetailRuntimeTextureOwner;

type PlannedArchitectureDetailShader = {
  fragmentShader: string;
  uniforms: Record<string, THREE.IUniform>;
};

type PlannedArchitectureDetailShaderConfiguration = Readonly<{
  family: PlannedArchitectureSurfaceFamily;
  slot: number;
  normalAtlas: THREE.Texture;
  roughnessAtlas: THREE.Texture;
  tuning: PlannedArchitectureDetailTuning;
}>;

const NOOP = () => undefined;

function disabledRuntimeResult(
  reason: PlannedArchitectureDetailRuntimeDisabled["reason"],
): PlannedArchitectureDetailRuntimeDisabled {
  return Object.freeze({
    status: "disabled" as const,
    reason,
    textures: null,
    addedSamplers: 0 as const,
    addedFragmentTextureReads: 0 as const,
    dispose: NOOP,
  });
}

export function evaluatePlannedArchitectureDetailRuntimeGate(
  gate: PlannedArchitectureDetailRuntimeGate,
): PlannedArchitectureDetailRuntimeDisabled["reason"] | null {
  if (!gate.detailEnabled) return "detail-disabled";
  if (gate.navigationMode !== "walk") return "orbit-mode";
  if (gate.quality !== "high") return "low-quality";
  return null;
}

export function classifyPlannedArchitectureSurface(
  materialName: string,
): PlannedArchitectureSurfaceClassification {
  const match = SURFACES_BY_EXACT_MATERIAL_NAME[
    materialName as keyof typeof SURFACES_BY_EXACT_MATERIAL_NAME
  ] as { family: PlannedArchitectureSurfaceFamily; slot: number } | undefined;
  if (!match) {
    return Object.freeze({
      matched: false as const,
      materialName,
      family: null,
      slot: null,
    });
  }
  return Object.freeze({
    matched: true as const,
    materialName,
    family: match.family,
    slot: match.slot,
  });
}

export function classifyPlannedArchitectureMaterialRole(
  materialName: string,
): PlannedArchitectureMaterialRoleClassification {
  const surface = classifyPlannedArchitectureSurface(materialName);
  if (surface.matched) {
    return Object.freeze({
      ...surface,
      role: surface.family,
    });
  }
  if (materialName === "MI_WindowGlass") {
    return Object.freeze({
      matched: true as const,
      materialName: "MI_WindowGlass" as const,
      role: "window-glass" as const,
      family: null,
      slot: null,
    });
  }
  return Object.freeze({
    matched: false as const,
    materialName,
    role: null,
    family: null,
    slot: null,
  });
}

function configureRuntimeDetailTexture(
  texture: THREE.Texture,
  channel: keyof PlannedArchitectureDetailRuntimeTextures,
  maximumAnisotropy: number,
): THREE.Texture {
  texture.name = `planned-architecture-detail-high-${channel}`;
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Number.isFinite(maximumAnisotropy)
    ? Math.max(1, Math.min(8, Math.floor(maximumAnisotropy)))
    : 1;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Loads only the two data atlases sampled by the detail shader. Orbit, low quality,
 * and disabled detail return before the loader is touched. The owner exclusively
 * owns these two atlas textures and disposes each at most once.
 */
export async function loadPlannedArchitectureDetailRuntimeTextures(
  gate: PlannedArchitectureDetailRuntimeGate,
  options: Readonly<{
    loader?: PlannedArchitectureDetailTextureLoader;
    maximumAnisotropy?: number;
  }> = {},
): Promise<PlannedArchitectureDetailRuntimeTextureResult> {
  const disabledReason = evaluatePlannedArchitectureDetailRuntimeGate(gate);
  if (disabledReason) return disabledRuntimeResult(disabledReason);

  const loader = options.loader ?? new THREE.TextureLoader();
  const maximumAnisotropy = options.maximumAnisotropy ?? 4;
  const urls = PLANNED_ARCHITECTURE_DETAIL_ASSET_CONTRACT.tiers.high.urls;
  const results = await Promise.allSettled([
    loader.loadAsync(urls.normal),
    loader.loadAsync(urls.roughness),
  ]);
  const loadedTextures = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  if (rejected) {
    for (const texture of new Set(loadedTextures)) texture.dispose();
    return Object.freeze({
      status: "unavailable" as const,
      reason: "texture-load-failed" as const,
      error: rejected.reason,
      textures: null,
      addedSamplers: 0 as const,
      addedFragmentTextureReads: 0 as const,
      dispose: NOOP,
    });
  }

  const textures = Object.freeze({
    normal: configureRuntimeDetailTexture(loadedTextures[0]!, "normal", maximumAnisotropy),
    roughness: configureRuntimeDetailTexture(loadedTextures[1]!, "roughness", maximumAnisotropy),
  });
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const texture of new Set(Object.values(textures))) texture.dispose();
  };

  return Object.freeze({
    status: "ready" as const,
    reason: null,
    textures,
    addedSamplers: 2 as const,
    addedFragmentTextureReads: 2 as const,
    dispose,
  });
}

function validateTuning(tuning: PlannedArchitectureDetailTuning): void {
  const limits = PLANNED_ARCHITECTURE_DETAIL_ASSET_CONTRACT.tuningLimits;
  const values = [
    ["repeat.x", tuning.repeat[0], limits.repeat],
    ["repeat.y", tuning.repeat[1], limits.repeat],
    ["normalStrength", tuning.normalStrength, limits.normalStrength],
    ["roughnessStrength", tuning.roughnessStrength, limits.roughnessStrength],
  ] as const;
  for (const [name, value, limit] of values) {
    if (!Number.isFinite(value) || value < limit.minimum || value > limit.maximum) {
      throw new RangeError(`${name} must be between ${limit.minimum} and ${limit.maximum}`);
    }
  }
}

const DETAIL_PARS_FRAGMENT = /* glsl */ `
#define PLANNED_ARCHITECTURE_DETAIL_SHADER_V1
uniform sampler2D kingdomArchitectureDetailNormalAtlas;
uniform sampler2D kingdomArchitectureDetailRoughnessAtlas;
uniform vec4 kingdomArchitectureDetailAtlasLayout;
uniform vec2 kingdomArchitectureDetailRepeat;
uniform float kingdomArchitectureDetailSlot;
uniform float kingdomArchitectureDetailMaximumMip;
uniform float kingdomArchitectureDetailNormalStrength;
uniform float kingdomArchitectureDetailRoughnessStrength;
uniform float kingdomArchitectureDetailRoughnessNeutral;

vec4 sampleKingdomArchitectureDetailAtlas( sampler2D atlas, vec2 sourceUv ) {
  vec2 repeatedUv = sourceUv * kingdomArchitectureDetailRepeat;
  float cellSize = kingdomArchitectureDetailAtlasLayout.z;
  float gutter = kingdomArchitectureDetailAtlasLayout.w;
  float usableTileSize = cellSize - 2.0 * gutter;
  vec2 atlasSize = kingdomArchitectureDetailAtlasLayout.xy;
  vec2 atlasPixel = vec2(
    kingdomArchitectureDetailSlot * cellSize + gutter,
    gutter
  ) + fract( repeatedUv ) * usableTileSize;
  vec2 gradientXTexels = dFdx( repeatedUv ) * usableTileSize;
  vec2 gradientYTexels = dFdy( repeatedUv ) * usableTileSize;
  float requestedFootprint = max( length( gradientXTexels ), length( gradientYTexels ) );
  float maximumFootprint = exp2( kingdomArchitectureDetailMaximumMip );
  float detailFade = 1.0 - smoothstep(
    maximumFootprint * 0.5,
    maximumFootprint,
    requestedFootprint
  );
  gradientXTexels *= min(
    1.0,
    maximumFootprint / max( length( gradientXTexels ), 0.000001 )
  );
  gradientYTexels *= min(
    1.0,
    maximumFootprint / max( length( gradientYTexels ), 0.000001 )
  );
  vec4 detailSample = texture2DGradEXT(
    atlas,
    atlasPixel / atlasSize,
    gradientXTexels / atlasSize,
    gradientYTexels / atlasSize
  );
  detailSample.a = detailFade;
  return detailSample;
}
`;

const DETAIL_NORMAL_FRAGMENT = /* glsl */ `
vec4 kingdomArchitectureDetailNormalSample = sampleKingdomArchitectureDetailAtlas(
  kingdomArchitectureDetailNormalAtlas,
  vMapUv
);
vec3 kingdomArchitectureDetailNormalTs =
  kingdomArchitectureDetailNormalSample.xyz * 2.0 - 1.0;
kingdomArchitectureDetailNormalTs.xy *=
  kingdomArchitectureDetailNormalStrength * kingdomArchitectureDetailNormalSample.a;
kingdomArchitectureDetailNormalTs = normalize( kingdomArchitectureDetailNormalTs );
vec3 kingdomArchitectureDetailNormalVs = normalize( tbn * kingdomArchitectureDetailNormalTs );
normal = normalize(
  normal + kingdomArchitectureDetailNormalVs - nonPerturbedNormal
);
`;

const DETAIL_ROUGHNESS_FRAGMENT = /* glsl */ `
vec4 kingdomArchitectureDetailRoughnessSample = sampleKingdomArchitectureDetailAtlas(
  kingdomArchitectureDetailRoughnessAtlas,
  vMapUv
);
float kingdomArchitectureDetailRoughness = kingdomArchitectureDetailRoughnessSample.r;
roughnessFactor = clamp(
  roughnessFactor +
    ( kingdomArchitectureDetailRoughness - kingdomArchitectureDetailRoughnessNeutral ) *
      kingdomArchitectureDetailRoughnessStrength * kingdomArchitectureDetailRoughnessSample.a,
  0.04,
  1.0
);
`;

export function patchPlannedArchitectureDetailShader(
  shader: PlannedArchitectureDetailShader,
  configuration: PlannedArchitectureDetailShaderConfiguration,
): boolean {
  const commonAnchor = "#include <common>";
  const normalAnchor = "#include <normal_fragment_maps>";
  const roughnessAnchor = "#include <roughnessmap_fragment>";
  if (
    !shader.fragmentShader.includes(commonAnchor) ||
    !shader.fragmentShader.includes(normalAnchor) ||
    !shader.fragmentShader.includes(roughnessAnchor)
  ) {
    return false;
  }

  validateTuning(configuration.tuning);
  const tier = PLANNED_ARCHITECTURE_DETAIL_ASSET_CONTRACT.tiers.high;
  shader.uniforms.kingdomArchitectureDetailNormalAtlas = {
    value: configuration.normalAtlas,
  };
  shader.uniforms.kingdomArchitectureDetailRoughnessAtlas = {
    value: configuration.roughnessAtlas,
  };
  shader.uniforms.kingdomArchitectureDetailAtlasLayout = {
    value: new THREE.Vector4(tier.width, tier.height, tier.cellSize, tier.gutter),
  };
  shader.uniforms.kingdomArchitectureDetailRepeat = {
    value: new THREE.Vector2(...configuration.tuning.repeat),
  };
  shader.uniforms.kingdomArchitectureDetailSlot = { value: configuration.slot };
  shader.uniforms.kingdomArchitectureDetailMaximumMip = {
    value: tier.bilinearSafeThroughMipLevel,
  };
  shader.uniforms.kingdomArchitectureDetailNormalStrength = {
    value: configuration.tuning.normalStrength,
  };
  shader.uniforms.kingdomArchitectureDetailRoughnessStrength = {
    value: configuration.tuning.roughnessStrength,
  };
  shader.uniforms.kingdomArchitectureDetailRoughnessNeutral = {
    value: ROUGHNESS_NEUTRAL_BY_FAMILY[configuration.family],
  };

  shader.fragmentShader = shader.fragmentShader
    .replace(commonAnchor, `${commonAnchor}\n${DETAIL_PARS_FRAGMENT}`)
    .replace(normalAnchor, `${normalAnchor}\n${DETAIL_NORMAL_FRAGMENT}`)
    .replace(roughnessAnchor, `${roughnessAnchor}\n${DETAIL_ROUGHNESS_FRAGMENT}`);
  return true;
}

type PlannedArchitectureDetailSkipReason =
  | PlannedArchitectureDetailRuntimeDisabled["reason"]
  | "unmatched-material"
  | "missing-uv0"
  | "missing-authored-base-map"
  | "missing-authored-normal-map"
  | "missing-authored-roughness-map"
  | "unsupported-normal-map-type"
  | "runtime-textures-unavailable";

export type PlannedArchitectureDetailMaterialResult =
  | Readonly<{
      status: "skipped";
      reason: PlannedArchitectureDetailSkipReason;
      classification: PlannedArchitectureSurfaceClassification;
      material: THREE.MeshStandardMaterial;
      ownsMaterial: false;
      addedSamplers: 0;
      addedFragmentTextureReads: 0;
      dispose: () => void;
    }>
  | Readonly<{
      status: "ready";
      reason: null;
      classification: Extract<PlannedArchitectureSurfaceClassification, { matched: true }>;
      material: THREE.MeshStandardMaterial;
      ownsMaterial: true;
      addedSamplers: 2;
      addedFragmentTextureReads: 2;
      dispose: () => void;
    }>;

function skippedMaterialResult(
  reason: PlannedArchitectureDetailSkipReason,
  classification: PlannedArchitectureSurfaceClassification,
  material: THREE.MeshStandardMaterial,
): PlannedArchitectureDetailMaterialResult {
  return Object.freeze({
    status: "skipped" as const,
    reason,
    classification,
    material,
    ownsMaterial: false as const,
    addedSamplers: 0 as const,
    addedFragmentTextureReads: 0 as const,
    dispose: NOOP,
  });
}

/**
 * Creates an owned material clone for one exact modular-home surface role.
 * Authored color/maps stay attached and untouched; only shader uniforms and
 * onBeforeCompile on the clone change. The returned disposer owns the clone,
 * never authored textures or the shared detail-atlas texture owner.
 */
export function createPlannedArchitectureDetailMaterial(
  gate: PlannedArchitectureDetailRuntimeGate,
  options: Readonly<{
    sourceMaterial: THREE.MeshStandardMaterial;
    geometry: THREE.BufferGeometry;
    runtimeTextures: PlannedArchitectureDetailRuntimeTextures | null;
    tuning?: PlannedArchitectureDetailTuning;
  }>,
): PlannedArchitectureDetailMaterialResult {
  const classification = classifyPlannedArchitectureSurface(options.sourceMaterial.name);
  if (!classification.matched) {
    return skippedMaterialResult("unmatched-material", classification, options.sourceMaterial);
  }

  const disabledReason = evaluatePlannedArchitectureDetailRuntimeGate(gate);
  if (disabledReason) {
    return skippedMaterialResult(disabledReason, classification, options.sourceMaterial);
  }
  if (!options.runtimeTextures) {
    return skippedMaterialResult(
      "runtime-textures-unavailable",
      classification,
      options.sourceMaterial,
    );
  }
  if (!options.geometry.hasAttribute("uv")) {
    return skippedMaterialResult("missing-uv0", classification, options.sourceMaterial);
  }
  if (!options.sourceMaterial.map) {
    return skippedMaterialResult(
      "missing-authored-base-map",
      classification,
      options.sourceMaterial,
    );
  }
  if (!options.sourceMaterial.normalMap) {
    return skippedMaterialResult(
      "missing-authored-normal-map",
      classification,
      options.sourceMaterial,
    );
  }
  if (!options.sourceMaterial.roughnessMap) {
    return skippedMaterialResult(
      "missing-authored-roughness-map",
      classification,
      options.sourceMaterial,
    );
  }
  if (options.sourceMaterial.normalMapType !== THREE.TangentSpaceNormalMap) {
    return skippedMaterialResult(
      "unsupported-normal-map-type",
      classification,
      options.sourceMaterial,
    );
  }
  const tuning =
    options.tuning ?? PLANNED_ARCHITECTURE_DETAIL_DEFAULT_TUNING[classification.family];
  validateTuning(tuning);

  const material = options.sourceMaterial.clone();
  material.onBeforeCompile = options.sourceMaterial.onBeforeCompile;
  material.customProgramCacheKey = options.sourceMaterial.customProgramCacheKey;
  const previousOnBeforeCompile = material.onBeforeCompile;
  const previousCustomProgramCacheKey = material.customProgramCacheKey;
  const previousProgramCacheKey = previousCustomProgramCacheKey.call(material);

  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    previousOnBeforeCompile.call(this, shader, renderer);
    patchPlannedArchitectureDetailShader(shader, {
      family: classification.family,
      slot: classification.slot,
      normalAtlas: options.runtimeTextures!.normal,
      roughnessAtlas: options.runtimeTextures!.roughness,
      tuning,
    });
  };
  material.customProgramCacheKey = () =>
    `${previousProgramCacheKey}|${PLANNED_ARCHITECTURE_DETAIL_PROGRAM_CACHE_KEY}`;
  material.needsUpdate = true;

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    material.onBeforeCompile = previousOnBeforeCompile;
    material.customProgramCacheKey = previousCustomProgramCacheKey;
    material.dispose();
  };

  return Object.freeze({
    status: "ready" as const,
    reason: null,
    classification,
    material,
    ownsMaterial: true as const,
    addedSamplers: 2 as const,
    addedFragmentTextureReads: 2 as const,
    dispose,
  });
}

export type PlannedArchitectureWindowEmissiveMaterialResult =
  | Readonly<{
      status: "skipped";
      reason: PlannedArchitectureDetailRuntimeDisabled["reason"] | "unmatched-window-glass";
      classification: PlannedArchitectureMaterialRoleClassification;
      material: THREE.MeshStandardMaterial;
      ownsMaterial: false;
      addedDrawCalls: 0;
      addedSamplers: 0;
      addedFragmentTextureReads: 0;
      dispose: () => void;
    }>
  | Readonly<{
      status: "ready";
      reason: null;
      classification: Extract<
        PlannedArchitectureMaterialRoleClassification,
        { role: "window-glass" }
      >;
      material: THREE.MeshStandardMaterial;
      ownsMaterial: true;
      addedDrawCalls: 0;
      addedSamplers: 0;
      addedFragmentTextureReads: 0;
      dispose: () => void;
    }>;

/**
 * Adds bounded emissive warmth only to the dedicated MI_WindowGlass primitive.
 * MeshStandardMaterial already carries emissive uniforms, so this clone adds no
 * shader sampler, texture read, program variant, or draw call.
 */
export function createPlannedArchitectureWindowEmissiveMaterial(
  gate: PlannedArchitectureDetailRuntimeGate,
  options: Readonly<{
    sourceMaterial: THREE.MeshStandardMaterial;
    emissiveColor: THREE.ColorRepresentation;
    emissiveIntensity: number;
  }>,
): PlannedArchitectureWindowEmissiveMaterialResult {
  const classification = classifyPlannedArchitectureMaterialRole(options.sourceMaterial.name);
  if (!classification.matched || classification.role !== "window-glass") {
    return Object.freeze({
      status: "skipped" as const,
      reason: "unmatched-window-glass" as const,
      classification,
      material: options.sourceMaterial,
      ownsMaterial: false as const,
      addedDrawCalls: 0 as const,
      addedSamplers: 0 as const,
      addedFragmentTextureReads: 0 as const,
      dispose: NOOP,
    });
  }

  const disabledReason = evaluatePlannedArchitectureDetailRuntimeGate(gate);
  if (disabledReason) {
    return Object.freeze({
      status: "skipped" as const,
      reason: disabledReason,
      classification,
      material: options.sourceMaterial,
      ownsMaterial: false as const,
      addedDrawCalls: 0 as const,
      addedSamplers: 0 as const,
      addedFragmentTextureReads: 0 as const,
      dispose: NOOP,
    });
  }

  const maximumIntensity =
    PLANNED_ARCHITECTURE_DETAIL_ASSET_CONTRACT.windowEmissive.maximumIntensity;
  if (
    !Number.isFinite(options.emissiveIntensity) ||
    options.emissiveIntensity < 0 ||
    options.emissiveIntensity > maximumIntensity
  ) {
    throw new RangeError(`emissiveIntensity must be between 0 and ${maximumIntensity}`);
  }

  const material = options.sourceMaterial.clone();
  material.onBeforeCompile = options.sourceMaterial.onBeforeCompile;
  material.customProgramCacheKey = options.sourceMaterial.customProgramCacheKey;
  material.emissive.set(options.emissiveColor);
  material.emissiveIntensity = options.emissiveIntensity;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    material.dispose();
  };

  return Object.freeze({
    status: "ready" as const,
    reason: null,
    classification,
    material,
    ownsMaterial: true as const,
    addedDrawCalls: 0 as const,
    addedSamplers: 0 as const,
    addedFragmentTextureReads: 0 as const,
    dispose,
  });
}

export type FinalizedPlannedArchitectureMaterial = Readonly<{
  status: "surface-detail" | "window-emissive" | "authored-only";
  reason: PlannedArchitectureDetailSkipReason | "unmatched-material" | null;
  classification: PlannedArchitectureMaterialRoleClassification;
  material: THREE.MeshStandardMaterial;
  ownsMaterial: true;
  addedDrawCalls: 0;
  addedSamplers: 0 | 2;
  addedFragmentTextureReads: 0 | 2;
  dispose: () => void;
}>;

/**
 * Final scene-integration boundary for a material that the caller has already
 * cloned and styled. This function never clones again. It owns and disposes that
 * material exactly once, while the shared runtime texture owner remains separate.
 */
export function finalizePlannedArchitectureMaterial(
  gate: PlannedArchitectureDetailRuntimeGate,
  options: Readonly<{
    ownedMaterial: THREE.MeshStandardMaterial;
    geometry: THREE.BufferGeometry;
    runtimeTextures: PlannedArchitectureDetailRuntimeTextures | null;
    surfaceTuning?: PlannedArchitectureDetailTuning;
    windowEmissive: Readonly<{
      color: THREE.ColorRepresentation;
      intensity: number;
    }>;
  }>,
): FinalizedPlannedArchitectureMaterial {
  const material = options.ownedMaterial;
  const classification = classifyPlannedArchitectureMaterialRole(material.name);
  let disposed = false;
  let restoreMaterial: (() => void) | null = null;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    restoreMaterial?.();
    material.dispose();
  };
  const result = (
    status: FinalizedPlannedArchitectureMaterial["status"],
    reason: FinalizedPlannedArchitectureMaterial["reason"],
    addedSamplers: 0 | 2,
    addedFragmentTextureReads: 0 | 2,
  ): FinalizedPlannedArchitectureMaterial =>
    Object.freeze({
      status,
      reason,
      classification,
      material,
      ownsMaterial: true as const,
      addedDrawCalls: 0 as const,
      addedSamplers,
      addedFragmentTextureReads,
      dispose,
    });

  if (!classification.matched) return result("authored-only", "unmatched-material", 0, 0);
  const disabledReason = evaluatePlannedArchitectureDetailRuntimeGate(gate);
  if (disabledReason) return result("authored-only", disabledReason, 0, 0);

  if (classification.role === "window-glass") {
    const maximumIntensity =
      PLANNED_ARCHITECTURE_DETAIL_ASSET_CONTRACT.windowEmissive.maximumIntensity;
    if (
      !Number.isFinite(options.windowEmissive.intensity) ||
      options.windowEmissive.intensity < 0 ||
      options.windowEmissive.intensity > maximumIntensity
    ) {
      throw new RangeError(`windowEmissive.intensity must be between 0 and ${maximumIntensity}`);
    }
    material.emissive.set(options.windowEmissive.color);
    material.emissiveIntensity = options.windowEmissive.intensity;
    return result("window-emissive", null, 0, 0);
  }

  if (!options.runtimeTextures) {
    return result("authored-only", "runtime-textures-unavailable", 0, 0);
  }
  if (!options.geometry.hasAttribute("uv")) {
    return result("authored-only", "missing-uv0", 0, 0);
  }
  if (!material.map) {
    return result("authored-only", "missing-authored-base-map", 0, 0);
  }
  if (!material.normalMap) {
    return result("authored-only", "missing-authored-normal-map", 0, 0);
  }
  if (!material.roughnessMap) {
    return result("authored-only", "missing-authored-roughness-map", 0, 0);
  }
  if (material.normalMapType !== THREE.TangentSpaceNormalMap) {
    return result("authored-only", "unsupported-normal-map-type", 0, 0);
  }
  const surfaceTuning =
    options.surfaceTuning ?? PLANNED_ARCHITECTURE_DETAIL_DEFAULT_TUNING[classification.family];
  validateTuning(surfaceTuning);

  const previousOnBeforeCompile = material.onBeforeCompile;
  const previousCustomProgramCacheKey = material.customProgramCacheKey;
  const previousProgramCacheKey = previousCustomProgramCacheKey.call(material);
  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    previousOnBeforeCompile.call(this, shader, renderer);
    patchPlannedArchitectureDetailShader(shader, {
      family: classification.family,
      slot: classification.slot,
      normalAtlas: options.runtimeTextures!.normal,
      roughnessAtlas: options.runtimeTextures!.roughness,
      tuning: surfaceTuning,
    });
  };
  material.customProgramCacheKey = () =>
    `${previousProgramCacheKey}|${PLANNED_ARCHITECTURE_DETAIL_PROGRAM_CACHE_KEY}`;
  material.needsUpdate = true;
  restoreMaterial = () => {
    material.onBeforeCompile = previousOnBeforeCompile;
    material.customProgramCacheKey = previousCustomProgramCacheKey;
  };
  return result("surface-detail", null, 2, 2);
}
