"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { KingdomSeason } from "@/lib/kingdom/types";
import type { WorldPlan, WorldPlanPoint } from "@/lib/kingdom/world-plan";

import type { KingdomNavigationMode } from "./kingdom-navigation-model";
import {
  installPlannedEnvironmentIbl,
  PLANNED_ENVIRONMENT_IBL_ASSET_CONTRACT,
} from "./planned-environment-ibl";

export const PLANNED_CINEMATIC_ENVIRONMENT_SCHEMA =
  "repo-planned-cinematic-environment/v2" as const;

/**
 * The environment deliberately avoids a full-screen post-processing chain.
 * Its only geometry is a deterministic gradient sky box (one draw, twelve
 * triangles), and only the directional sun is allowed to cast a shadow pass.
 */
export const PLANNED_CINEMATIC_ENVIRONMENT_BUDGET = Object.freeze({
  maximumLights: 2,
  maximumShadowCastingLights: 1,
  maximumAtmosphericDrawCalls: 1,
  maximumAtmosphericTriangles: 12,
  maximumPostProcessingPasses: 0,
  maximumShadowMapSize: 2_048,
  maximumToneMappingExposure: 1.16,
  maximumHemisphereFillIntensity: 0.64,
});

export type PlannedCinematicEnvironmentQuality = "low" | "high";
type Vec3Tuple = [number, number, number];

type PlannedLinearFog = Readonly<{
  kind: "linear";
  color: string;
  near: number;
  far: number;
}>;

type PlannedExponentialFog = Readonly<{
  kind: "exponential";
  color: string;
  density: number;
}>;

export type PlannedCinematicEnvironmentPlan = Readonly<{
  schema: typeof PLANNED_CINEMATIC_ENVIRONMENT_SCHEMA;
  navigationMode: KingdomNavigationMode;
  background: string;
  ibl: Readonly<{
    enabled: boolean;
    url: typeof PLANNED_ENVIRONMENT_IBL_ASSET_CONTRACT.url;
    usage: typeof PLANNED_ENVIRONMENT_IBL_ASSET_CONTRACT.usage;
    backgroundAllowed: false;
    intensity: number;
  }>;
  fog: PlannedLinearFog | PlannedExponentialFog;
  sky: Readonly<{
    enabled: boolean;
    distance: number;
    sunPosition: Vec3Tuple;
    zenithColor: string;
    horizonColor: string;
    nadirColor: string;
    sunHazeColor: string;
    horizonExponent: number;
    sunHazeStrength: number;
  }>;
  fill: Readonly<{
    skyColor: string;
    groundColor: string;
    intensity: number;
  }>;
  sun: Readonly<{
    color: string;
    intensity: number;
    direction: Vec3Tuple;
    position: Vec3Tuple;
    target: Vec3Tuple;
    offset: Vec3Tuple;
    shadow: Readonly<{
      enabled: boolean;
      mapSize: number;
      halfExtent: number;
      cameraNear: number;
      cameraFar: number;
      bias: number;
      normalBias: number;
      focusSnap: number;
    }>;
  }>;
  renderer: Readonly<{
    outputColorSpace: "srgb";
    toneMapping: "aces-filmic";
    exposure: number;
    shadowFilter: "pcf";
  }>;
  budget: Readonly<{
    lights: number;
    shadowCastingLights: number;
    atmosphericDrawCalls: number;
    atmosphericTriangles: number;
    postProcessingPasses: 0;
  }>;
}>;

export type PlannedCinematicEnvironmentOptions = Readonly<{
  quality: PlannedCinematicEnvironmentQuality;
  navigationMode: KingdomNavigationMode;
  proceduralSky?: boolean;
}>;

export type PlannedCinematicEnvironmentProps = PlannedCinematicEnvironmentOptions &
  Readonly<{ plan: WorldPlan }>;

type SeasonalLighting = Readonly<{
  exposure: number;
  fillIntensity: number;
  sunIntensityScale: number;
}>;

const SEASONAL_LIGHTING: Readonly<Record<KingdomSeason, SeasonalLighting>> = {
  spring: {
    exposure: 1.01,
    fillIntensity: 0.45,
    sunIntensityScale: 1.58,
  },
  summer: {
    exposure: 0.96,
    fillIntensity: 0.38,
    sunIntensityScale: 1.66,
  },
  autumn: {
    exposure: 1,
    fillIntensity: 0.4,
    sunIntensityScale: 1.55,
  },
  winter: {
    exposure: 1.07,
    fillIntensity: 0.5,
    sunIntensityScale: 1.46,
  },
};

