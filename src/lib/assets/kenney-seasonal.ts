export const KENNEY_SEASONAL_ASSET_BASE_URL = "/assets/world/kenney" as const;

export const KENNEY_SEASONAL_ASSET_NAMES = {
  nature: [
    "crop_pumpkin",
    "flower_purpleA",
    "tree_default",
    "tree_default_fall",
    "tree_detailed",
    "tree_detailed_fall",
    "tree_oak",
    "tree_oak_fall",
  ],
  holiday: ["snow-flat-large", "snow-pile", "tree-snow-a", "tree-snow-b", "tree-snow-c"],
} as const;

export type KenneySeasonalAssetCollection = keyof typeof KENNEY_SEASONAL_ASSET_NAMES;
export type KenneySeasonalAssetName<Collection extends KenneySeasonalAssetCollection> =
  (typeof KENNEY_SEASONAL_ASSET_NAMES)[Collection][number];
export type KenneySeason = "spring" | "summer" | "autumn" | "winter";

export type KenneySeasonalAssetReference = {
  [Collection in KenneySeasonalAssetCollection]: {
    collection: Collection;
    name: KenneySeasonalAssetName<Collection>;
  };
}[KenneySeasonalAssetCollection];

function asset<Collection extends KenneySeasonalAssetCollection>(
  collection: Collection,
  name: KenneySeasonalAssetName<Collection>,
): { collection: Collection; name: KenneySeasonalAssetName<Collection> } {
  return { collection, name };
}

export function kenneySeasonalAssetUrl<Collection extends KenneySeasonalAssetCollection>(
  collection: Collection,
  name: KenneySeasonalAssetName<Collection>,
): `${typeof KENNEY_SEASONAL_ASSET_BASE_URL}/${Collection}/${KenneySeasonalAssetName<Collection>}.glb` {
  return `${KENNEY_SEASONAL_ASSET_BASE_URL}/${collection}/${name}.glb`;
}

export function kenneySeasonalAssetReferenceUrl(
  reference: KenneySeasonalAssetReference,
): `${typeof KENNEY_SEASONAL_ASSET_BASE_URL}/${KenneySeasonalAssetCollection}/${string}.glb` {
  return `${KENNEY_SEASONAL_ASSET_BASE_URL}/${reference.collection}/${reference.name}.glb`;
}

export const KENNEY_SEASONAL_TREE_VARIANTS = [
  {
    slot: "default-canopy",
    spring: asset("nature", "tree_default"),
    summer: asset("nature", "tree_default"),
    autumn: asset("nature", "tree_default_fall"),
    winter: asset("holiday", "tree-snow-a"),
  },
  {
    slot: "oak-canopy",
    spring: asset("nature", "tree_oak"),
    summer: asset("nature", "tree_oak"),
    autumn: asset("nature", "tree_oak_fall"),
    winter: asset("holiday", "tree-snow-b"),
  },
  {
    slot: "detailed-canopy",
    spring: asset("nature", "tree_detailed"),
    summer: asset("nature", "tree_detailed"),
    autumn: asset("nature", "tree_detailed_fall"),
    winter: asset("holiday", "tree-snow-c"),
  },
] as const;

export const KENNEY_SEASONAL_DETAIL_VARIANTS = [
  {
    slot: "small-ground-accent",
    spring: asset("nature", "flower_purpleA"),
    summer: asset("nature", "flower_purpleA"),
    autumn: asset("nature", "crop_pumpkin"),
    winter: asset("holiday", "snow-pile"),
  },
  {
    slot: "broad-ground-accent",
    spring: asset("nature", "flower_purpleA"),
    summer: asset("nature", "flower_purpleA"),
    autumn: asset("nature", "crop_pumpkin"),
    winter: asset("holiday", "snow-flat-large"),
  },
] as const;

export function getKenneySeasonalPalette(season: KenneySeason): Readonly<{
  canopy: ReadonlyArray<KenneySeasonalAssetReference>;
  groundDetails: ReadonlyArray<KenneySeasonalAssetReference>;
}> {
  return {
    canopy: KENNEY_SEASONAL_TREE_VARIANTS.map((variant) => variant[season]),
    groundDetails: KENNEY_SEASONAL_DETAIL_VARIANTS.map((variant) => variant[season]),
  };
}

export const KENNEY_SEASONAL_SOURCE_PACKS = {
  nature: {
    title: "Kenney Nature Kit",
    version: "2.1",
    canonicalUrl: "https://kenney.nl/assets/nature-kit",
    license: "CC0-1.0",
    archiveSha256: "fa7974a0d342bfe63c38664ba9f8ec1a4aab8ea25f099bdc56870e33588c4d9d",
  },
  holiday: {
    title: "Kenney Holiday Kit",
    version: "2.0",
    canonicalUrl: "https://kenney.nl/assets/holiday-kit",
    license: "CC0-1.0",
    archiveSha256: "fde4d514d7297388d98058e8933ff614e071886f7ce57f9aea4b00d7698dd769",
  },
} as const;

export const KENNEY_SEASONAL_RUNTIME_CONTRACT = {
  format: "glTF 2.0 binary",
  coordinateSystem: "right-handed, Y-up",
  units: "metre-like source units",
  origin: "ground contact within 0.06 source units of y=0",
  geometryCompression: "EXT_meshopt_compression",
  textureCompression: "embedded EXT_texture_webp where textured",
  topologyPolicy: "variant slots change appearance only; callers retain placement topology",
} as const;
