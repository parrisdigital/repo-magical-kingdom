import type { CustomAssetCatalogV1 } from "@/lib/world-assets-v2";

export const ASSET_LAB_NAVIGATION_MODES = ["turntable", "orbit", "walk"] as const;
export const ASSET_LAB_MATERIAL_MODES = [
  "beauty",
  "albedo",
  "normal",
  "roughness",
  "metalness",
  "emissive",
] as const;
export const ASSET_LAB_LOD_SLOTS = ["lod0", "lod1", "lod2"] as const;
export const ASSET_LAB_LOD_REVIEW_MODES = ["single", "crossfade"] as const;

export type AssetLabNavigationMode = (typeof ASSET_LAB_NAVIGATION_MODES)[number];
export type AssetLabMaterialMode = (typeof ASSET_LAB_MATERIAL_MODES)[number];
export type AssetLabLodSlot = (typeof ASSET_LAB_LOD_SLOTS)[number];
export type AssetLabLodReviewMode = (typeof ASSET_LAB_LOD_REVIEW_MODES)[number];

export type AssetLabControls = Readonly<{
  navigation: AssetLabNavigationMode;
  material: AssetLabMaterialMode;
  lod: AssetLabLodSlot;
  lodReview: AssetLabLodReviewMode;
  lodBlend: number;
  wireframe: boolean;
  contactShadows: boolean;
  collisions: boolean;
  animation: boolean;
}>;

export const DEFAULT_ASSET_LAB_CONTROLS: AssetLabControls = Object.freeze({
  navigation: "turntable",
  material: "beauty",
  lod: "lod0",
  lodReview: "single",
  lodBlend: 0.5,
  wireframe: false,
  contactShadows: true,
  collisions: false,
  animation: true,
});

export const ASSET_LAB_LINEUP_POSITIONS = Object.freeze([
  [-18, 0, 0],
  [-9, 0, 0],
  [0, 0, 0],
  [9, 0, 0],
  [18, 0, 0],
] as const);

export function assetLabLodIndex(slot: AssetLabLodSlot): 0 | 1 | 2 {
  return slot === "lod0" ? 0 : slot === "lod1" ? 1 : 2;
}

export function createAssetLabLodTransition(selectedSlot: AssetLabLodSlot, blend: number) {
  if (!Number.isFinite(blend)) throw new Error("Asset-lab LOD blend must be finite.");
  const clampedBlend = Math.min(1, Math.max(0, blend));
  const from: AssetLabLodSlot = selectedSlot === "lod0" ? "lod0" : "lod1";
  const to: AssetLabLodSlot = selectedSlot === "lod0" ? "lod1" : "lod2";
  return Object.freeze({
    from,
    to,
    blend: clampedBlend,
    fromOpacity: 1 - clampedBlend,
    toOpacity: clampedBlend,
  });
}

type CollisionNode = CustomAssetCatalogV1["families"][number]["collision"]["nodes"][number];

export type AssetLabCollisionGeometry =
  | Readonly<{ shape: "box"; args: [number, number, number] }>
  | Readonly<{ shape: "sphere"; args: [number, number, number] }>
  | Readonly<{ shape: "capsule"; args: [number, number, number, number] }>;

export function createAssetLabCollisionGeometry(node: CollisionNode): AssetLabCollisionGeometry {
  if (node.shape === "box") {
    return {
      shape: "box",
      args: [node.halfExtents[0] * 2, node.halfExtents[1] * 2, node.halfExtents[2] * 2],
    };
  }
  if (node.shape === "sphere") {
    return { shape: "sphere", args: [node.halfExtents[0], 16, 10] };
  }
  const radius = Math.max(node.halfExtents[0], node.halfExtents[2]);
  return {
    shape: "capsule",
    args: [radius, Math.max(0.01, node.halfExtents[1] * 2 - radius * 2), 8, 16],
  };
}

export function createAssetLabMetrics(
  catalog: CustomAssetCatalogV1,
  familyId: string,
  lodSlot: AssetLabLodSlot,
) {
  const family = catalog.families.find((candidate) => candidate.id === familyId);
  if (!family) throw new Error(`Unknown asset-lab family ${familyId}`);
  const lod = family.lods[assetLabLodIndex(lodSlot)];
  const textureMaps = family.materials.flatMap((material) =>
    material.mode === "textured-pbr" ? material.textureSet.maps : [],
  );
  return Object.freeze({
    familyId: family.id,
    title: family.title,
    kind: family.kind,
    lod: lod.slot,
    shippedBytes: lod.bytes,
    meshes: lod.metrics.meshes,
    drawCalls: lod.metrics.drawCalls,
    materials: lod.metrics.materials,
    vertices: lod.metrics.vertices,
    triangles: lod.metrics.triangles,
    geometryBytes: lod.metrics.geometryBytes,
    estimatedGpuBytes: lod.metrics.estimatedGpuBytes,
    bounds: lod.metrics.bounds,
    silhouetteEnvelopeDeltaPercent: Math.max(...lod.silhouette.envelopeDeltaRatio) * 100,
    silhouetteExtentDeltaPercent: Math.max(...lod.silhouette.extentDeltaRatio) * 100,
    silhouetteCenterDriftPercent: Math.max(...lod.silhouette.centerDriftRatio) * 100,
    textureSamplers: textureMaps.length,
    textureShippedBytes: textureMaps.reduce((sum, map) => sum + map.bytes, 0),
    textureDecodedGpuBytes: textureMaps.reduce((sum, map) => sum + map.decodedGpuBytes, 0),
    collisionNodes: family.collision.nodes.length,
    footprintShape: family.footprint.shape,
    footprintDimensionsMeters: [
      family.footprint.halfExtents[0] * 2,
      family.footprint.halfExtents[1] * 2,
    ] as const,
    footprintClearanceMeters: family.footprint.clearanceMeters,
    primaryBiome: family.biomeAffinity.primary,
    compatibleBiomes: family.biomeAffinity.compatible,
    animation: family.animations[0]?.name ?? "None",
    quality: family.quality,
  });
}

export function formatAssetLabBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}
