import * as THREE from "three";

import type { FileCategory, Province, RealmBiome, Selection, Vec3 } from "@/lib/kingdom/types";

export const BIOME_COLORS: Readonly<Record<RealmBiome, string>> = {
  spring: "#ef93bb",
  summer: "#6ecb78",
  autumn: "#dd7844",
  winter: "#a5d4eb",
  highland: "#98a87b",
  tidewater: "#61c9bd",
  volcanic: "#e45d3f",
  desert: "#ddb86f",
  canyon: "#bc7554",
  crystal: "#a78cf2",
  marsh: "#719b76",
  moonlit: "#7188d8",
};

export const BIOME_GROUND_COLORS: Readonly<Record<RealmBiome, string>> = {
  spring: "#6e9c66",
  summer: "#4f854d",
  autumn: "#8b633e",
  winter: "#b5cbcf",
  highland: "#63705a",
  tidewater: "#477c70",
  volcanic: "#493f3b",
  desert: "#9f8051",
  canyon: "#815340",
  crystal: "#60618b",
  marsh: "#4c6952",
  moonlit: "#3f5278",
};

export const BIOME_LABELS: Readonly<Record<RealmBiome, string>> = {
  spring: "Springwild",
  summer: "Sunwood",
  autumn: "Emberfall",
  winter: "Frostlands",
  highland: "Highlands",
  tidewater: "Tidewater",
  volcanic: "Volcanic",
  desert: "Desert",
  canyon: "Canyon",
  crystal: "Crystal",
  marsh: "Marsh",
  moonlit: "Moonlit",
};

export const CATEGORY_COLORS: Readonly<Record<FileCategory, string>> = {
  source: "#89b5ff",
  test: "#ed8a9b",
  docs: "#f2cf7a",
  config: "#b79aee",
  asset: "#79d9c7",
  other: "#b2bac8",
};

export const CATEGORY_LABELS: Readonly<Record<FileCategory, string>> = {
  source: "Source",
  test: "Test",
  docs: "Documentation",
  config: "Configuration",
  asset: "Asset",
  other: "Other",
};

export function seededUnit(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0) / 4294967295;
}

export function stableNumber(seed: string, minimum: number, maximum: number): number {
  return minimum + seededUnit(seed) * (maximum - minimum);
}

export function nearestProvince(
  provinces: ReadonlyArray<Province>,
  x: number,
  z: number,
): Readonly<{ province: Province; distance: number; influence: number }> | null {
  let nearest: Readonly<{ province: Province; distance: number; influence: number }> | null = null;
  for (const province of provinces) {
    const distance = Math.hypot(x - province.position.x, z - province.position.z);
    const reach = province.radius * (province.role === "nexus" ? 1.45 : 1.85);
    const influence = THREE.MathUtils.clamp(1 - distance / reach, 0, 1);
    if (!nearest || distance / reach < nearest.distance / (nearest.province.radius * 1.85)) {
      nearest = { province, distance, influence };
    }
  }
  return nearest;
}

export function terrainHeight(
  x: number,
  z: number,
  radius: number,
  seed = "kingdom",
  provinces: ReadonlyArray<Province> = [],
): number {
  const normalizedDistance = Math.sqrt(x * x + z * z) / radius;
  const shoreline = THREE.MathUtils.smoothstep(1 - normalizedDistance, 0, 0.24);
  const broadNoise =
    Math.sin(x * 0.19 + seededUnit(seed) * 4) * 0.34 +
    Math.cos(z * 0.23 - seededUnit(`${seed}:z`) * 3) * 0.27 +
    Math.sin((x + z) * 0.1) * 0.18;
  let realmLift = 0;
  for (const province of provinces) {
    const distance = Math.hypot(x - province.position.x, z - province.position.z);
    const influence = THREE.MathUtils.clamp(1 - distance / (province.radius * 1.7), 0, 1);
    const terrace = THREE.MathUtils.smoothstep(influence, 0.08, 0.82);
    realmLift = Math.max(realmLift, terrace * (province.role === "nexus" ? 1.1 : 0.72));
  }
  return -1.35 + shoreline * (2.1 + broadNoise + realmLift);
}

export function selectionPosition(selection: Selection): Vec3 | null {
  if (!selection) return null;
  if (selection.kind === "province") return selection.province.position;
  if (selection.kind === "entity") return selection.entity.position;
  if (selection.kind === "portal") return selection.portal.position;
  return selection.repository.position;
}