/**
 * Enchanted materials are intentionally deeper than Kingdom Valley's palette.
 * This bounded lift keeps their mids readable without adding a third light or
 * changing the seasonal sun, sky, or ACES contracts.
 */
const ENCHANTED_THEME_LIGHTING_LIFT = Object.freeze({
  exposureScale: 1.02,
  fillIntensityOffset: 0.04,
});

/**
 * Desktop high quality uses a deliberate photographic grade rather than the
 * lifted prototype values. The overcast HDR remains useful for reflections,
 * but it must not become a second broad key light and bleach the authored
 * forest palette.
 */
const HIGH_QUALITY_ENCHANTED_GRADE = Object.freeze({
  orbitExposureScale: 0.92,
  walkExposureScale: 0.84,
  orbitFillIntensityScale: 0.82,
  walkFillIntensityScale: 0.64,
  orbitSunIntensityScale: 0.91,
  walkSunIntensityScale: 0.82,
  orbitIblIntensity: 0.79,
  walkIblIntensity: 0.58,
  orbitFogNearScale: 0.86,
  orbitFogFarScale: 2.42,
  walkFogDistanceScale: 1.08,
  horizonExponent: 0.78,
  sunHazeStrength: 0.06,
});

const SUN_DIRECTION_SOURCE = [-0.52, 0.77, 0.37] as const;

function round(value: number, precision = 1_000_000): number {
  return Math.round(value * precision) / precision;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function mixScaledColor(source: string, target: string, mix: number, lightScale: number): string {
  return `#${new THREE.Color(source)
    .lerp(new THREE.Color(target), clamp(mix, 0, 1))
    .multiplyScalar(Math.max(0, lightScale))
    .getHexString()}`;
}

function normalizedSunDirection(): Vec3Tuple {
  const length = Math.hypot(...SUN_DIRECTION_SOURCE);
  return SUN_DIRECTION_SOURCE.map((component) => round(component / length)) as Vec3Tuple;
}

function snapToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(value)) return 0;
  const snapped =
    !Number.isFinite(increment) || increment <= 0
      ? round(value)
      : Math.round(value / increment) * increment;
  return Object.is(snapped, -0) ? 0 : round(snapped);
}

/**
 * Quantizes the Walk shadow focus so camera bob and sub-texel movement do not
 * continuously crawl the directional shadow projection across static detail.
 */
export function snapPlannedCinematicShadowFocus(
  focus: Readonly<{ x: number; y: number; z: number }>,
  horizontalIncrement: number,
  verticalIncrement = 0.5,
): Readonly<{ x: number; y: number; z: number }> {
  return {
    x: snapToIncrement(focus.x, horizontalIncrement),
    y: snapToIncrement(focus.y, verticalIncrement),
    z: snapToIncrement(focus.z, horizontalIncrement),
  };
}

function plannedFocus(plan: WorldPlan, navigationMode: KingdomNavigationMode): Vec3Tuple {
  const camera =
    navigationMode === "walk" ? plan.topology.camera.entry : plan.topology.camera.overview;
  const horizontal: WorldPlanPoint =
    navigationMode === "walk" ? camera.target : plan.topology.envelope.center;
  return [horizontal.x, camera.target.y, horizontal.z];
}

