"use client";

import {
  Clone,
  OrbitControls,
  OrthographicCamera,
  Sparkles,
  useAnimations,
  useGLTF,
} from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ComponentProps } from "react";
import * as THREE from "three";

import type { KingdomSeason } from "@/lib/kingdom";
import { QUATERNIUS_ANIMAL_CLIPS, quaterniusAssetUrl } from "@/lib/assets/quaternius";
import type {
  FileCategory,
  KingdomEntity,
  KingdomRoute,
  KingdomWorld,
  RepositoryPortal,
  Selection,
} from "@/lib/kingdom/types";

import { seededUnit, stableNumber } from "./world-utils";

type Quality = "low" | "high";
type VecTuple = readonly [number, number, number];

type KingdomSceneProps = Readonly<{
  world: KingdomWorld;
  season: KingdomSeason;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onHover: (selection: Selection) => void;
  onEnterPortal: (portal: RepositoryPortal) => void;
  resetToken: number;
  reducedMotion: boolean;
  quality: Quality;
}>;

type SeasonStyle = Readonly<{
  sky: string;
  horizon: string;
  fog: string;
  grass: string;
  grassHigh: string;
  grassLow: string;
  cliff: string;
  path: string;
  water: string;
  sun: string;
  ambient: string;
  foliage: string;
  particle: string;
}>;

const SEASON_STYLE: Readonly<Record<KingdomSeason, SeasonStyle>> = {
  spring: {
    sky: "#b9dbea",
    horizon: "#eef2d9",
    fog: "#c7ddd5",
    grass: "#6f9c58",
    grassHigh: "#8db46d",
    grassLow: "#557d49",
    cliff: "#59675b",
    path: "#b99565",
    water: "#4ca0a9",
    sun: "#fff0bd",
    ambient: "#e8f4e6",
    foliage: "#e8ffda",
    particle: "#fff4f7",
  },
  summer: {
    sky: "#87c8e4",
    horizon: "#f3e4ae",
    fog: "#bdd6c4",
    grass: "#4f8445",
    grassHigh: "#6b9e4a",
    grassLow: "#315f37",
    cliff: "#4f6256",
    path: "#b99058",
    water: "#2c8fa1",
    sun: "#ffe49a",
    ambient: "#d8efcf",
    foliage: "#ddf3bd",
    particle: "#fff0aa",
  },
  autumn: {
    sky: "#bdcbd0",
    horizon: "#ebc69a",
    fog: "#cbbda3",
    grass: "#777a43",
    grassHigh: "#9b8748",
    grassLow: "#525b38",
    cliff: "#62584d",
    path: "#aa7650",
    water: "#4d8990",
    sun: "#ffd29b",
    ambient: "#ead9bd",
    foliage: "#e48c52",
    particle: "#e98f4d",
  },
  winter: {
    sky: "#b7d0df",
    horizon: "#ecf1f0",
    fog: "#cddde1",
    grass: "#bccdca",
    grassHigh: "#e3ece7",
    grassLow: "#829a96",
    cliff: "#687a7d",
    path: "#bbc1b7",
    water: "#73aebd",
    sun: "#eff7ff",
    ambient: "#dcecf3",
    foliage: "#a7c2b1",
    particle: "#f4fbff",
  },
};

const MODULE_URLS = {
  plasterWall: quaterniusAssetUrl("medieval", "Wall_Plaster_Straight"),
  plasterDoor: quaterniusAssetUrl("medieval", "Wall_Plaster_Door_Round"),
  plasterWindow: quaterniusAssetUrl("medieval", "Wall_Plaster_Window_Wide_Round"),
  brickWall: quaterniusAssetUrl("medieval", "Wall_UnevenBrick_Straight"),
  brickDoor: quaterniusAssetUrl("medieval", "Wall_UnevenBrick_Door_Round"),
  brickWindow: quaterniusAssetUrl("medieval", "Wall_UnevenBrick_Window_Wide_Round"),
  roofSmall: quaterniusAssetUrl("medieval", "Roof_RoundTiles_4x4"),
  roofWide: quaterniusAssetUrl("medieval", "Roof_RoundTiles_6x8"),
  roofTower: quaterniusAssetUrl("medieval", "Roof_Tower_RoundTiles"),
  chimney: quaterniusAssetUrl("medieval", "Prop_Chimney"),
  wagon: quaterniusAssetUrl("medieval", "Prop_Wagon"),
  fence: quaterniusAssetUrl("medieval", "Prop_WoodenFence_Single"),
} as const;

const TREE_URLS = [
  quaterniusAssetUrl("nature", "CommonTree_1"),
  quaterniusAssetUrl("nature", "CommonTree_2"),
  quaterniusAssetUrl("nature", "CommonTree_3"),
  quaterniusAssetUrl("nature", "Pine_2"),
] as const;

for (const url of [...Object.values(MODULE_URLS), ...TREE_URLS]) useGLTF.preload(url);

function setCursor(active: boolean) {
  document.body.style.cursor = active ? "pointer" : "default";
}

function consumePointer(event: Readonly<{ stopPropagation: () => void }>) {
  event.stopPropagation();
}

