export const GLTF_TRANSFORM_VERSION = "4.4.2";

export const KENNEY_SEASONAL_PACKS = {
  nature: {
    title: "Nature Kit",
    version: "2.1",
    canonicalUrl: "https://kenney.nl/assets/nature-kit",
    archiveSha256: "fa7974a0d342bfe63c38664ba9f8ec1a4aab8ea25f099bdc56870e33588c4d9d",
    sourceDirectory: "Models/GLTF format",
    licenseEntry: "License.txt",
    licenseFileName: "Nature_Kit_2.1_LICENSE.txt",
    licenseSha256: "cb96b75e3560ac78d7a53ce6f083f4cdb5c53faea6141b62d63458dcfe1e4b9d",
    dependencies: [],
    assets: [
      "crop_pumpkin",
      "flower_purpleA",
      "tree_default",
      "tree_default_fall",
      "tree_detailed",
      "tree_detailed_fall",
      "tree_oak",
      "tree_oak_fall",
    ],
  },
  holiday: {
    title: "Holiday Kit",
    version: "2.0",
    canonicalUrl: "https://kenney.nl/assets/holiday-kit",
    archiveSha256: "fde4d514d7297388d98058e8933ff614e071886f7ce57f9aea4b00d7698dd769",
    sourceDirectory: "Models/GLB format",
    licenseEntry: "License.txt",
    licenseFileName: "Holiday_Kit_2.0_LICENSE.txt",
    licenseSha256: "6010f677d95f3ab7935faf873d8f4eb96ad1e5f02fd0e4659c9d92852b768d6a",
    dependencies: ["Textures/colormap.png"],
    assets: ["snow-flat-large", "snow-pile", "tree-snow-a", "tree-snow-b", "tree-snow-c"],
  },
};