/** Pure renderer and atmosphere contract; it performs no R3F or WebGL mutation. */
export function createPlannedCinematicEnvironmentPlan(
  plan: WorldPlan,
  { quality, navigationMode, proceduralSky = true }: PlannedCinematicEnvironmentOptions,
): PlannedCinematicEnvironmentPlan {
  const { appearance } = plan;
  const { envelope } = plan.topology;
  const diagonal = Math.max(1, Math.hypot(envelope.width, envelope.depth));
  const lighting = SEASONAL_LIGHTING[appearance.season];
  const enchantedTheme = appearance.worldTheme === "enchanted-forest";
  const highQualityEnchantedGrade = quality === "high" && enchantedTheme;
  const baseExposure = enchantedTheme
    ? clamp(
        lighting.exposure * ENCHANTED_THEME_LIGHTING_LIFT.exposureScale,
        0,
        PLANNED_CINEMATIC_ENVIRONMENT_BUDGET.maximumToneMappingExposure,
      )
    : lighting.exposure;
  const baseFillIntensity = enchantedTheme
    ? clamp(
        lighting.fillIntensity + ENCHANTED_THEME_LIGHTING_LIFT.fillIntensityOffset,
        0,
        PLANNED_CINEMATIC_ENVIRONMENT_BUDGET.maximumHemisphereFillIntensity,
      )
    : lighting.fillIntensity;
  const exposure = highQualityEnchantedGrade
    ? baseExposure *
      (navigationMode === "orbit"
        ? HIGH_QUALITY_ENCHANTED_GRADE.orbitExposureScale
        : HIGH_QUALITY_ENCHANTED_GRADE.walkExposureScale)
    : baseExposure;
  const fillIntensity = highQualityEnchantedGrade
    ? baseFillIntensity *
      (navigationMode === "orbit"
        ? HIGH_QUALITY_ENCHANTED_GRADE.orbitFillIntensityScale
        : HIGH_QUALITY_ENCHANTED_GRADE.walkFillIntensityScale)
    : baseFillIntensity;
  const skyZenithColor = highQualityEnchantedGrade
    ? mixScaledColor(appearance.atmosphere.sky, appearance.magic.primary, 0.08, 0.52)
    : appearance.atmosphere.sky;
  const skyHorizonColor = highQualityEnchantedGrade
    ? mixScaledColor(appearance.atmosphere.horizon, appearance.atmosphere.sky, 0.62, 0.48)
    : appearance.atmosphere.horizon;
  const skyNadirColor = highQualityEnchantedGrade
    ? mixScaledColor(appearance.terrain.lowland, appearance.atmosphere.fog, 0.28, 0.42)
    : appearance.terrain.lowland;
  const skySunHazeColor = highQualityEnchantedGrade
    ? mixScaledColor(appearance.atmosphere.horizon, appearance.atmosphere.sunlight, 0.25, 0.7)
    : appearance.atmosphere.horizon;
  const highQualityFogColor = highQualityEnchantedGrade
    ? mixScaledColor(appearance.atmosphere.fog, appearance.atmosphere.sky, 0.32, 0.64)
    : appearance.atmosphere.fog;
  const background =
    navigationMode === "orbit"
      ? highQualityEnchantedGrade
        ? mixScaledColor(appearance.atmosphere.sky, appearance.terrain.lowland, 0.42, 0.38)
        : mixScaledColor(appearance.atmosphere.sky, appearance.terrain.lowland, 0.55, 0.45)
      : highQualityEnchantedGrade
        ? skyZenithColor
        : appearance.atmosphere.sky;
  const direction = normalizedSunDirection();
  const shadowEnabled = quality === "high";
  const mapSize = shadowEnabled ? PLANNED_CINEMATIC_ENVIRONMENT_BUDGET.maximumShadowMapSize : 512;
  const halfExtent =
    navigationMode === "walk" ? clamp(diagonal * 0.14, 28, 52) : clamp(diagonal * 0.58, 80, 420);
  const lightDistance =
    navigationMode === "walk" ? Math.max(110, halfExtent * 3.1) : Math.max(150, diagonal * 1.18);
  const target = plannedFocus(plan, navigationMode);
  const offset = direction.map((component) => round(component * lightDistance)) as Vec3Tuple;
  const position = target.map((component, index) => round(component + offset[index]!)) as Vec3Tuple;
  const shadowTexelWorldSize = (halfExtent * 2) / mapSize;
  const focusSnap = navigationMode === "walk" ? round(Math.max(0.25, shadowTexelWorldSize * 8)) : 0;
  // The graded dome is reserved for ground level. Orbit uses a deterministic
  // authored backdrop so an orthographic overview cannot sample a bright
  // horizon across most of the frame and lose the world silhouette.
  const skyEnabled = quality === "high" && proceduralSky && navigationMode === "walk";
  const fog: PlannedLinearFog | PlannedExponentialFog =
    navigationMode === "walk"
      ? {
          kind: "exponential",
          color: highQualityFogColor,
          density: round(
            1 /
              (highQualityEnchantedGrade
                ? clamp(diagonal * HIGH_QUALITY_ENCHANTED_GRADE.walkFogDistanceScale, 230, 480)
                : clamp(diagonal * 0.76, 150, 360)),
          ),
        }
      : {
          kind: "linear",
          color: highQualityFogColor,
          near: round(
            diagonal *
              (highQualityEnchantedGrade ? HIGH_QUALITY_ENCHANTED_GRADE.orbitFogNearScale : 0.72),
          ),
          far: round(
            diagonal *
              (highQualityEnchantedGrade ? HIGH_QUALITY_ENCHANTED_GRADE.orbitFogFarScale : 2.08),
          ),
        };

  return {
    schema: PLANNED_CINEMATIC_ENVIRONMENT_SCHEMA,
    navigationMode,
    background,
    ibl: {
      enabled: quality === "high",
      url: PLANNED_ENVIRONMENT_IBL_ASSET_CONTRACT.url,
      usage: PLANNED_ENVIRONMENT_IBL_ASSET_CONTRACT.usage,
      backgroundAllowed: PLANNED_ENVIRONMENT_IBL_ASSET_CONTRACT.backgroundAllowed,
      intensity: highQualityEnchantedGrade
        ? navigationMode === "orbit"
          ? HIGH_QUALITY_ENCHANTED_GRADE.orbitIblIntensity
          : HIGH_QUALITY_ENCHANTED_GRADE.walkIblIntensity
        : 1,
    },
    fog,
    sky: {
      enabled: skyEnabled,
      distance: round(Math.max(1_000, diagonal * 4)),
      sunPosition: direction,
      zenithColor: skyZenithColor,
      horizonColor: skyHorizonColor,
      nadirColor: skyNadirColor,
      sunHazeColor: skySunHazeColor,
      horizonExponent: highQualityEnchantedGrade
        ? HIGH_QUALITY_ENCHANTED_GRADE.horizonExponent
        : 0.72,
      sunHazeStrength: highQualityEnchantedGrade
        ? HIGH_QUALITY_ENCHANTED_GRADE.sunHazeStrength
        : 0.1,
    },
    fill: {
      skyColor: appearance.atmosphere.sky,
      groundColor: appearance.terrain.lowland,
      intensity: round(fillIntensity),
    },
    sun: {
      color: appearance.atmosphere.sunlight,
      intensity: round(
        appearance.atmosphere.sunlightIntensity *
          lighting.sunIntensityScale *
          (highQualityEnchantedGrade
            ? navigationMode === "orbit"
              ? HIGH_QUALITY_ENCHANTED_GRADE.orbitSunIntensityScale
              : HIGH_QUALITY_ENCHANTED_GRADE.walkSunIntensityScale
            : 1) *
          (navigationMode === "walk" ? 1.04 : 1),
      ),
      direction,
      position,
      target,
      offset,
      shadow: {
        enabled: shadowEnabled,
        mapSize,
        halfExtent: round(halfExtent),
        cameraNear: round(Math.max(0.5, lightDistance - halfExtent * 2.15)),
        cameraFar: round(lightDistance + halfExtent * 2.65),
        bias: navigationMode === "walk" ? -0.00012 : -0.00008,
        normalBias:
          navigationMode === "walk"
            ? round(clamp(shadowTexelWorldSize * 0.65, 0.018, 0.038))
            : round(clamp(shadowTexelWorldSize * 0.42, 0.035, 0.07)),
        focusSnap,
      },
    },
    renderer: {
      outputColorSpace: "srgb",
      toneMapping: "aces-filmic",
      exposure: round(exposure * (navigationMode === "walk" ? 0.98 : 1)),
      shadowFilter: "pcf",
    },
    budget: {
      lights: 2,
      shadowCastingLights: shadowEnabled ? 1 : 0,
      atmosphericDrawCalls: skyEnabled ? 1 : 0,
      atmosphericTriangles: skyEnabled ? 12 : 0,
      postProcessingPasses: 0,
    },
  };
}

