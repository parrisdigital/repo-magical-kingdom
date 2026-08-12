"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { WorldPlan } from "@/lib/kingdom/world-plan";

import {
  buildPlannedTerrainGeometry,
  buildPlannedWaterGeometry,
  plannedTerrainMaterialCode,
  type PlannedGeometryData,
  type PlannedTerrainBuildOptions,
  type PlannedTerrainMaterialZone,
} from "./planned-terrain-model";

export type PlannedTerrainQuality = "low" | "high";

export type PlannedTerrainProps = Readonly<{
  plan: WorldPlan;
  quality?: PlannedTerrainQuality;
  receiveShadow?: boolean;
}>;

export type PlannedWatershedProps = Readonly<{
  plan: WorldPlan;
  quality?: PlannedTerrainQuality;
  reducedMotion?: boolean;
}>;

const QUALITY_OPTIONS: Readonly<Record<PlannedTerrainQuality, PlannedTerrainBuildOptions>> = {
  low: {
    segmentsX: 68,
    segmentsZ: 78,
    courseSegments: 42,
    courseCrossSegments: 3,
    lakeSegments: 56,
  },
  high: {
    segmentsX: 112,
    segmentsZ: 128,
    courseSegments: 76,
    courseCrossSegments: 5,
    lakeSegments: 84,
  },
};

function blendColor(first: string, second: string, amount: number): THREE.Color {
  return new THREE.Color(first).lerp(new THREE.Color(second), amount);
}

function terrainPalette(plan: WorldPlan): ReadonlyMap<number, THREE.Color> {
  const terrain = plan.appearance.terrain;
  const isSpring = plan.appearance.season === "spring";
  const lowMeadow = isSpring
    ? blendColor(terrain.lowland, "#9edb78", 0.46)
    : blendColor(terrain.lowland, plan.appearance.atmosphere.horizon, 0.1);
  const highMeadow = isSpring
    ? blendColor(terrain.meadow, "#c4e994", 0.52)
    : blendColor(terrain.meadow, plan.appearance.atmosphere.horizon, 0.08);
  const cliffStone = blendColor(terrain.escarpment, isSpring ? "#dfbba5" : "#b19a83", 0.7);
  const scree = cliffStone.clone().lerp(new THREE.Color(terrain.shore), 0.38);
  const shore = blendColor(terrain.shore, isSpring ? "#ead39f" : "#d0c19f", 0.42);
  const pathSoil = blendColor(shore.getStyle(), "#80664d", isSpring ? 0.42 : 0.48);
  const settlementSoil = highMeadow.clone().lerp(new THREE.Color("#947a57"), 0.28);
  const waterBed = blendColor(terrain.water, "#263f46", 0.58);
  const sideCliff = cliffStone.clone().lerp(new THREE.Color("#775d51"), 0.36);
  const palette = new Map<number, THREE.Color>();
  const assign = (material: PlannedTerrainMaterialZone, color: THREE.Color) => {
    palette.set(plannedTerrainMaterialCode(material), color);
  };
  assign("low-meadow", lowMeadow);
  assign("high-meadow", highMeadow);
  assign("path-soil", pathSoil);
  assign("settlement-soil", settlementSoil);
  assign("shore", shore);
  assign("river-bed", waterBed.clone().multiplyScalar(0.88));
  assign("lake-bed", waterBed);
  assign("cliff-stone", cliffStone);
  assign("scree", scree);
  assign("side-cliff", sideCliff);
  assign("outside", sideCliff.clone().lerp(new THREE.Color("#51473f"), 0.28));
  return palette;
}

function varyTerrainColor(
  color: THREE.Color,
  materialZone: number,
  x: number,
  y: number,
  z: number,
): THREE.Color {
  const lowMeadow = plannedTerrainMaterialCode("low-meadow");
  const highMeadow = plannedTerrainMaterialCode("high-meadow");
  const cliffStone = plannedTerrainMaterialCode("cliff-stone");
  const scree = plannedTerrainMaterialCode("scree");
  const sideCliff = plannedTerrainMaterialCode("side-cliff");
  const shore = plannedTerrainMaterialCode("shore");
  const pathSoil = plannedTerrainMaterialCode("path-soil");
  const settlementSoil = plannedTerrainMaterialCode("settlement-soil");
  const isGrass =
    materialZone === lowMeadow || materialZone === highMeadow || materialZone === settlementSoil;
  const isRock =
    materialZone === cliffStone || materialZone === scree || materialZone === sideCliff;
  const isEarth = materialZone === shore || materialZone === pathSoil;
  if (!isGrass && !isRock && !isEarth) return color;

  // Three broad-to-fine continuous frequencies break up large fields without
  // introducing a texture seam or exposing individual terrain triangles.
  const broad = Math.sin(x * 0.021 + z * 0.014) * 0.54 + Math.sin(z * 0.037 - x * 0.01) * 0.31;
  const middle = Math.sin(x * 0.081 - z * 0.053) * 0.26 + Math.cos(x * 0.047 + z * 0.096) * 0.19;
  const fine = Math.sin(x * 0.19 + z * 0.13) * 0.11;
  const field = broad + middle + fine;

  if (isGrass) {
    const heightLift = THREE.MathUtils.clamp(y * 0.000_7, -0.004, 0.016);
    return color.clone().offsetHSL(field * 0.009, field * 0.03, field * 0.052 + heightLift);
  }
  if (isRock) {
    // Broad vertical ribs and slower horizontal strata retain their value
    // contrast in the overview without keying variation to individual faces.
    const verticalRibs =
      Math.sin(x * 0.112 + z * 0.016) * 0.38 + Math.sin(x * 0.043 - z * 0.012) * 0.24;
    const horizontalStrata =
      Math.sin(y * 0.54 + x * 0.012) * 0.34 + Math.sin(y * 1.08 - z * 0.01) * 0.16;
    const strata = verticalRibs + horizontalStrata + field * 0.22;
    return color.clone().offsetHSL(strata * 0.01, -Math.abs(strata) * 0.012, strata * 0.09);
  }
  return color.clone().offsetHSL(field * 0.003, field * 0.014, field * 0.025);
}

