"use client";

import { Html, Line, OrbitControls, PerspectiveCamera, Sparkles, Stars } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { KingdomSeason } from "@/lib/kingdom";
import {
  REPOSITORY_PLANET_CLASS_LABELS,
  type RepositoryPlanetClass,
  type RepositoryUniverse,
  type Selection,
  type UniverseRepository,
} from "@/lib/kingdom/types";

import { seededUnit } from "./world-utils";

type RepositoryUniverseSceneProps = Readonly<{
  universe: RepositoryUniverse;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onHover: (selection: Selection) => void;
  onEnterRepository: (repository: UniverseRepository) => void;
  travelingRepositoryId: number | null;
  resetToken: number;
  reducedMotion: boolean;
  quality: "low" | "high";
}>;

type PlanetVisualProfile = Readonly<{
  primary: string;
  secondary: string;
  accent: string;
  dark: string;
  atmosphere: string;
  clouds: string;
  ringInner: string;
  ringOuter: string;
  cloudOpacity: number;
  axialTilt: number;
  ringed: boolean;
}>;

const TERRESTRIAL_LAND: Readonly<Record<KingdomSeason, string>> = {
  spring: "#3f8b55",
  summer: "#697f3f",
  autumn: "#8d693c",
  winter: "#d7e1dc",
};

function createPlanetVisualProfile(repository: UniverseRepository): PlanetVisualProfile {
  const variant = seededUnit(`${repository.id}:celestial-profile`);
  const tiltDirection = variant > 0.5 ? 1 : -1;
  const axialTilt = tiltDirection * (0.08 + seededUnit(`${repository.id}:axial-tilt`) * 0.34);

  if (repository.planetClass === "gas-giant") {
    return {
      primary: "#b88342",
      secondary: "#e4c486",
      accent: "#f1dfba",
      dark: "#6c472b",
      atmosphere: "#e8bd72",
      clouds: "#f7e7c9",
      ringInner: "#d9c398",
      ringOuter: "#8b7457",
      cloudOpacity: 0,
      axialTilt,
      ringed: true,
    };
  }

  if (repository.planetClass === "ice-giant") {
    return {
      primary: "#1f628a",
      secondary: "#65b7cf",
      accent: "#b9e4eb",
      dark: "#0c2848",
      atmosphere: "#6ed7ff",
      clouds: "#e3f6f7",
      ringInner: "#9dc4cf",
      ringOuter: "#527786",
      cloudOpacity: 0.18,
      axialTilt,
      ringed: variant > 0.42,
    };
  }

  if (repository.planetClass === "rocky") {
    return {
      primary: variant > 0.5 ? "#8b4430" : "#676b70",
      secondary: variant > 0.5 ? "#c77c4b" : "#a9a29a",
      accent: variant > 0.5 ? "#e0ad70" : "#d5cec3",
      dark: variant > 0.5 ? "#3f1f20" : "#272b32",
      atmosphere: variant > 0.5 ? "#d88257" : "#8096aa",
      clouds: "#d8c7b0",
      ringInner: "#8c7765",
      ringOuter: "#50453d",
      cloudOpacity: variant > 0.72 ? 0.08 : 0,
      axialTilt,
      ringed: false,
    };
  }

  return {
    primary: repository.season === "winter" ? "#174f6f" : "#0b4475",
    secondary: TERRESTRIAL_LAND[repository.season],
    accent: repository.season === "winter" ? "#f0f3ef" : "#c8b37d",
    dark: "#031b38",
    atmosphere: "#53bde9",
    clouds: "#f5f7f3",
    ringInner: "#8fa5a5",
    ringOuter: "#455c63",
    cloudOpacity: repository.season === "winter" ? 0.38 : 0.27,
    axialTilt,
    ringed: false,
  };
}

