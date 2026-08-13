"use client";

import {
  OrbitControls,
  OrthographicCamera,
  Sparkles,
  useAnimations,
  useGLTF,
} from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

import {
  getKenneySeasonalPalette,
  kenneySeasonalAssetReferenceUrl,
} from "@/lib/assets/kenney-seasonal";
import { QUATERNIUS_ANIMAL_CLIPS, quaterniusAssetUrl } from "@/lib/assets/quaternius";
import { stableFraction } from "@/lib/kingdom/hash";
import { createWorldPlan, type KingdomSeason, type WorldPlan } from "@/lib/kingdom";
import type {
  KingdomEntity,
  KingdomWorld,
  Province,
  RepositoryPortal,
  Selection,
} from "@/lib/kingdom/types";

import { createPlannedScatter, type PlannedScatter } from "./planned-scatter";
import {
  classifyPlannedTerrainRegion,
  getHamletVisualPlacementMask,
  samplePlannedTerrainHeight,
  samplePlannedWatershedPoint,
} from "./planned-terrain-model";
import { buildPlannedEscarpmentGeometry, PlannedEscarpment } from "./planned-escarpment";
import { PlannedLife } from "./planned-life";
import { PlannedTerrain, PlannedWatershed } from "./planned-terrain";
import {
  createPlannedVisualEnrichment,
  type PlannedVisualEnrichment,
} from "./planned-visual-enrichment";
import {
  createPlannedWorldThemeLayer,
  type PlannedWorldThemeLayer,
} from "./planned-world-theme-model";

type Quality = "low" | "high";
type VecTuple = readonly [number, number, number];
type WildlifeMotionSegment = Readonly<{
  start: VecTuple;
  end: VecTuple;
  length: number;
}>;
export type WildlifeMotion = Readonly<{
  segments: ReadonlyArray<WildlifeMotionSegment>;
  totalLength: number;
}>;
type OverviewFit = Readonly<{
  zoom: number;
  target: THREE.Vector3;
  position: THREE.Vector3;
}>;

const DESKTOP_CAMERA_ELEVATION = THREE.MathUtils.degToRad(32);
const DESKTOP_CAMERA_AZIMUTH = THREE.MathUtils.degToRad(28);
const PORTRAIT_CAMERA_ELEVATION = THREE.MathUtils.degToRad(48);
const PORTRAIT_CAMERA_AZIMUTH = THREE.MathUtils.degToRad(9);

type FoliagePalette = "broadleaf" | "pine" | "flowering";
type SurfaceStyle = "default" | "architecture" | "rock" | "rune";

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
  vine: quaterniusAssetUrl("medieval", "Prop_Vine1"),
  stairs: quaterniusAssetUrl("medieval", "Stairs_Exterior_Straight"),
  balcony: quaterniusAssetUrl("medieval", "Balcony_Cross_Straight"),
} as const;

const TREE_URLS = {
  "common-tree-1": quaterniusAssetUrl("nature", "CommonTree_1"),
  "common-tree-2": quaterniusAssetUrl("nature", "CommonTree_2"),
  "common-tree-3": quaterniusAssetUrl("nature", "CommonTree_3"),
  "pine-1": quaterniusAssetUrl("nature", "Pine_1"),
  "pine-2": quaterniusAssetUrl("nature", "Pine_2"),
  "twisted-tree-1": quaterniusAssetUrl("nature", "TwistedTree_1"),
  "twisted-tree-2": quaterniusAssetUrl("nature", "TwistedTree_2"),
  "dead-tree": quaterniusAssetUrl("nature", "DeadTree_1"),
} as const;

const GROUND_URLS = {
  bush: quaterniusAssetUrl("nature", "Bush_Common"),
  "flowering-bush": quaterniusAssetUrl("nature", "Bush_Common_Flowers"),
  fern: quaterniusAssetUrl("nature", "Fern_1"),
  grass: quaterniusAssetUrl("nature", "Grass_Common_Short"),
  "flower-group": quaterniusAssetUrl("nature", "Flower_3_Group"),
  mushroom: quaterniusAssetUrl("nature", "Mushroom_Common"),
} as const;

const GROUND_TARGET_HEIGHT: Readonly<Record<keyof typeof GROUND_URLS, number>> = {
  bush: 1.55,
  "flowering-bush": 1.65,
  fern: 0.9,
  grass: 0.68,
  "flower-group": 0.85,
  mushroom: 0.45,
};

const AMBIENT_URLS = {
  "medium-rock-1": quaterniusAssetUrl("nature", "Rock_Medium_1"),
  "medium-rock-2": quaterniusAssetUrl("nature", "Rock_Medium_2"),
  "round-rock-path": quaterniusAssetUrl("nature", "RockPath_Round_Small_1"),
  bush: GROUND_URLS.bush,
  "flowering-bush": GROUND_URLS["flowering-bush"],
  fern: GROUND_URLS.fern,
  grass: GROUND_URLS.grass,
  "flower-group": GROUND_URLS["flower-group"],
} as const;

const AMBIENT_TARGET_HEIGHT: Readonly<Record<keyof typeof AMBIENT_URLS, number>> = {
  "medium-rock-1": 2.8,
  "medium-rock-2": 2.35,
  "round-rock-path": 0.48,
  bush: GROUND_TARGET_HEIGHT.bush,
  "flowering-bush": GROUND_TARGET_HEIGHT["flowering-bush"],
  fern: GROUND_TARGET_HEIGHT.fern,
  grass: GROUND_TARGET_HEIGHT.grass,
  "flower-group": GROUND_TARGET_HEIGHT["flower-group"],
};

const ANIMAL_URLS = {
  deer: quaterniusAssetUrl("animals", "Deer"),
  fox: quaterniusAssetUrl("animals", "Fox"),
  stag: quaterniusAssetUrl("animals", "Stag"),
} as const;

const ANIMAL_TARGET_HEIGHT: Readonly<Record<keyof typeof ANIMAL_URLS, number>> = {
  deer: 2.2,
  fox: 1.15,
  stag: 2.65,
};

/**
 * Converts the planner's validated adjacent waypoints into a continuous
 * out-and-back route. The return leg retraces those same safe segments instead
 * of inventing an unchecked final-to-first shortcut.
 */
export function buildRetracedWildlifeMotion(
  wanderPath: ReadonlyArray<VecTuple>,
): WildlifeMotion | null {
  const outward: WildlifeMotionSegment[] = [];
  for (let index = 1; index < wanderPath.length; index += 1) {
    const start = wanderPath[index - 1]!;
    const end = wanderPath[index]!;
    const length = Math.hypot(end[0] - start[0], end[2] - start[2]);
    if (length > 0.000_1) outward.push({ start, end, length });
  }
  if (outward.length === 0) return null;
  const returnTrip = [...outward].reverse().map((segment): WildlifeMotionSegment => ({
    start: segment.end,
    end: segment.start,
    length: segment.length,
  }));
  const segments = [...outward, ...returnTrip];
  return {
    segments,
    totalLength: segments.reduce((total, segment) => total + segment.length, 0),
  };
}

const KENNEY_SEASONAL_URLS = [
  ...new Set(
    (["spring", "summer", "autumn", "winter"] as const).flatMap((season) => {
      const palette = getKenneySeasonalPalette(season);
      return [...palette.canopy, ...palette.groundDetails].map((reference) =>
        kenneySeasonalAssetReferenceUrl(reference),
      );
    }),
  ),
];

for (const url of [
  ...Object.values(MODULE_URLS),
  ...Object.values(TREE_URLS),
  ...Object.values(GROUND_URLS),
  ...Object.values(AMBIENT_URLS),
  ...Object.values(ANIMAL_URLS),
  ...KENNEY_SEASONAL_URLS,
]) {
  useGLTF.preload(url);
}

function setCursor(active: boolean) {
  document.body.style.cursor = active ? "pointer" : "default";
}

function consumePointer(event: Readonly<{ stopPropagation: () => void }>) {
  event.stopPropagation();
}

type GltfPrimitive = Readonly<{
  id: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  sourceMatrix: THREE.Matrix4;
}>;

type TemplateAsset = Readonly<{
  primitives: ReadonlyArray<GltfPrimitive>;
  height: number;
}>;

function templateAsset(scene: THREE.Object3D, normalize: boolean): TemplateAsset {
  const template = scene.clone(true);
  template.updateMatrixWorld(true);
  const originalBounds = new THREE.Box3().setFromObject(template);
  const height = Math.max(0.001, originalBounds.max.y - originalBounds.min.y);
  if (normalize) {
    const center = originalBounds.getCenter(new THREE.Vector3());
    template.position.sub(new THREE.Vector3(center.x, originalBounds.min.y, center.z));
    template.updateMatrixWorld(true);
  }
  const primitives: GltfPrimitive[] = [];
  template.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    primitives.push({
      id: child.uuid,
      geometry: child.geometry,
      material: child.material,
      sourceMatrix: child.matrixWorld.clone(),
    });
  });
  return { primitives, height };
}

