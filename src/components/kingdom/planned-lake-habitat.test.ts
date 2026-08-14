import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import {
  REPOSITORY_TOPOLOGY_FAMILY_IDS,
  deriveRepositoryTopologyFamily,
  type RepositoryTopologyFamilyId,
} from "@/lib/kingdom/topology-family";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { buildPlannedIsletGeometry, getPlannedTerrainDefinition } from "./planned-terrain-model";

function worldForFamily(familyId: RepositoryTopologyFamilyId, season: "spring" | "winter") {
  const base = createDemoKingdom(season);
  for (let index = 0; index < 256; index += 1) {
    const candidate = { ...base, seed: `lake-habitat:${familyId}:${index}` };
    if (deriveRepositoryTopologyFamily(candidate).id === familyId) return candidate;
  }
  throw new Error(`Unable to find deterministic ${familyId} fixture.`);
}

describe("planned lake habitat", () => {
  it("varies islet presence and story role with repository geography, not season", () => {
    for (const familyId of REPOSITORY_TOPOLOGY_FAMILY_IDS) {
      const spring = createWorldPlan(worldForFamily(familyId, "spring"));
      const winter = createWorldPlan(worldForFamily(familyId, "winter"));
      const springIslet = getPlannedTerrainDefinition(spring).water.lake.islet;
      const winterIslet = getPlannedTerrainDefinition(winter).water.lake.islet;

      expect(winterIslet).toEqual(springIslet);
      expect(springIslet.enabled).toBe(
        familyId === "eastern-lake-run" || familyId === "western-basin-watershed",
      );
      expect(springIslet.kind).toBe(familyId === "western-basin-watershed" ? "ruin" : "grove");
    }
  });

  it("builds enabled habitats as irregular, raised, three-band landforms with details", () => {
    for (const familyId of ["eastern-lake-run", "western-basin-watershed"] as const) {
      const plan = createWorldPlan(worldForFamily(familyId, "spring"));
      const lake = getPlannedTerrainDefinition(plan).water.lake;
      const islet = lake.islet;
      const geometry = buildPlannedIsletGeometry(plan);
      const isletAreaRatio = (Math.PI * islet.radiusX * islet.radiusZ) / lake.area;

      expect(isletAreaRatio).toBeGreaterThanOrEqual(0.022);
      expect(isletAreaRatio).toBeLessThanOrEqual(0.045);
      expect(islet.height).toBeGreaterThanOrEqual(1.05);
      expect(islet.height).toBeLessThanOrEqual(1.53);
      expect(islet.detailAnchors).toHaveLength(4);
      expect(new Set(islet.detailAnchors.map((anchor) => anchor.role))).toContain("rock");
      expect(geometry.vertexCount).toBe(112);
      expect(geometry.triangleCount).toBe(180);
      expect(new Set(Array.from(geometry.materialZones)).size).toBeGreaterThanOrEqual(3);

      const heights = new Set<number>();
      for (let index = 1; index < geometry.positions.length; index += 3) {
        heights.add(Math.round(geometry.positions[index]! * 1_000));
      }
      expect(heights.size).toBeGreaterThanOrEqual(4);

      for (const anchor of islet.detailAnchors) {
        const cosine = Math.cos(-islet.rotation);
        const sine = Math.sin(-islet.rotation);
        const deltaX = anchor.x - islet.center.x;
        const deltaZ = anchor.z - islet.center.z;
        const localX = deltaX * cosine - deltaZ * sine;
        const localZ = deltaX * sine + deltaZ * cosine;
        expect(Math.hypot(localX / islet.radiusX, localZ / islet.radiusZ)).toBeLessThan(0.56);
        expect(anchor.y).toBeGreaterThan(lake.surfaceHeight + 0.5);
      }
    }
  });

  it("omits the flat disk entirely for basin and estuary families", () => {
    for (const familyId of ["foreground-estuary", "central-meander"] as const) {
      const plan = createWorldPlan(worldForFamily(familyId, "spring"));
      const geometry = buildPlannedIsletGeometry(plan);
      expect(geometry.vertexCount).toBe(0);
      expect(geometry.triangleCount).toBe(0);
    }
  });
});