const PLANET_VERTEX_SHADER = /* glsl */ `
  varying vec3 vLocalPosition;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vLocalPosition = normalize(position);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const NOISE_GLSL = /* glsl */ `
  float hash31(vec3 point) {
    point = fract(point * 0.1031);
    point += dot(point, point.yzx + 33.33);
    return fract((point.x + point.y) * point.z);
  }

  float noise3(vec3 point) {
    vec3 cell = floor(point);
    vec3 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    float n000 = hash31(cell);
    float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, local.x), mix(n010, n110, local.x), local.y),
      mix(mix(n001, n101, local.x), mix(n011, n111, local.x), local.y),
      local.z
    );
  }

  float fbm(vec3 point) {
    float value = 0.0;
    float amplitude = 0.52;
    for (int octave = 0; octave < 5; octave += 1) {
      value += noise3(point) * amplitude;
      point = point * 2.03 + vec3(7.1, 3.7, 5.9);
      amplitude *= 0.5;
    }
    return value;
  }
`;

const PLANET_FRAGMENT_SHADER = /* glsl */ `
  uniform float uKind;
  uniform float uSeed;
  uniform float uSelected;
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform vec3 uAccent;
  uniform vec3 uDark;
  uniform vec3 uAtmosphere;
  uniform vec3 uLightDirection;

  varying vec3 vLocalPosition;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  ${NOISE_GLSL}

  void main() {
    vec3 point = normalize(vLocalPosition);
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 lightDirection = normalize(uLightDirection);
    float diffuse = max(dot(normal, lightDirection), 0.0);
    float halfLight = smoothstep(-0.24, 0.58, dot(normal, lightDirection));
    float latitude = abs(point.y);
    vec3 color;
    float oceanMask = 0.0;

    if (uKind < 0.5) {
      float continents = fbm(point * 1.85 + vec3(uSeed * 7.0, 1.2, -2.4));
      continents += (fbm(point * 5.2 - vec3(uSeed * 3.0)) - 0.5) * 0.19;
      float land = smoothstep(0.49, 0.565, continents);
      float mountain = smoothstep(0.61, 0.83, continents + noise3(point * 11.0) * 0.1);
      float coast = smoothstep(0.485, 0.515, continents) * (1.0 - smoothstep(0.54, 0.58, continents));
      vec3 ocean = mix(uDark, uPrimary, 0.74 + noise3(point * 9.0) * 0.16);
      vec3 landColor = mix(uSecondary, uAccent, mountain * 0.72 + noise3(point * 8.0) * 0.12);
      landColor = mix(landColor, uAccent, coast * 0.34);
      float polarIce = smoothstep(0.77, 0.94, latitude + (noise3(point * 7.0) - 0.5) * 0.14);
      color = mix(ocean, landColor, land);
      color = mix(color, vec3(0.92, 0.96, 0.95), polarIce * (0.64 + 0.36 * land));
      oceanMask = 1.0 - land;
    } else if (uKind < 1.5) {
      float turbulence = fbm(point * vec3(2.0, 5.0, 2.0) + vec3(uSeed * 9.0));
      float band = sin(point.y * 48.0 + turbulence * 7.0 + uSeed * 16.0);
      float fineBand = sin(point.y * 112.0 - turbulence * 4.0) * 0.22;
      float blend = smoothstep(-0.82, 0.78, band + fineBand);
      color = mix(uPrimary, uSecondary, blend);
      color = mix(color, uDark, smoothstep(0.58, 0.92, sin(point.y * 19.0 + turbulence * 3.0)) * 0.34);
      vec2 stormPoint = vec2(point.x - 0.5, (point.y + 0.18) * 2.8);
      float storm = 1.0 - smoothstep(0.12, 0.34, length(stormPoint));
      color = mix(color, uAccent, storm * smoothstep(0.1, 0.8, turbulence) * 0.72);
      color = mix(color, uAccent, smoothstep(0.83, 0.98, latitude) * 0.28);
    } else if (uKind < 2.5) {
      float flow = fbm(point * vec3(2.4, 6.0, 2.4) + vec3(uSeed * 5.0));
      float band = sin(point.y * 34.0 + flow * 4.6 + uSeed * 11.0);
      color = mix(uPrimary, uSecondary, 0.42 + band * 0.2 + flow * 0.2);
      color = mix(color, uAccent, smoothstep(0.69, 0.96, latitude + flow * 0.08) * 0.45);
      color = mix(color, uDark, smoothstep(0.72, 0.96, noise3(point * 13.0)) * 0.18);
    } else {
      float terrain = fbm(point * 3.8 + vec3(uSeed * 8.0));
      float detail = noise3(point * 18.0 - vec3(uSeed * 3.0));
      color = mix(uPrimary, uSecondary, smoothstep(0.28, 0.78, terrain));
      color = mix(color, uAccent, smoothstep(0.72, 0.96, detail) * 0.34);
      float basin = smoothstep(0.54, 0.86, noise3(point * 8.0 + terrain));
      color = mix(color, uDark, basin * 0.28);
    }

    float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.2);
    float specular = pow(max(dot(reflect(-lightDirection, normal), viewDirection), 0.0), 44.0);
    vec3 lit = color * (0.22 + halfLight * 0.82 + diffuse * 0.13);
    lit += uAtmosphere * rim * (0.09 + uSelected * 0.08);
    lit += vec3(0.75, 0.9, 1.0) * specular * oceanMask * 0.38;
    gl_FragColor = vec4(lit, 1.0);
  }