function InstancePrimitive({
  primitive,
  matrices,
  plan,
  foliagePalette,
  seasonalCanopy,
  surfaceStyle,
  castShadow,
}: Readonly<{
  primitive: GltfPrimitive;
  matrices: ReadonlyArray<THREE.Matrix4>;
  plan: WorldPlan;
  foliagePalette?: FoliagePalette;
  seasonalCanopy: boolean;
  surfaceStyle: SurfaceStyle;
  castShadow: boolean;
}>) {
  const instance = useRef<THREE.InstancedMesh>(null);
  const materials = useMemo(() => {
    const sources = Array.isArray(primitive.material) ? primitive.material : [primitive.material];
    return sources.map((source, materialIndex) => {
      const material = source.clone();
      if (
        seasonalCanopy &&
        material instanceof THREE.MeshStandardMaterial &&
        plan.appearance.season === "spring"
      ) {
        material.color.lerp(
          new THREE.Color(plan.appearance.foliage.broadleaf[1] ?? "#78a86b"),
          plan.worldTheme === "enchanted-forest" ? 0.62 : 0.38,
        );
        material.emissiveMap = material.map;
        material.emissive.set(plan.appearance.foliage.broadleaf[0] ?? "#708c5d");
        material.emissiveIntensity = 0.2;
        material.roughness = Math.max(0.82, material.roughness);
      }
      if (
        foliagePalette &&
        material instanceof THREE.MeshStandardMaterial &&
        /(?:leaves|flower|grass|fern|foliage)/i.test(material.name)
      ) {
        material.vertexColors = false;
        material.roughness = 0.84;
        if (foliagePalette === "flowering" && plan.appearance.season === "spring") {
          material.map = null;
          material.normalMap = null;
          const colors = plan.appearance.foliage.flowering;
          material.color.set(colors[materialIndex % colors.length] ?? "#f7cbd8");
          material.emissive.set(colors[(materialIndex + 1) % colors.length] ?? "#9a6475");
          material.emissiveIntensity = plan.worldTheme === "enchanted-forest" ? 0.28 : 0.36;
          material.toneMapped = true;
        } else if (plan.appearance.season === "spring") {
          // Several source diffuse maps contain deep autumn-red texels. Spring
          // uses a clean pastel canopy treatment so the whole world reads as
          // one season while retaining each model's authored silhouette.
          material.map = null;
          material.normalMap = null;
          const colors =
            foliagePalette === "pine"
              ? plan.appearance.foliage.pine
              : plan.appearance.foliage.broadleaf;
          material.color.set(colors[materialIndex % colors.length] ?? "#8fbd72");
          material.emissiveMap = null;
          material.emissive.set(colors[(materialIndex + 1) % colors.length] ?? "#63805b");
          material.emissiveIntensity = plan.worldTheme === "enchanted-forest" ? 0.2 : 0.3;
        } else if (plan.appearance.season === "summer") {
          material.color.set("#ffffff");
          material.emissiveMap = material.map;
          material.emissive.set(foliagePalette === "pine" ? "#587a63" : "#7ca664");
          material.emissiveIntensity = 0.16;
        } else {
          const colors =
            foliagePalette === "pine"
              ? plan.appearance.foliage.pine
              : plan.appearance.foliage.broadleaf;
          material.map = null;
          material.normalMap = null;
          material.color.set(colors[materialIndex % colors.length] ?? "#6f985f");
        }
      }
      if (material instanceof THREE.MeshStandardMaterial && surfaceStyle === "architecture") {
        material.roughness = Math.max(0.78, material.roughness);
        material.metalness = 0;
        const roofMaterial = /tile|roof/i.test(material.name);
        const timberMaterial = /wood|timber|beam|frame|door/i.test(material.name);
        material.map = null;
        material.normalMap = null;
        material.aoMap = null;
        const surfaceColor = roofMaterial
          ? plan.appearance.architecture.roofTint
          : timberMaterial
            ? plan.appearance.architecture.timberTint
            : plan.appearance.architecture.plasterTint;
        material.color.set(surfaceColor);
        material.emissiveMap = null;
        material.emissive
          .copy(material.color)
          .multiplyScalar(plan.worldTheme === "enchanted-forest" ? 0.32 : 0.24);
        material.emissiveIntensity = roofMaterial ? 0.14 : timberMaterial ? 0.09 : 0.11;
      }
      if (material instanceof THREE.MeshStandardMaterial && surfaceStyle === "rock") {
        material.roughness = 1;
        material.metalness = 0;
        material.color.set("#ead4c1");
        if (material.map) {
          material.emissiveMap = material.map;
          material.emissive.set("#bca28c");
          material.emissiveIntensity = 0.36;
        }
      }
      if (material instanceof THREE.MeshStandardMaterial && surfaceStyle === "rune") {
        material.map = null;
        material.normalMap = null;
        material.roughness = 0.9;
        material.metalness = 0;
        material.color
          .set(plan.appearance.terrain.escarpment)
          .lerp(new THREE.Color(plan.appearance.magic.secondary), 0.2);
        material.emissiveMap = null;
        material.emissive.set(plan.appearance.magic.primary);
        material.emissiveIntensity = 0.34 * plan.appearance.magic.glowIntensity;
      }
      return material;
    });
  }, [foliagePalette, plan, primitive.material, seasonalCanopy, surfaceStyle]);

  useLayoutEffect(() => {
    if (!instance.current) return;
    const composed = new THREE.Matrix4();
    matrices.forEach((matrix, index) => {
      composed.multiplyMatrices(matrix, primitive.sourceMatrix);
      instance.current?.setMatrixAt(index, composed);
    });
    instance.current.instanceMatrix.needsUpdate = true;
    instance.current.computeBoundingSphere();
  }, [matrices, primitive.sourceMatrix]);

  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  return (
    <instancedMesh
      ref={instance}
      args={[
        primitive.geometry,
        materials.length === 1 ? materials[0] : materials,
        matrices.length,
      ]}
      castShadow={castShadow}
      receiveShadow
      frustumCulled={false}
    />
  );
}

function AssetInstances({
  url,
  matrices,
  plan,
  targetHeight,
  foliagePalette,
  surfaceStyle = "default",
  castShadow = false,
}: Readonly<{
  url: string;
  matrices: ReadonlyArray<THREE.Matrix4>;
  plan: WorldPlan;
  targetHeight?: number;
  foliagePalette?: FoliagePalette;
  surfaceStyle?: SurfaceStyle;
  castShadow?: boolean;
}>) {
  const { scene } = useGLTF(url);
  const normalize = targetHeight !== undefined;
  const template = useMemo(() => templateAsset(scene, normalize), [normalize, scene]);
  const heightNormalization = targetHeight === undefined ? 1 : targetHeight / template.height;
  const normalizedMatrices = useMemo(
    () =>
      heightNormalization === 1
        ? matrices
        : matrices.map((matrix) =>
            matrix
              .clone()
              .multiply(
                new THREE.Matrix4().makeScale(
                  heightNormalization,
                  heightNormalization,
                  heightNormalization,
                ),
              ),
          ),
    [heightNormalization, matrices],
  );
  if (matrices.length === 0) return null;
  return (
    <group>
      {template.primitives.map((primitive) => (
        <InstancePrimitive
          key={primitive.id}
          primitive={primitive}
          matrices={normalizedMatrices}
          plan={plan}
          foliagePalette={foliagePalette}
          seasonalCanopy={url.includes("/kenney/") && (targetHeight ?? 0) > 4}
          surfaceStyle={surfaceStyle}
          castShadow={castShadow}
        />
      ))}
    </group>
  );
}

function matrixAt(
  x: number,
  y: number,
  z: number,
  rotationY: number,
  scale: number | VecTuple = 1,
): THREE.Matrix4 {
  const size = typeof scale === "number" ? [scale, scale, scale] : scale;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
    new THREE.Vector3(size[0], size[1], size[2]),
  );
}

function matrixAtEuler(
  x: number,
  y: number,
  z: number,
  rotation: Readonly<{ x: number; y: number; z: number }>,
  scale: VecTuple,
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z)),
    new THREE.Vector3(scale[0], scale[1], scale[2]),
  );
}

function multiply(parent: THREE.Matrix4, local: THREE.Matrix4): THREE.Matrix4 {
  return new THREE.Matrix4().multiplyMatrices(parent, local);
}

type ArchitectureRole =
  | PlannedScatter["buildings"][number]["assetRole"]
  | PlannedScatter["landmarks"][number]["assetRole"];

type CompoundIdentity = "civic" | "productive" | "village";

type HamletCompound = Readonly<{
  hamletId: string;
  identity: CompoundIdentity;
  center: Readonly<{ x: number; z: number }>;
  radiusX: number;
  radiusZ: number;
  rotation: number;
}>;

function watershedDistance(plan: WorldPlan, point: Readonly<{ x: number; z: number }>): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= 24; index += 1) {
    const water = samplePlannedWatershedPoint(plan, index / 24);
    nearest = Math.min(nearest, Math.hypot(point.x - water.x, point.z - water.z));
  }
  return nearest;
}

function createHamletCompounds(
  plan: WorldPlan,
  scatter: PlannedScatter,
): ReadonlyMap<string, HamletCompound> {
  const hamlets = plan.topology.hamlets.map((hamlet) => {
    const mask = getHamletVisualPlacementMask(plan, hamlet);
    return { hamlet, mask };
  });
  const remaining = new Set(hamlets.map(({ hamlet }) => hamlet.id));
  const result = new Map<string, HamletCompound>();

  const assign = (
    identity: CompoundIdentity,
    score: (candidate: (typeof hamlets)[number]) => number,
  ) => {
    const candidate = hamlets
      .filter(({ hamlet }) => remaining.has(hamlet.id))
      .sort(
        (first, second) =>
          score(second) - score(first) || first.hamlet.id.localeCompare(second.hamlet.id),
      )[0];
    if (!candidate) return;
    remaining.delete(candidate.hamlet.id);
    const orientationJitter =
      (stableFraction(`${plan.topologyKey}:${candidate.hamlet.id}:compound-orientation`) - 0.5) *
      0.42;
    result.set(candidate.hamlet.id, {
      hamletId: candidate.hamlet.id,
      identity,
      center: candidate.mask.center,
      radiusX: candidate.mask.radiusX,
      radiusZ: candidate.mask.radiusZ,
      rotation: candidate.mask.rotation + orientationJitter,
    });
  };

  assign("civic", ({ hamlet }) => {
    const hasLandmark = scatter.landmarks.some((landmark) => landmark.hamletId === hamlet.id);
    const civicRole = /crown|archive|observatory|warden/.test(hamlet.role);
    return (hasLandmark ? 1_000 : 0) + (civicRole ? 400 : 0) + hamlet.representedFiles;
  });
  assign("productive", ({ hamlet, mask }) => {
    const productiveRole = /maker|crossroads/.test(hamlet.role);
    return (productiveRole ? 500 : 0) - watershedDistance(plan, mask.center);
  });
  assign("village", ({ hamlet }) => hamlet.representedFiles);

  for (const { hamlet, mask } of hamlets) {
    if (!remaining.has(hamlet.id)) continue;
    result.set(hamlet.id, {
      hamletId: hamlet.id,
      identity: "village",
      center: mask.center,
      radiusX: mask.radiusX,
      radiusZ: mask.radiusZ,
      rotation:
        mask.rotation +
        (stableFraction(`${plan.topologyKey}:${hamlet.id}:compound-orientation`) - 0.5) * 0.42,
    });
  }
  return result;
}

