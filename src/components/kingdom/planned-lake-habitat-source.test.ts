import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { plannedLakeHabitatAssetUrl } from "./planned-lake-habitat";

describe("planned lake habitat renderer contract", () => {
  it("uses only shipped legal asset roots and gives trees seasonal appearance", () => {
    const rock = plannedLakeHabitatAssetUrl({ id: "rock-1", role: "rock" }, "spring");
    const ruin = plannedLakeHabitatAssetUrl({ id: "ruin-1", role: "ruin" }, "spring");
    const springTree = plannedLakeHabitatAssetUrl({ id: "tree-1", role: "tree" }, "spring");
    const autumnTree = plannedLakeHabitatAssetUrl({ id: "tree-1", role: "tree" }, "autumn");
    const winterTree = plannedLakeHabitatAssetUrl({ id: "tree-1", role: "tree" }, "winter");

    expect(rock).toMatch(/^\/assets\/world\/quaternius\/nature\//);
    expect(ruin).toMatch(/^\/assets\/world\/quaternius\/medieval\//);
    expect(springTree).toMatch(/^\/assets\/world\/kenney\/nature\//);
    expect(autumnTree).not.toBe(springTree);
    expect(winterTree).toMatch(/^\/assets\/world\/kenney\/holiday\//);
  });

  it("keeps habitat instances explicit and leaves source materials untouched", () => {
    const source = readFileSync(new URL("./planned-lake-habitat.tsx", import.meta.url), "utf8");
    expect(source).toContain("islet.detailAnchors.map");
    expect(source).toContain("<primitive object={normalized}");
    expect(source).not.toMatch(/\.material\s*=/);
    expect(source).not.toMatch(/new THREE\.(?:MeshStandardMaterial|MeshPhysicalMaterial)/);
  });

  it("mounts the optional habitat in the same planned world scene", () => {
    const source = readFileSync(new URL("./kingdom-scene-planned.tsx", import.meta.url), "utf8");
    expect(source).toContain('import { PlannedLakeHabitat } from "./planned-lake-habitat"');
    expect(source).toContain("<PlannedLakeHabitat plan={plan} season={season} />");
  });
});