`;

const CLOUD_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform vec3 uLightDirection;

  varying vec3 vLocalPosition;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  ${NOISE_GLSL}

  void main() {
    vec3 point = normalize(vLocalPosition);
    vec3 drift = vec3(uTime * 0.012, 0.0, -uTime * 0.007);
    float coverage = fbm(point * 4.8 + drift + vec3(uSeed * 11.0));
    coverage += (noise3(point * 14.0 - drift * 1.7) - 0.5) * 0.18;
    float alpha = smoothstep(0.54, 0.69, coverage) * uOpacity;
    float light = 0.4 + 0.6 * smoothstep(-0.2, 0.7, dot(normalize(vWorldNormal), normalize(uLightDirection)));
    gl_FragColor = vec4(uColor * light, alpha);
  }
`;

const ATMOSPHERE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - abs(dot(normalize(vWorldNormal), viewDirection)), 2.35);
    gl_FragColor = vec4(uColor, fresnel * uStrength);
  }
`;

const RING_VERTEX_SHADER = /* glsl */ `
  varying float vRadius;
  varying vec3 vWorldNormal;

  void main() {
    vRadius = length(position.xy);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAGMENT_SHADER = /* glsl */ `
  uniform float uInnerRadius;
  uniform float uOuterRadius;
  uniform float uSeed;
  uniform vec3 uInnerColor;
  uniform vec3 uOuterColor;
  varying float vRadius;
  varying vec3 vWorldNormal;

  void main() {
    float normalizedRadius = clamp((vRadius - uInnerRadius) / (uOuterRadius - uInnerRadius), 0.0, 1.0);
    float bands = sin(normalizedRadius * 128.0 + uSeed * 17.0) * 0.5 + 0.5;
    bands = mix(bands, sin(normalizedRadius * 33.0 - uSeed * 9.0) * 0.5 + 0.5, 0.34);
    float cassini = smoothstep(0.035, 0.075, abs(normalizedRadius - 0.57));
    float edge = smoothstep(0.0, 0.035, normalizedRadius) * (1.0 - smoothstep(0.965, 1.0, normalizedRadius));
    vec3 color = mix(uInnerColor, uOuterColor, normalizedRadius + bands * 0.14);
    float light = 0.45 + abs(vWorldNormal.y) * 0.5;
    float alpha = edge * cassini * (0.34 + bands * 0.48);
    gl_FragColor = vec4(color * light, alpha);
  }
`;

function planetClassIndex(planetClass: RepositoryPlanetClass): number {
  return planetClass === "terrestrial"
    ? 0
    : planetClass === "gas-giant"
      ? 1
      : planetClass === "ice-giant"
        ? 2
        : 3;
}

function CelestialPlanet({
  repository,
  detail,
  profile,
  reducedMotion,
  selected,
}: Readonly<{
  repository: UniverseRepository;
  detail: "low" | "medium" | "high";
  profile: PlanetVisualProfile;
  reducedMotion: boolean;
  selected: boolean;
}>) {
  const body = useRef<THREE.Group>(null);
  const cloudShell = useRef<THREE.Mesh>(null);
  const cloudShader = useRef<THREE.ShaderMaterial>(null);
  const seed = seededUnit(`${repository.id}:planet-surface`);
  const lightDirection = useMemo(
    () =>
      new THREE.Vector3(
        -repository.position.x,
        -repository.position.y,
        -repository.position.z,
      ).normalize(),
    [repository.position.x, repository.position.y, repository.position.z],
  );
  const surfaceMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PLANET_VERTEX_SHADER,
        fragmentShader: PLANET_FRAGMENT_SHADER,
        uniforms: {
          uKind: { value: planetClassIndex(repository.planetClass) },
          uSeed: { value: seed },
          uSelected: { value: selected ? 1 : 0 },
          uPrimary: { value: new THREE.Color(profile.primary) },
          uSecondary: { value: new THREE.Color(profile.secondary) },
          uAccent: { value: new THREE.Color(profile.accent) },
          uDark: { value: new THREE.Color(profile.dark) },
          uAtmosphere: { value: new THREE.Color(profile.atmosphere) },
          uLightDirection: { value: lightDirection },
        },
      }),
    [lightDirection, profile, repository.planetClass, seed, selected],
  );
  const cloudMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PLANET_VERTEX_SHADER,
        fragmentShader: CLOUD_FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: seed },
          uOpacity: { value: profile.cloudOpacity },
          uColor: { value: new THREE.Color(profile.clouds) },
          uLightDirection: { value: lightDirection },
        },
        transparent: true,
        depthWrite: false,
      }),
    [lightDirection, profile.cloudOpacity, profile.clouds, seed],
  );
  const atmosphereMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PLANET_VERTEX_SHADER,
        fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
        uniforms: {
          uColor: { value: new THREE.Color(profile.atmosphere) },
          uStrength: { value: selected ? 0.72 : 0.46 },
        },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [profile.atmosphere, selected],
  );
  const ringMaterial = useMemo(() => {
    const innerRadius = repository.radius * 1.28;
    const outerRadius = repository.radius * (repository.planetClass === "gas-giant" ? 2.05 : 1.72);
    return new THREE.ShaderMaterial({
      vertexShader: RING_VERTEX_SHADER,
      fragmentShader: RING_FRAGMENT_SHADER,
      uniforms: {
        uInnerRadius: { value: innerRadius },
        uOuterRadius: { value: outerRadius },
        uSeed: { value: seed },
        uInnerColor: { value: new THREE.Color(profile.ringInner) },
        uOuterColor: { value: new THREE.Color(profile.ringOuter) },
      },
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });
  }, [profile.ringInner, profile.ringOuter, repository.planetClass, repository.radius, seed]);

  useEffect(
    () => () => {
      surfaceMaterial.dispose();
      cloudMaterial.dispose();
      atmosphereMaterial.dispose();
      ringMaterial.dispose();
    },
    [atmosphereMaterial, cloudMaterial, ringMaterial, surfaceMaterial],
  );

  useFrame(({ clock }, delta) => {
    if (reducedMotion) return;
    if (body.current) body.current.rotation.y += delta * (selected ? 0.052 : 0.022 + seed * 0.018);
    if (cloudShell.current) cloudShell.current.rotation.y += delta * (0.034 + seed * 0.015);
    if (cloudShader.current) cloudShader.current.uniforms.uTime!.value = clock.elapsedTime;
  });

  const widthSegments = detail === "high" ? 80 : detail === "medium" ? 56 : 36;
  const heightSegments = detail === "high" ? 56 : detail === "medium" ? 36 : 24;
  const outerRingRadius =
    repository.radius * (repository.planetClass === "gas-giant" ? 2.05 : 1.72);

  return (
    <group rotation-z={profile.axialTilt}>
      <group ref={body}>
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[repository.radius, widthSegments, heightSegments]} />
          <primitive object={surfaceMaterial} attach="material" />
        </mesh>
      </group>
      {profile.cloudOpacity > 0 && detail !== "low" ? (
        <mesh ref={cloudShell} scale={1.018}>
          <sphereGeometry args={[repository.radius, widthSegments, heightSegments]} />
          <primitive ref={cloudShader} object={cloudMaterial} attach="material" />
        </mesh>
      ) : null}
      <mesh scale={1.065}>
        <sphereGeometry args={[repository.radius, widthSegments, heightSegments]} />
        <primitive object={atmosphereMaterial} attach="material" />
      </mesh>
      {profile.ringed ? (
        <mesh rotation-x={Math.PI / 2}>
          <ringGeometry args={[repository.radius * 1.28, outerRingRadius, 128, 4]} />
          <primitive object={ringMaterial} attach="material" />
        </mesh>
      ) : null}
      {repository.stars > 0 && detail !== "low" ? (
        <group rotation-y={seed * Math.PI * 2} rotation-x={0.18 + seed * 0.24}>
          <mesh position={[repository.radius * 1.72, 0, 0]} castShadow>
            <sphereGeometry args={[Math.max(0.14, repository.radius * 0.105), 24, 16]} />
            <meshStandardMaterial color="#aeb2b4" roughness={1} metalness={0} />
          </mesh>
          <mesh rotation-x={Math.PI / 2}>
            <torusGeometry args={[repository.radius * 1.72, repository.radius * 0.005, 6, 96]} />
            <meshBasicMaterial color="#a7bfd0" transparent opacity={0.16} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}

function ProfileStar({ reducedMotion }: Readonly<{ reducedMotion: boolean }>) {
  const core = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!reducedMotion && core.current) {
      const scale = 1 + Math.sin(clock.elapsedTime * 0.7) * 0.04;
      core.current.scale.setScalar(scale);
    }
  });

  return (
    <group>
      <mesh ref={core}>
        <sphereGeometry args={[1.72, 48, 32]} />
        <meshBasicMaterial color="#ffe08b" toneMapped={false} />
      </mesh>
      <mesh scale={1.42}>
        <sphereGeometry args={[1.72, 40, 28]} />
        <meshBasicMaterial
          color="#ffbe55"
          transparent
          opacity={0.2}
          depthWrite={false}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <pointLight color="#ffd89a" intensity={52} distance={48} decay={1.35} />
      <Sparkles count={34} scale={8} size={2.1} speed={reducedMotion ? 0 : 0.18} color="#ffe3a1" />
    </group>
  );
}