function compoundPoint(
  compound: HamletCompound,
  localX: number,
  localZ: number,
): Readonly<{ x: number; z: number }> {
  const cosine = Math.cos(compound.rotation);
  const sine = Math.sin(compound.rotation);
  return {
    x: compound.center.x + localX * cosine + localZ * sine,
    z: compound.center.z - localX * sine + localZ * cosine,
  };
}

function architectureKind(role: ArchitectureRole) {
  const brick =
    role === "brick-cottage" ||
    role === "workshop" ||
    role === "forge" ||
    role === "watchtower" ||
    role === "observatory" ||
    role === "waystone";
  const tower = role === "watchtower" || role === "observatory" || role === "waystone";
  const hall =
    role === "manor" ||
    role === "repository-crown" ||
    role === "archive" ||
    role === "garden-sanctum";
  return { brick, tower, hall, workshop: role === "workshop" || role === "forge" };
}

type InstanceGroups = Map<string, THREE.Matrix4[]>;

function addInstance(groups: InstanceGroups, url: string, matrix: THREE.Matrix4) {
  const group = groups.get(url);
  if (group) group.push(matrix);
  else groups.set(url, [matrix]);
}

function addBuildingAssembly(
  groups: InstanceGroups,
  role: ArchitectureRole,
  parent: THREE.Matrix4,
  options: Readonly<{ compound: CompoundIdentity; hero: boolean; enchanted: boolean }> = {
    compound: "village",
    hero: false,
    enchanted: false,
  },
) {
  const kind = architectureKind(role);
  const wall = kind.brick ? MODULE_URLS.brickWall : MODULE_URLS.plasterWall;
  const door = kind.brick ? MODULE_URLS.brickDoor : MODULE_URLS.plasterDoor;
  const window = kind.brick ? MODULE_URLS.brickWindow : MODULE_URLS.plasterWindow;
  const stories = kind.tower || kind.hall ? 2 : 1;
  const offset = kind.hall ? 2 : 1.75;

  for (let story = 0; story < stories; story += 1) {
    const y = story * 3.12;
    const frontLeft = story === 0 ? door : window;
    const pieces: ReadonlyArray<readonly [string, number, number, number, number]> = [
      [frontLeft, -1, y, offset, 0],
      [window, 1, y, offset, 0],
      [window, -1, y, -offset, Math.PI],
      [wall, 1, y, -offset, Math.PI],
      [window, -offset, y, -1, Math.PI / 2],
      [wall, -offset, y, 1, Math.PI / 2],
      [window, offset, y, -1, -Math.PI / 2],
      [wall, offset, y, 1, -Math.PI / 2],
    ];
    for (const [url, x, localY, z, rotation] of pieces) {
      addInstance(groups, url, multiply(parent, matrixAt(x, localY, z, rotation)));
    }
  }

  const roofY = stories * 3.12 - (kind.tower ? 0.2 : 0.35);
  const roofUrl = kind.tower
    ? MODULE_URLS.roofTower
    : kind.hall
      ? MODULE_URLS.roofWide
      : MODULE_URLS.roofSmall;
  const roofScale = kind.tower ? 0.62 : kind.hall ? 0.58 : 0.52;
  addInstance(groups, roofUrl, multiply(parent, matrixAt(0, roofY, 0, 0, roofScale)));

  if (!kind.tower) {
    addInstance(
      groups,
      MODULE_URLS.chimney,
      multiply(parent, matrixAt(kind.hall ? 1.4 : 1.05, roofY + 1.7, -0.4, 0, 0.72)),
    );
  }
  if (kind.hall) {
    addInstance(groups, MODULE_URLS.stairs, multiply(parent, matrixAt(0, -0.08, 2.85, 0, 0.78)));
    addInstance(groups, MODULE_URLS.balcony, multiply(parent, matrixAt(0, 3.08, 2.25, 0, 0.78)));
  } else if (!kind.brick) {
    addInstance(groups, MODULE_URLS.vine, multiply(parent, matrixAt(-1.1, 0.12, 2.02, 0, 0.82)));
  }
  if (options.enchanted) {
    addInstance(
      groups,
      MODULE_URLS.vine,
      multiply(parent, matrixAt(1.08, stories > 1 ? 2.85 : 0.18, 2.04, 0, 0.76)),
    );
  }
  if (kind.workshop) {
    addInstance(groups, MODULE_URLS.wagon, multiply(parent, matrixAt(3.1, 0, 0.8, -0.4, 0.85)));
  }

  if (!options.hero) return;
  if (options.compound === "civic") {
    const annex = multiply(parent, matrixAt(-3.15, 0, -0.9, 0.08, 0.68));
    addBuildingAssembly(groups, "watchtower", annex, {
      compound: "civic",
      hero: false,
      enchanted: options.enchanted,
    });
    addInstance(groups, MODULE_URLS.vine, multiply(parent, matrixAt(1.25, 0.15, 2.04, 0, 0.88)));
  } else if (options.compound === "productive") {
    const annex = multiply(parent, matrixAt(-3.25, 0, -0.55, -0.12, 0.7));
    addBuildingAssembly(groups, "brick-cottage", annex, {
      compound: "productive",
      hero: false,
      enchanted: options.enchanted,
    });
    addInstance(groups, MODULE_URLS.chimney, multiply(parent, matrixAt(-1.2, 4.75, -0.8, 0, 0.82)));
    addInstance(groups, MODULE_URLS.wagon, multiply(parent, matrixAt(3.7, 0, -1.7, -0.9, 0.92)));
  } else {
    const annex = multiply(parent, matrixAt(3.05, 0, -0.45, -0.08, 0.66));
    addBuildingAssembly(groups, "plaster-cottage", annex, {
      compound: "village",
      hero: false,
      enchanted: options.enchanted,
    });
    addInstance(groups, MODULE_URLS.vine, multiply(parent, matrixAt(-1.15, 0.12, 2.04, 0, 0.9)));
  }
}

function addCompoundProp(
  groups: InstanceGroups,
  plan: WorldPlan,
  compound: HamletCompound,
  url: string,
  localX: number,
  localZ: number,
  rotation: number,
  scale = 1,
) {
  const point = compoundPoint(compound, localX, localZ);
  const region = classifyPlannedTerrainRegion(plan, point.x, point.z);
  if (!region.inside || region.water !== null || region.slopeDegrees > 18) return;
  addInstance(
    groups,
    url,
    matrixAt(
      point.x,
      samplePlannedTerrainHeight(plan, point.x, point.z) + 0.04,
      point.z,
      compound.rotation + rotation,
      scale,
    ),
  );
}

function addCompoundGroundLanguage(
  groups: InstanceGroups,
  plan: WorldPlan,
  compound: HamletCompound,
) {
  const side = Math.min(compound.radiusX, compound.radiusZ);
  const fenceScale = 1.04;
  const back = side * (compound.identity === "productive" ? -0.54 : -0.48);
  const fencePoints: ReadonlyArray<readonly [number, number, number]> =
    compound.identity === "civic"
      ? [
          [-5.4, back, 0],
          [-1.8, back, 0],
          [1.8, back, 0],
          [5.4, back, 0],
          [-5.8, back + 3.2, Math.PI / 2],
          [5.8, back + 3.2, Math.PI / 2],
        ]
      : compound.identity === "productive"
        ? [
            [-5.4, back, 0],
            [-1.8, back, 0],
            [1.8, back, 0],
            [5.4, back, 0],
            [-5.8, back + 3.2, Math.PI / 2],
            [-5.8, back + 6.4, Math.PI / 2],
          ]
        : [
            [-4.6, back, 0],
            [-1.4, back, 0],
            [1.8, back, 0],
            [5, back, 0],
            [5.4, back + 3, Math.PI / 2],
          ];
  for (const [localX, localZ, rotation] of fencePoints) {
    addCompoundProp(
      groups,
      plan,
      compound,
      MODULE_URLS.fence,
      localX,
      localZ,
      rotation,
      fenceScale,
    );
  }

  if (compound.identity === "productive") {
    addCompoundProp(groups, plan, compound, MODULE_URLS.wagon, 4.7, 1.8, -0.72, 0.92);
    addCompoundProp(groups, plan, compound, MODULE_URLS.wagon, 1.6, 4.4, -0.2, 0.78);
  } else if (compound.identity === "village") {
    addCompoundProp(groups, plan, compound, MODULE_URLS.wagon, -4.2, 2.8, 0.64, 0.76);
  } else {
    addCompoundProp(groups, plan, compound, MODULE_URLS.stairs, 0, 4.6, 0, 0.7);
  }
}

