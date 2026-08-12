"use client";

import {
  Html,
  Line,
  OrbitControls,
  PerspectiveCamera,
  Sparkles,
  Stars,
  useGLTF,
} from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import {
  getKenneySeasonalPalette,
  kenneySeasonalAssetReferenceUrl,
} from "@/lib/assets/kenney-seasonal";
import { quaterniusAssetUrl } from "@/lib/assets/quaternius";
import { KINGDOM_SEASON_LABELS, type KingdomSeason } from "@/lib/kingdom";
import type { RepositoryUniverse, Selection, UniverseRepository } from "@/lib/kingdom/types";

import { seededUnit } from "./world-utils";

type RepositoryUniverseSceneProps = Readonly<{
  universe: RepositoryUniverse;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onHover: (selection: Selection) => void;
  onEnterRepository: (repository: UniverseRepository) => void;
  resetToken: number;
  reducedMotion: boolean;
  quality: "low" | "high";
}>;

type PlanetSeasonStyle = Readonly<{
  ground: string;
  highland: string;
  water: string;
  soil: string;
  road: string;
  roadMarking: string;
  foliage: string;
  roof: string;
  atmosphere: string;
  cloud: string;
  snow: number;
}>;

const PLANET_STYLES: Readonly<Record<KingdomSeason, PlanetSeasonStyle>> = {
  spring: {
    ground: "#76a84f",
    highland: "#b8d878",
    water: "#55abc2",
    soil: "#9a744d",
    road: "#d7c8aa",
    roadMarking: "#faf0cd",
    foliage: "#efabc3",
    roof: "#b66757",
    atmosphere: "#9fdcef",
    cloud: "#fff8e9",
    snow: 0,
  },
  summer: {
    ground: "#4f853c",
    highland: "#86ad4f",
    water: "#3e92ad",
    soil: "#886d43",
    road: "#cfb98e",
    roadMarking: "#f7e7b0",
    foliage: "#4d8b43",
    roof: "#a9513d",
    atmosphere: "#7dcce8",
    cloud: "#fff9e8",
    snow: 0,
  },
  autumn: {
    ground: "#8d743d",
    highland: "#c99547",
    water: "#567f94",
    soil: "#775033",
    road: "#bca27d",
    roadMarking: "#efd6a0",
    foliage: "#bf6435",
    roof: "#823f34",
    atmosphere: "#e3a36e",
    cloud: "#fff0d7",
    snow: 0,
  },
  winter: {
    ground: "#a9bbb5",
    highland: "#edf2ee",
    water: "#668fa5",
    soil: "#89918f",
    road: "#aeb7ba",
    roadMarking: "#f8fbfa",
    foliage: "#47685c",
    roof: "#795653",
    atmosphere: "#c7e0ea",
    cloud: "#ffffff",
    snow: 0.82,
  },
};

const MINIATURE_ASSETS = {
  wall: quaterniusAssetUrl("medieval", "Wall_Plaster_Straight"),
  door: quaterniusAssetUrl("medieval", "Wall_Plaster_Door_Round"),
  window: quaterniusAssetUrl("medieval", "Wall_Plaster_Window_Wide_Round"),
  roof: quaterniusAssetUrl("medieval", "Roof_RoundTiles_4x4"),
  chimney: quaterniusAssetUrl("medieval", "Prop_Chimney"),
  fence: quaterniusAssetUrl("medieval", "Prop_WoodenFence_Single"),
  vine: quaterniusAssetUrl("medieval", "Prop_Vine1"),
  broadleaf: quaterniusAssetUrl("nature", "CommonTree_2"),
  flowering: quaterniusAssetUrl("nature", "TwistedTree_1"),
  pine: quaterniusAssetUrl("nature", "Pine_2"),
  bush: quaterniusAssetUrl("nature", "Bush_Common_Flowers"),
} as const;

for (const url of Object.values(MINIATURE_ASSETS)) useGLTF.preload(url);
for (const season of ["spring", "summer", "autumn", "winter"] as const) {
  const palette = getKenneySeasonalPalette(season);
  for (const reference of [...palette.canopy, ...palette.groundDetails]) {
    useGLTF.preload(kenneySeasonalAssetReferenceUrl(reference));
  }
}