type RendererSnapshot = Readonly<{
  outputColorSpace: string;
  shadowEnabled: boolean;
  shadowType: THREE.ShadowMapType;
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
}>;

function snapshotRenderer(gl: THREE.WebGLRenderer): RendererSnapshot {
  return {
    outputColorSpace: gl.outputColorSpace,
    shadowEnabled: gl.shadowMap.enabled,
    shadowType: gl.shadowMap.type,
    toneMapping: gl.toneMapping,
    toneMappingExposure: gl.toneMappingExposure,
  };
}

function applyRendererSettings(gl: THREE.WebGLRenderer, exposure: number, shadowsEnabled: boolean) {
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = exposure;
  gl.shadowMap.enabled = shadowsEnabled;
  gl.shadowMap.type = THREE.PCFShadowMap;
  gl.shadowMap.needsUpdate = true;
}

function restoreRenderer(gl: THREE.WebGLRenderer, snapshot: RendererSnapshot) {
  gl.outputColorSpace = snapshot.outputColorSpace;
  gl.toneMapping = snapshot.toneMapping;
  gl.toneMappingExposure = snapshot.toneMappingExposure;
  gl.shadowMap.enabled = snapshot.shadowEnabled;
  gl.shadowMap.type = snapshot.shadowType;
  gl.shadowMap.needsUpdate = true;
}