function toBufferGeometry(
  data: PlannedGeometryData,
  palette: ReadonlyMap<number, THREE.Color> | null,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  if (palette) {
    const colors = new Float32Array(data.vertexCount * 3);
    const fallback = new THREE.Color("#80936a");
    for (let index = 0; index < data.vertexCount; index += 1) {
      const materialZone = data.materialZones[index] ?? -1;
      const baseColor = palette.get(materialZone) ?? fallback;
      const color = varyTerrainColor(
        baseColor,
        materialZone,
        data.positions[index * 3] ?? 0,
        data.positions[index * 3 + 1] ?? 0,
        data.positions[index * 3 + 2] ?? 0,
      );
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function applyTerrainDetailShader(
  shader: THREE.WebGLProgramParametersWithUniforms,
  sideStrength: number,
) {
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>
varying vec3 vKingdomWorldPosition;
varying vec3 vKingdomWorldNormal;`,
    )
    .replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
vec4 kingdomTerrainWorldPosition = modelMatrix * vec4(transformed, 1.0);
vKingdomWorldPosition = kingdomTerrainWorldPosition.xyz;
vKingdomWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
varying vec3 vKingdomWorldPosition;
varying vec3 vKingdomWorldNormal;
float kingdomHash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}`,
    )
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
vec3 kingdomNormal = normalize(vKingdomWorldNormal);
float kingdomSlope = 1.0 - smoothstep(0.42, 0.88, abs(kingdomNormal.y));
float kingdomStrata = 0.5 + 0.5 * sin(
  vKingdomWorldPosition.y * 0.72 +
  sin(vKingdomWorldPosition.x * 0.06) * 0.72
);
float kingdomRibs = 0.5 + 0.5 * sin(
  vKingdomWorldPosition.x * 0.2 +
  vKingdomWorldPosition.z * 0.042 +
  sin(vKingdomWorldPosition.x * 0.071) * 1.45
);
float kingdomFineRibs = 0.5 + 0.5 * sin(
  vKingdomWorldPosition.x * 0.47 -
  vKingdomWorldPosition.z * 0.025
);
float kingdomRockValue = mix(
  0.84,
  1.12,
  kingdomRibs * 0.55 + kingdomFineRibs * 0.26 + kingdomStrata * 0.19
);
diffuseColor.rgb *= mix(vec3(1.0), vec3(kingdomRockValue), kingdomSlope * ${sideStrength.toFixed(2)});
float kingdomVein = smoothstep(0.57, 0.93, kingdomRibs * 0.72 + kingdomFineRibs * 0.28) * kingdomSlope;
vec3 kingdomVeinColor = vec3(0.58, 0.63, 0.57);
diffuseColor.rgb = mix(diffuseColor.rgb, kingdomVeinColor, kingdomVein * 0.27 * ${sideStrength.toFixed(2)});
float kingdomMeadow = smoothstep(0.82, 0.97, kingdomNormal.y);
float kingdomMeadowNoise = kingdomHash(floor(vKingdomWorldPosition.xz * 0.72));
float kingdomMeadowBroad = 0.5 + 0.5 * sin(vKingdomWorldPosition.x * 0.15 + sin(vKingdomWorldPosition.z * 0.11));
diffuseColor.rgb *= mix(
  vec3(1.0),
  vec3(0.9 + kingdomMeadowNoise * 0.14 + kingdomMeadowBroad * 0.045),
  kingdomMeadow * 0.78
);`,
    );
}

function applyWaterDetailShader(
  shader: THREE.WebGLProgramParametersWithUniforms,
  timeUniform: Readonly<{ value: number }>,
) {
  shader.uniforms.uKingdomWaterTime = timeUniform;
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>
uniform float uKingdomWaterTime;
varying vec3 vKingdomWaterWorldPosition;`,
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
float kingdomWaterWave =
  sin(position.x * 0.2 + uKingdomWaterTime * 0.72) * 0.035 +
  sin(position.z * 0.31 - uKingdomWaterTime * 0.48) * 0.022;
transformed.y += kingdomWaterWave;`,
    )
    .replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
vec4 kingdomWaterWorldPosition = modelMatrix * vec4(transformed, 1.0);
vKingdomWaterWorldPosition = kingdomWaterWorldPosition.xyz;`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
uniform float uKingdomWaterTime;
varying vec3 vKingdomWaterWorldPosition;`,
    )
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
float kingdomWaterFlow = 0.5 + 0.5 * sin(
  vKingdomWaterWorldPosition.z * 0.23 - uKingdomWaterTime * 0.62 +
  sin(vKingdomWaterWorldPosition.x * 0.17) * 1.25
);
float kingdomWaterCross = 0.5 + 0.5 * sin(
  vKingdomWaterWorldPosition.x * 0.31 + uKingdomWaterTime * 0.29
);
float kingdomWaterHighlight = smoothstep(
  0.72,
  0.98,
  kingdomWaterFlow * 0.7 + kingdomWaterCross * 0.3
);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  vec3(0.66, 0.88, 0.9),
  kingdomWaterHighlight * 0.18
);`,
    );
}

export function PlannedTerrain({
  plan,
  quality = "high",
  receiveShadow = true,
}: PlannedTerrainProps) {
  const terrain = useMemo(
    () => buildPlannedTerrainGeometry(plan, QUALITY_OPTIONS[quality]),
    [plan, quality],
  );
  const palette = useMemo(() => terrainPalette(plan), [plan]);
  const surfaceGeometry = useMemo(
    () => toBufferGeometry(terrain.surface, palette),
    [palette, terrain.surface],
  );
  const sideGeometry = useMemo(
    () => toBufferGeometry(terrain.sideCliffs, palette),
    [palette, terrain.sideCliffs],
  );
  const isletGeometry = useMemo(
    () => toBufferGeometry(terrain.islet, palette),
    [palette, terrain.islet],
  );

  useEffect(
    () => () => {
      surfaceGeometry.dispose();
      sideGeometry.dispose();
      isletGeometry.dispose();
    },
    [isletGeometry, sideGeometry, surfaceGeometry],
  );

  return (
    <group name="planned-global-terrain">
      <mesh geometry={surfaceGeometry} receiveShadow={receiveShadow} castShadow={false}>
        <meshStandardMaterial
          vertexColors
          roughness={0.98}
          metalness={0}
          envMapIntensity={0.34}
          dithering
          onBeforeCompile={(shader) => applyTerrainDetailShader(shader, 0.9)}
          customProgramCacheKey={() => "planned-terrain-surface-detail-v1"}
          side={THREE.FrontSide}
        />
      </mesh>
      <mesh geometry={sideGeometry} receiveShadow={receiveShadow} castShadow={false}>
        <meshStandardMaterial
          vertexColors
          roughness={0.97}
          metalness={0}
          envMapIntensity={0.22}
          dithering
          onBeforeCompile={(shader) => applyTerrainDetailShader(shader, 1.18)}
          customProgramCacheKey={() => "planned-terrain-side-detail-v1"}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={isletGeometry} receiveShadow={receiveShadow} castShadow={false}>
        <meshStandardMaterial
          vertexColors
          roughness={0.94}
          metalness={0}
          envMapIntensity={0.42}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

export function PlannedWatershed({
  plan,
  quality = "high",
  reducedMotion = false,
}: PlannedWatershedProps) {
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const timeUniform = useRef({ value: 0 });
  const waterColor = useMemo(
    () =>
      new THREE.Color(plan.appearance.terrain.water).lerp(
        new THREE.Color(plan.appearance.season === "spring" ? "#9bd8e5" : "#77b5c2"),
        plan.appearance.season === "spring" ? 0.54 : 0.18,
      ),
    [plan],
  );
  const water = useMemo(
    () => buildPlannedWaterGeometry(plan, QUALITY_OPTIONS[quality]),
    [plan, quality],
  );
  const geometry = useMemo(() => toBufferGeometry(water, null), [water]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    if (reducedMotion || !materialRef.current) return;
    timeUniform.current.value = clock.elapsedTime;
    const breath = Math.sin(clock.elapsedTime * 0.72) * 0.018;
    materialRef.current.opacity = 0.82 + breath;
    materialRef.current.clearcoatRoughness = 0.17 + breath * 0.9;
  });

  return (
    <mesh name="planned-watershed" geometry={geometry} receiveShadow={false} renderOrder={4}>
      <meshPhysicalMaterial
        ref={materialRef}
        color={waterColor}
        emissive={waterColor}
        emissiveIntensity={0.08}
        roughness={0.25}
        metalness={0.03}
        clearcoat={0.88}
        clearcoatRoughness={0.12}
        sheen={0.22}
        sheenColor={plan.appearance.atmosphere.horizon}
        iridescence={0.06}
        transmission={0.08}
        thickness={0.55}
        transparent
        opacity={0.82}
        depthWrite={false}
        onBeforeCompile={(shader) => applyWaterDetailShader(shader, timeUniform.current)}
        customProgramCacheKey={() => "planned-watershed-flow-v1"}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