function createPlanetGeometry(
  repository: UniverseRepository,
  detail: "low" | "high",
): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(
    repository.radius,
    detail === "high" ? 48 : 28,
    detail === "high" ? 32 : 20,
  );
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const style = PLANET_STYLES[repository.season];
  const ground = new THREE.Color(style.ground);
  const highland = new THREE.Color(style.highland);
  const seed = seededUnit(`${repository.id}:planet-surface`) * Math.PI * 8;
  const point = new THREE.Vector3();

  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index).normalize();
    const terrainNoise =
      Math.sin(point.x * 3.2 + point.z * 1.6 + seed) * 0.52 +
      Math.cos(point.y * 4.1 - point.x * 1.2 - seed * 0.37) * 0.31 +
      Math.sin((point.x + point.y - point.z) * 5.4 + seed * 0.21) * 0.17;
    const elevation = THREE.MathUtils.smoothstep(terrainNoise, -0.55, 0.82);
    const color = ground.clone().lerp(highland, 0.12 + elevation * 0.3);
    if (repository.season === "winter") {
      const polarSnow = THREE.MathUtils.smoothstep(Math.abs(point.y), 0.12, 0.92);
      color.lerp(highland, Math.max(style.snow * 0.45, polarSnow * 0.72));
    }
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function surfaceNormal(latitude: number, longitude: number): THREE.Vector3 {
  const latitudeCosine = Math.cos(latitude);
  return new THREE.Vector3(
    latitudeCosine * Math.cos(longitude),
    Math.sin(latitude),
    latitudeCosine * Math.sin(longitude),
  ).normalize();
}

function PlanetAnchor({
  latitude,
  longitude,
  radius,
  rotation = 0,
  children,
}: Readonly<{
  latitude: number;
  longitude: number;
  radius: number;
  rotation?: number;
  children: React.ReactNode;
}>) {
  const transform = useMemo(() => {
    const normal = surfaceNormal(latitude, longitude);
    return {
      position: normal.multiplyScalar(radius),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal),
    };
  }, [latitude, longitude, radius]);
  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      <group rotation-y={rotation}>{children}</group>
    </group>
  );
}

function MiniatureAsset({
  url,
  targetHeight,
  tint,
  tintStrength = 0.28,
  castShadow = true,
}: Readonly<{
  url: string;
  targetHeight: number;
  tint: string;
  tintStrength?: number;
  castShadow?: boolean;
}>) {
  const { scene } = useGLTF(url);
  const asset = useMemo(() => {
    const object = scene.clone(true);
    const materials: THREE.Material[] = [];
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
      const clonedMaterials = sourceMaterials.map((source) => {
        const material = source.clone();
        if (material instanceof THREE.MeshStandardMaterial) {
          material.color.lerp(new THREE.Color(tint), tintStrength);
          material.roughness = Math.max(0.64, material.roughness);
        }
        materials.push(material);
        return material;
      });
      child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0]!;
      child.castShadow = castShadow;
      child.receiveShadow = true;
    });
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object);
    const center = bounds.getCenter(new THREE.Vector3());
    const height = Math.max(0.001, bounds.max.y - bounds.min.y);
    const scale = targetHeight / height;
    object.scale.setScalar(scale);
    object.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    return { materials, object };
  }, [castShadow, scene, targetHeight, tint, tintStrength]);

  useEffect(
    () => () => {
      for (const material of asset.materials) material.dispose();
    },
    [asset],
  );
  return <primitive object={asset.object} />;
}