function RepositoryWorld({
  repository,
  selected,
  detail,
  reducedMotion,
  onSelect,
  onHover,
  onEnter,
  traveling,
}: Readonly<{
  repository: UniverseRepository;
  selected: boolean;
  detail: "low" | "medium" | "high";
  reducedMotion: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
  onEnter: () => void;
  traveling: boolean;
}>) {
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const profile = useMemo(() => createPlanetVisualProfile(repository), [repository]);
  const textureSeed = seededUnit(`${repository.owner}/${repository.repository}`);

  useFrame(({ clock }) => {
    if (!reducedMotion && group.current) {
      group.current.position.y =
        repository.position.y + Math.sin(clock.elapsedTime * 0.24 + textureSeed * 8) * 0.09;
    }
  });

  return (
    <group
      ref={group}
      position={[repository.position.x, repository.position.y, repository.position.z]}
      onClick={(event) => {
        event.stopPropagation();
        if (selected) onEnter();
        else onSelect();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onEnter();
      }}
      onPointerEnter={(event) => {
        event.stopPropagation();
        setHovered(true);
        onHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerLeave={() => {
        setHovered(false);
        onHover(false);
        document.body.style.cursor = "default";
      }}
    >
      <group scale={traveling ? 1.2 : selected ? 1.09 : hovered ? 1.045 : 1}>
        <CelestialPlanet
          repository={repository}
          detail={detail}
          profile={profile}
          reducedMotion={reducedMotion}
          selected={selected}
        />
        {selected ? (
          <>
            <pointLight
              color={profile.atmosphere}
              intensity={5.5}
              distance={repository.radius * 4}
              decay={1.8}
            />
            <Sparkles
              count={12}
              scale={repository.radius * 3}
              size={1.2}
              speed={reducedMotion ? 0 : 0.08}
              color={profile.atmosphere}
            />
          </>
        ) : null}
      </group>
      {hovered || selected ? (
        <Html
          center
          distanceFactor={12}
          position={[0, repository.radius * (profile.ringed ? 2.2 : 1.62), 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className="kingdom-world-label kingdom-world-label--universe" aria-hidden="true">
            <span>
              {REPOSITORY_PLANET_CLASS_LABELS[repository.planetClass]} ·{" "}
              {repository.language ?? "Repository"}
            </span>
            {repository.repository}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

function OrbitalLines({
  repositories,
}: Readonly<{ repositories: ReadonlyArray<UniverseRepository> }>) {
  return (
    <group>
      {repositories.slice(0, 18).map((repository) => {
        const radius = Math.hypot(repository.position.x, repository.position.z);
        const tilt = (seededUnit(`${repository.id}:orbit-tilt`) - 0.5) * 0.08;
        const points = Array.from({ length: 97 }, (_, index) => {
          const angle = (index / 96) * Math.PI * 2;
          return new THREE.Vector3(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius * tilt,
            Math.sin(angle) * radius,
          );
        });
        return (
          <Line
            key={repository.id}
            points={points}
            color="#6c829e"
            lineWidth={0.36}
            opacity={0.075}
            transparent
          />
        );
      })}
    </group>
  );
}

function Nebula({
  quality,
  reducedMotion,
}: Readonly<{ quality: "low" | "high"; reducedMotion: boolean }>) {
  const nebula = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const count = quality === "high" ? 900 : 350;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const angle = seededUnit(`nebula:${index}:angle`) * Math.PI * 6;
      const distance = 5 + Math.sqrt(seededUnit(`nebula:${index}:distance`)) * 38;
      const spread = (seededUnit(`nebula:${index}:spread`) - 0.5) * 6;
      const color = new THREE.Color(
        index % 3 === 0 ? "#8e79f0" : index % 3 === 1 ? "#3ac7d8" : "#de6ba8",
      );
      positions.set([Math.cos(angle) * distance, spread, Math.sin(angle) * distance], index * 3);
      colors.set([color.r, color.g, color.b], index * 3);
    }
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    nextGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return nextGeometry;
  }, [quality]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, delta) => {
    if (!reducedMotion && nebula.current) nebula.current.rotation.y += delta * 0.006;
  });

  return (
    <points ref={nebula} geometry={geometry} rotation-x={0.18}>
      <pointsMaterial size={0.11} vertexColors opacity={0.42} transparent depthWrite={false} />
    </points>
  );
}

function UniverseCamera({
  universe,
  selection,
  resetToken,
  reducedMotion,
  travelingRepositoryId,
}: Readonly<{
  universe: RepositoryUniverse;
  selection: Selection;
  resetToken: number;
  reducedMotion: boolean;
  travelingRepositoryId: number | null;
}>) {
  const { size } = useThree();
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const controls = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const goalPosition = useRef(new THREE.Vector3(20, 16, 27));
  const goalTarget = useRef(new THREE.Vector3());
  const animating = useRef(true);
  const overview = useMemo(() => {
    const bounds = new THREE.Box3();
    for (const repository of universe.repositories) {
      const profile = createPlanetVisualProfile(repository);
      const padding = repository.radius * (profile.ringed ? 2.28 : 1.42);
      bounds.expandByPoint(
        new THREE.Vector3(
          repository.position.x - padding,
          repository.position.y - padding,
          repository.position.z - padding,
        ),
      );
      bounds.expandByPoint(
        new THREE.Vector3(
          repository.position.x + padding,
          repository.position.y + padding,
          repository.position.z + padding,
        ),
      );
    }
    if (bounds.isEmpty()) {
      bounds.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(24, 12, 24));
    }
    bounds.expandByPoint(new THREE.Vector3(-3, -3, -3));
    bounds.expandByPoint(new THREE.Vector3(3, 3, 3));
    const center = bounds.getCenter(new THREE.Vector3());
    const aspect = Math.max(0.45, size.width / Math.max(1, size.height));
    const portrait = aspect < 0.78;
    const fovDegrees = portrait ? 48 : 39;
    const direction = portrait
      ? new THREE.Vector3(0.26, 2.8, 0.38).normalize()
      : new THREE.Vector3(0.58, 0.92, 1.16).normalize();
    const right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), direction)
      .normalize();
    const screenUp = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tangent = Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2);
    const margin = portrait ? 1.04 : size.height < 800 ? 1.2 : 1.16;
    let distance = 14;
    for (const repository of universe.repositories) {
      const profile = createPlanetVisualProfile(repository);
      const padding = repository.radius * (profile.ringed ? 2.18 : 1.2);
      const relative = new THREE.Vector3(
        repository.position.x,
        repository.position.y,
        repository.position.z,
      ).sub(center);
      const depth = relative.dot(direction) + padding;
      const horizontal = Math.abs(relative.dot(right)) + padding;
      const vertical = Math.abs(relative.dot(screenUp)) + padding;
      distance = Math.max(
        distance,
        depth + (horizontal * margin) / (tangent * aspect),
        depth + (vertical * margin) / tangent,
      );
    }
    return {
      center,
      distance,
      fov: fovDegrees,
      position: center.clone().addScaledVector(direction, distance),
    };
  }, [size.height, size.width, universe.repositories]);

  useEffect(() => {
    if (selection?.kind === "repository") {
      const { position, radius } = selection.repository;
      const traveling = travelingRepositoryId === selection.repository.id;
      const focusScale = createPlanetVisualProfile(selection.repository).ringed ? 1.56 : 1;
      goalTarget.current.set(position.x, position.y, position.z);
      goalPosition.current.set(
        position.x +
          radius *
            focusScale *
            (traveling ? (size.width < 700 ? 3.05 : 2.65) : size.width < 700 ? 4.1 : 3.2),
        position.y +
          radius *
            focusScale *
            (traveling ? (size.width < 700 ? 2.7 : 1.9) : size.width < 700 ? 3.65 : 2.35),
        position.z +
          radius *
            focusScale *
            (traveling ? (size.width < 700 ? 4.2 : 3.45) : size.width < 700 ? 5.5 : 4.2),
      );
    } else {
      goalTarget.current.copy(overview.center);
      goalPosition.current.copy(overview.position);
    }
    animating.current = true;
    if (reducedMotion) {
      camera.current?.position.copy(goalPosition.current);
      controls.current?.target.copy(goalTarget.current);
      controls.current?.update();
      animating.current = false;
    }
  }, [overview, reducedMotion, resetToken, selection, size.width, travelingRepositoryId]);

  useFrame((_, delta) => {
    if (!animating.current || !controls.current || !camera.current) return;
    const alpha = 1 - Math.exp(-delta * (travelingRepositoryId === null ? 3.4 : 5.8));
    camera.current.position.lerp(goalPosition.current, alpha);
    controls.current.target.lerp(goalTarget.current, alpha);
    controls.current.update();
    if (camera.current.position.distanceTo(goalPosition.current) < 0.04) animating.current = false;
  });

  return (
    <>
      <PerspectiveCamera
        ref={camera}
        makeDefault
        fov={overview.fov}
        near={0.08}
        far={650}
        position={[overview.position.x, overview.position.y, overview.position.z]}
      />
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping={!reducedMotion}
        dampingFactor={0.06}
        minDistance={3.5}
        maxDistance={overview.distance * 2.8}
        enabled={travelingRepositoryId === null}
        onStart={() => {
          animating.current = false;
        }}
      />
    </>
  );
}