function provinceExtents(world: KingdomWorld) {
  const minX = Math.min(
    ...world.provinces.map((province) => province.position.x - province.radius),
  );
  const maxX = Math.max(
    ...world.provinces.map((province) => province.position.x + province.radius),
  );
  const minZ = Math.min(
    ...world.provinces.map((province) => province.position.z - province.radius),
  );
  const maxZ = Math.max(
    ...world.provinces.map((province) => province.position.z + province.radius),
  );
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: Math.max(36, maxX - minX),
    depth: Math.max(48, maxZ - minZ),
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

function riverCenterX(z: number, world: KingdomWorld): number {
  const extents = provinceExtents(world);
  const progress = (z - extents.minZ) / Math.max(1, extents.depth);
  const bend =
    Math.sin(progress * Math.PI * 2.35 + seededUnit(world.seed) * 3) * extents.width * 0.08;
  return extents.centerX + bend - extents.width * 0.14;
}

function hillNoise(x: number, z: number, seed: string) {
  const phaseX = seededUnit(`${seed}:terrain-x`) * Math.PI * 2;
  const phaseZ = seededUnit(`${seed}:terrain-z`) * Math.PI * 2;
  return (
    Math.sin(x * 0.11 + phaseX) * 0.7 +
    Math.cos(z * 0.095 + phaseZ) * 0.55 +
    Math.sin((x + z) * 0.052 + phaseX * 0.7) * 0.42
  );
}

function worldHeight(x: number, z: number, world: KingdomWorld): number {
  const extents = provinceExtents(world);
  const normalizedBack = THREE.MathUtils.clamp(
    (extents.maxZ - z) / Math.max(1, extents.depth),
    0,
    1,
  );
  const rearRise = THREE.MathUtils.smoothstep(normalizedBack, 0.76, 1) * 2.8;
  const ridgeRipple =
    rearRise *
    (0.7 +
      Math.pow(Math.abs(Math.sin(x * 0.09 + seededUnit(`${world.seed}:ridge`) * 4)), 1.6) * 0.75);
  const riverDistance = Math.abs(x - riverCenterX(z, world));
  const riverValley = THREE.MathUtils.smoothstep(1 - riverDistance / 4.5, 0, 1) * 1.15;
  const lakeZ = extents.maxZ + 4;
  const lakeX = riverCenterX(lakeZ, world);
  const lakeDistance = Math.hypot((x - lakeX) / 7.2, (z - lakeZ) / 4.8);
  const lakeBasin = THREE.MathUtils.smoothstep(1 - lakeDistance, 0, 1) * 1.45;
  let settlementFlattening = 0;
  for (const province of world.provinces) {
    const distance = Math.hypot(x - province.position.x, z - province.position.z);
    const influence = THREE.MathUtils.clamp(1 - distance / (province.radius * 0.72), 0, 1);
    settlementFlattening = Math.max(settlementFlattening, influence * influence);
  }
  const rolling = hillNoise(x, z, world.seed) * (1 - settlementFlattening * 0.74);
  return 2.4 + rolling + ridgeRipple - riverValley - lakeBasin;
}

function boundaryRadius(angle: number, world: KingdomWorld): number {
  return (
    1 +
    Math.sin(angle * 3 + seededUnit(`${world.seed}:edge-a`) * 5) * 0.035 +
    Math.sin(angle * 7 - seededUnit(`${world.seed}:edge-b`) * 4) * 0.02
  );
}

function makeFloatingTerrain(world: KingdomWorld, style: SeasonStyle, quality: Quality) {
  const extents = provinceExtents(world);
  const padding = Math.max(13, Math.min(24, world.bounds.radius * 0.16));
  const centerX = extents.centerX;
  const centerZ = extents.centerZ;
  const halfWidth = extents.width / 2 + padding;
  const halfDepth = extents.depth / 2 + padding;
  const rings = quality === "high" ? 52 : 34;
  const segments = quality === "high" ? 128 : 84;
  const positions: number[] = [centerX, worldHeight(centerX, centerZ, world), centerZ];
  const colors: number[] = [];
  const indices: number[] = [];

  const centerColor = new THREE.Color(style.grass);
  colors.push(centerColor.r, centerColor.g, centerColor.b);

  for (let ring = 1; ring <= rings; ring += 1) {
    const fraction = ring / rings;
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const edge = boundaryRadius(angle, world);
      const x = centerX + Math.cos(angle) * halfWidth * fraction * edge;
      const z = centerZ + Math.sin(angle) * halfDepth * fraction * edge;
      const y = worldHeight(x, z, world);
      positions.push(x, y, z);
      const high = THREE.MathUtils.smoothstep(y, 2, 9);
      const river = THREE.MathUtils.clamp(1 - Math.abs(x - riverCenterX(z, world)) / 6, 0, 1);
      const color = new THREE.Color(style.grassLow)
        .lerp(new THREE.Color(style.grass), 0.48 + high * 0.36)
        .lerp(new THREE.Color(style.grassHigh), high * 0.42)
        .lerp(new THREE.Color(style.grassLow), river * 0.13);
      const variation = stableNumber(`${world.seed}:ground:${ring}:${segment}`, -0.035, 0.035);
      color.offsetHSL(variation * 0.2, variation * 0.3, variation);
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(0, 1 + ((segment + 1) % segments), 1 + segment);
  }
  for (let ring = 1; ring < rings; ring += 1) {
    const currentStart = 1 + (ring - 1) * segments;
    const nextStart = currentStart + segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      indices.push(
        currentStart + segment,
        nextStart + next,
        nextStart + segment,
        currentStart + segment,
        currentStart + next,
        nextStart + next,
      );
    }
  }

  const top = new THREE.BufferGeometry();
  top.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  top.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  top.setIndex(indices);
  top.computeVertexNormals();

  const sidePositions: number[] = [];
  const sideIndices: number[] = [];
  const sideColors: number[] = [];
  const cliffTop = new THREE.Color(style.cliff);
  const cliffBottom = cliffTop.clone().multiplyScalar(0.38);
  const bottomY = -4.4;
  for (let segment = 0; segment < segments; segment += 1) {
    const angle = (segment / segments) * Math.PI * 2;
    const edge = boundaryRadius(angle, world);
    const x = centerX + Math.cos(angle) * halfWidth * edge;
    const z = centerZ + Math.sin(angle) * halfDepth * edge;
    const y = worldHeight(x, z, world);
    sidePositions.push(x, y, z, x * 0.995 + centerX * 0.005, bottomY, z * 0.995 + centerZ * 0.005);
    sideColors.push(
      cliffTop.r,
      cliffTop.g,
      cliffTop.b,
      cliffBottom.r,
      cliffBottom.g,
      cliffBottom.b,
    );
  }
  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    sideIndices.push(
      segment * 2,
      next * 2 + 1,
      segment * 2 + 1,
      segment * 2,
      next * 2,
      next * 2 + 1,
    );
  }
  const side = new THREE.BufferGeometry();
  side.setAttribute("position", new THREE.Float32BufferAttribute(sidePositions, 3));
  side.setAttribute("color", new THREE.Float32BufferAttribute(sideColors, 3));
  side.setIndex(sideIndices);
  side.computeVertexNormals();
  return { top, side };
}