function MiniatureHouse({
  radius,
  style,
  variant,
}: Readonly<{ radius: number; style: PlanetSeasonStyle; variant: number }>) {
  const wallHeight = radius * (variant === 0 ? 0.34 : 0.27);
  const footprint = variant === 0 ? 1.08 : 0.86;
  const wallOffset = radius * (variant === 0 ? 0.13 : 0.105);
  return (
    <group scale={[footprint, 1, footprint]}>
      {[
        { url: MINIATURE_ASSETS.door, position: [0, 0, wallOffset], rotation: 0 },
        { url: MINIATURE_ASSETS.wall, position: [0, 0, -wallOffset], rotation: Math.PI },
        {
          url: MINIATURE_ASSETS.window,
          position: [-wallOffset, 0, 0],
          rotation: Math.PI / 2,
        },
        {
          url: MINIATURE_ASSETS.window,
          position: [wallOffset, 0, 0],
          rotation: -Math.PI / 2,
        },
      ].map((wall, index) => (
        <group
          key={index}
          position={wall.position as [number, number, number]}
          rotation-y={wall.rotation}
        >
          <MiniatureAsset
            url={wall.url}
            targetHeight={wallHeight}
            tint="#eadbc0"
            tintStrength={0.14}
          />
        </group>
      ))}
      <group position-y={wallHeight * 0.9} scale={[1.18, 1, 1.18]}>
        <MiniatureAsset
          url={MINIATURE_ASSETS.roof}
          targetHeight={radius * (variant === 0 ? 0.18 : 0.15)}
          tint={style.roof}
          tintStrength={0.46}
        />
      </group>
      <group position={[radius * 0.13, wallHeight * 1.07, -radius * 0.03]}>
        <MiniatureAsset
          url={MINIATURE_ASSETS.chimney}
          targetHeight={radius * 0.11}
          tint="#80685b"
        />
      </group>
      {variant === 0 ? (
        <group position={[-wallOffset * 1.05, wallHeight * 0.05, radius * 0.05]}>
          <MiniatureAsset
            url={MINIATURE_ASSETS.vine}
            targetHeight={wallHeight * 0.76}
            tint={style.foliage}
            tintStrength={0.38}
          />
        </group>
      ) : null}
      <pointLight
        position={[0, wallHeight * 0.58, radius * 0.12]}
        color="#ffd38e"
        intensity={0.64}
        distance={radius * 1.2}
        decay={1.5}
      />
    </group>
  );
}

function MiniatureFence({ radius, style }: Readonly<{ radius: number; style: PlanetSeasonStyle }>) {
  return (
    <group>
      {[-1, 0, 1].map((offset) => (
        <group key={offset} position-x={offset * radius * 0.1}>
          <MiniatureAsset
            url={MINIATURE_ASSETS.fence}
            targetHeight={radius * 0.075}
            tint={style.soil}
            tintStrength={0.34}
          />
        </group>
      ))}
    </group>
  );
}

function MiniatureBush({ radius, style }: Readonly<{ radius: number; style: PlanetSeasonStyle }>) {
  return (
    <MiniatureAsset
      url={MINIATURE_ASSETS.bush}
      targetHeight={radius * 0.12}
      tint={style.foliage}
      tintStrength={0.36}
      castShadow={false}
    />
  );
}

function PlanetCloud({
  radius,
  style,
  seed,
}: Readonly<{ radius: number; style: PlanetSeasonStyle; seed: number }>) {
  return (
    <group scale={0.85 + seed * 0.24}>
      <mesh position-x={-radius * 0.08} scale={[1.55, 0.52, 0.82]}>
        <sphereGeometry args={[radius * 0.075, 12, 8]} />
        <meshStandardMaterial
          color={style.cloud}
          emissive={style.cloud}
          emissiveIntensity={0.18}
          transparent
          opacity={0.88}
          depthWrite={false}
          roughness={1}
        />
      </mesh>
      <mesh position-x={radius * 0.055} scale={[1.3, 0.64, 0.9]}>
        <sphereGeometry args={[radius * 0.07, 12, 8]} />
        <meshStandardMaterial
          color={style.cloud}
          emissive={style.cloud}
          emissiveIntensity={0.18}
          transparent
          opacity={0.84}
          depthWrite={false}
          roughness={1}
        />
      </mesh>
    </group>
  );
}

