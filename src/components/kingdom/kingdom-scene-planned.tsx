"use client";

import { OrbitControls, OrthographicCamera, useAnimations, useGLTF } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

import {
  getKenneySeasonalPalette,
  kenneySeasonalAssetReferenceUrl,
} from "@/lib/assets/kenney-seasonal";
import { QUATERNIUS_ANIMAL_CLIPS, quaterniusAssetUrl } from "@/lib/assets/quaternius";
import { stableFraction } from "@/lib/kingdom/hash";
import { createWorldPlan, type KingdomSeason, type WorldPlan } from "@/lib/kingdom";
import type { KingdomWorld, RepositoryPortal, Selection } from "@/lib/kingdom/types";

import { createPlannedScatter, type PlannedScatter } from "./planned-scatter";
import {
  classifyPlannedTerrainRegion,
  getHamletVisualPlacementMask,
  getPlannedTerrainDefinition,
  samplePlannedTerrainHeight,
} from "./planned-terrain-model";
import { buildPlannedEscarpmentGeometry, PlannedEscarpment } from "./planned-escarpment";
import { PlannedLife } from "./planned-life";
import { PlannedLakeHabitat } from "./planned-lake-habitat";
import {
  createPlannedHamletPathBatch,
  disposePlannedHamletPathBatch,
} from "./planned-hamlet-paths";
import { PlannedLandUseLayer } from "./planned-land-use-layer";
import {
  createPlannedScenePickRecords,
  plannedPickRecordForInstance,
  PlannedScenePickProxy,
} from "./planned-scene-picking";
import {
  createPlannedPortalInstances,
  plannedPortalForInstance,
  writePlannedPortalMatrices,
} from "./planned-portal-batching";
import { createPlannedLandUse } from "./planned-land-use";
import {
  createPlannedTreeLodBatches,
  createPlannedWalkTreeLodBatches,
  disposePlannedTreeLodGeometry,
  plannedTreeLodMode,
  plannedTreeLodPaletteFor,
  selectPlannedWalkTreeHybrid,
  type PlannedTreeLodBatch,
  type PlannedTreeLodPalette,
  type PlannedWalkTreeDetailCandidate,
  type PlannedWalkTreeLodBatch,
} from "./planned-tree-lod";
import {
  createPlannedEnchantedOrbitGeometry,
  createPlannedThemeTreeLodGeometry,
  disposePlannedEnchantedOrbitGeometry,
  plannedThemeLodMode,
  plannedThemeTreeTrianglesPerInstance,
} from "./planned-theme-lod";
import {
  fitPlannedOverview,
  isPlannedCameraTransitionSettled,
  plannedCameraTransitionAlpha,
} from "./planned-camera-model";
import { PlannedCinematicEnvironment } from "./planned-cinematic-environment";
import {
  finalizePlannedArchitectureMaterial,
  loadPlannedArchitectureDetailRuntimeTextures,
  type PlannedArchitectureDetailRuntimeGate,
  type PlannedArchitectureDetailRuntimeTextureOwner,
  type PlannedArchitectureDetailRuntimeTextures,
} from "./planned-architecture-detail-material";
import { PlannedRegionalExperienceLayer } from "./planned-regional-experience-layer";
import { PlannedTerrain, PlannedWatershed } from "./planned-terrain";
import {
  createPlannedVisualEnrichment,
  type PlannedVisualEnrichment,
} from "./planned-visual-enrichment";
import {
  createPlannedWorldThemeLayer,
  type PlannedWorldThemeLayer,
} from "./planned-world-theme-model";
import {
  buildRetracedWildlifeMotion,
  wildlifeMotionStartDistance,
  type WildlifeMotion,
} from "./wildlife-motion";
import {
  createPlannedWalkWildlifeLodGeometry,
  PLANNED_WALK_WILDLIFE_LOD_CONTRACT,
} from "./planned-wildlife-lod";
import {
  createLandUseWalkObstacles,
  type KingdomNavigationMode,
  type WalkObstacle,
} from "./kingdom-navigation-model";
import { KingdomWalkControls } from "./kingdom-walk-controls";
import { PlannedWalkDetail } from "./planned-walk-detail";
import {
  createRepositoryWalkInteraction,
  WALK_ANIMAL_TARGET_HEIGHT as ANIMAL_TARGET_HEIGHT,
  WALK_WILDLIFE_GROUND_OFFSET as WILDLIFE_GROUND_OFFSET,
  type LivingWalkSpawn,
  type WalkTarget,
  type WalkTargetPositionUpdater,
  type WalkViewStatus,
} from "./kingdom-walk-experience-model";
import type { PlannedWalkRuntimePlan } from "./planned-walk-runtime-model";
import { usePreparedPlannedWalkRuntime } from "./use-planned-walk-runtime";
import {
  ARCHITECTURE_MATERIAL_POLICY,
  ARCHITECTURE_RECIPES,
  createRepositoryAssetVocabulary,
  type ArchitectureRecipe,
  type ArchitectureRecipeId,
  type GroundCompoundProp,
  type MedievalModuleRole,
  type RepositoryAssetVocabulary,
  type RepositoryCompoundIdentity,
} from "./repo-asset-vocabulary";

type Quality = "low" | "high";
type VecTuple = readonly [number, number, number];
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
type ArchitectureDetailContext = Readonly<{
  gate: PlannedArchitectureDetailRuntimeGate;
  runtimeTextures: PlannedArchitectureDetailRuntimeTextures | null;
}>;

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
  navigationMode?: KingdomNavigationMode;
  onWalkLockChange?: (locked: boolean) => void;
  onWalkStatusChange?: (status: WalkViewStatus) => void;
  onWalkTargetSelect?: (selection: Selection) => void;
}>;

const ignoreWalkLockChange = () => undefined;
const ignoreWalkStatusChange = () => undefined;
const PREPARING_WALK_STATUS: WalkViewStatus = Object.freeze({
  heading: "N",
  locationLabel: "Preparing walkable world…",
  target: null,
});
const FAILED_WALK_STATUS: WalkViewStatus = Object.freeze({
  heading: "N",
  locationLabel: "Walk preparation unavailable",
  target: null,
});