function FloatingTerrain({
  world,
  style,
  quality,
}: Readonly<{ world: KingdomWorld; style: SeasonStyle; quality: Quality }>) {
  const geometry = useMemo(
    () => makeFloatingTerrain(world, style, quality),
    [quality, style, world],
  );
  useEffect(
    () => () => {
      geometry.top.dispose();
      geometry.side.dispose();
    },
    [geometry],
  );
  return (
    <group>
      <mesh geometry={geometry.top}>
        <meshStandardMaterial vertexColors roughness={0.94} metalness={0} />
      </mesh>
      <mesh geometry={geometry.side} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.98} metalness={0} />
      </mesh>
    </group>
  );
}

function makeRiver(world: KingdomWorld) {
  const extents = provinceExtents(world);
  const points = 72;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index < points; index += 1) {
    const progress = index / (points - 1);
    const z = THREE.MathUtils.lerp(extents.minZ - 13, extents.maxZ + 19, progress);
    const x = riverCenterX(z, world);
    const nextZ = z + 0.3;
    const direction = new THREE.Vector2(riverCenterX(nextZ, world) - x, nextZ - z).normalize();
    const normal = new THREE.Vector2(-direction.y, direction.x);
    const width = 1.25 + Math.sin(progress * Math.PI) * 0.54 + progress * 0.75;
    const y = worldHeight(x, z, world) + 0.14;
    positions.push(
      x + normal.x * width,
      y,
      z + normal.y * width,
      x - normal.x * width,
      y,
      z - normal.y * width,
    );
  }
  for (let index = 0; index < points - 1; index += 1) {
    const offset = index * 2;
    indices.push(offset, offset + 2, offset + 3, offset, offset + 3, offset + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function ValleyRiver({
  world,
  style,
  reducedMotion,
}: Readonly<{ world: KingdomWorld; style: SeasonStyle; reducedMotion: boolean }>) {
  const geometry = useMemo(() => makeRiver(world), [world]);
  const material = useRef<THREE.MeshPhysicalMaterial>(null);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    if (!material.current || reducedMotion) return;
    material.current.opacity = 0.79 + Math.sin(clock.elapsedTime * 0.62) * 0.035;
  });
  return (
    <group>
      <mesh geometry={geometry} receiveShadow renderOrder={2}>
        <meshPhysicalMaterial
          ref={material}
          color={style.water}
          roughness={0.24}
          metalness={0.02}
          transmission={0.06}
          transparent
          opacity={0.72}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh
        position={[
          riverCenterX(provinceExtents(world).maxZ + 4, world),
          worldHeight(
            riverCenterX(provinceExtents(world).maxZ + 4, world),
            provinceExtents(world).maxZ + 4,
            world,
          ) + 0.2,
          provinceExtents(world).maxZ + 4,
        ]}
        rotation-x={-Math.PI / 2}
        scale={[7.2, 4.8, 1]}
        renderOrder={2}
      >
        <circleGeometry args={[1, 64]} />
        <meshPhysicalMaterial
          color={style.water}
          roughness={0.2}
          transparent
          opacity={0.72}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function makeRoute(route: KingdomRoute, world: KingdomWorld) {
  const start = new THREE.Vector3(
    route.from.x,
    worldHeight(route.from.x, route.from.z, world) + 0.12,
    route.from.z,
  );
  const end = new THREE.Vector3(
    route.to.x,
    worldHeight(route.to.x, route.to.z, world) + 0.12,
    route.to.z,
  );
  const direction = end.clone().sub(start);
  const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
  const bend = stableNumber(`${world.seed}:${route.id}:bend`, -3.8, 3.8);
  const control = start.clone().lerp(end, 0.5).addScaledVector(perpendicular, bend);
  control.y = worldHeight(control.x, control.z, world) + 0.16;
  const curve = new THREE.QuadraticBezierCurve3(start, control, end);
  return new THREE.TubeGeometry(curve, 28, 0.42, 7, false);
}

function RootPaths({ world, style }: Readonly<{ world: KingdomWorld; style: SeasonStyle }>) {
  const geometries = useMemo(() => world.routes.map((route) => makeRoute(route, world)), [world]);
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);
  return (
    <group>
      {geometries.map((geometry, index) => (
        <mesh key={world.routes[index]?.id} geometry={geometry} receiveShadow>
          <meshStandardMaterial color={style.path} roughness={0.98} />
        </mesh>
      ))}
    </group>
  );
}

function GltfPart({
  url,
  ...props
}: Readonly<{ url: string } & Omit<ComponentProps<typeof Clone>, "object">>) {
  const { scene } = useGLTF(url);
  return <Clone object={scene} castShadow receiveShadow {...props} />;
}

type ArchitectureKind = "cottage" | "hall" | "tower" | "workshop" | "storehouse";

function architectureKind(entity: KingdomEntity): ArchitectureKind {
  if (entity.aggregate) return "hall";
  const byCategory: Readonly<Record<FileCategory, ArchitectureKind>> = {
    source: seededUnit(`${entity.id}:house`) > 0.7 ? "workshop" : "cottage",
    test: "tower",
    docs: "hall",
    config: "workshop",
    asset: "storehouse",
    other: "cottage",
  };
  return byCategory[entity.category];
}

function wallsForStory(wall: string, door: string, window: string, storyY: number, wide = false) {
  const offset = wide ? 2 : 1.75;
  return (
    <>
      <GltfPart url={storyY === 0 ? door : window} position={[-1, storyY, offset]} />
      <GltfPart url={window} position={[1, storyY, offset]} />
      <GltfPart url={window} position={[-1, storyY, -offset]} rotation={[0, Math.PI, 0]} />
      <GltfPart url={wall} position={[1, storyY, -offset]} rotation={[0, Math.PI, 0]} />
      <GltfPart url={window} position={[-offset, storyY, -1]} rotation={[0, Math.PI / 2, 0]} />
      <GltfPart url={wall} position={[-offset, storyY, 1]} rotation={[0, Math.PI / 2, 0]} />
      <GltfPart url={window} position={[offset, storyY, -1]} rotation={[0, -Math.PI / 2, 0]} />
      <GltfPart url={wall} position={[offset, storyY, 1]} rotation={[0, -Math.PI / 2, 0]} />
    </>
  );
}

function TexturedBuilding({
  kind,
  position,
  rotation,
  scale = 1,
}: Readonly<{
  kind: ArchitectureKind;
  position: VecTuple;
  rotation: number;
  scale?: number;
}>) {
  const brick = kind === "tower" || kind === "workshop";
  const wall = brick ? MODULE_URLS.brickWall : MODULE_URLS.plasterWall;
  const door = brick ? MODULE_URLS.brickDoor : MODULE_URLS.plasterDoor;
  const window = brick ? MODULE_URLS.brickWindow : MODULE_URLS.plasterWindow;
  const stories = kind === "tower" ? 2 : kind === "hall" ? 2 : 1;
  const wide = kind === "hall" || kind === "storehouse";
  const roofScale = kind === "tower" ? 0.62 : wide ? 0.58 : 0.52;
  const roofY = stories * 3.12 - (kind === "tower" ? 0.2 : 0.35);
  return (
    <group position={position as [number, number, number]} rotation-y={rotation} scale={scale}>
      {Array.from({ length: stories }, (_, story) => (
        <group key={story}>{wallsForStory(wall, door, window, story * 3.12, wide)}</group>
      ))}
      <GltfPart
        url={
          kind === "tower"
            ? MODULE_URLS.roofTower
            : wide
              ? MODULE_URLS.roofWide
              : MODULE_URLS.roofSmall
        }
        position={[0, roofY, 0]}
        scale={roofScale}
      />
      {kind !== "tower" ? (
        <GltfPart
          url={MODULE_URLS.chimney}
          position={[wide ? 1.4 : 1.05, roofY + 1.7, -0.4]}
          scale={0.72}
        />
      ) : null}
      {kind === "workshop" ? (
        <GltfPart
          url={MODULE_URLS.wagon}
          position={[3.1, 0, 0.8]}
          rotation={[0, -0.4, 0]}
          scale={0.85}
        />
      ) : null}
    </group>
  );
}

function entityVisualPosition(entity: KingdomEntity, world: KingdomWorld): VecTuple {
  const province = world.provinces.find((candidate) => candidate.id === entity.provinceId);
  const x = entity.position.x;
  const z = entity.position.z;
  const river = Math.abs(x - riverCenterX(z, world));
  if (river > 3.8) return [x, worldHeight(x, z, world) + 0.1, z];
  const side = province && province.position.x >= riverCenterX(z, world) ? 1 : -1;
  const adjustedX = riverCenterX(z, world) + side * (4.4 + stableNumber(`${entity.id}:bank`, 0, 2));
  return [adjustedX, worldHeight(adjustedX, z, world) + 0.1, z];
}

function buildingScale(entity: KingdomEntity): number {
  const importance = Math.log2(entity.size + 8) / 18;
  return THREE.MathUtils.clamp((entity.aggregate ? 1.02 : 0.66) + importance, 0.72, 1.26);
}

function SemanticLandmark({
  entity,
  world,
  onSelect,
  onHover,
}: Readonly<{
  entity: KingdomEntity;
  world: KingdomWorld;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
}>) {
  const position = entityVisualPosition(entity, world);
  const scale = buildingScale(entity);
  const rotation = stableNumber(`${entity.id}:facing`, -Math.PI, Math.PI);
  return (
    <group position={[0, 0, 0]}>
      <TexturedBuilding
        kind={architectureKind(entity)}
        position={position}
        rotation={rotation}
        scale={scale}
      />
      <mesh
        position={[position[0], position[1] + scale * 2.2, position[2]]}
        onPointerDown={(event) => {
          consumePointer(event);
          onSelect();
        }}
        onDoubleClick={(event) => {
          consumePointer(event);
          window.open(entity.sourceUrl, "_blank", "noopener,noreferrer");
        }}
        onPointerEnter={(event) => {
          consumePointer(event);
          setCursor(true);
          onHover(true);
        }}
        onPointerLeave={() => {
          setCursor(false);
          onHover(false);
        }}
      >
        <boxGeometry args={[4.6 * scale, 5.8 * scale, 4.6 * scale]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Settlements({
  world,
  quality,
  onSelect,
  onHover,
}: Readonly<{
  world: KingdomWorld;
  quality: Quality;
  onSelect: (selection: Selection) => void;
  onHover: (selection: Selection) => void;
}>) {
  const visibleLimit = quality === "high" ? 25 : 16;
  const chosen = useMemo(() => {
    const important = [...world.entities].sort(
      (a, b) =>
        Number(b.aggregate) - Number(a.aggregate) ||
        b.size - a.size ||
        a.path.localeCompare(b.path),
    );
    const perProvince = new Map<string, number>();
    return important.filter((entity) => {
      const count = perProvince.get(entity.provinceId) ?? 0;
      if (count >= 4) return false;
      if ([...perProvince.values()].reduce((sum, value) => sum + value, 0) >= visibleLimit)
        return false;
      perProvince.set(entity.provinceId, count + 1);
      return true;
    });
  }, [visibleLimit, world.entities]);
  return (
    <group>
      {chosen.map((entity) => (
        <SemanticLandmark
          key={entity.id}
          entity={entity}
          world={world}
          onSelect={() => onSelect({ kind: "entity", entity })}
          onHover={(hovered) => onHover(hovered ? { kind: "entity", entity } : null)}
        />
      ))}
      {world.provinces.map((province) => (
        <group key={province.id}>
          <mesh
            position={[
              province.position.x,
              worldHeight(province.position.x, province.position.z, world) + 0.45,
              province.position.z,
            ]}
            rotation-x={-Math.PI / 2}
            onPointerDown={(event) => {
              consumePointer(event);
              onSelect({ kind: "province", province });
            }}
            onPointerEnter={(event) => {
              consumePointer(event);
              setCursor(true);
              onHover({ kind: "province", province });
            }}
            onPointerLeave={() => {
              setCursor(false);
              onHover(null);
            }}
          >
            <circleGeometry args={[Math.max(2.8, province.radius * 0.34), 28]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

type ForestPlacement = Readonly<{
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
}>;

function makeForestPlacements(world: KingdomWorld, count: number): ForestPlacement[][] {
  const extents = provinceExtents(world);
  const padding = Math.max(10, Math.min(20, world.bounds.radius * 0.13));
  const groups = TREE_URLS.map(() => [] as ForestPlacement[]);
  let attempts = 0;
  while (groups.reduce((sum, group) => sum + group.length, 0) < count && attempts < count * 18) {
    attempts += 1;
    const u = seededUnit(`${world.seed}:forest:u:${attempts}:east`);
    const v = seededUnit(`${world.seed}:forest:v:${attempts * 7919}:north`);
    const x = THREE.MathUtils.lerp(extents.minX - padding, extents.maxX + padding, u);
    const z = THREE.MathUtils.lerp(extents.minZ - padding, extents.maxZ + padding, v);
    const edgeX = Math.abs(x - extents.centerX) / (extents.width / 2 + padding);
    const edgeZ = Math.abs(z - extents.centerZ) / (extents.depth / 2 + padding);
    if (edgeX * edgeX + edgeZ * edgeZ > 0.97) continue;
    if (Math.abs(x - riverCenterX(z, world)) < 4.2) continue;
    const nearSettlement = world.provinces.some(
      (province) =>
        Math.hypot(x - province.position.x, z - province.position.z) < province.radius * 0.78,
    );
    if (nearSettlement) continue;
    const rearBias = THREE.MathUtils.clamp((extents.maxZ - z) / extents.depth, 0, 1);
    if (seededUnit(`${world.seed}:forest:${attempts}:density`) > 0.44 + rearBias * 0.5) continue;
    const groupIndex = Math.min(
      TREE_URLS.length - 1,
      Math.floor(seededUnit(`${world.seed}:forest:${attempts}:kind`) * TREE_URLS.length),
    );
    groups[groupIndex]?.push({
      x,
      y: worldHeight(x, z, world),
      z,
      rotation: seededUnit(`${world.seed}:forest:${attempts}:rotation`) * Math.PI * 2,
      scale: stableNumber(`${world.seed}:forest:${attempts}:scale`, 0.42, 0.78),
    });
  }
  return groups;
}

type GltfPrimitive = Readonly<{
  id: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  sourceMatrix: THREE.Matrix4;
}>;

function normalizedTemplatePrimitives(scene: THREE.Object3D): GltfPrimitive[] {
  const template = scene.clone(true);
  template.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(template);
  const center = bounds.getCenter(new THREE.Vector3());
  const anchor = new THREE.Vector3(center.x, bounds.min.y, center.z);
  template.position.sub(anchor);
  template.updateMatrixWorld(true);
  const found: GltfPrimitive[] = [];
  template.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      found.push({
        id: child.uuid,
        geometry: child.geometry,
        material: child.material,
        sourceMatrix: child.matrixWorld.clone(),
      });
    }
  });
  return found;
}

function InstancedPrimitive({
  primitive,
  placements,
  season,
  assetUrl,
}: Readonly<{
  primitive: GltfPrimitive;
  placements: ReadonlyArray<ForestPlacement>;
  season: KingdomSeason;
  assetUrl: string;
}>) {
  const instance = useRef<THREE.InstancedMesh>(null);
  const materials = useMemo(() => {
    const source = Array.isArray(primitive.material) ? primitive.material : [primitive.material];
    return source.map((material) => {
      const clone = material.clone();
      if (clone instanceof THREE.MeshStandardMaterial && /leaves/i.test(clone.name)) {
        if (season === "spring") {
          clone.color.set("#aeda73");
        } else if (season === "summer") {
          clone.color.set("#6eac57");
        } else if (season === "autumn") {
          clone.color.set("#df8b4a");
        } else {
          clone.color.set("#b7c7ba");
        }
        clone.roughness = 0.82;
      }
      if (
        clone instanceof THREE.MeshStandardMaterial &&
        !/leaves/i.test(clone.name) &&
        assetUrl.includes("Rock_")
      ) {
        clone.color.multiplyScalar(0.84);
      }
      return clone;
    });
  }, [assetUrl, primitive.material, season]);
  useLayoutEffect(() => {
    if (!instance.current) return;
    const placementMatrix = new THREE.Matrix4();
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    placements.forEach((placement, index) => {
      position.set(placement.x, placement.y, placement.z);
      quaternion.setFromEuler(new THREE.Euler(0, placement.rotation, 0));
      scale.setScalar(placement.scale);
      placementMatrix.compose(position, quaternion, scale);
      matrix.multiplyMatrices(placementMatrix, primitive.sourceMatrix);
      instance.current?.setMatrixAt(index, matrix);
    });
    instance.current.instanceMatrix.needsUpdate = true;
  }, [placements, primitive.sourceMatrix]);
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  return (
    <instancedMesh
      ref={instance}
      args={[
        primitive.geometry,
        materials.length === 1 ? materials[0] : materials,
        placements.length,
      ]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}

function InstancedGltf({
  url,
  placements,
  season,
}: Readonly<{ url: string; placements: ReadonlyArray<ForestPlacement>; season: KingdomSeason }>) {
  const { scene } = useGLTF(url);
  const primitives = useMemo(() => normalizedTemplatePrimitives(scene), [scene]);
  if (placements.length === 0) return null;
  return (
    <group>
      {primitives.map((primitive) => (
        <InstancedPrimitive
          key={primitive.id}
          primitive={primitive}
          placements={placements}
          season={season}
          assetUrl={url}
        />
      ))}
    </group>
  );
}

function DetailedForest({
  world,
  quality,
  season,
}: Readonly<{ world: KingdomWorld; quality: Quality; season: KingdomSeason }>) {
  const placements = useMemo(
    () => makeForestPlacements(world, quality === "high" ? 148 : 72),
    [quality, world],
  );
  return (
    <group>
      {TREE_URLS.map((url, index) => (
        <InstancedGltf key={url} url={url} placements={placements[index] ?? []} season={season} />
      ))}
    </group>
  );
}

function RearRockRidge({
  world,
  season,
}: Readonly<{ world: KingdomWorld; season: KingdomSeason }>) {
  const extents = provinceExtents(world);
  const placement = useMemo(() => {
    return Array.from({ length: 18 }, (_, index) => {
      const progress = index / 17;
      const x = THREE.MathUtils.lerp(extents.minX - 10, extents.maxX + 10, progress);
      const z = extents.minZ - 9 + Math.sin(progress * Math.PI * 3.2) * 2.5;
      return {
        x,
        y: worldHeight(x, z, world) - 0.7,
        z,
        rotation: seededUnit(`${world.seed}:ridge-rock:${index}`) * Math.PI * 2,
        scale: stableNumber(`${world.seed}:ridge-rock:${index}:scale`, 3.1, 6.2),
      };
    });
  }, [extents.maxX, extents.minX, extents.minZ, world]);
  return (
    <InstancedGltf
      url={quaterniusAssetUrl("nature", "Rock_Medium_1")}
      placements={placement}
      season={season}
    />
  );
}

function AnimatedDeer({
  position,
  rotation,
  clip,
  reducedMotion,
}: Readonly<{
  position: VecTuple;
  rotation: number;
  clip: "idle" | "graze";
  reducedMotion: boolean;
}>) {
  const group = useRef<THREE.Group>(null);
  const gltf = useGLTF(quaterniusAssetUrl("animals", "Deer"));
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const { actions } = useAnimations(gltf.animations, group);
  useEffect(() => {
    if (reducedMotion) return;
    const action = actions[QUATERNIUS_ANIMAL_CLIPS.Deer[clip]];
    action?.reset().fadeIn(0.35).play();
    return () => {
      action?.fadeOut(0.2);
    };
  }, [actions, clip, reducedMotion]);
  return (
    <group
      ref={group}
      position={position as [number, number, number]}
      rotation-y={rotation}
      scale={0.78}
    >
      <primitive object={scene} castShadow />
    </group>
  );
}

function DeerHerd({
  world,
  reducedMotion,
}: Readonly<{ world: KingdomWorld; reducedMotion: boolean }>) {
  const extents = provinceExtents(world);
  const baseZ = extents.centerZ + extents.depth * 0.12;
  const baseX = riverCenterX(baseZ, world) + 8.5;
  const herd = [
    [baseX, baseZ, 0.15, "graze"],
    [baseX + 2.5, baseZ - 1.8, -0.35, "idle"],
    [baseX - 1.5, baseZ + 2.3, 0.7, "graze"],
  ] as const;
  return (
    <group>
      {herd.map(([x, z, rotation, clip], index) => (
        <AnimatedDeer
          key={index}
          position={[x, worldHeight(x, z, world) + 0.08, z]}
          rotation={rotation}
          clip={clip}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  );
}

function Atmosphere({
  world,
  season,
  quality,
  reducedMotion,
}: Readonly<{
  world: KingdomWorld;
  season: KingdomSeason;
  quality: Quality;
  reducedMotion: boolean;
}>) {
  const style = SEASON_STYLE[season];
  const extents = provinceExtents(world);
  return (
    <>
      <color attach="background" args={[style.sky]} />
      <fog attach="fog" args={[style.fog, world.bounds.radius * 1.15, world.bounds.radius * 3.1]} />
      <hemisphereLight args={[style.ambient, style.cliff, 1.15]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        castShadow={quality === "high"}
        color={style.sun}
        intensity={1.85}
        position={[
          extents.maxX + world.bounds.radius * 0.4,
          world.bounds.radius * 1.25,
          extents.maxZ + world.bounds.radius * 0.35,
        ]}
        shadow-mapSize-width={quality === "high" ? 2048 : 768}
        shadow-mapSize-height={quality === "high" ? 2048 : 768}
        shadow-camera-far={world.bounds.radius * 4}
        shadow-camera-left={-world.bounds.radius * 1.2}
        shadow-camera-right={world.bounds.radius * 1.2}
        shadow-camera-top={world.bounds.radius * 1.3}
        shadow-camera-bottom={-world.bounds.radius * 1.3}
        shadow-bias={-0.00012}
      />
      <mesh position={[extents.centerX, -4.9, extents.centerZ]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[world.bounds.radius * 2.6, 64]} />
        <meshBasicMaterial color={style.horizon} />
      </mesh>
      {season === "winter" || season === "autumn" ? (
        <Sparkles
          count={quality === "high" ? 190 : 75}
          scale={[extents.width * 1.1, 18, extents.depth * 1.1]}
          position={[extents.centerX, 9, extents.centerZ]}
          size={season === "winter" ? 2.4 : 1.25}
          speed={reducedMotion ? 0 : season === "winter" ? 0.28 : 0.15}
          color={style.particle}
          opacity={0.7}
        />
      ) : null}
    </>
  );
}

function PortalGateway({
  portal,
  world,
  style,
  reducedMotion,
  onSelect,
  onHover,
  onEnter,
}: Readonly<{
  portal: RepositoryPortal;
  world: KingdomWorld;
  style: SeasonStyle;
  reducedMotion: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
  onEnter: () => void;
}>) {
  const group = useRef<THREE.Group>(null);
  const y = worldHeight(portal.position.x, portal.position.z, world) + 2.4;
  useFrame((_, delta) => {
    if (!group.current || reducedMotion) return;
    group.current.rotation.y += delta * 0.18;
  });
  return (
    <group
      ref={group}
      position={[portal.position.x, y, portal.position.z]}
      onPointerDown={(event) => {
        consumePointer(event);
        onSelect();
      }}
      onDoubleClick={(event) => {
        consumePointer(event);
        onEnter();
      }}
      onPointerEnter={(event) => {
        consumePointer(event);
        setCursor(true);
        onHover(true);
      }}
      onPointerLeave={() => {
        setCursor(false);
        onHover(false);
      }}
    >
      <mesh>
        <torusGeometry args={[1.7, 0.22, 10, 32]} />
        <meshStandardMaterial color={style.sun} emissive={style.water} emissiveIntensity={1.3} />
      </mesh>
      <mesh rotation-y={Math.PI / 2}>
        <circleGeometry args={[1.45, 32]} />
        <meshBasicMaterial color={style.water} transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      <pointLight color={style.water} intensity={5} distance={8} />
    </group>
  );
}

function visualSelectionPosition(selection: Selection, world: KingdomWorld): THREE.Vector3 | null {
  if (!selection || selection.kind === "repository") return null;
  if (selection.kind === "entity") {
    const [x, y, z] = entityVisualPosition(selection.entity, world);
    return new THREE.Vector3(x, y + 1.8, z);
  }
  if (selection.kind === "province") {
    const { x, z } = selection.province.position;
    return new THREE.Vector3(x, worldHeight(x, z, world) + 1, z);
  }
  const { x, z } = selection.portal.position;
  return new THREE.Vector3(x, worldHeight(x, z, world) + 2.4, z);
}

function SelectionBeacon({
  selection,
  world,
  style,
}: Readonly<{ selection: Selection; world: KingdomWorld; style: SeasonStyle }>) {
  const position = visualSelectionPosition(selection, world);
  if (!position) return null;
  return (
    <group position={position}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.4, 1.72, 42]} />
        <meshBasicMaterial color={style.sun} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <pointLight color={style.sun} intensity={4.5} distance={6} />
    </group>
  );
}

function CameraRig({
  world,
  selection,
  resetToken,
  reducedMotion,
}: Readonly<{
  world: KingdomWorld;
  selection: Selection;
  resetToken: number;
  reducedMotion: boolean;
}>) {
  const controls = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const camera = useRef<THREE.OrthographicCamera>(null);
  const { size } = useThree();
  const extents = useMemo(() => provinceExtents(world), [world]);
  const focus = useRef(new THREE.Vector3(extents.centerX, 2.6, extents.centerZ));
  const goalPosition = useRef(new THREE.Vector3());
  const goalZoom = useRef(1);
  const animating = useRef(true);
  const baseZoom = Math.max(
    2.6,
    Math.min(
      13,
      Math.min(size.width / (extents.width * 1.75), size.height / (extents.depth * 1.28)),
    ),
  );

  useEffect(() => {
    if (!camera.current) return;
    const selected = visualSelectionPosition(selection, world);
    if (selected && selection && selection.kind !== "repository") {
      focus.current.copy(selected);
      goalZoom.current = baseZoom * (selection.kind === "province" ? 2.2 : 3.25);
      goalPosition.current.set(
        selected.x + world.bounds.radius * 0.55,
        selected.y + world.bounds.radius * 0.58,
        selected.z + world.bounds.radius * 0.76,
      );
    } else {
      focus.current.set(extents.centerX, 2.7, extents.centerZ - extents.depth * 0.04);
      goalZoom.current = baseZoom;
      goalPosition.current.set(
        extents.centerX + world.bounds.radius * 0.72,
        world.bounds.radius * 0.72,
        extents.centerZ + world.bounds.radius * 0.88,
      );
    }
    animating.current = true;
    if (reducedMotion) {
      camera.current.position.copy(goalPosition.current);
      camera.current.zoom = goalZoom.current;
      camera.current.updateProjectionMatrix();
      controls.current?.target.copy(focus.current);
      controls.current?.update();
      animating.current = false;
    }
  }, [baseZoom, extents, reducedMotion, resetToken, selection, world]);

  useFrame((_, delta) => {
    if (!animating.current || !controls.current || !camera.current) return;
    const alpha = 1 - Math.exp(-delta * 3.7);
    camera.current.position.lerp(goalPosition.current, alpha);
    controls.current.target.lerp(focus.current, alpha);
    camera.current.zoom = THREE.MathUtils.lerp(camera.current.zoom, goalZoom.current, alpha);
    camera.current.updateProjectionMatrix();
    controls.current.update();
    if (
      camera.current.position.distanceTo(goalPosition.current) < 0.04 &&
      controls.current.target.distanceTo(focus.current) < 0.03
    ) {
      animating.current = false;
    }
  });

  const startPosition: [number, number, number] = [
    extents.centerX + world.bounds.radius * 0.72,
    world.bounds.radius * 0.72,
    extents.centerZ + world.bounds.radius * 0.88,
  ];
  return (
    <>
      <OrthographicCamera
        ref={camera}
        makeDefault
        near={0.1}
        far={world.bounds.radius * 8}
        zoom={baseZoom}
        position={startPosition}
      />
      <OrbitControls
        ref={controls}
        makeDefault
        target={[extents.centerX, 2.7, extents.centerZ - extents.depth * 0.04]}
        enableDamping={!reducedMotion}
        dampingFactor={0.06}
        minZoom={baseZoom * 0.45}
        maxZoom={baseZoom * 5.2}
        minPolarAngle={0.28}
        maxPolarAngle={Math.PI * 0.46}
        screenSpacePanning={false}
        onStart={() => {
          animating.current = false;
        }}
      />
    </>
  );
}

function SceneLoading({ world, style }: Readonly<{ world: KingdomWorld; style: SeasonStyle }>) {
  const extents = provinceExtents(world);
  return (
    <group position={[extents.centerX, 4, extents.centerZ]}>
      <mesh>
        <octahedronGeometry args={[1.4, 1]} />
        <meshStandardMaterial color={style.sun} emissive={style.water} emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

export function KingdomScene({
  world,
  season,
  selection,
  onSelect,
  onHover,
  onEnterPortal,
  resetToken,
  reducedMotion,
  quality,
}: KingdomSceneProps) {
  const style = SEASON_STYLE[season];
  return (
    <>
      <Atmosphere world={world} season={season} quality={quality} reducedMotion={reducedMotion} />
      <FloatingTerrain world={world} style={style} quality={quality} />
      <ValleyRiver world={world} style={style} reducedMotion={reducedMotion} />
      <RootPaths world={world} style={style} />
      <Suspense fallback={<SceneLoading world={world} style={style} />}>
        <RearRockRidge world={world} season={season} />
        <DetailedForest world={world} quality={quality} season={season} />
        <Settlements world={world} quality={quality} onSelect={onSelect} onHover={onHover} />
        {quality === "high" ? <DeerHerd world={world} reducedMotion={reducedMotion} /> : null}
      </Suspense>
      {world.portals.map((portal) => (
        <PortalGateway
          key={portal.id}
          portal={portal}
          world={world}
          style={style}
          reducedMotion={reducedMotion}
          onSelect={() => onSelect({ kind: "portal", portal })}
          onHover={(hovered) => onHover(hovered ? { kind: "portal", portal } : null)}
          onEnter={() => onEnterPortal(portal)}
        />
      ))}
      <SelectionBeacon selection={selection} world={world} style={style} />
      <CameraRig
        world={world}
        selection={selection}
        resetToken={resetToken}
        reducedMotion={reducedMotion}
      />
    </>
  );
}