function MiniatureTree({
  repository,
  index,
  style,
  emphasis = 1,
}: Readonly<{
  repository: UniverseRepository;
  index: number;
  style: PlanetSeasonStyle;
  emphasis?: number;
}>) {
  const role =
    repository.season === "winter"
      ? "pine"
      : repository.season === "spring" && index % 2 === 0
        ? "flowering"
        : "broadleaf";
  const seasonalPalette = getKenneySeasonalPalette(repository.season);
  const seasonalTreeUrl = kenneySeasonalAssetReferenceUrl(
    seasonalPalette.canopy[index % seasonalPalette.canopy.length]!,
  );
  return (
    <MiniatureAsset
      url={
        repository.season === "spring" && index % 3 === 0 ? MINIATURE_ASSETS[role] : seasonalTreeUrl
      }
      targetHeight={
        repository.radius * emphasis * (0.38 + seededUnit(`${repository.id}:tree:${index}`) * 0.09)
      }
      tint={style.foliage}
      tintStrength={repository.season === "winter" ? 0.46 : 0.42}
    />
  );
}

function MiniatureSeasonAccent({
  repository,
  index,
}: Readonly<{ repository: UniverseRepository; index: number }>) {
  const style = PLANET_STYLES[repository.season];
  const palette = getKenneySeasonalPalette(repository.season);
  const reference = palette.groundDetails[index % palette.groundDetails.length]!;
  return (
    <MiniatureAsset
      url={kenneySeasonalAssetReferenceUrl(reference)}
      targetHeight={repository.radius * (repository.season === "winter" ? 0.08 : 0.11)}
      tint={repository.season === "winter" ? style.highland : style.foliage}
      tintStrength={repository.season === "winter" ? 0.12 : 0.24}
      castShadow={false}
    />
  );
}