const MODULE_URLS: Readonly<Record<MedievalModuleRole, string>> = {
  plasterWall: quaterniusAssetUrl("medieval", "Wall_Plaster_Straight"),
  plasterDoor: quaterniusAssetUrl("medieval", "Wall_Plaster_Door_Round"),
  plasterWindow: quaterniusAssetUrl("medieval", "Wall_Plaster_Window_Wide_Round"),
  brickWall: quaterniusAssetUrl("medieval", "Wall_UnevenBrick_Straight"),
  brickDoor: quaterniusAssetUrl("medieval", "Wall_UnevenBrick_Door_Round"),
  brickWindow: quaterniusAssetUrl("medieval", "Wall_UnevenBrick_Window_Wide_Round"),
  brickCorner: quaterniusAssetUrl("medieval", "Corner_Exterior_Brick"),
  woodCorner: quaterniusAssetUrl("medieval", "Corner_Exterior_Wood"),
  brickDoorframe: quaterniusAssetUrl("medieval", "DoorFrame_Round_Brick"),
  standaloneDoor: quaterniusAssetUrl("medieval", "Door_1_Round"),
  standaloneWindow: quaterniusAssetUrl("medieval", "Window_Wide_Round1"),
  shutters: quaterniusAssetUrl("medieval", "WindowShutters_Wide_Round_Open"),
  roofSmall: quaterniusAssetUrl("medieval", "Roof_RoundTiles_4x4"),
  roofWide: quaterniusAssetUrl("medieval", "Roof_RoundTiles_6x8"),
  roofLarge: quaterniusAssetUrl("medieval", "Roof_RoundTiles_8x8"),
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

type WalkTreeAssetStats = Readonly<{ sourcePrimitives: number; triangles: number }>;

const WALK_TREE_ASSET_STATS: Readonly<Record<string, WalkTreeAssetStats>> = Object.freeze({
  [TREE_URLS["common-tree-1"]]: { sourcePrimitives: 2, triangles: 6_265 },
  [TREE_URLS["common-tree-2"]]: { sourcePrimitives: 2, triangles: 5_648 },
  [TREE_URLS["common-tree-3"]]: { sourcePrimitives: 2, triangles: 3_505 },
  [TREE_URLS["pine-1"]]: { sourcePrimitives: 2, triangles: 3_947 },
  [TREE_URLS["pine-2"]]: { sourcePrimitives: 2, triangles: 3_648 },
  [TREE_URLS["twisted-tree-1"]]: { sourcePrimitives: 2, triangles: 9_564 },
  [TREE_URLS["twisted-tree-2"]]: { sourcePrimitives: 2, triangles: 9_134 },
  [TREE_URLS["dead-tree"]]: { sourcePrimitives: 1, triangles: 6_169 },
  "/assets/world/kenney/holiday/tree-snow-a.glb": { sourcePrimitives: 1, triangles: 378 },
  "/assets/world/kenney/holiday/tree-snow-b.glb": { sourcePrimitives: 1, triangles: 374 },
  "/assets/world/kenney/holiday/tree-snow-c.glb": { sourcePrimitives: 1, triangles: 234 },
  "/assets/world/kenney/nature/tree_blocks.glb": { sourcePrimitives: 2, triangles: 132 },
  "/assets/world/kenney/nature/tree_blocks_fall.glb": { sourcePrimitives: 2, triangles: 264 },
  "/assets/world/kenney/nature/tree_cone.glb": { sourcePrimitives: 2, triangles: 132 },
  "/assets/world/kenney/nature/tree_cone_fall.glb": { sourcePrimitives: 2, triangles: 132 },
  "/assets/world/kenney/nature/tree_default.glb": { sourcePrimitives: 2, triangles: 114 },
  "/assets/world/kenney/nature/tree_default_fall.glb": { sourcePrimitives: 2, triangles: 228 },
  "/assets/world/kenney/nature/tree_detailed.glb": { sourcePrimitives: 3, triangles: 402 },
  "/assets/world/kenney/nature/tree_detailed_fall.glb": { sourcePrimitives: 3, triangles: 402 },
  "/assets/world/kenney/nature/tree_fat.glb": { sourcePrimitives: 2, triangles: 50 },
  "/assets/world/kenney/nature/tree_fat_fall.glb": { sourcePrimitives: 2, triangles: 50 },
  "/assets/world/kenney/nature/tree_oak.glb": { sourcePrimitives: 2, triangles: 196 },
  "/assets/world/kenney/nature/tree_oak_fall.glb": { sourcePrimitives: 2, triangles: 196 },
});

function walkTreeAssetStats(url: string): WalkTreeAssetStats {
  const stats = WALK_TREE_ASSET_STATS[url];
  if (!stats) throw new Error(`Missing Walk tree renderer stats for ${url}.`);
  return stats;
}

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
  architectureDetail,
}: Readonly<{
  primitive: GltfPrimitive;
  matrices: ReadonlyArray<THREE.Matrix4>;
  plan: WorldPlan;
  foliagePalette?: FoliagePalette;
  seasonalCanopy: boolean;
  surfaceStyle: SurfaceStyle;
  castShadow: boolean;
  architectureDetail?: ArchitectureDetailContext;
}>) {
  const instance = useRef<THREE.InstancedMesh>(null);
  const ownedMaterials = useMemo(() => {
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
        material.roughness = Math.max(
          ARCHITECTURE_MATERIAL_POLICY.minimumRoughness,
          material.roughness,
        );
        const roofMaterial = /tile|roof/i.test(material.name);
        const timberMaterial = /wood|timber|beam|frame|door/i.test(material.name);
        const surfaceColor = roofMaterial
          ? plan.appearance.architecture.roofTint
          : timberMaterial
            ? plan.appearance.architecture.timberTint
            : plan.appearance.architecture.plasterTint;
        // Current Quaternius sources carry authored color, normal, and
        // metallic-roughness detail. AO and emissive references remain intact
        // when a future source provides them. Season contributes a restrained
        // tint and never replaces source maps with a flat material.
        material.color.lerp(
          new THREE.Color(surfaceColor),
          material.map
            ? ARCHITECTURE_MATERIAL_POLICY.texturedTintMix
            : ARCHITECTURE_MATERIAL_POLICY.untexturedTintMix,
        );
        if (!material.emissiveMap) {
          material.emissive.copy(material.color).multiplyScalar(0.12);
          material.emissiveIntensity = ARCHITECTURE_MATERIAL_POLICY.supplementalEmissiveIntensity;
        }
      }
      if (material instanceof THREE.MeshStandardMaterial && surfaceStyle === "rock") {
        material.roughness = 1;
        material.metalness = 0;
        material.color
          .set("#ffffff")
          .lerp(new THREE.Color(plan.appearance.terrain.escarpment), 0.22);
        material.emissiveMap = null;
        material.emissive.set("#000000");
        material.emissiveIntensity = 0;
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
      if (
        material instanceof THREE.MeshStandardMaterial &&
        surfaceStyle === "architecture" &&
        architectureDetail
      ) {
        const finalized = finalizePlannedArchitectureMaterial(architectureDetail.gate, {
          ownedMaterial: material,
          geometry: primitive.geometry,
          runtimeTextures: architectureDetail.runtimeTextures,
          windowEmissive: {
            color: plan.appearance.architecture.windowGlow,
            intensity: 0.72,
          },
        });
        return { material: finalized.material, dispose: finalized.dispose };
      }
      return { material, dispose: () => material.dispose() };
    });
  }, [
    architectureDetail,
    foliagePalette,
    plan,
    primitive.geometry,
    primitive.material,
    seasonalCanopy,
    surfaceStyle,
  ]);
  const materials = useMemo(() => ownedMaterials.map((owned) => owned.material), [ownedMaterials]);

  useLayoutEffect(() => {
    if (!instance.current) return;
    const composed = new THREE.Matrix4();
    matrices.forEach((matrix, index) => {
      composed.multiplyMatrices(matrix, primitive.sourceMatrix);
      instance.current?.setMatrixAt(index, composed);
    });
    instance.current.instanceMatrix.needsUpdate = true;
    instance.current.computeBoundingBox();
    instance.current.computeBoundingSphere();
  }, [materials, matrices, primitive.sourceMatrix]);

  useEffect(() => () => ownedMaterials.forEach((owned) => owned.dispose()), [ownedMaterials]);
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
  architectureDetail,
}: Readonly<{
  url: string;
  matrices: ReadonlyArray<THREE.Matrix4>;
  plan: WorldPlan;
  targetHeight?: number;
  foliagePalette?: FoliagePalette;
  surfaceStyle?: SurfaceStyle;
  castShadow?: boolean;
  architectureDetail?: ArchitectureDetailContext;
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
          architectureDetail={architectureDetail}
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

type CompoundIdentity = RepositoryCompoundIdentity;

type HamletCompound = Readonly<{
  hamletId: string;
  identity: CompoundIdentity;
  center: Readonly<{ x: number; z: number }>;
  radiusX: number;
  radiusZ: number;
  rotation: number;
}>;

function createHamletCompounds(
  plan: WorldPlan,
  scatter: PlannedScatter,
): ReadonlyMap<string, HamletCompound> {
  const identities = new Map<string, CompoundIdentity>();
  for (const structure of [...scatter.buildings, ...scatter.landmarks]) {
    if (structure.hamletId === null) continue;
    const identity = structure.architecture.compoundIdentity;
    const existing = identities.get(structure.hamletId);
    if (existing !== undefined && existing !== identity) {
      throw new Error(`Conflicting planned compound identities for ${structure.hamletId}.`);
    }
    identities.set(structure.hamletId, identity);
  }
  const result = new Map<string, HamletCompound>();
  for (const hamlet of plan.topology.hamlets) {
    const identity = identities.get(hamlet.id);
    if (identity === undefined) {
      throw new Error(`Missing planned compound identity for ${hamlet.id}.`);
    }
    const mask = getHamletVisualPlacementMask(plan, hamlet);
    const orientationJitter =
      (stableFraction(`${plan.topologyKey}:${hamlet.id}:compound-orientation`) - 0.5) * 0.42;
    result.set(hamlet.id, {
      hamletId: hamlet.id,
      identity,
      center: mask.center,
      radiusX: mask.radiusX,
      radiusZ: mask.radiusZ,
      rotation: mask.rotation + orientationJitter,
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

type InstanceGroups = Map<string, THREE.Matrix4[]>;

function addInstance(groups: InstanceGroups, url: string, matrix: THREE.Matrix4) {
  const group = groups.get(url);
  if (group) group.push(matrix);
  else groups.set(url, [matrix]);
}

function addBuildingAssembly(
  groups: InstanceGroups,
  recipe: ArchitectureRecipe,
  parent: THREE.Matrix4,
  options: Readonly<{ compound: CompoundIdentity; hero: boolean; enchanted: boolean }> = {
    compound: "village",
    hero: false,
    enchanted: false,
  },
) {
  const width = recipe.footprint === "wide" ? 2 : recipe.footprint === "tower" ? 1.65 : 1.75;
  const depth = recipe.footprint === "wide" ? 1.88 : recipe.footprint === "tower" ? 1.65 : 1.75;

  for (let story = 0; story < recipe.stories; story += 1) {
    const y = story * 3.12;
    const layeredPortal = story === 0 && recipe.layeredPortal;
    const layeredWindow = recipe.layeredWindow && story === 0;
    const frontLeft = layeredPortal
      ? recipe.wall
      : story === 0
        ? recipe.integratedDoor
        : recipe.integratedWindow;
    const frontRight = layeredWindow ? recipe.wall : recipe.integratedWindow;
    const pieces: ReadonlyArray<readonly [MedievalModuleRole, number, number, number, number]> = [
      [frontLeft, -1, y, depth, 0],
      [frontRight, 1, y, depth, 0],
      [recipe.integratedWindow, -1, y, -depth, Math.PI],
      [recipe.wall, 1, y, -depth, Math.PI],
      [recipe.integratedWindow, -width, y, -1, Math.PI / 2],
      [recipe.wall, -width, y, 1, Math.PI / 2],
      [recipe.integratedWindow, width, y, -1, -Math.PI / 2],
      [recipe.wall, width, y, 1, -Math.PI / 2],
    ];
    for (const [moduleRole, x, localY, z, rotation] of pieces) {
      addInstance(
        groups,
        MODULE_URLS[moduleRole],
        multiply(parent, matrixAt(x, localY, z, rotation)),
      );
    }
    if (layeredPortal) {
      addInstance(
        groups,
        MODULE_URLS.brickDoorframe,
        multiply(parent, matrixAt(-1, y + 0.015, depth + 0.035, 0, 0.98)),
      );
      addInstance(
        groups,
        MODULE_URLS.standaloneDoor,
        multiply(parent, matrixAt(-1, y + 0.025, depth + 0.06, 0, 0.96)),
      );
    }
    if (layeredWindow) {
      addInstance(
        groups,
        MODULE_URLS.standaloneWindow,
        multiply(parent, matrixAt(1, y + 0.02, depth + 0.04, 0, 0.96)),
      );
      if (recipe.shutters) {
        addInstance(
          groups,
          MODULE_URLS.shutters,
          multiply(parent, matrixAt(1, y + 0.025, depth + 0.065, 0, 0.96)),
        );
      }
    }
    if (recipe.corner && story === 0) {
      const corners: ReadonlyArray<readonly [number, number, number]> = [
        [-width, depth, 0],
        [width, depth, -Math.PI / 2],
      ];
      for (const [x, z, rotation] of corners) {
        addInstance(
          groups,
          MODULE_URLS[recipe.corner],
          multiply(parent, matrixAt(x, y, z, rotation, 0.96)),
        );
      }
    }
  }

  const roofY = recipe.stories * 3.12 - (recipe.footprint === "tower" ? 0.2 : 0.35);
  addInstance(
    groups,
    MODULE_URLS[recipe.roof],
    multiply(parent, matrixAt(0, roofY, 0, 0, recipe.roofScale)),
  );

  if (recipe.chimney) {
    addInstance(
      groups,
      MODULE_URLS.chimney,
      multiply(
        parent,
        matrixAt(recipe.footprint === "wide" ? 1.4 : 1.05, roofY + 1.7, -0.4, 0, 0.72),
      ),
    );
  }
  if (recipe.stairs) {
    addInstance(
      groups,
      MODULE_URLS.stairs,
      multiply(parent, matrixAt(0, -0.08, depth + 1.02, 0, 0.78)),
    );
  }
  if (recipe.balcony) {
    addInstance(
      groups,
      MODULE_URLS.balcony,
      multiply(parent, matrixAt(0, 3.08, depth + 0.28, 0, 0.78)),
    );
  }
  if (recipe.vine) {
    addInstance(groups, MODULE_URLS.vine, multiply(parent, matrixAt(-1.1, 1.78, 2.02, 0, 0.82)));
  }
  if (options.enchanted) {
    addInstance(
      groups,
      MODULE_URLS.vine,
      multiply(parent, matrixAt(1.08, recipe.stories > 1 ? 2.85 : 1.64, 2.04, 0, 0.76)),
    );
  }
  if (!options.hero || recipe.annex === "none") return;
  const annexRecipeId: ArchitectureRecipeId =
    recipe.annex === "tower-wing"
      ? "stone-observatory"
      : recipe.annex === "brick-wing"
        ? "brick-corner-workshop"
        : "plaster-shutter-cottage";
  const annexSide = options.compound === "village" ? 1 : -1;
  const annex = multiply(parent, matrixAt(annexSide * 2, 0, -0.35, annexSide * -0.1, 0.34));
  addBuildingAssembly(groups, ARCHITECTURE_RECIPES[annexRecipeId], annex, {
    compound: options.compound,
    hero: false,
    enchanted: options.enchanted,
  });
}

type PlannedStructure = PlannedScatter["buildings"][number] | PlannedScatter["landmarks"][number];

const COMPOUND_PROP_FOOTPRINT_RADIUS: Readonly<Record<GroundCompoundProp, number>> = {
  fence: 1.05,
  // Rounded above shipped GLB AABB-corner radii: stairs 1.46987, wagon 3.29913.
  stairs: 1.5,
  wagon: 3.35,
};

function validCompoundPropFootprint(
  plan: WorldPlan,
  point: Readonly<{ x: number; z: number }>,
  radius: number,
  structures: ReadonlyArray<PlannedStructure>,
): boolean {
  const terrainSamples = Array.from({ length: 9 }, (_, index) => {
    if (index === 0) return point;
    const angle = ((index - 1) / 8) * Math.PI * 2;
    return {
      x: point.x + Math.cos(angle) * radius,
      z: point.z + Math.sin(angle) * radius,
    };
  });
  if (
    terrainSamples.some((sample) => {
      const region = classifyPlannedTerrainRegion(plan, sample.x, sample.z);
      return (
        !region.inside ||
        region.water !== null ||
        region.material === "shore" ||
        region.slopeDegrees > 18
      );
    })
  ) {
    return false;
  }
  return structures.every(
    (structure) =>
      Math.hypot(
        point.x - structure.transform.position.x,
        point.z - structure.transform.position.z,
      ) >=
      radius + structure.footprintRadius + 0.35,
  );
}

function addCompoundProp(
  groups: InstanceGroups,
  plan: WorldPlan,
  compound: HamletCompound,
  structures: ReadonlyArray<PlannedStructure>,
  moduleRole: GroundCompoundProp,
  localX: number,
  localZ: number,
  rotation: number,
  scale = 1,
) {
  const point = compoundPoint(compound, localX, localZ);
  const footprintRadius = COMPOUND_PROP_FOOTPRINT_RADIUS[moduleRole] * scale;
  if (!validCompoundPropFootprint(plan, point, footprintRadius, structures)) return;
  addInstance(
    groups,
    MODULE_URLS[moduleRole],
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
  vocabulary: RepositoryAssetVocabulary,
  structures: ReadonlyArray<PlannedStructure>,
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
      structures,
      "fence",
      localX,
      localZ,
      rotation,
      fenceScale,
    );
  }

  const propPoints: ReadonlyArray<readonly [number, number, number]> =
    compound.identity === "productive"
      ? [
          [4.7, 1.8, -0.72],
          [1.6, 4.4, -0.2],
        ]
      : compound.identity === "village"
        ? [
            [-4.2, 2.8, 0.64],
            [3.8, 3.7, -0.35],
          ]
        : [
            [0, 4.6, 0],
            [-4.1, 2.4, 0.4],
          ];
  for (const [index, moduleRole] of vocabulary.compoundPropPriority[compound.identity]
    .slice(0, 2)
    .entries()) {
    const point = propPoints[index]!;
    const scale =
      moduleRole === "wagon" ? (index === 0 ? 0.9 : 0.78) : moduleRole === "stairs" ? 0.7 : 1;
    addCompoundProp(
      groups,
      plan,
      compound,
      structures,
      moduleRole,
      point[0],
      point[1],
      point[2],
      scale,
    );
  }
}

function createArchitectureGroups(scatter: PlannedScatter, plan: WorldPlan): InstanceGroups {
  const groups: InstanceGroups = new Map();
  const compounds = createHamletCompounds(plan, scatter);
  const structures = [
    ...scatter.buildings.map((building) => ({ ...building, landmark: false as const })),
    ...scatter.landmarks.map((landmark) => ({ ...landmark, landmark: true as const })),
  ];
  const vocabulary = createRepositoryAssetVocabulary({
    placementKey: plan.placementKey,
    geographyId: plan.topology.geography.id,
    archetype: plan.identity.archetype,
    repositoryIdentity: `${plan.repository.id}:${plan.repository.owner}/${plan.repository.name}:${plan.repository.commitSha}`,
  });
  for (const structure of structures) {
    const compound = structure.hamletId ? compounds.get(structure.hamletId) : undefined;
    const { desiredHeightScale, desiredVisualScale, hero, recipeId } = structure.architecture;
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
    const parent = matrixAt(x, y, z, structure.transform.rotationY, [
      desiredVisualScale,
      desiredHeightScale,
      desiredVisualScale,
    ]);
    addBuildingAssembly(groups, ARCHITECTURE_RECIPES[recipeId], parent, {
      compound: compound?.identity ?? "village",
      hero,
      enchanted: plan.worldTheme === "enchanted-forest",
    });
  }

  for (const compound of compounds.values()) {
    addCompoundGroundLanguage(groups, plan, compound, vocabulary, structures);
  }
  return groups;
}

function usePlannedArchitectureDetailTextures(
  gate: PlannedArchitectureDetailRuntimeGate,
): PlannedArchitectureDetailRuntimeTextures | null {
  const maximumAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const [owner, setOwner] = useState<PlannedArchitectureDetailRuntimeTextureOwner | null>(null);
  const ownerRef = useRef<PlannedArchitectureDetailRuntimeTextureOwner | null>(null);
  const mountedRef = useRef(true);
  const latestGateRef = useRef(gate);
  const attemptedLoadRef = useRef<string | null>(null);

  useEffect(() => {
    latestGateRef.current = gate;
  }, [gate]);

  useEffect(() => {
    if (!gate.detailEnabled || gate.quality !== "high") {
      const previousOwner = ownerRef.current;
      ownerRef.current = null;
      attemptedLoadRef.current = null;
      // The current render has already removed the shader patch. Dispose after
      // finalized child materials complete the same passive-effect cleanup.
      queueMicrotask(() => {
        previousOwner?.dispose();
        if (mountedRef.current) setOwner(null);
      });
      return;
    }
    if (gate.navigationMode !== "walk" || ownerRef.current) return;

    const loadKey = `high:${maximumAnisotropy}`;
    if (attemptedLoadRef.current === loadKey) return;
    attemptedLoadRef.current = loadKey;
    void loadPlannedArchitectureDetailRuntimeTextures(gate, { maximumAnisotropy }).then(
      (nextOwner) => {
        if (nextOwner.status !== "ready") {
          attemptedLoadRef.current = null;
          nextOwner.dispose();
          return;
        }
        const latestGate = latestGateRef.current;
        if (!mountedRef.current || !latestGate.detailEnabled || latestGate.quality !== "high") {
          nextOwner.dispose();
          return;
        }
        ownerRef.current?.dispose();
        ownerRef.current = nextOwner;
        setOwner(nextOwner);
      },
    );
  }, [gate, maximumAnisotropy]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const previousOwner = ownerRef.current;
      ownerRef.current = null;
      if (previousOwner) queueMicrotask(() => previousOwner.dispose());
    };
  }, []);

  return gate.detailEnabled && gate.navigationMode === "walk" && gate.quality === "high"
    ? (owner?.textures ?? null)
    : null;
}

function ArchitectureLayer({
  plan,
  scatter,
  navigationMode,
  quality,
}: Readonly<{
  plan: WorldPlan;
  scatter: PlannedScatter;
  navigationMode: KingdomNavigationMode;
  quality: Quality;
}>) {
  const groups = useMemo(() => createArchitectureGroups(scatter, plan), [plan, scatter]);
  const detailGate = useMemo<PlannedArchitectureDetailRuntimeGate>(
    () => ({ detailEnabled: true, navigationMode, quality }),
    [navigationMode, quality],
  );
  const runtimeTextures = usePlannedArchitectureDetailTextures(detailGate);
  const architectureDetail = useMemo<ArchitectureDetailContext>(
    () => ({ gate: detailGate, runtimeTextures }),
    [detailGate, runtimeTextures],
  );
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
          architectureDetail={architectureDetail}
        />
      ))}
    </group>
  );
}

