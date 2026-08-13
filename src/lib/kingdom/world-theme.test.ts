import { describe, expect, it } from "vitest";

import {
  deriveDefaultKingdomWorldTheme,
  isKingdomWorldTheme,
  KINGDOM_WORLD_THEMES,
} from "./world-theme";

describe("repository world themes", () => {
  it("accepts only the released canonical world values", () => {
    expect(KINGDOM_WORLD_THEMES).toEqual(["kingdom-valley", "enchanted-forest"]);
    expect(isKingdomWorldTheme("enchanted-forest")).toBe(true);
    expect(isKingdomWorldTheme("alpine")).toBe(false);
  });

  it("defaults source-heavy repositories to the open kingdom valley", () => {
    expect(
      deriveDefaultKingdomWorldTheme({
        repositoryId: 1,
        categories: [
          { category: "source", files: 80, bytes: 800_000 },
          { category: "test", files: 20, bytes: 100_000 },
          { category: "docs", files: 4, bytes: 20_000 },
        ],
        languages: [{ name: "TypeScript", files: 90, bytes: 850_000 }],
      }),
    ).toBe("kingdom-valley");
  });

  it("defaults visually expressive repositories to the enchanted forest", () => {
    expect(
      deriveDefaultKingdomWorldTheme({
        repositoryId: 2,
        categories: [
          { category: "source", files: 30, bytes: 90_000 },
          { category: "docs", files: 12, bytes: 2_200_000 },
          { category: "asset", files: 8, bytes: 600_000 },
        ],
        languages: [
          { name: "TypeScript", files: 30, bytes: 90_000 },
          { name: "PNG", files: 8, bytes: 2_600_000 },
        ],
      }),
    ).toBe("enchanted-forest");
  });

  it("keeps empty repositories on the conservative default", () => {
    expect(deriveDefaultKingdomWorldTheme({ repositoryId: 3, categories: [], languages: [] })).toBe(
      "kingdom-valley",
    );
  });
});