function MiniatureHabitat({
  repository,
  detail,
}: Readonly<{ repository: UniverseRepository; detail: "medium" | "high" }>) {
  const style = PLANET_STYLES[repository.season];
  const seed = seededUnit(`${repository.id}:habitat`) * Math.PI * 2;
  const crownLongitude = 0.9 + (seededUnit(`${repository.id}:crown-longitude`) - 0.5) * 0.12;
  const treeAnchors = [
    { latitude: 0.74, longitude: crownLongitude - 0.58 },
    { latitude: 0.42, longitude: crownLongitude - 0.36 },
    { latitude: 0.68, longitude: crownLongitude + 0.4 },
    { latitude: 0.38, longitude: crownLongitude + 0.58 },
    { latitude: 0.52, longitude: crownLongitude + 1.02 },
    { latitude: 0.42, longitude: crownLongitude - 1.08 },
  ];
  const highDetail = detail === "high";
  return (
    <group>
      <PlanetAnchor
        latitude={0.56}
        longitude={crownLongitude}
        radius={repository.radius * 1.005}
        rotation={-seed * 0.35}
      >
        <MiniatureHouse radius={repository.radius} style={style} variant={0} />
      </PlanetAnchor>
      {treeAnchors.slice(0, highDetail ? 4 : 3).map((anchor, index) => (
        <PlanetAnchor
          key={`${repository.id}:tree:${index}`}
          latitude={anchor.latitude}
          longitude={anchor.longitude}
          radius={repository.radius * 1.008}
          rotation={seed + index * 1.7}
        >
          <MiniatureTree
            repository={repository}
            index={index}
            style={style}
            emphasis={index === 0 ? 1.12 : 1}
          />
        </PlanetAnchor>
      ))}
      {highDetail
        ? [2.42].map((longitude, index) => (
            <PlanetAnchor
              key={`${repository.id}:fence:${index}`}
              latitude={0.04 + index * 0.08}
              longitude={crownLongitude + (longitude - 2.6) * 0.32}
              radius={repository.radius * 1.006}
              rotation={longitude + Math.PI / 2}
            >
              <MiniatureFence radius={repository.radius} style={style} />
            </PlanetAnchor>
          ))
        : null}
      {highDetail
        ? [1.2, 5.74].map((longitude, index) => (
            <PlanetAnchor
              key={`${repository.id}:bush:${index}`}
              latitude={0.2 + index * 0.14}
              longitude={crownLongitude + (longitude - 3.4) * 0.28}
              radius={repository.radius * 1.008}
              rotation={index}
            >
              <MiniatureBush radius={repository.radius} style={style} />
            </PlanetAnchor>
          ))
        : null}
      {highDetail
        ? [0.72, 5.16].map((longitude, index) => (
            <PlanetAnchor
              key={`${repository.id}:season-accent:${index}`}
              latitude={0.12 + index * 0.12}
              longitude={crownLongitude + (longitude - 3) * 0.3}
              radius={repository.radius * 1.009}
              rotation={-longitude}
            >
              <MiniatureSeasonAccent repository={repository} index={index} />
            </PlanetAnchor>
          ))
        : null}
      <PlanetAnchor
        latitude={0.86}
        longitude={crownLongitude + 1.38}
        radius={repository.radius * 1.12}
        rotation={seed}
      >
        <PlanetCloud radius={repository.radius} style={style} seed={seed / (Math.PI * 2)} />
      </PlanetAnchor>
      {highDetail ? (
        <PlanetAnchor
          latitude={0.42}
          longitude={crownLongitude - 1.45}
          radius={repository.radius * 1.1}
          rotation={-seed}
        >
          <PlanetCloud radius={repository.radius} style={style} seed={1 - seed / (Math.PI * 2)} />
        </PlanetAnchor>
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
        <icosahedronGeometry args={[1.6, 3]} />
        <meshStandardMaterial
          color="#fff0ad"
          emissive="#f5a835"
          emissiveIntensity={2.8}
          roughness={0.32}
        />
      </mesh>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[2.4, 0.045, 8, 80]} />
        <meshBasicMaterial color="#f5d779" transparent opacity={0.52} />
      </mesh>
      <pointLight color="#ffd57c" intensity={42} distance={28} decay={1.4} />
      <Sparkles count={28} scale={7} size={2.5} speed={reducedMotion ? 0 : 0.25} color="#ffe3a1" />
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
}: Readonly<{
  repository: UniverseRepository;
  selected: boolean;
  detail: "low" | "medium" | "high";
  reducedMotion: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
  onEnter: () => void;
}>) {
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const textureSeed = seededUnit(`${repository.owner}/${repository.repository}`);
  const style = PLANET_STYLES[repository.season];
  const geometry = useMemo(
    () => createPlanetGeometry(repository, detail === "low" ? "low" : "high"),
    [detail, repository],
  );
  const roadTilt = (textureSeed - 0.5) * 0.72;
  const roadWidth = 0.062 + textureSeed * 0.018;

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }) => {
    if (!reducedMotion && group.current) {
      group.current.rotation.y = selected
        ? Math.sin(clock.elapsedTime * 0.22 + textureSeed * 4) * 0.025
        : clock.elapsedTime * (0.012 + textureSeed * 0.016);
      group.current.position.y =
        repository.position.y + Math.sin(clock.elapsedTime * 0.32 + textureSeed * 8) * 0.12;
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
      <group scale={selected ? 1.1 : hovered ? 1.04 : 1}>
        <mesh geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial
            vertexColors
            emissive={style.ground}
            emissiveIntensity={selected ? 0.12 : 0.035}
            roughness={0.86}
            metalness={0.015}
            envMapIntensity={0.28}
            flatShading={false}
          />
        </mesh>
        <mesh rotation={[roadTilt, textureSeed * 0.6, roadTilt * -0.72]}>
          <sphereGeometry
            args={[
              repository.radius * 1.009,
              64,
              8,
              0,
              Math.PI * 2,
              Math.PI / 2 - roadWidth,
              roadWidth * 2,
            ]}
          />
          <meshStandardMaterial
            color={style.road}
            roughness={0.96}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
        <mesh rotation={[roadTilt * -0.55, textureSeed * 2.3, roadTilt * 0.38]}>
          <sphereGeometry
            args={[
              repository.radius * 1.01,
              56,
              8,
              0,
              Math.PI * 2,
              Math.PI / 2 - roadWidth * 0.5,
              roadWidth,
            ]}
          />
          <meshStandardMaterial color={style.water} roughness={0.3} metalness={0.05} />
        </mesh>
        <mesh rotation={[roadTilt, textureSeed * 0.6, roadTilt * -0.72]}>
          <sphereGeometry
            args={[
              repository.radius * 1.013,
              64,
              4,
              0,
              Math.PI * 2,
              Math.PI / 2 - roadWidth * 0.13,
              roadWidth * 0.26,
            ]}
          />
          <meshBasicMaterial color={style.roadMarking} transparent opacity={0.82} />
        </mesh>
        <mesh scale={1.038}>
          <sphereGeometry args={[repository.radius, 36, 24]} />
          <meshBasicMaterial
            color={style.atmosphere}
            transparent
            opacity={selected ? 0.085 : 0.036}
            depthWrite={false}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {detail !== "low" ? (
          <Suspense fallback={null}>
            <MiniatureHabitat repository={repository} detail={detail} />
          </Suspense>
        ) : null}
        {repository.stars > 0 ? (
          <mesh
            position={[
              repository.radius * 1.62,
              repository.radius * 0.38,
              repository.radius * 0.52,
            ]}
          >
            <icosahedronGeometry args={[Math.max(0.12, repository.radius * 0.095), 2]} />
            <meshStandardMaterial color="#d8dce3" roughness={0.94} />
          </mesh>
        ) : null}
        {selected ? (
          <>
            <pointLight color={style.atmosphere} intensity={9} distance={repository.radius * 3.4} />
            <Sparkles
              count={18}
              scale={repository.radius * 2.8}
              size={1.6}
              speed={reducedMotion ? 0 : 0.16}
              color={style.atmosphere}
            />
          </>
        ) : null}
      </group>
      {hovered || selected ? (
        <Html
          center
          distanceFactor={12}
          position={[0, repository.radius * 1.72, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className="kingdom-world-label kingdom-world-label--universe" aria-hidden="true">
            <span>
              {KINGDOM_SEASON_LABELS[repository.season]} · {repository.language ?? "Repository"}
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
      {repositories.slice(0, 18).map((repository) => (
        <Line
          key={repository.id}
          points={[
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(repository.position.x, repository.position.y, repository.position.z),
          ]}
          color={`hsl(${repository.hue} 50% 65%)`}
          lineWidth={0.45}
          opacity={0.12}
          transparent
        />
      ))}
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
}: Readonly<{
  universe: RepositoryUniverse;
  selection: Selection;
  resetToken: number;
  reducedMotion: boolean;
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
      const padding = repository.radius * 1.72;
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
    const dimensions = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(14, dimensions.length() * 0.5);
    const aspect = Math.max(0.45, size.width / Math.max(1, size.height));
    const portrait = aspect < 0.78;
    const fovDegrees = portrait ? 48 : 39;
    const fov = THREE.MathUtils.degToRad(fovDegrees);
    const fitHeight = Math.max(dimensions.y + dimensions.z * 0.5, dimensions.x / aspect);
    const distance =
      Math.max(radius * 1.48, fitHeight / (2 * Math.tan(fov / 2))) * (portrait ? 0.9 : 1.07);
    const direction = portrait
      ? new THREE.Vector3(0.36, 0.98, 1.34).normalize()
      : new THREE.Vector3(0.58, 0.92, 1.16).normalize();
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
      goalTarget.current.set(position.x, position.y, position.z);
      goalPosition.current.set(
        position.x + radius * (size.width < 700 ? 4.1 : 3.2),
        position.y + radius * (size.width < 700 ? 3.65 : 2.35),
        position.z + radius * (size.width < 700 ? 5.5 : 4.2),
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
  }, [overview, reducedMotion, resetToken, selection, size.width]);

  useFrame((_, delta) => {
    if (!animating.current || !controls.current || !camera.current) return;
    const alpha = 1 - Math.exp(-delta * 3.4);
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
      />
    </>
  );
}