function createArchitectureGroups(scatter: PlannedScatter, plan: WorldPlan): InstanceGroups {
  const groups: InstanceGroups = new Map();
  const compounds = createHamletCompounds(plan, scatter);
  const structures = [
    ...scatter.buildings.map((building) => ({ ...building, landmark: false as const })),
    ...scatter.landmarks.map((landmark) => ({ ...landmark, landmark: true as const })),
  ];
  const heroByHamlet = new Map<string, string>();
  for (const compound of compounds.values()) {
    const candidates = structures
      .filter((structure) => structure.hamletId === compound.hamletId)
      .sort(
        (first, second) =>
          Number(second.landmark) - Number(first.landmark) ||
          (second.assetRole === "manor" || second.assetRole === "workshop" ? 1 : 0) -
            (first.assetRole === "manor" || first.assetRole === "workshop" ? 1 : 0) ||
          first.id.localeCompare(second.id),
      );
    if (candidates[0]) heroByHamlet.set(compound.hamletId, candidates[0].id);
  }
  for (const structure of structures) {
    const x = structure.transform.position.x;
    const z = structure.transform.position.z;
    const region = classifyPlannedTerrainRegion(plan, x, z);
    if (
      !region.inside ||
      region.water !== null ||
      region.material === "shore" ||
      region.slopeDegrees > structure.terrain.maxSlopeDegrees
    ) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[visual-review] suppressed invalid planned structure placement", {
          id: structure.id,
          material: region.material,
          slopeDegrees: region.slopeDegrees,
          water: region.water,
        });
      }
      continue;
    }
    const y = samplePlannedTerrainHeight(plan, x, z) + 0.08;
    const compound = structure.hamletId ? compounds.get(structure.hamletId) : undefined;
    const hero = compound
      ? heroByHamlet.get(compound.hamletId) === structure.id
      : structure.landmark;
    const sourceScale = structure.transform.scale.y;
    const visualScale = sourceScale * (hero ? 1.52 : structure.landmark ? 1.44 : 1.28);
    const parent = matrixAt(x, y, z, structure.transform.rotationY, visualScale);
    const renderedRole: ArchitectureRole = hero
      ? compound?.identity === "civic"
        ? "repository-crown"
        : compound?.identity === "productive"
          ? "forge"
          : "manor"
      : structure.assetRole;
    addBuildingAssembly(groups, renderedRole, parent, {
      compound: compound?.identity ?? "village",
      hero,
      enchanted: plan.worldTheme === "enchanted-forest",
    });
  }

  for (const compound of compounds.values()) addCompoundGroundLanguage(groups, plan, compound);
  return groups;
}

function isValidStructure(
  structure: PlannedScatter["buildings"][number] | PlannedScatter["landmarks"][number],
  plan: WorldPlan,
): boolean {
  const region = classifyPlannedTerrainRegion(
    plan,
    structure.transform.position.x,
    structure.transform.position.z,
  );
  return (
    region.inside &&
    region.water === null &&
    region.material !== "shore" &&
    region.slopeDegrees <= structure.terrain.maxSlopeDegrees
  );
}

function selectionForStructure(
  entityId: string | null,
  provinceId: string,
  entities: ReadonlyMap<string, KingdomEntity>,
  provinces: ReadonlyMap<string, Province>,
): Selection {
  const entity = entityId ? entities.get(entityId) : undefined;
  if (entity) return { kind: "entity", entity };
  const province = provinces.get(provinceId);
  return province ? { kind: "province", province } : null;
}