function applySceneEnvironmentIntensity(scene: THREE.Scene, intensity: number) {
  scene.environmentIntensity = intensity;
}

function CinematicRendererSettings({
  environment,
}: Readonly<{ environment: PlannedCinematicEnvironmentPlan }>) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useLayoutEffect(() => {
    const previous = snapshotRenderer(gl);
    const previousEnvironmentIntensity = scene.environmentIntensity;
    applyRendererSettings(gl, environment.renderer.exposure, environment.sun.shadow.enabled);
    applySceneEnvironmentIntensity(scene, environment.ibl.intensity);

    return () => {
      restoreRenderer(gl, previous);
      applySceneEnvironmentIntensity(scene, previousEnvironmentIntensity);
    };
  }, [
    environment.ibl.intensity,
    environment.renderer.exposure,
    environment.sun.shadow.enabled,
    gl,
    scene,
  ]);

  return null;
}

function CinematicEnvironmentIbl() {
  const renderer = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(
    () => installPlannedEnvironmentIbl({ renderer, scene, invalidate }),
    [invalidate, renderer, scene],
  );

  return null;
}

function applySunFocus(
  light: THREE.DirectionalLight,
  target: THREE.Object3D,
  environment: PlannedCinematicEnvironmentPlan,
  x: number,
  y: number,
  z: number,
) {
  target.position.set(x, y, z);
  light.position.set(
    x + environment.sun.offset[0],
    y + environment.sun.offset[1],
    z + environment.sun.offset[2],
  );
  light.target = target;
  target.updateMatrixWorld();
  light.updateMatrixWorld();
}

function CinematicSunRig({
  environment,
}: Readonly<{ environment: PlannedCinematicEnvironmentPlan }>) {
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useRef<THREE.Object3D>(null);
  const lastWalkFocus = useRef({ x: Number.NaN, z: Number.NaN });

  useLayoutEffect(() => {
    if (!light.current || !target.current) return;
    applySunFocus(
      light.current,
      target.current,
      environment,
      environment.sun.target[0],
      environment.sun.target[1],
      environment.sun.target[2],
    );
    lastWalkFocus.current.x = Number.NaN;
    lastWalkFocus.current.z = Number.NaN;
  }, [environment]);

  useFrame(({ camera }) => {
    if (environment.navigationMode !== "walk" || !environment.sun.shadow.enabled) return;
    const x = snapToIncrement(camera.position.x, environment.sun.shadow.focusSnap);
    const z = snapToIncrement(camera.position.z, environment.sun.shadow.focusSnap);
    if (lastWalkFocus.current.x === x && lastWalkFocus.current.z === z) return;
    if (!light.current || !target.current) return;

    applySunFocus(light.current, target.current, environment, x, environment.sun.target[1], z);
    lastWalkFocus.current.x = x;
    lastWalkFocus.current.z = z;
  });

  const shadow = environment.sun.shadow;
  return (
    <>
      <object3D ref={target} name="cinematic-sun-target" position={environment.sun.target} />
      <directionalLight
        ref={light}
        name="cinematic-sun"
        castShadow={shadow.enabled}
        color={environment.sun.color}
        intensity={environment.sun.intensity}
        position={environment.sun.position}
        shadow-mapSize-width={shadow.mapSize}
        shadow-mapSize-height={shadow.mapSize}
        shadow-camera-left={-shadow.halfExtent}
        shadow-camera-right={shadow.halfExtent}
        shadow-camera-top={shadow.halfExtent}
        shadow-camera-bottom={-shadow.halfExtent}
        shadow-camera-near={shadow.cameraNear}
        shadow-camera-far={shadow.cameraFar}
        shadow-bias={shadow.bias}
        shadow-normalBias={shadow.normalBias}
      />
    </>
  );
}

