import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import type { KingdomSeason } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import {
  createPlannedCinematicEnvironmentPlan,
  PLANNED_CINEMATIC_ENVIRONMENT_BUDGET,
  PLANNED_CINEMATIC_ENVIRONMENT_SCHEMA,
  snapPlannedCinematicShadowFocus,
} from "./planned-cinematic-environment";
import { PLANNED_ENVIRONMENT_IBL_ASSET_CONTRACT } from "./planned-environment-ibl";

const SOURCE_URL = new URL("./planned-cinematic-environment.tsx", import.meta.url);
const ENVIRONMENT_MANIFEST_URL = new URL(
  "../../../public/assets/world/environment/polyhaven/environment-manifest.json",
  import.meta.url,
);
const SEASONS: ReadonlyArray<KingdomSeason> = ["spring", "summer", "autumn", "winter"];

function demoPlan(season: KingdomSeason = "summer") {
  return createWorldPlan(createDemoKingdom(season, "enchanted-forest"));
}

function valleyPlan(season: KingdomSeason = "summer") {
  return createWorldPlan(createDemoKingdom(season, "kingdom-valley"));
}

describe("planned cinematic environment", () => {
  it("keeps the Walk sky and sole shadowed sun on the same physical direction", () => {
    const environment = createPlannedCinematicEnvironmentPlan(demoPlan(), {
      quality: "high",
      navigationMode: "walk",
    });
    const targetToLight = environment.sun.position.map(
      (component, index) => component - environment.sun.target[index]!,
    );
    const targetToLightLength = Math.hypot(...targetToLight);
    const lightDirection = targetToLight.map((component) => component / targetToLightLength);

    expect(environment.schema).toBe(PLANNED_CINEMATIC_ENVIRONMENT_SCHEMA);
    expect(Math.hypot(...environment.sun.direction)).toBeCloseTo(1, 5);
    environment.sky.sunPosition.forEach((component, index) => {
      expect(component).toBeCloseTo(environment.sun.direction[index]!, 5);
      expect(lightDirection[index]).toBeCloseTo(component, 5);
    });
    expect(environment.fill.intensity).toBeLessThan(environment.sun.intensity);
    expect(environment.budget).toEqual({
      lights: 2,
      shadowCastingLights: 1,
      atmosphericDrawCalls: 1,
      atmosphericTriangles: 12,
      postProcessingPasses: 0,
    });
  });

  it("uses broad linear Orbit depth and a tighter stable Walk shadow volume", () => {
    const plan = demoPlan();
    const orbit = createPlannedCinematicEnvironmentPlan(plan, {
      quality: "high",
      navigationMode: "orbit",
    });
    const walk = createPlannedCinematicEnvironmentPlan(plan, {
      quality: "high",
      navigationMode: "walk",
    });

    expect(orbit.fog.kind).toBe("linear");
    if (orbit.fog.kind === "linear") {
      expect(orbit.fog.near).toBeGreaterThan(0);
      expect(orbit.fog.far).toBeGreaterThan(orbit.fog.near * 2);
    }
    expect(walk.fog.kind).toBe("exponential");
    if (walk.fog.kind === "exponential") {
      expect(walk.fog.density).toBeGreaterThanOrEqual(1 / 360);
      expect(walk.fog.density).toBeLessThanOrEqual(1 / 150);
    }
    expect(walk.sun.shadow.halfExtent).toBeLessThan(orbit.sun.shadow.halfExtent);
    expect(walk.sun.shadow.focusSnap).toBeGreaterThan(0);
    expect(walk.sun.shadow.normalBias).toBeLessThan(orbit.sun.shadow.normalBias);
    expect(walk.sun.shadow.cameraNear).toBeGreaterThan(0);
    expect(walk.sun.shadow.cameraFar).toBeGreaterThan(walk.sun.shadow.cameraNear);
  });

  it("covers the complete maximum repository envelope in the Orbit shadow frustum", () => {
    const plan = demoPlan();
    const maximumEnvelopePlan = {
      ...plan,
      topology: {
        ...plan.topology,
        envelope: {
          ...plan.topology.envelope,
          minX: -230,
          maxX: 230,
          minZ: -270,
          maxZ: 270,
          width: 460,
          depth: 540,
          center: { x: 0, z: 0 },
        },
      },
    };
    const orbit = createPlannedCinematicEnvironmentPlan(maximumEnvelopePlan, {
      quality: "high",
      navigationMode: "orbit",
    });
    const envelopeRadius = Math.hypot(460 / 2, 540 / 2);

    expect(orbit.sun.shadow.halfExtent).toBeGreaterThan(envelopeRadius);
    expect(orbit.sun.shadow.halfExtent).toBeLessThanOrEqual(420);
    expect(orbit.sun.shadow.mapSize).toBe(2_048);
  });

  it("bounds every season and low-quality fallback without hidden render passes", () => {
    for (const season of SEASONS) {
      for (const quality of ["low", "high"] as const) {
        const environment = createPlannedCinematicEnvironmentPlan(demoPlan(season), {
          quality,
          navigationMode: "orbit",
        });

        expect(environment.renderer).toMatchObject({
          outputColorSpace: "srgb",
          toneMapping: "aces-filmic",
          shadowFilter: "pcf",
        });
        expect(environment.renderer.exposure).toBeGreaterThanOrEqual(
          quality === "high" ? 0.78 : 0.9,
        );
        expect(environment.renderer.exposure).toBeLessThanOrEqual(
          PLANNED_CINEMATIC_ENVIRONMENT_BUDGET.maximumToneMappingExposure,
        );
        expect(environment.fill.intensity).toBeLessThanOrEqual(
          PLANNED_CINEMATIC_ENVIRONMENT_BUDGET.maximumHemisphereFillIntensity,
        );
        expect(environment.budget.lights).toBeLessThanOrEqual(
          PLANNED_CINEMATIC_ENVIRONMENT_BUDGET.maximumLights,
        );
        expect(environment.budget.shadowCastingLights).toBeLessThanOrEqual(
          PLANNED_CINEMATIC_ENVIRONMENT_BUDGET.maximumShadowCastingLights,
        );
        expect(environment.budget.atmosphericDrawCalls).toBeLessThanOrEqual(
          PLANNED_CINEMATIC_ENVIRONMENT_BUDGET.maximumAtmosphericDrawCalls,
        );
        expect(environment.budget.atmosphericTriangles).toBeLessThanOrEqual(
          PLANNED_CINEMATIC_ENVIRONMENT_BUDGET.maximumAtmosphericTriangles,
        );
        expect(environment.budget.postProcessingPasses).toBe(0);
        expect(environment.sun.shadow.mapSize).toBeLessThanOrEqual(
          PLANNED_CINEMATIC_ENVIRONMENT_BUDGET.maximumShadowMapSize,
        );

        if (quality === "low") {
          expect(environment.ibl.enabled).toBe(false);
          expect(environment.sky.enabled).toBe(false);
          expect(environment.sun.shadow.enabled).toBe(false);
          expect(environment.budget).toMatchObject({
            shadowCastingLights: 0,
            atmosphericDrawCalls: 0,
            atmosphericTriangles: 0,
          });
        } else {
          expect(environment.ibl.enabled).toBe(true);
          expect(environment.sky.enabled).toBe(false);
          expect(environment.sun.shadow.enabled).toBe(true);
        }
      }
    }
  });

  it("uses a clean authored Orbit backdrop and a bounded graded dome for Walk", () => {
    const plan = demoPlan();
    const orbit = createPlannedCinematicEnvironmentPlan(plan, {
      quality: "high",
      navigationMode: "orbit",
    });
    const walk = createPlannedCinematicEnvironmentPlan(plan, {
      quality: "high",
      navigationMode: "walk",
    });

    expect(orbit.sky.enabled).toBe(false);
    expect(orbit.background).toBe("#3e6162");
    expect(orbit.background).not.toBe(plan.appearance.atmosphere.sky);
    expect(orbit.budget).toMatchObject({ atmosphericDrawCalls: 0, atmosphericTriangles: 0 });
    expect(walk.sky.enabled).toBe(true);
    expect(walk.background).toBe("#5c8e8f");
    expect(walk.sky).toMatchObject({
      zenithColor: "#5c8e8f",
      horizonColor: "#758d83",
      nadirColor: "#2d4333",
      sunHazeColor: "#b4bb8a",
      horizonExponent: 0.78,
      sunHazeStrength: 0.06,
    });
    expect(walk.budget).toMatchObject({ atmosphericDrawCalls: 1, atmosphericTriangles: 12 });
  });

  it("pins the high enchanted grade while preserving low-tier and valley lighting", () => {
    const enchantedSummer = createPlannedCinematicEnvironmentPlan(demoPlan("summer"), {
      quality: "high",
      navigationMode: "orbit",
    });
    const enchantedSummerWalk = createPlannedCinematicEnvironmentPlan(demoPlan("summer"), {
      quality: "high",
      navigationMode: "walk",
    });
    const enchantedSummerLow = createPlannedCinematicEnvironmentPlan(demoPlan("summer"), {
      quality: "low",
      navigationMode: "orbit",
    });
    const enchantedSummerWalkLow = createPlannedCinematicEnvironmentPlan(demoPlan("summer"), {
      quality: "low",
      navigationMode: "walk",
    });
    const valleySummer = createPlannedCinematicEnvironmentPlan(valleyPlan("summer"), {
      quality: "high",
      navigationMode: "orbit",
    });
    const enchantedBySeason = SEASONS.map((season) =>
      createPlannedCinematicEnvironmentPlan(demoPlan(season), {
        quality: "high",
        navigationMode: "orbit",
      }),
    );

    expect(enchantedSummer.renderer).toMatchObject({
      toneMapping: "aces-filmic",
      exposure: 0.900864,
    });
    expect(enchantedSummerWalk.renderer.exposure).toBe(0.806077);
    expect(enchantedSummer.fill.intensity).toBe(0.3444);
    expect(enchantedSummerWalk.fill.intensity).toBe(0.2688);
    expect(enchantedSummer.sun.intensity).toBe(1.722084);
    expect(enchantedSummerWalk.sun.intensity).toBe(1.613839);
    expect(enchantedSummer.ibl.intensity).toBe(0.79);
    expect(enchantedSummerWalk.ibl.intensity).toBe(0.58);
    expect(enchantedSummer.renderer.exposure).toBeLessThan(valleySummer.renderer.exposure);
    expect(enchantedSummer.fill.intensity).toBeLessThan(valleySummer.fill.intensity);
    expect(enchantedSummerLow).toMatchObject({
      background: "#3d6060",
      ibl: { enabled: false, intensity: 1 },
      fog: { color: "#708f78" },
      fill: { intensity: 0.42 },
      sun: { intensity: 1.8924 },
      renderer: { exposure: 0.9792 },
    });
    expect(enchantedSummerWalkLow).toMatchObject({
      background: "#7cb9c0",
      ibl: { enabled: false, intensity: 1 },
      fog: { color: "#708f78" },
      sky: { enabled: false },
      fill: { intensity: 0.42 },
      sun: { intensity: 1.968096 },
      renderer: { exposure: 0.959616 },
    });
    expect(
      enchantedBySeason.every(
        (environment) =>
          environment.renderer.exposure <=
            PLANNED_CINEMATIC_ENVIRONMENT_BUDGET.maximumToneMappingExposure &&
          environment.fill.intensity <=
            PLANNED_CINEMATIC_ENVIRONMENT_BUDGET.maximumHemisphereFillIntensity,
      ),
    ).toBe(true);
    expect(new Set(enchantedBySeason.map(({ renderer }) => renderer.exposure)).size).toBe(
      SEASONS.length,
    );
    expect(new Set(enchantedBySeason.map(({ fill }) => fill.intensity)).size).toBe(SEASONS.length);
    expect(enchantedSummer.budget).toMatchObject({
      lights: 2,
      shadowCastingLights: 1,
      postProcessingPasses: 0,
    });
  });

  it("pins the high-only environment consumer to the licensed unwired asset contract", () => {
    const manifest = JSON.parse(readFileSync(ENVIRONMENT_MANIFEST_URL, "utf8"));
    const high = createPlannedCinematicEnvironmentPlan(demoPlan(), {
      quality: "high",
      navigationMode: "orbit",
    });
    const low = createPlannedCinematicEnvironmentPlan(demoPlan(), {
      quality: "low",
      navigationMode: "orbit",
    });
    const source = readFileSync(SOURCE_URL, "utf8");

    expect(PLANNED_ENVIRONMENT_IBL_ASSET_CONTRACT).toMatchObject({
      url: manifest.runtime.url,
      sourceBytes: manifest.source.bytes,
      sourceSha256: manifest.source.sha256,
      width: manifest.runtime.width,
      height: manifest.runtime.height,
      usage: manifest.runtime.usage,
      backgroundAllowed: false,
      loader: manifest.runtime.loader,
      loaderDataType: manifest.runtime.loaderDataType,
      colorSpace: manifest.runtime.colorSpace,
      mapping: manifest.runtime.mapping,
      retainedPmremBytes: manifest.runtime.pmrem.retainedHalfFloatRgbaBytes,
    });
    expect(high.ibl).toEqual({
      enabled: true,
      url: manifest.runtime.url,
      usage: "reflection-and-ibl-only",
      backgroundAllowed: false,
      intensity: 0.79,
    });
    expect(low.ibl).toEqual({ ...high.ibl, enabled: false, intensity: 1 });
    expect(source).toContain("{environment.ibl.enabled ? (");
    expect(source).toContain("<Suspense fallback={null}>");
    expect(source.match(/<CinematicEnvironmentIbl\b/gu)).toHaveLength(1);
  });

  it("allows the graded sky to be disabled independently on the high tier", () => {
    const environment = createPlannedCinematicEnvironmentPlan(demoPlan(), {
      quality: "high",
      navigationMode: "walk",
      proceduralSky: false,
    });

    expect(environment.sky.enabled).toBe(false);
    expect(environment.sun.shadow.enabled).toBe(true);
    expect(environment.budget).toMatchObject({
      atmosphericDrawCalls: 0,
      atmosphericTriangles: 0,
      shadowCastingLights: 1,
      postProcessingPasses: 0,
    });
  });

  it("snaps Walk focus deterministically and rejects sub-cell camera jitter", () => {
    const first = snapPlannedCinematicShadowFocus({ x: 10.08, y: 3.81, z: -5.08 }, 0.5);
    const jittered = snapPlannedCinematicShadowFocus({ x: 10.18, y: 3.83, z: -5.18 }, 0.5);
    const nextCell = snapPlannedCinematicShadowFocus({ x: 10.31, y: 3.81, z: -5.31 }, 0.5);

    expect(first).toEqual({ x: 10, y: 4, z: -5 });
    expect(jittered).toEqual(first);
    expect(nextCell).toEqual({ x: 10.5, y: 4, z: -5.5 });
    expect(
      snapPlannedCinematicShadowFocus({ x: Number.NaN, y: Number.POSITIVE_INFINITY, z: -0 }, 0),
    ).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("pins the isolated component to two lights and no post-processing stack", () => {
    const source = readFileSync(SOURCE_URL, "utf8");

    expect(source.match(/<directionalLight\b/gu)).toHaveLength(1);
    expect(source.match(/<hemisphereLight\b/gu)).toHaveLength(1);
    expect(source.match(/<boxGeometry\b/gu)).toHaveLength(1);
    expect(source).toContain("applySceneEnvironmentIntensity(scene, environment.ibl.intensity)");
    expect(source).toContain("THREE.ACESFilmicToneMapping");
    expect(source).toContain("THREE.PCFShadowMap");
    expect(source).not.toContain("THREE.PCFSoftShadowMap");
    expect(source).not.toMatch(
      /EffectComposer|ContactShadows|AccumulativeShadows|pointLight|spotLight/u,
    );
  });
});