function createTreeGroups(
  instances: ReadonlyArray<PlannedWalkTreeDetailCandidate>,
): Map<string, THREE.Matrix4[]> {
  const groups = new Map<string, THREE.Matrix4[]>();
  for (const instance of instances) addInstance(groups, instance.detailKey, instance.matrix);
  return groups;
}

function createTreeLodInstances(
  scatter: PlannedScatter,
  plan: WorldPlan,
  enrichment: PlannedVisualEnrichment,
  themeLayer: PlannedWorldThemeLayer,
): ReadonlyArray<PlannedWalkTreeDetailCandidate> {
  const instances: PlannedWalkTreeDetailCandidate[] = [];
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
    const palette = plannedTreeLodPaletteFor(plan.appearance.season, {
      paletteRole: tree.paletteRole,
      ancient,
    });
    const stats = walkTreeAssetStats(treeUrl);
    instances.push({
      id: tree.id,
      palette,
      matrix: matrixAt(x, y, z, tree.transform.rotationY, [visualScale, visualScale, visualScale]),
      detailKey: treeUrl,
      detailSourcePrimitives: stats.sourcePrimitives,
      detailTriangles: stats.triangles,
      lodTriangles: plannedThemeTreeTrianglesPerInstance(plan.worldTheme, palette),
    });
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
    const palette = plannedTreeLodPaletteFor(plan.appearance.season, {
      paletteRole: tree.paletteRole,
      ancient: false,
    });
    const stats = walkTreeAssetStats(treeUrl);
    instances.push({
      id: tree.id,
      palette,
      matrix: matrixAt(tree.position.x, y, tree.position.z, tree.rotationY, [
        tree.scale.x * themeScale,
        tree.scale.y * themeScale,
        tree.scale.z * themeScale,
      ]),
      detailKey: treeUrl,
      detailSourcePrimitives: stats.sourcePrimitives,
      detailTriangles: stats.triangles,
      lodTriangles: plannedThemeTreeTrianglesPerInstance(plan.worldTheme, palette),
    });
  }
  return instances;
}

