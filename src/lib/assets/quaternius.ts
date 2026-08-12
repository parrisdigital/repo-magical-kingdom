export const QUATERNIUS_ASSET_BASE_URL = "/assets/world/quaternius" as const;

export const QUATERNIUS_ASSET_NAMES = {
  animals: ["Deer", "Fox", "Stag"],
  medieval: [
    "Balcony_Cross_Straight",
    "Corner_Exterior_Brick",
    "Corner_Exterior_Wood",
    "DoorFrame_Round_Brick",
    "Door_1_Round",
    "Prop_Chimney",
    "Prop_Vine1",
    "Prop_Wagon",
    "Prop_WoodenFence_Single",
    "Roof_RoundTiles_4x4",
    "Roof_RoundTiles_6x8",
    "Roof_RoundTiles_8x8",
    "Roof_Tower_RoundTiles",
    "Stairs_Exterior_Straight",
    "Wall_Plaster_Door_Round",
    "Wall_Plaster_Straight",
    "Wall_Plaster_Window_Wide_Round",
    "Wall_UnevenBrick_Door_Round",
    "Wall_UnevenBrick_Straight",
    "Wall_UnevenBrick_Window_Wide_Round",
    "WindowShutters_Wide_Round_Open",
    "Window_Wide_Round1",
  ],
  nature: [
    "Bush_Common",
    "Bush_Common_Flowers",
    "CommonTree_1",
    "CommonTree_2",
    "CommonTree_3",
    "DeadTree_1",
    "Fern_1",
    "Flower_3_Group",
    "Flower_4_Group",
    "Grass_Common_Short",
    "Mushroom_Common",
    "Pine_1",
    "Pine_2",
    "RockPath_Round_Small_1",
    "Rock_Medium_1",
    "Rock_Medium_2",
    "TwistedTree_1",
    "TwistedTree_2",
  ],
} as const;

export type QuaterniusAssetCollection = keyof typeof QUATERNIUS_ASSET_NAMES;
export type QuaterniusAssetName<Collection extends QuaterniusAssetCollection> =
  (typeof QUATERNIUS_ASSET_NAMES)[Collection][number];

export function quaterniusAssetUrl<Collection extends QuaterniusAssetCollection>(
  collection: Collection,
  name: QuaterniusAssetName<Collection>,
): `${typeof QUATERNIUS_ASSET_BASE_URL}/${Collection}/${QuaterniusAssetName<Collection>}.glb` {
  return `${QUATERNIUS_ASSET_BASE_URL}/${collection}/${name}.glb`;
}

export const QUATERNIUS_ANIMAL_CLIPS = {
  Deer: {
    idle: "Idle",
    graze: "Eating",
    walk: "Walk",
    run: "Gallop",
  },
  Fox: {
    idle: "Idle",
    graze: "Eating",
    walk: "Walk",
    run: "Gallop",
  },
  Stag: {
    idle: "Idle",
    graze: "Eating",
    walk: "Walk",
    run: "Gallop",
  },
} as const;

export const QUATERNIUS_RUNTIME_CONTRACT = {
  format: "glTF 2.0 binary",
  coordinateSystem: "right-handed, Y-up",
  units: "metre-like source units",
  geometryCompression: "EXT_meshopt_compression",
  textureCompression: "EXT_texture_webp",
  staticOrigin: "grounded near y=0",
  animalOrigin: "source rig origin; normalize visually in the scene",
} as const;