const CINEMATIC_SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vLocalDirection;

  void main() {
    vLocalDirection = position;
    vec4 clipPosition = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = clipPosition.xyww;
  }
`;

const CINEMATIC_SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 zenithColor;
  uniform vec3 horizonColor;
  uniform vec3 nadirColor;
  uniform vec3 sunDirection;
  uniform vec3 sunHazeColor;
  uniform float horizonExponent;
  uniform float sunHazeStrength;

  varying vec3 vLocalDirection;

  void main() {
    vec3 direction = normalize(vLocalDirection);
    float upperBand = pow(smoothstep(0.0, 0.88, direction.y), horizonExponent);
    float lowerBand = smoothstep(-0.36, 0.0, direction.y);
    vec3 lowerColor = mix(nadirColor, horizonColor, lowerBand);
    vec3 skyColor = mix(lowerColor, zenithColor, upperBand);
    float sunHaze = pow(max(dot(direction, normalize(sunDirection)), 0.0), 42.0);
    skyColor = mix(skyColor, sunHazeColor, sunHaze * sunHazeStrength);

    gl_FragColor = vec4(skyColor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function CinematicGradientSky({
  environment,
}: Readonly<{ environment: PlannedCinematicEnvironmentPlan }>) {
  const uniforms = useMemo(
    () => ({
      zenithColor: { value: new THREE.Color(environment.sky.zenithColor) },
      horizonColor: { value: new THREE.Color(environment.sky.horizonColor) },
      nadirColor: { value: new THREE.Color(environment.sky.nadirColor) },
      sunDirection: {
        value: new THREE.Vector3(...environment.sky.sunPosition).normalize(),
      },
      sunHazeColor: { value: new THREE.Color(environment.sky.sunHazeColor) },
      horizonExponent: { value: environment.sky.horizonExponent },
      sunHazeStrength: { value: environment.sky.sunHazeStrength },
    }),
    [environment.sky],
  );

  return (
    <mesh
      name="cinematic-gradient-sky"
      scale={environment.sky.distance}
      frustumCulled={false}
      renderOrder={-1_000}
    >
      <boxGeometry args={[1, 1, 1]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={CINEMATIC_SKY_VERTEX_SHADER}
        fragmentShader={CINEMATIC_SKY_FRAGMENT_SHADER}
        side={THREE.BackSide}
        depthWrite={false}
        toneMapped
      />
    </mesh>
  );
}

/**
 * Bounded environment layer for the desktop vertical slice. It owns only
 * renderer color/shadow policy, background atmosphere, and the two-light rig.
 */
export function PlannedCinematicEnvironment({
  plan,
  quality,
  navigationMode,
  proceduralSky = true,
}: PlannedCinematicEnvironmentProps) {
  const environment = useMemo(
    () =>
      createPlannedCinematicEnvironmentPlan(plan, {
        quality,
        navigationMode,
        proceduralSky,
      }),
    [navigationMode, plan, proceduralSky, quality],
  );

  return (
    <>
      <CinematicRendererSettings environment={environment} />
      <color attach="background" args={[environment.background]} />
      {environment.ibl.enabled ? (
        <Suspense fallback={null}>
          <CinematicEnvironmentIbl />
        </Suspense>
      ) : null}
      {environment.fog.kind === "linear" ? (
        <fog
          attach="fog"
          args={[environment.fog.color, environment.fog.near, environment.fog.far]}
        />
      ) : (
        <fogExp2 attach="fog" args={[environment.fog.color, environment.fog.density]} />
      )}
      {environment.sky.enabled ? <CinematicGradientSky environment={environment} /> : null}
      <hemisphereLight
        name="cinematic-sky-fill"
        args={[environment.fill.skyColor, environment.fill.groundColor, environment.fill.intensity]}
      />
      <CinematicSunRig environment={environment} />
    </>
  );
}