function treeCanopyColor(palette: PlannedTreeLodPalette, plan: WorldPlan): THREE.Color {
  const foliage = plan.appearance.foliage;
  const canopyColors: readonly [string, string] =
    palette === "winter"
      ? ["#eef7f6", "#c7e1e4"]
      : palette === "pine"
        ? [foliage.pine[0] ?? "#5f866c", foliage.pine[1] ?? "#789d7a"]
        : palette === "flowering"
          ? [foliage.flowering[0] ?? "#efb7c8", foliage.flowering[1] ?? "#f7d6df"]
          : [foliage.broadleaf[0] ?? "#77a765", foliage.broadleaf[1] ?? "#99c47f"];
  return new THREE.Color(canopyColors[0]).lerp(new THREE.Color(canopyColors[1]), 0.38);
}

function OverviewTreeLodBatch({
  batch,
  plan,
}: Readonly<{ batch: PlannedTreeLodBatch; plan: WorldPlan }>) {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const canopy = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(
    () => createPlannedThemeTreeLodGeometry(batch.palette, plan.worldTheme),
    [batch.palette, plan.worldTheme],
  );
  const colors = useMemo(() => {
    return {
      trunk: new THREE.Color(plan.appearance.foliage.trunk),
      canopy: treeCanopyColor(batch.palette, plan),
    };
  }, [batch.palette, plan]);

  useLayoutEffect(() => {
    for (const [index, matrix] of batch.matrices.entries()) {
      trunk.current?.setMatrixAt(index, matrix);
      canopy.current?.setMatrixAt(index, matrix);
    }
    for (const instance of [trunk.current, canopy.current]) {
      if (!instance) continue;
      instance.instanceMatrix.needsUpdate = true;
      instance.computeBoundingBox();
      instance.computeBoundingSphere();
    }
  }, [batch.matrices]);
  useEffect(() => () => disposePlannedTreeLodGeometry(geometry), [geometry]);

  return (
    <group name={`planned-tree-overview-lod-${batch.palette}`}>
      <instancedMesh
        ref={trunk}
        args={[geometry.trunk, undefined, batch.matrices.length]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={colors.trunk} roughness={1} />
      </instancedMesh>
      <instancedMesh
        ref={canopy}
        args={[geometry.canopy, undefined, batch.matrices.length]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={colors.canopy}
          roughness={0.88}
          emissive={colors.canopy}
          emissiveIntensity={plan.worldTheme === "enchanted-forest" ? 0.1 : 0.04}
        />
      </instancedMesh>
    </group>
  );
}

function WalkTreeLodFamilyBatch({
  batch,
  plan,
}: Readonly<{ batch: PlannedWalkTreeLodBatch; plan: WorldPlan }>) {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const canopy = useRef<THREE.InstancedMesh>(null);
  const representativePalette = batch.family === "conifer" ? "pine" : "broadleaf";
  const geometry = useMemo(
    () => createPlannedThemeTreeLodGeometry(representativePalette, plan.worldTheme),
    [plan.worldTheme, representativePalette],
  );
  const canopyColors = useMemo(
    () => batch.palettes.map((palette) => treeCanopyColor(palette, plan)),
    [batch.palettes, plan],
  );

  useLayoutEffect(() => {
    batch.matrices.forEach((matrix, index) => {
      trunk.current?.setMatrixAt(index, matrix);
      canopy.current?.setMatrixAt(index, matrix);
      const color = canopyColors[index];
      if (color) canopy.current?.setColorAt(index, color);
    });
    for (const instance of [trunk.current, canopy.current]) {
      if (!instance) continue;
      instance.instanceMatrix.needsUpdate = true;
      if (instance.instanceColor) instance.instanceColor.needsUpdate = true;
      instance.computeBoundingBox();
      instance.computeBoundingSphere();
    }
  }, [batch.matrices, canopyColors]);
  useEffect(() => () => disposePlannedTreeLodGeometry(geometry), [geometry]);

  return (
    <group name={`planned-tree-walk-lod-${batch.family}`}>
      <instancedMesh
        ref={trunk}
        args={[geometry.trunk, undefined, batch.matrices.length]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={plan.appearance.foliage.trunk} roughness={1} />
      </instancedMesh>
      <instancedMesh
        ref={canopy}
        args={[geometry.canopy, undefined, batch.matrices.length]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color="#ffffff"
          roughness={0.88}
          emissive="#6d806a"
          emissiveIntensity={plan.worldTheme === "enchanted-forest" ? 0.08 : 0.025}
        />
      </instancedMesh>
    </group>
  );
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
  navigationMode,
}: Readonly<{
  scatter: PlannedScatter;
  plan: WorldPlan;
  enrichment: PlannedVisualEnrichment;
  themeLayer: PlannedWorldThemeLayer;
  navigationMode: KingdomNavigationMode;
}>) {
  const treeMode = plannedTreeLodMode(navigationMode);
  const overviewTrees = useMemo(
    () =>
      treeMode === "overview-lod"
        ? createPlannedTreeLodBatches(createTreeLodInstances(scatter, plan, enrichment, themeLayer))
        : [],
    [enrichment, plan, scatter, themeLayer, treeMode],
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
      {overviewTrees.map((batch) => (
        <OverviewTreeLodBatch key={batch.palette} batch={batch} plan={plan} />
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

function treeDetailFoliagePalette(url: string): FoliagePalette | undefined {
  if (url.includes("/kenney/")) return undefined;
  if (url.includes("CommonTree_2") || url.includes("TwistedTree_1")) return "flowering";
  return url.includes("Pine") ? "pine" : "broadleaf";
}

function WalkTreeHybridLayer({
  scatter,
  plan,
  enrichment,
  themeLayer,
  livingSpawn,
}: Readonly<{
  scatter: PlannedScatter;
  plan: WorldPlan;
  enrichment: PlannedVisualEnrichment;
  themeLayer: PlannedWorldThemeLayer;
  livingSpawn: LivingWalkSpawn | null;
}>) {
  const instances = useMemo(
    () => createTreeLodInstances(scatter, plan, enrichment, themeLayer),
    [enrichment, plan, scatter, themeLayer],
  );
  const focus = livingSpawn?.position ?? plan.topology.envelope.center;
  const hybrid = useMemo(() => selectPlannedWalkTreeHybrid(instances, focus), [focus, instances]);
  const farBatches = useMemo(() => createPlannedWalkTreeLodBatches(hybrid.far), [hybrid.far]);
  const detailGroups = useMemo(() => createTreeGroups(hybrid.detail), [hybrid.detail]);

  return (
    <group name="planned-walk-tree-hybrid">
      {farBatches.map((batch) => (
        <WalkTreeLodFamilyBatch key={batch.family} batch={batch} plan={plan} />
      ))}
      {[...detailGroups.entries()].map(([url, matrices]) => (
        <AssetInstances
          key={url}
          url={url}
          matrices={matrices}
          plan={plan}
          targetHeight={8.6}
          foliagePalette={treeDetailFoliagePalette(url)}
          castShadow
        />
      ))}
    </group>
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
  navigationMode,
}: Readonly<{
  layer: PlannedWorldThemeLayer;
  plan: WorldPlan;
  reducedMotion: boolean;
  quality: Quality;
  navigationMode: KingdomNavigationMode;
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
  const lodMode = plannedThemeLodMode(navigationMode);
  const repeatedFeatureGeometry = useMemo(
    () =>
      layer.worldTheme === "enchanted-forest" ? createPlannedEnchantedOrbitGeometry(layer) : null,
    [layer],
  );
  useEffect(
    () => () => {
      if (repeatedFeatureGeometry) {
        disposePlannedEnchantedOrbitGeometry(repeatedFeatureGeometry);
      }
    },
    [repeatedFeatureGeometry],
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
      {repeatedFeatureGeometry?.runestoneGlows ? (
        <mesh
          name={
            lodMode === "orbit-batched"
              ? "enchanted-runestone-glows-orbit-batch"
              : "enchanted-runestone-glows-walk-batch"
          }
          geometry={repeatedFeatureGeometry.runestoneGlows}
        >
          <meshBasicMaterial
            color={plan.appearance.magic.primary}
            transparent
            opacity={0.72}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ) : null}
      {repeatedFeatureGeometry?.rootArches ? (
        <mesh
          name={
            lodMode === "orbit-batched"
              ? "enchanted-root-arches-orbit-batch"
              : "enchanted-root-arches-walk-batch"
          }
          geometry={repeatedFeatureGeometry.rootArches}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color={plan.appearance.foliage.trunk}
            roughness={1}
            emissive={plan.appearance.magic.primary}
            emissiveIntensity={0.055 * plan.appearance.magic.glowIntensity}
          />
        </mesh>
      ) : null}
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
  plan,
  reducedMotion,
  updateWalkTargetPosition,
}: Readonly<{
  role: PlannedScatter["wildlife"][number]["assetRole"];
  behavior: PlannedScatter["wildlife"][number]["behavior"];
  position: VecTuple;
  rotationY: number;
  scale: number;
  emphasis: number;
  wanderPath: ReadonlyArray<VecTuple>;
  motionOffset: number;
  plan: WorldPlan;
  reducedMotion: boolean;
  updateWalkTargetPosition?: WalkTargetPositionUpdater;
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
  const travelled = useRef(wildlifeMotionStartDistance(motion, motionOffset));
  useLayoutEffect(() => {
    travelled.current = wildlifeMotionStartDistance(motion, motionOffset);
    updateWalkTargetPosition?.(
      position[0],
      position[1] + ANIMAL_TARGET_HEIGHT[role] * scale * emphasis * 0.52,
      position[2],
    );
  }, [emphasis, motion, motionOffset, position, role, scale, updateWalkTargetPosition]);
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
    let segment = motion.segments[motion.segments.length - 1]!;
    for (let index = 0; index < motion.segments.length; index += 1) {
      const candidate = motion.segments[index]!;
      if (remaining <= candidate.length) {
        segment = candidate;
        break;
      }
      remaining -= candidate.length;
    }
    const progress = THREE.MathUtils.clamp(remaining / segment.length, 0, 1);
    const x = THREE.MathUtils.lerp(segment.start[0], segment.end[0], progress);
    const z = THREE.MathUtils.lerp(segment.start[2], segment.end[2], progress);
    root.current.position.set(
      x,
      samplePlannedTerrainHeight(plan, x, z) + WILDLIFE_GROUND_OFFSET,
      z,
    );
    updateWalkTargetPosition?.(
      x,
      root.current.position.y + ANIMAL_TARGET_HEIGHT[role] * scale * emphasis * 0.52,
      z,
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

type PlannedWildlifeActor = Readonly<{
  animal: PlannedScatter["wildlife"][number];
  emphasis: number;
  position: VecTuple;
  wanderPath: ReadonlyArray<VecTuple>;
  motion: WildlifeMotion | null;
  motionOffset: number;
  updateWalkTargetPosition?: WalkTargetPositionUpdater;
}>;

function OverviewWildlifeRoleBatch({
  role,
  actors,
  plan,
  reducedMotion,
}: Readonly<{
  role: PlannedWildlifeActor["animal"]["assetRole"];
  actors: ReadonlyArray<PlannedWildlifeActor>;
  plan: WorldPlan;
  reducedMotion: boolean;
}>) {
  const { scene } = useGLTF(ANIMAL_URLS[role]);
  const template = useMemo(() => templateAsset(scene, true), [scene]);
  const meshes = useRef<Array<THREE.InstancedMesh | null>>([]);
  const travelled = useRef(
    actors.map((actor) => wildlifeMotionStartDistance(actor.motion, actor.motionOffset)),
  );
  const writeMatrices = (delta: number) => {
    const heightNormalization = ANIMAL_TARGET_HEIGHT[role] / template.height;
    const composed = new THREE.Matrix4();
    actors.forEach((actor, actorIndex) => {
      const motion = actor.motion;
      if (!reducedMotion && actor.animal.behavior === "wander" && motion) {
        const speed = role === "fox" ? 1.05 : role === "stag" ? 0.72 : 0.82;
        travelled.current[actorIndex] =
          ((travelled.current[actorIndex] ?? 0) + Math.min(delta, 0.05) * speed) %
          motion.totalLength;
      }
      let x = actor.position[0];
      let z = actor.position[2];
      let rotationY = actor.animal.transform.rotationY;
      if (actor.animal.behavior === "wander" && motion) {
        let remaining = travelled.current[actorIndex] ?? 0;
        let segment = motion.segments[motion.segments.length - 1]!;
        for (const candidate of motion.segments) {
          if (remaining <= candidate.length) {
            segment = candidate;
            break;
          }
          remaining -= candidate.length;
        }
        const progress = THREE.MathUtils.clamp(remaining / segment.length, 0, 1);
        x = THREE.MathUtils.lerp(segment.start[0], segment.end[0], progress);
        z = THREE.MathUtils.lerp(segment.start[2], segment.end[2], progress);
        rotationY = Math.atan2(
          segment.end[0] - segment.start[0],
          segment.end[2] - segment.start[2],
        );
      }
      const y = samplePlannedTerrainHeight(plan, x, z) + WILDLIFE_GROUND_OFFSET;
      actor.updateWalkTargetPosition?.(
        x,
        y + ANIMAL_TARGET_HEIGHT[role] * actor.animal.transform.scale.y * actor.emphasis * 0.52,
        z,
      );
      const actorMatrix = matrixAt(
        x,
        y,
        z,
        rotationY,
        actor.animal.transform.scale.y * actor.emphasis * heightNormalization,
      );
      template.primitives.forEach((primitive, primitiveIndex) => {
        meshes.current[primitiveIndex]?.setMatrixAt(
          actorIndex,
          composed.multiplyMatrices(actorMatrix, primitive.sourceMatrix),
        );
      });
    });
    meshes.current.forEach((mesh) => {
      if (!mesh) return;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    });
  };
  useLayoutEffect(() => {
    travelled.current = actors.map((actor) =>
      wildlifeMotionStartDistance(actor.motion, actor.motionOffset),
    );
    writeMatrices(0);
  });
  useFrame((_, delta) => {
    if (reducedMotion) return;
    writeMatrices(delta);
  });
  return (
    <group name={`overview-wildlife:${role}`} dispose={null}>
      {template.primitives.map((primitive, primitiveIndex) => (
        <instancedMesh
          key={primitive.id}
          ref={(mesh) => {
            meshes.current[primitiveIndex] = mesh;
          }}
          args={[primitive.geometry, primitive.material, actors.length]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}

function WalkWildlifeRoleBatch({
  role,
  actors,
  plan,
  reducedMotion,
}: Readonly<{
  role: PlannedWildlifeActor["animal"]["assetRole"];
  actors: ReadonlyArray<PlannedWildlifeActor>;
  plan: WorldPlan;
  reducedMotion: boolean;
}>) {
  const geometry = useMemo(() => createPlannedWalkWildlifeLodGeometry(role), [role]);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        vertexColors: true,
        roughness: 0.88,
        metalness: 0,
      }),
    [],
  );
  const mesh = useRef<THREE.InstancedMesh>(null);
  const travelled = useRef(
    actors.map((actor) => wildlifeMotionStartDistance(actor.motion, actor.motionOffset)),
  );
  const writeMatrices = (delta: number) => {
    actors.forEach((actor, actorIndex) => {
      const motion = actor.motion;
      if (!reducedMotion && actor.animal.behavior === "wander" && motion) {
        const speed = role === "fox" ? 1.05 : role === "stag" ? 0.72 : 0.82;
        travelled.current[actorIndex] =
          ((travelled.current[actorIndex] ?? 0) + Math.min(delta, 0.05) * speed) %
          motion.totalLength;
      }
      let x = actor.position[0];
      let z = actor.position[2];
      let rotationY = actor.animal.transform.rotationY;
      if (actor.animal.behavior === "wander" && motion) {
        let remaining = travelled.current[actorIndex] ?? 0;
        let segment = motion.segments[motion.segments.length - 1]!;
        for (const candidate of motion.segments) {
          if (remaining <= candidate.length) {
            segment = candidate;
            break;
          }
          remaining -= candidate.length;
        }
        const progress = THREE.MathUtils.clamp(remaining / segment.length, 0, 1);
        x = THREE.MathUtils.lerp(segment.start[0], segment.end[0], progress);
        z = THREE.MathUtils.lerp(segment.start[2], segment.end[2], progress);
        rotationY = Math.atan2(
          segment.end[0] - segment.start[0],
          segment.end[2] - segment.start[2],
        );
      }
      const y = samplePlannedTerrainHeight(plan, x, z) + WILDLIFE_GROUND_OFFSET;
      actor.updateWalkTargetPosition?.(
        x,
        y + ANIMAL_TARGET_HEIGHT[role] * actor.animal.transform.scale.y * actor.emphasis * 0.52,
        z,
      );
      mesh.current?.setMatrixAt(
        actorIndex,
        matrixAt(
          x,
          y,
          z,
          rotationY,
          actor.animal.transform.scale.y * actor.emphasis * ANIMAL_TARGET_HEIGHT[role],
        ),
      );
    });
    if (!mesh.current) return;
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingBox();
    mesh.current.computeBoundingSphere();
  };
  useLayoutEffect(() => {
    travelled.current = actors.map((actor) =>
      wildlifeMotionStartDistance(actor.motion, actor.motionOffset),
    );
    writeMatrices(0);
  });
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame((_, delta) => {
    if (reducedMotion) return;
    writeMatrices(delta);
  });
  return (
    <instancedMesh
      ref={mesh}
      name={`walk-wildlife-far-role-batch:${role}`}
      args={[geometry, material, actors.length]}
      castShadow
      receiveShadow
    />
  );
}

const WALK_ANIMATED_WILDLIFE_RADIUS = 58;
const ANIMAL_SOURCE_PRIMITIVES: Readonly<
  Record<PlannedWildlifeActor["animal"]["assetRole"], number>
> = Object.freeze({ deer: 7, fox: 5, stag: 6 });

function selectWalkAnimatedWildlife(
  actors: ReadonlyArray<PlannedWildlifeActor>,
  livingSpawn: LivingWalkSpawn | null | undefined,
): PlannedWildlifeActor | null {
  if (!livingSpawn) return null;
  const focus = livingSpawn.position;
  const maximumDistanceSquared = WALK_ANIMATED_WILDLIFE_RADIUS ** 2;
  return (
    [...actors]
      .filter((actor) => {
        const deltaX = actor.position[0] - focus.x;
        const deltaZ = actor.position[2] - focus.z;
        return (
          ANIMAL_SOURCE_PRIMITIVES[actor.animal.assetRole] <=
            PLANNED_WALK_WILDLIFE_LOD_CONTRACT.maximumAnimatedSourcePrimitives &&
          deltaX * deltaX + deltaZ * deltaZ <= maximumDistanceSquared
        );
      })
      .sort((first, second) => {
        const firstDistance =
          (first.position[0] - focus.x) ** 2 + (first.position[2] - focus.z) ** 2;
        const secondDistance =
          (second.position[0] - focus.x) ** 2 + (second.position[2] - focus.z) ** 2;
        return firstDistance === secondDistance
          ? first.animal.id.localeCompare(second.animal.id)
          : firstDistance - secondDistance;
      })[0] ?? null
  );
}

function WildlifeLayer({
  scatter,
  plan,
  reducedMotion,
  navigationMode,
  walkTargetUpdaters,
  livingSpawn,
}: Readonly<{
  scatter: PlannedScatter;
  plan: WorldPlan;
  reducedMotion: boolean;
  navigationMode: KingdomNavigationMode;
  walkTargetUpdaters?: ReadonlyMap<string, WalkTargetPositionUpdater>;
  livingSpawn?: LivingWalkSpawn | null;
}>) {
  const actors = useMemo(
    () =>
      scatter.wildlife.map((animal, index) => {
        const x = animal.transform.position.x;
        const z = animal.transform.position.z;
        return {
          animal,
          emphasis: index < 3 ? 1.32 : 1.16,
          position: [
            x,
            samplePlannedTerrainHeight(plan, x, z) + WILDLIFE_GROUND_OFFSET,
            z,
          ] as const,
          wanderPath: animal.wanderPath.map(
            (waypoint) =>
              [
                waypoint.x,
                samplePlannedTerrainHeight(plan, waypoint.x, waypoint.z) + WILDLIFE_GROUND_OFFSET,
                waypoint.z,
              ] as const,
          ),
          motion: buildRetracedWildlifeMotion(
            animal.wanderPath.map(
              (waypoint) =>
                [
                  waypoint.x,
                  samplePlannedTerrainHeight(plan, waypoint.x, waypoint.z) + WILDLIFE_GROUND_OFFSET,
                  waypoint.z,
                ] as const,
            ),
          ),
          motionOffset: stableFraction(`${animal.id}:motion`),
          updateWalkTargetPosition: walkTargetUpdaters?.get(animal.id),
        };
      }),
    [plan, scatter, walkTargetUpdaters],
  );
  const animatedActor = useMemo(
    () => (navigationMode === "walk" ? selectWalkAnimatedWildlife(actors, livingSpawn) : null),
    [actors, livingSpawn, navigationMode],
  );
  const batchedActors = useMemo(
    () =>
      animatedActor
        ? actors.filter((actor) => actor.animal.id !== animatedActor.animal.id)
        : actors,
    [actors, animatedActor],
  );
  const overviewBatches = useMemo(
    () =>
      (["deer", "fox", "stag"] as const).flatMap((role) => {
        const roleActors = batchedActors.filter((actor) => actor.animal.assetRole === role);
        return roleActors.length > 0 ? [{ role, actors: roleActors }] : [];
      }),
    [batchedActors],
  );
  return (
    <group
      name={
        navigationMode === "walk"
          ? "planned-wildlife-walk-hybrid"
          : "planned-wildlife-overview-batches"
      }
    >
      {overviewBatches.map((batch) =>
        navigationMode === "walk" ? (
          <WalkWildlifeRoleBatch
            key={batch.role}
            role={batch.role}
            actors={batch.actors}
            plan={plan}
            reducedMotion={reducedMotion}
          />
        ) : (
          <OverviewWildlifeRoleBatch
            key={batch.role}
            role={batch.role}
            actors={batch.actors}
            plan={plan}
            reducedMotion={reducedMotion}
          />
        ),
      )}
      {animatedActor ? (
        <AnimalActor
          key={animatedActor.animal.id}
          role={animatedActor.animal.assetRole}
          behavior={animatedActor.animal.behavior}
          position={animatedActor.position}
          rotationY={animatedActor.animal.transform.rotationY}
          scale={animatedActor.animal.transform.scale.y}
          emphasis={animatedActor.emphasis}
          wanderPath={animatedActor.wanderPath}
          motionOffset={animatedActor.motionOffset}
          plan={plan}
          reducedMotion={reducedMotion}
          updateWalkTargetPosition={animatedActor.updateWalkTargetPosition}
        />
      ) : null}
    </group>
  );
}

function PlannedInteractionIndex({
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
  const records = useMemo(
    () => createPlannedScenePickRecords(world, plan, scatter),
    [plan, scatter, world],
  );
  const proxy = useMemo(() => new PlannedScenePickProxy(records), [records]);
  return (
    <primitive
      object={proxy}
      dispose={null}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        const record = plannedPickRecordForInstance(records, event.instanceId);
        if (!record) return;
        consumePointer(event);
        onSelect(record.selection);
      }}
      onDoubleClick={(event: ThreeEvent<MouseEvent>) => {
        const record = plannedPickRecordForInstance(records, event.instanceId);
        if (!record?.sourceUrl) return;
        consumePointer(event);
        window.open(record.sourceUrl, "_blank", "noopener,noreferrer");
      }}
      onPointerEnter={(event: ThreeEvent<PointerEvent>) => {
        const record = plannedPickRecordForInstance(records, event.instanceId);
        if (!record) return;
        consumePointer(event);
        setCursor(true);
        onHover(record.selection);
      }}
      onPointerLeave={() => {
        setCursor(false);
        onHover(null);
      }}
    />
  );
}

function PlannedPaths({ plan, scatter }: Readonly<{ plan: WorldPlan; scatter: PlannedScatter }>) {
  const paths = useMemo(() => createPlannedHamletPathBatch(plan, scatter), [plan, scatter]);
  useEffect(() => () => disposePlannedHamletPathBatch(paths), [paths]);
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
  if (paths.drawCallCount === 0) return null;
  return (
    <group name="planned-hamlet-paths">
      <mesh name="hamlet-path-borders" geometry={paths.border} receiveShadow>
        <meshStandardMaterial color={borderColor} roughness={1} />
      </mesh>
      <mesh name="hamlet-path-surfaces" geometry={paths.surface} receiveShadow>
        <meshStandardMaterial
          color={surfaceColor}
          roughness={1}
          emissive={surfaceColor}
          emissiveIntensity={0.023}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
    </group>
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
  const rings = useRef<THREE.InstancedMesh>(null);
  const disks = useRef<THREE.InstancedMesh>(null);
  const rotation = useRef(0);
  const instances = useMemo(() => createPlannedPortalInstances(world, plan), [plan, world]);
  const writeMatrices = () => {
    if (!rings.current || !disks.current) return;
    writePlannedPortalMatrices(instances, rotation.current, rings.current, disks.current);
  };
  useLayoutEffect(() => {
    writeMatrices();
    rings.current?.computeBoundingSphere();
    disks.current?.computeBoundingSphere();
  });
  useFrame((_, delta) => {
    if (reducedMotion) return;
    rotation.current += delta * 0.17;
    writeMatrices();
  });
  if (instances.length === 0) return null;
  return (
    <group
      name="repository-portals"
      onPointerDown={(event) => {
        const portal = plannedPortalForInstance(instances, event.instanceId);
        if (!portal) return;
        consumePointer(event);
        onSelect({ kind: "portal", portal });
      }}
      onDoubleClick={(event) => {
        const portal = plannedPortalForInstance(instances, event.instanceId);
        if (!portal) return;
        consumePointer(event);
        onEnter(portal);
      }}
      onPointerEnter={(event) => {
        const portal = plannedPortalForInstance(instances, event.instanceId);
        if (!portal) return;
        consumePointer(event);
        setCursor(true);
        onHover({ kind: "portal", portal });
      }}
      onPointerLeave={() => {
        setCursor(false);
        onHover(null);
      }}
    >
      <instancedMesh ref={rings} args={[undefined, undefined, instances.length]}>
        <torusGeometry args={[1.55, 0.19, 10, 32]} />
        <meshStandardMaterial
          color={plan.appearance.atmosphere.sunlight}
          emissive={plan.appearance.terrain.water}
          emissiveIntensity={1.1}
        />
      </instancedMesh>
      <instancedMesh ref={disks} args={[undefined, undefined, instances.length]}>
        <circleGeometry args={[1.3, 32]} />
        <meshBasicMaterial
          color={plan.appearance.terrain.water}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
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

function OrbitCameraRig({
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
    // The interior sampling grid can miss a narrow peninsula between cells.
    // Include the authored perimeter explicitly so full-silhouette fitting
    // guarantees real phone edge clearance rather than sampled clearance.
    for (const point of getPlannedTerrainDefinition(plan).outline) {
      points.push(
        new THREE.Vector3(point.x, samplePlannedTerrainHeight(plan, point.x, point.z), point.z),
      );
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
    const fit = fitPlannedOverview({
      viewportWidth: size.width,
      viewportHeight: size.height,
      projectedWidth: extentX,
      projectedHeight: extentY,
      repositoryProgress: plan.topology.repositoryScale.logarithmicProgress,
      portrait: isPortrait,
    });
    const projectedCenterX = (minX + maxX) / 2;
    const projectedCenterY = (minY + maxY) / 2;
    const fittedTarget = target
      .clone()
      .addScaledVector(right, projectedCenterX)
      .addScaledVector(
        cameraUp,
        projectedCenterY + fit.verticalOffsetPixels / Math.max(1, fit.zoom),
      );
    return {
      zoom: fit.zoom,
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
    const alpha = plannedCameraTransitionAlpha(delta, reducedMotion);
    camera.current.position.lerp(goalPosition.current, alpha);
    controls.current.target.lerp(focus.current, alpha);
    camera.current.zoom = THREE.MathUtils.lerp(camera.current.zoom, goalZoom.current, alpha);
    camera.current.updateProjectionMatrix();
    controls.current.update();
    if (
      isPlannedCameraTransitionSettled({
        position: camera.current.position.distanceTo(goalPosition.current),
        target: controls.current.target.distanceTo(focus.current),
        zoom: Math.abs(camera.current.zoom - goalZoom.current),
      })
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

function PlannedWalkRuntime({
  plan,
  scatter,
  enrichment,
  themeLayer,
  landUse,
  obstacles,
  targets,
  walkTargetUpdaters,
  runtime,
  reducedMotion,
  quality,
  onLockChange,
  onStatusChange,
  onTargetSelect,
}: Readonly<{
  plan: WorldPlan;
  scatter: PlannedScatter;
  enrichment: PlannedVisualEnrichment;
  themeLayer: PlannedWorldThemeLayer;
  landUse: ReturnType<typeof createPlannedLandUse>;
  obstacles: ReadonlyArray<WalkObstacle>;
  targets: ReadonlyArray<WalkTarget>;
  walkTargetUpdaters: ReadonlyMap<string, WalkTargetPositionUpdater>;
  runtime: PlannedWalkRuntimePlan;
  reducedMotion: boolean;
  quality: Quality;
  onLockChange: (locked: boolean) => void;
  onStatusChange: (status: WalkViewStatus) => void;
  onTargetSelect: (target: WalkTarget) => void;
}>) {
  return (
    <>
      <Suspense fallback={null}>
        <WalkTreeHybridLayer
          scatter={scatter}
          plan={plan}
          enrichment={enrichment}
          themeLayer={themeLayer}
          livingSpawn={runtime.livingSpawn}
        />
        <WildlifeLayer
          scatter={scatter}
          plan={plan}
          reducedMotion={reducedMotion}
          navigationMode="walk"
          walkTargetUpdaters={walkTargetUpdaters}
          livingSpawn={runtime.livingSpawn}
        />
      </Suspense>
      <PlannedWalkDetail
        plan={plan}
        detail={runtime.detail}
        reducedMotion={reducedMotion}
        quality={quality}
      />
      {runtime.regional ? (
        <>
          <PlannedRegionalExperienceLayer
            plan={plan}
            regional={runtime.regional}
            mount="far"
            quality={quality}
            reducedMotion={reducedMotion}
          />
          <Suspense fallback={null}>
            <PlannedRegionalExperienceLayer
              plan={plan}
              regional={runtime.regional}
              mount="near"
              quality={quality}
              reducedMotion={reducedMotion}
            />
          </Suspense>
        </>
      ) : null}
      <KingdomWalkControls
        plan={plan}
        landUse={landUse}
        obstacles={obstacles}
        targets={targets}
        navigationGrid={runtime.navigationGrid}
        livingSpawn={runtime.livingSpawn}
        reducedMotion={reducedMotion}
        onLockChange={onLockChange}
        onStatusChange={onStatusChange}
        onTargetSelect={onTargetSelect}
      />
    </>
  );
}

function PlannedWalkPreparationState({
  plan,
  failed,
  onLockChange,
  onStatusChange,
}: Readonly<{
  plan: WorldPlan;
  failed: boolean;
  onLockChange: (locked: boolean) => void;
  onStatusChange: (status: WalkViewStatus) => void;
}>) {
  useEffect(() => {
    onLockChange(false);
    onStatusChange(failed ? FAILED_WALK_STATUS : PREPARING_WALK_STATUS);
  }, [failed, onLockChange, onStatusChange]);
  return failed ? null : <LoadingMarker plan={plan} />;
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
  navigationMode = "orbit",
  onWalkLockChange = ignoreWalkLockChange,
  onWalkStatusChange = ignoreWalkStatusChange,
  onWalkTargetSelect,
}: KingdomSceneProps) {
  const plan = useMemo(() => createWorldPlan(world), [world]);
  const scatter = useMemo(() => createPlannedScatter(world, plan), [plan, world]);
  const enrichment = useMemo(() => createPlannedVisualEnrichment(plan, scatter), [plan, scatter]);
  const landUse = useMemo(
    () => createPlannedLandUse(plan, scatter, enrichment),
    [enrichment, plan, scatter],
  );
  const themeLayer = useMemo(() => createPlannedWorldThemeLayer(plan, scatter), [plan, scatter]);
  const walkObstacles = useMemo<ReadonlyArray<WalkObstacle>>(
    () => [
      ...[...scatter.buildings, ...scatter.landmarks].map((item) => ({
        x: item.transform.position.x,
        z: item.transform.position.z,
        radius: item.footprintRadius,
      })),
      ...createLandUseWalkObstacles(landUse),
    ],
    [landUse, scatter],
  );
  const walkInteraction = useMemo(
    () => createRepositoryWalkInteraction(world, plan, scatter),
    [plan, scatter, world],
  );
  const walkRuntimeTargets = useMemo(
    () => walkInteraction.targets.map(({ id, x, y, z }) => ({ id, x, y, z })),
    [walkInteraction.targets],
  );
  const walkRuntimeInput = useMemo(
    () => ({
      plan,
      landUse,
      scatter,
      enrichment,
      obstacles: walkObstacles,
      structures: walkInteraction.structures,
      targets: walkRuntimeTargets,
    }),
    [
      enrichment,
      landUse,
      plan,
      scatter,
      walkInteraction.structures,
      walkObstacles,
      walkRuntimeTargets,
    ],
  );
  // Preparation begins while Orbit remains interactive. The module worker and
  // its keyed cache keep both cold activation and repeated toggles off the main
  // render thread.
  const preparedWalkRuntime = usePreparedPlannedWalkRuntime(walkRuntimeInput);
  const renderedNavigationMode =
    navigationMode === "walk" && preparedWalkRuntime.status !== "ready" ? "orbit" : navigationMode;
  return (
    <>
      <PlannedCinematicEnvironment
        plan={plan}
        quality={quality}
        navigationMode={renderedNavigationMode}
      />
      <PlannedTerrain plan={plan} quality={quality} receiveShadow />
      <PlannedEscarpment plan={plan} quality={quality} />
      <PlannedWatershed plan={plan} quality={quality} reducedMotion={reducedMotion} />
      <PlannedPaths plan={plan} scatter={scatter} />
      <Suspense fallback={<LoadingMarker plan={plan} />}>
        <PlannedLandUseLayer plan={plan} landUse={landUse} season={season} />
        <PlannedLakeHabitat plan={plan} season={season} />
        <VegetationLayer
          scatter={scatter}
          plan={plan}
          enrichment={enrichment}
          themeLayer={themeLayer}
          navigationMode={renderedNavigationMode}
        />
        <ArchitectureLayer
          plan={plan}
          scatter={scatter}
          navigationMode={renderedNavigationMode}
          quality={quality}
        />
        {renderedNavigationMode === "orbit" ? (
          <WildlifeLayer
            scatter={scatter}
            plan={plan}
            reducedMotion={reducedMotion}
            navigationMode="orbit"
            walkTargetUpdaters={walkInteraction.animalTargetUpdaters}
          />
        ) : null}
        <EnchantedThemeLayer
          layer={themeLayer}
          plan={plan}
          reducedMotion={reducedMotion}
          quality={quality}
          navigationMode={renderedNavigationMode}
        />
      </Suspense>
      <PlannedLife
        plan={plan}
        scatter={scatter}
        enrichment={enrichment}
        reducedMotion={reducedMotion}
      />
      <PlannedInteractionIndex
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
      {navigationMode === "walk" ? (
        preparedWalkRuntime.status === "ready" ? (
          <PlannedWalkRuntime
            plan={plan}
            scatter={scatter}
            enrichment={enrichment}
            themeLayer={themeLayer}
            landUse={landUse}
            obstacles={walkObstacles}
            targets={walkInteraction.targets}
            walkTargetUpdaters={walkInteraction.animalTargetUpdaters}
            runtime={preparedWalkRuntime.result}
            reducedMotion={reducedMotion}
            quality={quality}
            onLockChange={onWalkLockChange}
            onStatusChange={onWalkStatusChange}
            onTargetSelect={(target) => (onWalkTargetSelect ?? onSelect)(target.selection)}
          />
        ) : (
          <>
            <PlannedWalkPreparationState
              plan={plan}
              failed={preparedWalkRuntime.status === "error"}
              onLockChange={onWalkLockChange}
              onStatusChange={onWalkStatusChange}
            />
            <OrbitCameraRig
              plan={plan}
              scatter={scatter}
              selection={selection}
              resetToken={resetToken}
              reducedMotion={reducedMotion}
            />
          </>
        )
      ) : (
        <OrbitCameraRig
          plan={plan}
          scatter={scatter}
          selection={selection}
          resetToken={resetToken}
          reducedMotion={reducedMotion}
        />
      )}
    </>
  );
}
