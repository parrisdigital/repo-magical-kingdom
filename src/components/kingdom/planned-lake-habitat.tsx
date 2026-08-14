"use client";

import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

import {
  getKenneySeasonalPalette,
  kenneySeasonalAssetReferenceUrl,
} from "@/lib/assets/kenney-seasonal";
import { quaterniusAssetUrl } from "@/lib/assets/quaternius";
import { stableHash } from "@/lib/kingdom/hash";
import type { KingdomSeason, WorldPlan } from "@/lib/kingdom";

import { getPlannedTerrainDefinition, type PlannedLake } from "./planned-terrain-model";

type LakeHabitatAnchor = PlannedLake["islet"]["detailAnchors"][number];

const ROCK_URLS = [
  quaterniusAssetUrl("nature", "Rock_Medium_1"),
  quaterniusAssetUrl("nature", "Rock_Medium_2"),
] as const;
const RUIN_URL = quaterniusAssetUrl("medieval", "Wall_UnevenBrick_Door_Round");
const SEASONAL_TREE_URLS = [
  ...new Set(
    (["spring", "summer", "autumn", "winter"] as const).map((season) =>
      kenneySeasonalAssetReferenceUrl(getKenneySeasonalPalette(season).canopy[1]!),
    ),
  ),
];

for (const url of [...ROCK_URLS, RUIN_URL, ...SEASONAL_TREE_URLS]) useGLTF.preload(url);

export function plannedLakeHabitatAssetUrl(
  anchor: Pick<LakeHabitatAnchor, "id" | "role">,
  season: KingdomSeason,
): string {
  if (anchor.role === "ruin") return RUIN_URL;
  if (anchor.role === "rock") return ROCK_URLS[stableHash(anchor.id) % ROCK_URLS.length]!;
  return kenneySeasonalAssetReferenceUrl(getKenneySeasonalPalette(season).canopy[1]!);
}

function habitatTargetHeight(role: LakeHabitatAnchor["role"]): number {
  if (role === "ruin") return 4.8;
  if (role === "tree") return 5.8;
  return 2.2;
}

function LakeHabitatAsset({
  anchor,
  season,
}: Readonly<{ anchor: LakeHabitatAnchor; season: KingdomSeason }>) {
  const url = plannedLakeHabitatAssetUrl(anchor, season);
  const { scene } = useGLTF(url);
  const normalized = useMemo(() => {
    const instance = scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(instance);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const targetScale = (habitatTargetHeight(anchor.role) / Math.max(0.1, size.y)) * anchor.scale;
    instance.position.set(
      -center.x * targetScale,
      -bounds.min.y * targetScale,
      -center.z * targetScale,
    );
    instance.scale.setScalar(targetScale);
    instance.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = false;
      child.receiveShadow = true;
    });
    return instance;
  }, [anchor.role, anchor.scale, scene]);

  return (
    <group
      name={anchor.id}
      position={[anchor.x, anchor.y + 0.035, anchor.z]}
      rotation={[0, anchor.rotation, 0]}
    >
      <primitive object={normalized} />
    </group>
  );
}

/**
 * Four explicit, independently editable habitat instances on the optional
 * topology-authored islet. Placement remains repository-deterministic while
 * the tree asset swaps with the user-selected season.
 */
export function PlannedLakeHabitat({
  plan,
  season,
}: Readonly<{ plan: WorldPlan; season: KingdomSeason }>) {
  const islet = getPlannedTerrainDefinition(plan).water.lake.islet;
  if (!islet.enabled) return null;
  return (
    <group name={`planned-lake-habitat-${islet.kind}`}>
      {islet.detailAnchors.map((anchor) => (
        <LakeHabitatAsset key={anchor.id} anchor={anchor} season={season} />
      ))}
    </group>
  );
}