function ArchitectureLayer({
  world,
  plan,
  scatter,
  onSelect,
  onHover,
}: Readonly<{
  world: KingdomWorld;
  plan: WorldPlan;
  scatter: PlannedScatter;
  onSelect: (selection: Selection) => void;
  onHover: (selection: Selection) => void;
}>) {
  const groups = useMemo(() => createArchitectureGroups(scatter, plan), [plan, scatter]);
  const entities = useMemo(
    () => new Map(world.entities.map((entity) => [entity.id, entity])),
    [world],
  );
  const provinces = useMemo(
    () => new Map(world.provinces.map((province) => [province.id, province])),
    [world],
  );
  const structures = [...scatter.buildings, ...scatter.landmarks];
  return (
    <group name="planned-hamlets">
      {[...groups.entries()].map(([url, matrices]) => (
        <AssetInstances
          key={url}
          url={url}
          matrices={matrices}
          plan={plan}
          surfaceStyle="architecture"
          castShadow
        />
      ))}
      {structures.map((structure) => {
        if (!isValidStructure(structure, plan)) return null;
        const selection = selectionForStructure(
          structure.entityId,
          structure.provinceId,
          entities,
          provinces,
        );
        if (!selection) return null;
        const x = structure.transform.position.x;
        const z = structure.transform.position.z;
        const scale = structure.transform.scale.y;
        const y = samplePlannedTerrainHeight(plan, x, z) + scale * 2.8;
        const entity = selection.kind === "entity" ? selection.entity : null;
        return (
          <mesh
            key={`${structure.id}:hit`}
            position={[x, y, z]}
            onPointerDown={(event) => {
              consumePointer(event);
              onSelect(selection);
            }}
            onDoubleClick={(event) => {
              consumePointer(event);
              if (entity) window.open(entity.sourceUrl, "_blank", "noopener,noreferrer");
            }}
            onPointerEnter={(event) => {
              consumePointer(event);
              setCursor(true);
              onHover(selection);
            }}
            onPointerLeave={() => {
              setCursor(false);
              onHover(null);
            }}
          >
            <boxGeometry args={[4.8 * scale, 6.2 * scale, 4.8 * scale]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function createTreeGroups(
  scatter: PlannedScatter,
  plan: WorldPlan,
  enrichment: PlannedVisualEnrichment,
  themeLayer: PlannedWorldThemeLayer,
): Map<string, THREE.Matrix4[]> {
  const groups = new Map<string, THREE.Matrix4[]>();
  const ancientTreeIds = new Set(themeLayer.ancientTreeIds);
  const seasonalCanopy = getKenneySeasonalPalette(plan.appearance.season).canopy;
  for (const tree of scatter.trees) {
    const x = tree.transform.position.x;
    const z = tree.transform.position.z;
    const y = samplePlannedTerrainHeight(plan, x, z);
    const base = tree.transform.scale.y;
    const ancient = ancientTreeIds.has(tree.id);
    const visualScale =
      base *
      0.96 *
      (ancient
        ? plan.appearance.magic.ancientTreeScale
        : plan.worldTheme === "enchanted-forest"
          ? 1.08
          : 1);
    const seasonalSlot = Math.floor(stableFraction(`${tree.id}:seasonal-slot`) * 3);
    const useSeasonalModel =
      !ancient &&
      tree.assetRole !== "dead-tree" &&
      (plan.appearance.season === "winter" ||
        plan.appearance.season === "autumn" ||
        tree.paletteRole !== "flowering");
    const treeUrl = ancient
      ? TREE_URLS[
          stableFraction(`${tree.id}:ancient-silhouette`) < 0.5
            ? "twisted-tree-1"
            : "twisted-tree-2"
        ]
      : useSeasonalModel
        ? kenneySeasonalAssetReferenceUrl(seasonalCanopy[seasonalSlot % seasonalCanopy.length]!)
        : TREE_URLS[tree.assetRole];
    addInstance(
      groups,
      treeUrl,
      matrixAt(x, y, z, tree.transform.rotationY, [visualScale, visualScale, visualScale]),
    );
  }
  for (const tree of enrichment.supplementalTrees) {
    const y = samplePlannedTerrainHeight(plan, tree.position.x, tree.position.z);
    const seasonalSlot = Math.floor(stableFraction(`${tree.id}:seasonal-slot`) * 3);
    const useSeasonalModel =
      tree.assetRole !== "dead-tree" &&
      (plan.appearance.season === "winter" ||
        plan.appearance.season === "autumn" ||
        !tree.assetRole.includes("twisted"));
    const treeUrl = useSeasonalModel
      ? kenneySeasonalAssetReferenceUrl(seasonalCanopy[seasonalSlot % seasonalCanopy.length]!)
      : TREE_URLS[tree.assetRole];
    const themeScale = plan.worldTheme === "enchanted-forest" ? 1.08 : 1;
    addInstance(
      groups,
      treeUrl,
      matrixAt(tree.position.x, y, tree.position.z, tree.rotationY, [
        tree.scale.x * themeScale,
        tree.scale.y * themeScale,
        tree.scale.z * themeScale,
      ]),
    );
  }
  return groups;
}

function createGroundGroups(
  scatter: PlannedScatter,
  plan: WorldPlan,
): Map<string, THREE.Matrix4[]> {
  const groups = new Map<string, THREE.Matrix4[]>();
  const seasonalDetails = getKenneySeasonalPalette(plan.appearance.season).groundDetails;
  for (const cluster of scatter.groundCoverClusters) {
    for (const member of cluster.members) {
      const x = cluster.center.x + member.offset.x;
      const z = cluster.center.z + member.offset.z;
      const y = samplePlannedTerrainHeight(plan, x, z) + 0.02;
      const seasonalProbability = stableFraction(
        `${cluster.id}:${member.offset.x}:${member.offset.z}:seasonal-detail`,
      );
      const seasonalRole = member.assetRole === "flower-group" || member.assetRole === "mushroom";
      const useSeasonalDetail =
        seasonalRole ||
        (plan.appearance.season === "winter" && seasonalProbability < 0.18) ||
        (plan.appearance.season === "autumn" && seasonalProbability < 0.12);
      const detailUrl = useSeasonalDetail
        ? kenneySeasonalAssetReferenceUrl(
            seasonalDetails[Math.floor(seasonalProbability * seasonalDetails.length)]!,
          )
        : GROUND_URLS[member.assetRole];
      addInstance(groups, detailUrl, matrixAt(x, y, z, member.rotationY, member.scale * 0.92));
    }
  }
  return groups;
}

function createAmbientGroups(
  scatter: PlannedScatter,
  plan: WorldPlan,
): Map<string, THREE.Matrix4[]> {
  const groups = new Map<string, THREE.Matrix4[]>();
  for (const detail of scatter.ambientDetails) {
    const x = detail.transform.position.x;
    const z = detail.transform.position.z;
    const y = samplePlannedTerrainHeight(plan, x, z) + 0.025;
    addInstance(
      groups,
      AMBIENT_URLS[detail.assetRole],
      matrixAt(x, y, z, detail.transform.rotationY, [
        detail.transform.scale.x,
        detail.transform.scale.y,
        detail.transform.scale.z,
      ]),
    );
  }
  return groups;
}

function createCliffFormationGroups(
  enrichment: PlannedVisualEnrichment,
  plan: WorldPlan,
): Map<string, THREE.Matrix4[]> {
  const groups = new Map<string, THREE.Matrix4[]>();
  for (const formation of enrichment.cliffFormations) {
    const y = samplePlannedTerrainHeight(plan, formation.position.x, formation.position.z) - 0.45;
    addInstance(
      groups,
      AMBIENT_URLS[formation.assetRole],
      matrixAtEuler(formation.position.x, y, formation.position.z, formation.rotation, [
        formation.scale.x,
        formation.scale.y,
        formation.scale.z,
      ]),
    );
  }
  return groups;
}

function createShoreDetailGroups(
  enrichment: PlannedVisualEnrichment,
  plan: WorldPlan,
): Map<string, THREE.Matrix4[]> {
  const groups = new Map<string, THREE.Matrix4[]>();
  for (const detail of enrichment.shoreDetails) {
    const y = samplePlannedTerrainHeight(plan, detail.position.x, detail.position.z) + 0.02;
    addInstance(
      groups,
      AMBIENT_URLS[detail.assetRole],
      matrixAt(detail.position.x, y, detail.position.z, detail.rotationY, [
        detail.scale.x,
        detail.scale.y,
        detail.scale.z,
      ]),
    );
  }
  return groups;
}

function createMeadowDetailGroups(
  enrichment: PlannedVisualEnrichment,
  plan: WorldPlan,
): Map<string, THREE.Matrix4[]> {
  const groups = new Map<string, THREE.Matrix4[]>();
  for (const detail of enrichment.meadowDetails) {
    const y = samplePlannedTerrainHeight(plan, detail.position.x, detail.position.z) + 0.02;
    addInstance(
      groups,
      AMBIENT_URLS[detail.assetRole],
      matrixAt(detail.position.x, y, detail.position.z, detail.rotationY, [
        detail.scale.x,
        detail.scale.y,
        detail.scale.z,
      ]),
    );
  }
  return groups;
}

function VegetationLayer({
  scatter,
  plan,
  enrichment,
  themeLayer,
}: Readonly<{
  scatter: PlannedScatter;
  plan: WorldPlan;
  enrichment: PlannedVisualEnrichment;
  themeLayer: PlannedWorldThemeLayer;
}>) {
  const trees = useMemo(
    () => createTreeGroups(scatter, plan, enrichment, themeLayer),
    [enrichment, plan, scatter, themeLayer],
  );
  const ground = useMemo(() => createGroundGroups(scatter, plan), [plan, scatter]);
  const ambient = useMemo(() => createAmbientGroups(scatter, plan), [plan, scatter]);
  const cliffFormations = useMemo(
    () => createCliffFormationGroups(enrichment, plan),
    [enrichment, plan],
  );
  const shoreDetails = useMemo(() => createShoreDetailGroups(enrichment, plan), [enrichment, plan]);
  const meadowDetails = useMemo(
    () => createMeadowDetailGroups(enrichment, plan),
    [enrichment, plan],
  );
  return (
    <group name="planned-groves">
      {[...trees.entries()].map(([url, matrices]) => (
        <AssetInstances
          key={url}
          url={url}
          matrices={matrices}
          plan={plan}
          targetHeight={8.6}
          foliagePalette={
            url.includes("/kenney/")
              ? undefined
              : url.includes("CommonTree_2") || url.includes("TwistedTree_1")
                ? "flowering"
                : url.includes("Pine")
                  ? "pine"
                  : "broadleaf"
          }
          castShadow
        />
      ))}
      {[...ground.entries()].map(([url, matrices]) => {
        const role = (
          Object.entries(GROUND_URLS) as Array<[keyof typeof GROUND_URLS, string]>
        ).find(([, candidateUrl]) => candidateUrl === url)?.[0];
        return (
          <AssetInstances
            key={url}
            url={url}
            matrices={matrices}
            plan={plan}
            targetHeight={
              (role ? GROUND_TARGET_HEIGHT[role] : 0.7) * plan.appearance.magic.groundDetailScale
            }
            foliagePalette={
              role === "flowering-bush" || role === "flower-group"
                ? "flowering"
                : role === "bush" || role === "fern"
                  ? "broadleaf"
                  : undefined
            }
          />
        );
      })}
      {[...ambient.entries()].map(([url, matrices]) => {
        const role = (
          Object.entries(AMBIENT_URLS) as Array<[keyof typeof AMBIENT_URLS, string]>
        ).find(([, candidateUrl]) => candidateUrl === url)?.[0];
        const foliagePalette =
          role === "flowering-bush" || role === "flower-group"
            ? "flowering"
            : role === "bush" || role === "fern"
              ? "broadleaf"
              : undefined;
        return (
          <AssetInstances
            key={`ambient:${url}`}
            url={url}
            matrices={matrices}
            plan={plan}
            targetHeight={
              (role ? AMBIENT_TARGET_HEIGHT[role] : 0.8) * plan.appearance.magic.groundDetailScale
            }
            foliagePalette={foliagePalette}
            castShadow={role === "medium-rock-1" || role === "medium-rock-2"}
          />
        );
      })}
      {[...cliffFormations.entries()].map(([url, matrices]) => (
        <AssetInstances
          key={`cliff:${url}`}
          url={url}
          matrices={matrices}
          plan={plan}
          targetHeight={2.25}
          surfaceStyle="rock"
          castShadow
        />
      ))}
      {[...shoreDetails.entries()].map(([url, matrices]) => {
        const role = (
          Object.entries(AMBIENT_URLS) as Array<[keyof typeof AMBIENT_URLS, string]>
        ).find(([, candidateUrl]) => candidateUrl === url)?.[0];
        const foliagePalette =
          role === "flowering-bush" || role === "flower-group"
            ? "flowering"
            : role === "bush" || role === "fern"
              ? "broadleaf"
              : undefined;
        return (
          <AssetInstances
            key={`shore:${url}`}
            url={url}
            matrices={matrices}
            plan={plan}
            targetHeight={
              (role ? AMBIENT_TARGET_HEIGHT[role] * 1.2 : 0.9) *
              plan.appearance.magic.groundDetailScale
            }
            foliagePalette={foliagePalette}
            surfaceStyle={role?.includes("rock") ? "rock" : "default"}
          />
        );
      })}
      {[...meadowDetails.entries()].map(([url, matrices]) => {
        const role = (
          Object.entries(AMBIENT_URLS) as Array<[keyof typeof AMBIENT_URLS, string]>
        ).find(([, candidateUrl]) => candidateUrl === url)?.[0];
        const foliagePalette =
          role === "flowering-bush" || role === "flower-group"
            ? "flowering"
            : role === "bush" || role === "fern"
              ? "broadleaf"
              : undefined;
        return (
          <AssetInstances
            key={`meadow:${url}`}
            url={url}
            matrices={matrices}
            plan={plan}
            targetHeight={
              (role ? AMBIENT_TARGET_HEIGHT[role] * 1.18 : 0.9) *
              plan.appearance.magic.groundDetailScale
            }
            foliagePalette={foliagePalette}
          />
        );
      })}
    </group>
  );
}

function EnchantedRootArch({
  arch,
  plan,
}: Readonly<{
  arch: PlannedWorldThemeLayer["rootArches"][number];
  plan: WorldPlan;
}>) {
  const geometry = useMemo(() => {
    const start = new THREE.Vector3(arch.start.x, arch.start.y, arch.start.z);
    const end = new THREE.Vector3(arch.end.x, arch.end.y, arch.end.z);
    const middle = start
      .clone()
      .lerp(end, 0.5)
      .setY(Math.max(start.y, end.y) + arch.height);
    const curve = new THREE.CatmullRomCurve3(
      [start, start.clone().lerp(middle, 0.48), middle, middle.clone().lerp(end, 0.52), end],
      false,
      "centripetal",
    );
    return new THREE.TubeGeometry(curve, 28, arch.radius, 7, false);
  }, [arch]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color={plan.appearance.foliage.trunk}
        roughness={1}
        emissive={plan.appearance.magic.primary}
        emissiveIntensity={0.055 * plan.appearance.magic.glowIntensity}
      />
    </mesh>
  );
}

function EnchantedFireflies({
  layer,
  plan,
  reducedMotion,
  quality,
}: Readonly<{
  layer: PlannedWorldThemeLayer;
  plan: WorldPlan;
  reducedMotion: boolean;
  quality: Quality;
}>) {
  const points = quality === "high" ? layer.fireflies : layer.fireflies.slice(0, 42);
  const object = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);
    const primary = new THREE.Color(plan.appearance.magic.primary);
    const secondary = new THREE.Color(plan.appearance.magic.secondary);
    points.forEach((firefly, index) => {
      positions[index * 3] = firefly.anchor.x;
      positions[index * 3 + 1] = firefly.anchor.y;
      positions[index * 3 + 2] = firefly.anchor.z;
      const color = index % 4 === 0 ? secondary : primary;
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    });
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    next.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return next;
  }, [plan.appearance.magic.primary, plan.appearance.magic.secondary, points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    if (reducedMotion || !object.current) return;
    const attribute = object.current.geometry.getAttribute("position");
    if (!(attribute instanceof THREE.BufferAttribute)) return;
    const time = clock.elapsedTime;
    points.forEach((firefly, index) => {
      const angle = firefly.phase + time * firefly.speed;
      attribute.setXYZ(
        index,
        firefly.anchor.x + Math.cos(angle * 1.17) * firefly.orbitRadius * 0.32,
        firefly.anchor.y + Math.sin(angle * 1.61) * firefly.verticalTravel,
        firefly.anchor.z + Math.sin(angle) * firefly.orbitRadius * 0.32,
      );
    });
    attribute.needsUpdate = true;
  });
  return (
    <points ref={object} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        vertexColors
        size={quality === "high" ? 0.48 : 0.62}
        sizeAttenuation
        transparent
        opacity={0.92}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

function EnchantedThemeLayer({
  layer,
  plan,
  reducedMotion,
  quality,
}: Readonly<{
  layer: PlannedWorldThemeLayer;
  plan: WorldPlan;
  reducedMotion: boolean;
  quality: Quality;
}>) {
  const runestoneMatrices = useMemo(
    () =>
      layer.runestones.map((runestone) =>
        matrixAt(
          runestone.position.x,
          runestone.position.y,
          runestone.position.z,
          runestone.rotationY,
          runestone.scale,
        ),
      ),
    [layer.runestones],
  );
  const mushroomMatrices = useMemo(
    () =>
      layer.mushrooms.map((mushroom) =>
        matrixAt(
          mushroom.position.x,
          mushroom.position.y,
          mushroom.position.z,
          mushroom.rotationY,
          mushroom.scale,
        ),
      ),
    [layer.mushrooms],
  );
  if (layer.worldTheme !== "enchanted-forest") return null;
  return (
    <group name="enchanted-forest-language">
      <AssetInstances
        url={AMBIENT_URLS["medium-rock-2"]}
        matrices={runestoneMatrices}
        plan={plan}
        targetHeight={3.15}
        surfaceStyle="rune"
        castShadow
      />
      <AssetInstances
        url={GROUND_URLS.mushroom}
        matrices={mushroomMatrices}
        plan={plan}
        targetHeight={0.58 * plan.appearance.magic.groundDetailScale}
      />
      {layer.runestones.map((runestone) => (
        <group
          key={`${runestone.id}:glow`}
          position={[runestone.position.x, runestone.position.y + 0.12, runestone.position.z]}
          rotation-y={runestone.rotationY + runestone.glowPhase * 0.08}
        >
          <mesh rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.56 * runestone.scale, 0.035, 6, 22]} />
            <meshBasicMaterial
              color={plan.appearance.magic.primary}
              transparent
              opacity={0.72}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      {layer.rootArches.map((arch) => (
        <EnchantedRootArch key={arch.id} arch={arch} plan={plan} />
      ))}
      <EnchantedFireflies
        layer={layer}
        plan={plan}
        reducedMotion={reducedMotion}
        quality={quality}
      />
    </group>
  );
}

function AnimalActor({
  role,
  behavior,
  position,
  rotationY,
  scale,
  emphasis,
  wanderPath,
  motionOffset,
  reducedMotion,
}: Readonly<{
  role: PlannedScatter["wildlife"][number]["assetRole"];
  behavior: PlannedScatter["wildlife"][number]["behavior"];
  position: VecTuple;
  rotationY: number;
  scale: number;
  emphasis: number;
  wanderPath: ReadonlyArray<VecTuple>;
  motionOffset: number;
  reducedMotion: boolean;
}>) {
  const root = useRef<THREE.Group>(null);
  const gltf = useGLTF(ANIMAL_URLS[role]);
  const scene = useMemo(() => {
    const clone = cloneSkeleton(gltf.scene);
    clone.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(clone);
    const center = bounds.getCenter(new THREE.Vector3());
    const height = Math.max(0.001, bounds.max.y - bounds.min.y);
    const normalization = ANIMAL_TARGET_HEIGHT[role] / height;
    clone.position.set(
      -center.x * normalization,
      -bounds.min.y * normalization,
      -center.z * normalization,
    );
    clone.scale.setScalar(normalization);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.SkinnedMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    clone.updateMatrixWorld(true);
    return clone;
  }, [gltf.scene, role]);
  const { actions } = useAnimations(gltf.animations, root);
  const collection = role === "deer" ? "Deer" : role === "fox" ? "Fox" : "Stag";
  const motion = useMemo(() => buildRetracedWildlifeMotion(wanderPath), [wanderPath]);
  const travelled = useRef((motion?.totalLength ?? 0) * motionOffset);
  useEffect(() => {
    if (reducedMotion) return;
    const clip = behavior === "wander" && motion ? "walk" : behavior === "graze" ? "graze" : "idle";
    const action = actions[QUATERNIUS_ANIMAL_CLIPS[collection][clip]];
    action?.reset().fadeIn(0.35).play();
    return () => {
      action?.fadeOut(0.2);
    };
  }, [actions, behavior, collection, motion, reducedMotion]);
  useFrame((_, delta) => {
    if (reducedMotion || behavior !== "wander" || !motion || !root.current) return;
    const speed = role === "fox" ? 1.05 : role === "stag" ? 0.72 : 0.82;
    travelled.current = (travelled.current + Math.min(delta, 0.05) * speed) % motion.totalLength;
    let remaining = travelled.current;
    const segment =
      motion.segments.find((candidate) => {
        if (remaining <= candidate.length) return true;
        remaining -= candidate.length;
        return false;
      }) ?? motion.segments.at(-1)!;
    const progress = THREE.MathUtils.clamp(remaining / segment.length, 0, 1);
    root.current.position.set(
      THREE.MathUtils.lerp(segment.start[0], segment.end[0], progress),
      THREE.MathUtils.lerp(segment.start[1], segment.end[1], progress),
      THREE.MathUtils.lerp(segment.start[2], segment.end[2], progress),
    );
    root.current.rotation.y = Math.atan2(
      segment.end[0] - segment.start[0],
      segment.end[2] - segment.start[2],
    );
  });
  return (
    <group
      ref={root}
      position={position as [number, number, number]}
      rotation-y={rotationY}
      scale={scale * emphasis}
    >
      <primitive object={scene} castShadow />
    </group>
  );
}

function WildlifeLayer({
  scatter,
  plan,
  reducedMotion,
}: Readonly<{ scatter: PlannedScatter; plan: WorldPlan; reducedMotion: boolean }>) {
  const actors = useMemo(
    () =>
      scatter.wildlife.map((animal, index) => {
        const x = animal.transform.position.x;
        const z = animal.transform.position.z;
        return {
          animal,
          emphasis: index < 3 ? 1.32 : 1.16,
          position: [x, samplePlannedTerrainHeight(plan, x, z) + 0.06, z] as const,
          wanderPath: animal.wanderPath.map(
            (waypoint) =>
              [
                waypoint.x,
                samplePlannedTerrainHeight(plan, waypoint.x, waypoint.z) + 0.06,
                waypoint.z,
              ] as const,
          ),
          motionOffset: stableFraction(`${animal.id}:motion`),
        };
      }),
    [plan, scatter],
  );
  return (
    <group name="planned-wildlife">
      {actors.map(({ animal, emphasis, position, wanderPath, motionOffset }) => (
        <AnimalActor
          key={animal.id}
          role={animal.assetRole}
          behavior={animal.behavior}
          position={position}
          rotationY={animal.transform.rotationY}
          scale={animal.transform.scale.y}
          emphasis={emphasis}
          wanderPath={wanderPath}
          motionOffset={motionOffset}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  );
}

function SemanticHitZones({
  world,
  plan,
  scatter,
  onSelect,
  onHover,
}: Readonly<{
  world: KingdomWorld;
  plan: WorldPlan;
  scatter: PlannedScatter;
  onSelect: (selection: Selection) => void;
  onHover: (selection: Selection) => void;
}>) {
  const provinces = useMemo(
    () => new Map(world.provinces.map((province) => [province.id, province])),
    [world],
  );
  return (
    <group name="semantic-hit-zones">
      {scatter.semanticHitZones.map((zone) => {
        const province = provinces.get(zone.provinceId);
        if (!province) return null;
        const selection: Selection = { kind: "province", province };
        return (
          <mesh
            key={zone.id}
            position={[
              zone.center.x,
              samplePlannedTerrainHeight(plan, zone.center.x, zone.center.z) + 0.3,
              zone.center.z,
            ]}
            rotation-x={-Math.PI / 2}
            scale={[zone.radiusX, zone.radiusZ, 1]}
            onPointerDown={(event) => {
              consumePointer(event);
              onSelect(selection);
            }}
            onPointerEnter={(event) => {
              consumePointer(event);
              setCursor(true);
              onHover(selection);
            }}
            onPointerLeave={() => {
              setCursor(false);
              onHover(null);
            }}
          >
            <circleGeometry args={[1, 28]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}

type PlannedPathKind = "main" | "lane" | "courtyard";

type PlannedPathEdge = Readonly<{
  id: string;
  from: Readonly<{ x: number; z: number }>;
  to: Readonly<{ x: number; z: number }>;
  kind: PlannedPathKind;
}>;

function plannedPathEdges(
  plan: WorldPlan,
  scatter: PlannedScatter,
): ReadonlyArray<PlannedPathEdge> {
  const hamlets = plan.topology.hamlets.map((hamlet) => ({
    ...hamlet,
    visualCenter: getHamletVisualPlacementMask(plan, hamlet).center,
  }));
  if (hamlets.length < 2) return [];
  const connected = new Set([hamlets[0]!.id]);
  const edges: PlannedPathEdge[] = [];
  while (connected.size < hamlets.length) {
    let best: Readonly<{
      from: (typeof hamlets)[number];
      to: (typeof hamlets)[number];
      distance: number;
    }> | null = null;
    for (const from of hamlets) {
      if (!connected.has(from.id)) continue;
      for (const to of hamlets) {
        if (connected.has(to.id)) continue;
        const distance = Math.hypot(
          from.visualCenter.x - to.visualCenter.x,
          from.visualCenter.z - to.visualCenter.z,
        );
        if (!best || distance < best.distance) best = { from, to, distance };
      }
    }
    if (!best) break;
    connected.add(best.to.id);
    edges.push({
      id: `path-${best.from.id}-${best.to.id}`,
      from: best.from.visualCenter,
      to: best.to.visualCenter,
      kind: "main",
    });
  }
  for (const hamlet of hamlets) {
    const buildings = scatter.buildings
      .filter((building) => building.hamletId === hamlet.id)
      .sort((first, second) => first.id.localeCompare(second.id));
    const landmark = scatter.landmarks.find((candidate) => candidate.hamletId === hamlet.id);
    const anchor =
      landmark?.transform.position ?? buildings[0]?.transform.position ?? hamlet.visualCenter;
    edges.push({
      id: `court-entry-${hamlet.id}`,
      from: hamlet.visualCenter,
      to: anchor,
      kind: "courtyard",
    });
    for (const building of buildings) {
      const doorDistance = 2.8 * building.transform.scale.y;
      const door = {
        x: building.transform.position.x + Math.sin(building.transform.rotationY) * doorDistance,
        z: building.transform.position.z + Math.cos(building.transform.rotationY) * doorDistance,
      };
      edges.push({
        id: `lane-${hamlet.id}-${building.id}`,
        from: anchor,
        to: door,
        kind: "lane",
      });
    }
  }
  return edges;
}

function pathCurve(plan: WorldPlan, edge: PlannedPathEdge): THREE.QuadraticBezierCurve3 | null {
  const start = new THREE.Vector3(edge.from.x, 0, edge.from.z);
  const end = new THREE.Vector3(edge.to.x, 0, edge.to.z);
  const midpoint = start.clone().lerp(end, 0.5);
  const direction = end.clone().sub(start);
  const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
  const bends =
    edge.kind === "lane"
      ? [0, 1.8, -1.8, 3.2, -3.2]
      : edge.kind === "courtyard"
        ? [0, 2.8, -2.8, 5, -5]
        : [0, 8, -8, 15, -15, 24, -24];
  let best: Readonly<{ curve: THREE.QuadraticBezierCurve3; penalty: number }> | null = null;
  for (const bend of bends) {
    const control = midpoint.clone().addScaledVector(perpendicular, bend);
    const curve = new THREE.QuadraticBezierCurve3(start, control, end);
    let penalty = 0;
    for (let index = 2; index < 38; index += 1) {
      const point = curve.getPoint(index / 40);
      const region = classifyPlannedTerrainRegion(plan, point.x, point.z);
      if (!region.inside) penalty += 100;
      if (region.water !== null) penalty += 80;
      if (region.material === "shore") penalty += 14;
      if (region.slopeDegrees > 18) penalty += region.slopeDegrees - 18;
    }
    if (!best || penalty < best.penalty) best = { curve, penalty };
  }
  return best && best.penalty < 18 ? best.curve : null;
}

function buildPathGeometry(
  plan: WorldPlan,
  edge: PlannedPathEdge,
  layer: "border" | "surface",
): THREE.BufferGeometry | null {
  const curve = pathCurve(plan, edge);
  if (!curve) return null;
  const segments = 52;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    const point = curve.getPoint(progress);
    const tangent = curve.getTangent(progress).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const baseHalfWidth = edge.kind === "main" ? 1.72 : edge.kind === "courtyard" ? 1.18 : 0.68;
    const halfWidth =
      (baseHalfWidth +
        Math.sin(progress * Math.PI) *
          (edge.kind === "main" ? 0.24 : edge.kind === "courtyard" ? 0.12 : 0.06)) *
      (layer === "border" ? 1.34 : 1);
    for (const side of [-1, 1]) {
      const x = point.x + normal.x * halfWidth * side;
      const z = point.z + normal.z * halfWidth * side;
      positions.push(
        x,
        samplePlannedTerrainHeight(plan, x, z) + (layer === "border" ? 0.065 : 0.095),
        z,
      );
    }
  }
  for (let index = 0; index < segments; index += 1) {
    const offset = index * 2;
    indices.push(offset, offset + 2, offset + 3, offset, offset + 3, offset + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function PlannedPaths({ plan, scatter }: Readonly<{ plan: WorldPlan; scatter: PlannedScatter }>) {
  const paths = useMemo(
    () =>
      plannedPathEdges(plan, scatter).flatMap((edge) => {
        const border = buildPathGeometry(plan, edge, "border");
        const surface = buildPathGeometry(plan, edge, "surface");
        return border && surface ? [{ id: edge.id, border, surface, kind: edge.kind }] : [];
      }),
    [plan, scatter],
  );
  useEffect(
    () => () => paths.forEach(({ border, surface }) => (border.dispose(), surface.dispose())),
    [paths],
  );
  const surfaceColor = useMemo(
    () =>
      new THREE.Color(plan.appearance.terrain.shore).lerp(
        new THREE.Color(plan.appearance.terrain.escarpment),
        0.18,
      ),
    [plan],
  );
  const borderColor = useMemo(
    () => surfaceColor.clone().lerp(new THREE.Color("#6f5844"), 0.42),
    [surfaceColor],
  );
  return (
    <group name="planned-hamlet-paths">
      {paths.flatMap(({ id, border, surface, kind }) => [
        <mesh key={`${id}:border`} geometry={border} receiveShadow>
          <meshStandardMaterial color={borderColor} roughness={1} />
        </mesh>,
        <mesh key={`${id}:surface`} geometry={surface} receiveShadow>
          <meshStandardMaterial
            color={surfaceColor}
            roughness={1}
            emissive={surfaceColor}
            emissiveIntensity={kind === "main" ? 0.035 : kind === "courtyard" ? 0.026 : 0.02}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>,
      ])}
    </group>
  );
}

function Atmosphere({
  plan,
  season,
  quality,
  reducedMotion,
}: Readonly<{
  plan: WorldPlan;
  season: KingdomSeason;
  quality: Quality;
  reducedMotion: boolean;
}>) {
  const { envelope } = plan.topology;
  const { appearance } = plan;
  const diagonal = Math.hypot(envelope.width, envelope.depth);
  return (
    <>
      <color attach="background" args={[appearance.atmosphere.sky]} />
      <fog attach="fog" args={[appearance.atmosphere.fog, diagonal * 0.78, diagonal * 2.25]} />
      <hemisphereLight
        args={[
          appearance.atmosphere.horizon,
          appearance.terrain.escarpment,
          season === "spring" ? 0.94 : 0.82,
        ]}
      />
      <ambientLight intensity={season === "spring" ? 0.18 : 0.1} />
      <directionalLight
        castShadow={quality === "high"}
        color={appearance.atmosphere.sunlight}
        intensity={appearance.atmosphere.sunlightIntensity * (season === "spring" ? 1.44 : 1.32)}
        position={[
          envelope.minX - envelope.width * 0.28,
          diagonal * 0.76,
          envelope.maxZ + envelope.depth * 0.24,
        ]}
        shadow-mapSize-width={quality === "high" ? 2048 : 768}
        shadow-mapSize-height={quality === "high" ? 2048 : 768}
        shadow-camera-far={diagonal * 3}
        shadow-camera-left={-envelope.width * 0.78}
        shadow-camera-right={envelope.width * 0.78}
        shadow-camera-top={envelope.depth * 0.78}
        shadow-camera-bottom={-envelope.depth * 0.78}
        shadow-bias={-0.00008}
        shadow-normalBias={0.035}
      />
      <mesh position={[envelope.center.x, -9, envelope.center.z]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[diagonal * 1.3, 64]} />
        <meshBasicMaterial color={appearance.atmosphere.horizon} />
      </mesh>
      {season === "winter" || season === "autumn" ? (
        <Sparkles
          count={quality === "high" ? 150 : 70}
          scale={[envelope.width, 20, envelope.depth]}
          position={[envelope.center.x, 9, envelope.center.z]}
          size={season === "winter" ? 2.2 : 1.2}
          speed={reducedMotion ? 0 : 0.22}
          color={season === "winter" ? "#f4fbff" : appearance.foliage.flowering[0]}
          opacity={0.66}
        />
      ) : null}
      {season === "spring" ? (
        <Sparkles
          count={quality === "high" ? 64 : 30}
          scale={[envelope.width * 0.78, 12, envelope.depth * 0.64]}
          position={[envelope.center.x, 7, envelope.center.z + envelope.depth * 0.03]}
          size={1.25}
          speed={reducedMotion ? 0 : 0.1}
          noise={0.7}
          color={appearance.foliage.flowering[1] ?? "#f6d6dc"}
          opacity={0.38}
        />
      ) : null}
    </>
  );
}

function PortalLayer({
  world,
  plan,
  reducedMotion,
  onSelect,
  onHover,
  onEnter,
}: Readonly<{
  world: KingdomWorld;
  plan: WorldPlan;
  reducedMotion: boolean;
  onSelect: (selection: Selection) => void;
  onHover: (selection: Selection) => void;
  onEnter: (portal: RepositoryPortal) => void;
}>) {
  return (
    <group name="repository-portals">
      {world.portals.map((portal) => (
        <Portal
          key={portal.id}
          portal={portal}
          plan={plan}
          reducedMotion={reducedMotion}
          onSelect={onSelect}
          onHover={onHover}
          onEnter={onEnter}
        />
      ))}
    </group>
  );
}

function Portal({
  portal,
  plan,
  reducedMotion,
  onSelect,
  onHover,
  onEnter,
}: Readonly<{
  portal: RepositoryPortal;
  plan: WorldPlan;
  reducedMotion: boolean;
  onSelect: (selection: Selection) => void;
  onHover: (selection: Selection) => void;
  onEnter: (portal: RepositoryPortal) => void;
}>) {
  const root = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!root.current || reducedMotion) return;
    root.current.rotation.y += delta * 0.17;
  });
  const selection: Selection = { kind: "portal", portal };
  const y = samplePlannedTerrainHeight(plan, portal.position.x, portal.position.z) + 2.3;
  return (
    <group
      ref={root}
      position={[portal.position.x, y, portal.position.z]}
      onPointerDown={(event) => {
        consumePointer(event);
        onSelect(selection);
      }}
      onDoubleClick={(event) => {
        consumePointer(event);
        onEnter(portal);
      }}
      onPointerEnter={(event) => {
        consumePointer(event);
        setCursor(true);
        onHover(selection);
      }}
      onPointerLeave={() => {
        setCursor(false);
        onHover(null);
      }}
    >
      <mesh>
        <torusGeometry args={[1.55, 0.19, 10, 32]} />
        <meshStandardMaterial
          color={plan.appearance.atmosphere.sunlight}
          emissive={plan.appearance.terrain.water}
          emissiveIntensity={1.1}
        />
      </mesh>
      <mesh rotation-y={Math.PI / 2}>
        <circleGeometry args={[1.3, 32]} />
        <meshBasicMaterial
          color={plan.appearance.terrain.water}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function selectionPosition(
  selection: Selection,
  plan: WorldPlan,
  scatter: PlannedScatter,
): THREE.Vector3 | null {
  if (!selection || selection.kind === "repository") return null;
  if (selection.kind === "entity") {
    const structure =
      scatter.buildings.find((building) => building.entityId === selection.entity.id) ??
      scatter.landmarks.find((landmark) => landmark.entityId === selection.entity.id);
    const x = structure?.transform.position.x ?? selection.entity.position.x;
    const z = structure?.transform.position.z ?? selection.entity.position.z;
    return new THREE.Vector3(x, samplePlannedTerrainHeight(plan, x, z) + 1.8, z);
  }
  if (selection.kind === "province") {
    const zone = scatter.semanticHitZones.find(
      (candidate) => candidate.provinceId === selection.province.id,
    );
    const x = zone?.center.x ?? selection.province.position.x;
    const z = zone?.center.z ?? selection.province.position.z;
    return new THREE.Vector3(x, samplePlannedTerrainHeight(plan, x, z) + 1.1, z);
  }
  const { x, z } = selection.portal.position;
  return new THREE.Vector3(x, samplePlannedTerrainHeight(plan, x, z) + 2.3, z);
}

function SelectionMarker({
  selection,
  plan,
  scatter,
}: Readonly<{ selection: Selection; plan: WorldPlan; scatter: PlannedScatter }>) {
  const position = selectionPosition(selection, plan, scatter);
  if (!position) return null;
  return (
    <group position={position}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.35, 1.65, 40]} />
        <meshBasicMaterial
          color={plan.appearance.atmosphere.sunlight}
          transparent
          opacity={0.9}
          depthWrite={false}
        />
      </mesh>
      <pointLight color={plan.appearance.atmosphere.sunlight} intensity={3.8} distance={6} />
    </group>
  );
}

function CameraRig({
  plan,
  scatter,
  selection,
  resetToken,
  reducedMotion,
}: Readonly<{
  plan: WorldPlan;
  scatter: PlannedScatter;
  selection: Selection;
  resetToken: number;
  reducedMotion: boolean;
}>) {
  const controls = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const camera = useRef<THREE.OrthographicCamera>(null);
  const { size } = useThree();
  const { envelope, camera: composition } = plan.topology;
  const diagonal = Math.hypot(envelope.width, envelope.depth);
  const overview = composition.overview;
  const focus = useRef(new THREE.Vector3(overview.target.x, overview.target.y, overview.target.z));
  const goalPosition = useRef(
    new THREE.Vector3(overview.position.x, overview.position.y, overview.position.z),
  );
  const goalZoom = useRef(1);
  const animating = useRef(true);

  const overviewFit = useMemo<OverviewFit>(() => {
    const target = new THREE.Vector3(overview.target.x, overview.target.y, overview.target.z);
    const authoredEye = new THREE.Vector3(
      overview.position.x,
      overview.position.y,
      overview.position.z,
    );
    const authoredOffset = authoredEye.clone().sub(target);
    const isPortrait = size.height > size.width * 1.25;
    const cameraOffset = (() => {
      if (isPortrait) {
        // A near-front, steeper isometric view maps the world's long travel axis
        // into the tall screen axis. This keeps the full floating silhouette in
        // view without reducing it to a small landscape strip on phones.
        const distance = Math.max(authoredOffset.length(), diagonal * 0.92);
        const horizontalDistance = Math.cos(PORTRAIT_CAMERA_ELEVATION) * distance;
        const xDirection = authoredOffset.x < 0 ? -1 : 1;
        return new THREE.Vector3(
          Math.sin(PORTRAIT_CAMERA_AZIMUTH) * horizontalDistance * xDirection,
          Math.sin(PORTRAIT_CAMERA_ELEVATION) * distance,
          Math.cos(PORTRAIT_CAMERA_AZIMUTH) * horizontalDistance,
        );
      }

      const distance = authoredOffset.length();
      const elevation = DESKTOP_CAMERA_ELEVATION;
      const horizontalDistance = Math.cos(elevation) * distance;
      const xDirection = authoredOffset.x < 0 ? -1 : 1;
      return new THREE.Vector3(
        Math.sin(DESKTOP_CAMERA_AZIMUTH) * horizontalDistance * xDirection,
        Math.sin(elevation) * distance,
        Math.cos(DESKTOP_CAMERA_AZIMUTH) * horizontalDistance,
      );
    })();
    const eye = target.clone().add(cameraOffset);
    const forward = target.clone().sub(eye).normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const cameraUp = new THREE.Vector3().crossVectors(right, forward).normalize();
    const points: THREE.Vector3[] = [];
    const gridX = 52;
    const gridZ = 62;
    for (let row = 0; row <= gridZ; row += 1) {
      const z = THREE.MathUtils.lerp(envelope.minZ, envelope.maxZ, row / gridZ);
      for (let column = 0; column <= gridX; column += 1) {
        const x = THREE.MathUtils.lerp(envelope.minX, envelope.maxX, column / gridX);
        const region = classifyPlannedTerrainRegion(plan, x, z);
        if (!region.inside) continue;
        points.push(new THREE.Vector3(x, region.height, z));
      }
    }
    for (const structure of [...scatter.buildings, ...scatter.landmarks]) {
      const { x, z } = structure.transform.position;
      points.push(
        new THREE.Vector3(
          x,
          samplePlannedTerrainHeight(plan, x, z) + structure.transform.scale.y * 8,
          z,
        ),
      );
    }
    for (const crest of buildPlannedEscarpmentGeometry(plan, "low").crest) {
      points.push(new THREE.Vector3(crest.x, crest.y, crest.z));
    }
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of points) {
      const relative = point.clone().sub(target);
      const projectedX = relative.dot(right);
      const projectedY = relative.dot(cameraUp);
      minX = Math.min(minX, projectedX);
      maxX = Math.max(maxX, projectedX);
      minY = Math.min(minY, projectedY);
      maxY = Math.max(maxY, projectedY);
    }
    const extentX = Math.max(1, maxX - minX);
    const extentY = Math.max(1, maxY - minY);
    const margin = isPortrait ? 1.08 : 1.22;
    const projectedCenterX = (minX + maxX) / 2;
    const projectedCenterY = (minY + maxY) / 2;
    const fittedTarget = target
      .clone()
      .addScaledVector(right, projectedCenterX)
      .addScaledVector(cameraUp, projectedCenterY);
    return {
      zoom: Math.max(
        1,
        Math.min(size.width / (extentX * margin), size.height / (extentY * margin)),
      ),
      target: fittedTarget,
      position: fittedTarget.clone().add(cameraOffset),
    };
  }, [diagonal, envelope, overview, plan, scatter, size.height, size.width]);
  const baseZoom = overviewFit.zoom;

  useEffect(() => {
    if (!camera.current) return;
    const selected = selectionPosition(selection, plan, scatter);
    if (selected && selection && selection.kind !== "repository") {
      focus.current.copy(selected);
      goalZoom.current = baseZoom * (selection.kind === "province" ? 2.1 : 3);
      goalPosition.current.set(
        selected.x + diagonal * 0.21,
        selected.y + diagonal * 0.23,
        selected.z + diagonal * 0.29,
      );
    } else {
      focus.current.copy(overviewFit.target);
      goalZoom.current = baseZoom;
      goalPosition.current.copy(overviewFit.position);
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
  }, [baseZoom, diagonal, overviewFit, plan, reducedMotion, resetToken, scatter, selection]);

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

  return (
    <>
      <OrthographicCamera
        ref={camera}
        makeDefault
        near={overview.near}
        far={overview.far}
        zoom={baseZoom}
        position={[overviewFit.position.x, overviewFit.position.y, overviewFit.position.z]}
      />
      <OrbitControls
        ref={controls}
        makeDefault
        target={[overviewFit.target.x, overviewFit.target.y, overviewFit.target.z]}
        enableDamping={!reducedMotion}
        dampingFactor={0.06}
        minZoom={baseZoom * 0.48}
        maxZoom={baseZoom * 5}
        minPolarAngle={0.28}
        maxPolarAngle={Math.PI * 0.3}
        screenSpacePanning={false}
        onStart={() => {
          animating.current = false;
        }}
      />
    </>
  );
}

function LoadingMarker({ plan }: Readonly<{ plan: WorldPlan }>) {
  const { envelope } = plan.topology;
  return (
    <mesh position={[envelope.center.x, 4, envelope.center.z]}>
      <octahedronGeometry args={[1.4, 1]} />
      <meshStandardMaterial
        color={plan.appearance.atmosphere.sunlight}
        emissive={plan.appearance.terrain.water}
        emissiveIntensity={0.4}
      />
    </mesh>
  );
}

export function KingdomScenePlanned({
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
  const plan = useMemo(() => createWorldPlan(world), [world]);
  const scatter = useMemo(() => createPlannedScatter(world, plan), [plan, world]);
  const enrichment = useMemo(() => createPlannedVisualEnrichment(plan, scatter), [plan, scatter]);
  const themeLayer = useMemo(() => createPlannedWorldThemeLayer(plan, scatter), [plan, scatter]);
  return (
    <>
      <Atmosphere plan={plan} season={season} quality={quality} reducedMotion={reducedMotion} />
      <PlannedTerrain plan={plan} quality={quality} receiveShadow />
      <PlannedEscarpment plan={plan} quality={quality} />
      <PlannedWatershed plan={plan} quality={quality} reducedMotion={reducedMotion} />
      <PlannedPaths plan={plan} scatter={scatter} />
      <Suspense fallback={<LoadingMarker plan={plan} />}>
        <VegetationLayer
          scatter={scatter}
          plan={plan}
          enrichment={enrichment}
          themeLayer={themeLayer}
        />
        <ArchitectureLayer
          world={world}
          plan={plan}
          scatter={scatter}
          onSelect={onSelect}
          onHover={onHover}
        />
        <WildlifeLayer scatter={scatter} plan={plan} reducedMotion={reducedMotion} />
        <EnchantedThemeLayer
          layer={themeLayer}
          plan={plan}
          reducedMotion={reducedMotion}
          quality={quality}
        />
      </Suspense>
      <PlannedLife
        plan={plan}
        scatter={scatter}
        enrichment={enrichment}
        reducedMotion={reducedMotion}
      />
      <SemanticHitZones
        world={world}
        plan={plan}
        scatter={scatter}
        onSelect={onSelect}
        onHover={onHover}
      />
      <PortalLayer
        world={world}
        plan={plan}
        reducedMotion={reducedMotion}
        onSelect={onSelect}
        onHover={onHover}
        onEnter={onEnterPortal}
      />
      <SelectionMarker selection={selection} plan={plan} scatter={scatter} />
      <CameraRig
        plan={plan}
        scatter={scatter}
        selection={selection}
        resetToken={resetToken}
        reducedMotion={reducedMotion}
      />
    </>
  );
}
