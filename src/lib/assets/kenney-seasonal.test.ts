import { describe, expect, it } from "vitest";

import {
  getKenneySeasonalPalette,
  KENNEY_SEASONAL_ASSET_NAMES,
  KENNEY_SEASONAL_DETAIL_VARIANTS,
  KENNEY_SEASONAL_TREE_VARIANTS,
  kenneySeasonalAssetReferenceUrl,
  kenneySeasonalAssetUrl,
  type KenneySeason,
} from "./kenney-seasonal";

const seasons = [
  "spring",
  "summer",
  "autumn",
  "winter",
] as const satisfies ReadonlyArray<KenneySeason>;

describe("Kenney seasonal asset contract", () => {
  it("returns stable public URLs for both source collections", () => {
    expect(kenneySeasonalAssetUrl("nature", "tree_oak_fall")).toBe(
      "/assets/world/kenney/nature/tree_oak_fall.glb",
    );
    expect(kenneySeasonalAssetUrl("holiday", "tree-snow-a")).toBe(
      "/assets/world/kenney/holiday/tree-snow-a.glb",
    );
  });

  it("keeps seasonal placement slots topology-invariant", () => {
    for (const season of seasons) {
      const palette = getKenneySeasonalPalette(season);
      expect(palette.canopy).toHaveLength(KENNEY_SEASONAL_TREE_VARIANTS.length);
      expect(palette.groundDetails).toHaveLength(KENNEY_SEASONAL_DETAIL_VARIANTS.length);
    }
  });

  it("references only curated bundled names", () => {
    const registered = new Set(
      Object.entries(KENNEY_SEASONAL_ASSET_NAMES).flatMap(([collection, names]) =>
        names.map((name) => `/assets/world/kenney/${collection}/${name}.glb`),
      ),
    );

    for (const season of seasons) {
      const palette = getKenneySeasonalPalette(season);
      for (const reference of [...palette.canopy, ...palette.groundDetails]) {
        expect(registered).toContain(kenneySeasonalAssetReferenceUrl(reference));
      }
    }
  });

  it("uses six paired green and fall trees plus bounded snowy silhouette reuse", () => {
    expect(getKenneySeasonalPalette("spring").canopy).toEqual(
      getKenneySeasonalPalette("summer").canopy,
    );
    expect(getKenneySeasonalPalette("autumn").canopy.map(({ name }) => name)).toEqual([
      "tree_default_fall",
      "tree_oak_fall",
      "tree_detailed_fall",
      "tree_blocks_fall",
      "tree_cone_fall",
      "tree_fat_fall",
    ]);
    expect(getKenneySeasonalPalette("winter").canopy.map(({ name }) => name)).toEqual([
      "tree-snow-a",
      "tree-snow-b",
      "tree-snow-c",
      "tree-snow-a",
      "tree-snow-b",
      "tree-snow-c",
    ]);
  });

  it("provides four season-specific ground-detail slots", () => {
    expect(KENNEY_SEASONAL_DETAIL_VARIANTS).toHaveLength(4);
    expect(getKenneySeasonalPalette("summer").groundDetails.map(({ name }) => name)).toEqual([
      "crop_melon",
      "crops_wheatStageB",
      "grass_large",
      "crop_melon",
    ]);
    expect(getKenneySeasonalPalette("autumn").groundDetails.map(({ name }) => name)).toEqual([
      "crop_pumpkin",
      "crop_carrot",
      "mushroom_redGroup",
      "crops_wheatStageB",
    ]);
    expect(getKenneySeasonalPalette("winter").groundDetails.map(({ name }) => name)).toEqual([
      "snow-pile",
      "snow-flat-large",
      "rocks-small",
      "snow-flat",
    ]);
  });
});