export function RepositoryUniverseScene({
  universe,
  selection,
  onSelect,
  onHover,
  onEnterRepository,
  travelingRepositoryId,
  resetToken,
  reducedMotion,
  quality,
}: RepositoryUniverseSceneProps) {
  const selectedId = selection?.kind === "repository" ? selection.repository.id : null;
  const universeExtent = useMemo(
    () =>
      Math.max(
        30,
        ...universe.repositories.map(
          (repository) =>
            Math.hypot(repository.position.x, repository.position.y, repository.position.z) +
            repository.radius,
        ),
      ),
    [universe.repositories],
  );
  const detailLevels = useMemo(() => {
    const mediumLimit = quality === "high" ? 14 : 7;
    const highLimit = quality === "high" ? 6 : 3;
    const levels = new Map<UniverseRepository["id"], "low" | "medium" | "high">();
    universe.repositories.forEach((repository, index) => {
      levels.set(
        repository.id,
        index < highLimit ? "high" : index < mediumLimit ? "medium" : "low",
      );
    });
    if (selectedId !== null) levels.set(selectedId, "high");
    return levels;
  }, [quality, selectedId, universe.repositories]);

  return (
    <>
      <color attach="background" args={["#030611"]} />
      <fog
        attach="fog"
        args={["#040818", Math.max(64, universeExtent * 1.65), universeExtent * 5.8]}
      />
      <hemisphereLight args={["#bedbff", "#16162b", 0.9]} />
      <ambientLight intensity={0.18} color="#8fa6d8" />
      <directionalLight
        castShadow={quality === "high"}
        position={[18, 24, 14]}
        color="#fff0cf"
        intensity={3.2}
        shadow-mapSize-width={quality === "high" ? 1536 : 512}
        shadow-mapSize-height={quality === "high" ? 1536 : 512}
      />
      <Stars
        radius={180}
        depth={80}
        count={quality === "high" ? 3600 : 1500}
        factor={3.2}
        saturation={0.58}
        fade
        speed={reducedMotion ? 0 : 0.18}
      />
      <Nebula quality={quality} reducedMotion={reducedMotion} />
      <ProfileStar reducedMotion={reducedMotion} />
      <OrbitalLines repositories={universe.repositories} />
      {universe.repositories.map((repository) => (
        <RepositoryWorld
          key={repository.id}
          repository={repository}
          selected={selectedId === repository.id}
          detail={detailLevels.get(repository.id) ?? "low"}
          reducedMotion={reducedMotion}
          traveling={travelingRepositoryId === repository.id}
          onSelect={() => onSelect({ kind: "repository", repository })}
          onHover={(hovered) => onHover(hovered ? { kind: "repository", repository } : null)}
          onEnter={() => onEnterRepository(repository)}
        />
      ))}
      <UniverseCamera
        universe={universe}
        selection={selection}
        resetToken={resetToken}
        reducedMotion={reducedMotion}
        travelingRepositoryId={travelingRepositoryId}
      />
    </>
  );
}
