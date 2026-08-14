import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { KingdomWorld } from "../kingdom/types";
import { createWorldPlan } from "../kingdom/world-plan";
import { createRepoSemanticGraphV2 } from "./repo-semantic-graph-v2";
import {
  assertWorldDesignSpecV3Integrity,
  createWorldDesignSpecV3,
  WORLD_DESIGN_SPEC_V3_SCHEMA,
  type WorldDesignSpecV3,
} from "./world-design-spec-v3";

const LARGE_FIXTURE_URL = new URL(
  "../../components/kingdom/test-fixtures/nextjs-large-world.json",
  import.meta.url,
);

function fixture(): KingdomWorld {
  return JSON.parse(readFileSync(LARGE_FIXTURE_URL, "utf8")) as KingdomWorld;
}

describe("WorldDesignSpecV3", () => {
  it("publishes the fixed high-fidelity terrain and repository mapping contract", () => {
    const world = fixture();
    const graph = createRepoSemanticGraphV2(world);
    const design = createWorldDesignSpecV3(world, createWorldPlan(world), graph);

    expect(design.schema).toBe(WORLD_DESIGN_SPEC_V3_SCHEMA);
    expect(design.terrain.artifactResolution).toBe(513);
    expect(design.terrain.chunkLods).toEqual([129, 65, 33]);
    expect(design.terrain.sharedHydrology).toBe(true);
    expect(design.terrain.operators.map((operator) => operator.kind)).toEqual([
      "ridge",
      "basin",
      "terrace",
      "river-valley",
      "cliff",
      "erosion-channel",
      "irregular-shoreline",
    ]);
    expect(design.mapping).toEqual({
      directoryToRegion: "implemented",
      fileBytesToHeight: "implemented",
      aggregatesToDensity: "planned",
      categoryAndLanguageToArtRole: "planned",
      dependenciesToRoutes: "explicit-evidence-only",
      pathDepthToHierarchy: "planned",
    });
    expect(Object.isFrozen(design)).toBe(true);
    expect(Object.isFrozen(design.terrain.envelope)).toBe(true);
    expect(Object.isFrozen(design.routes)).toBe(true);
    expect(() => assertWorldDesignSpecV3Integrity(design, graph)).not.toThrow();
  });

  it("rejects stale cached route and envelope mutations", () => {
    const world = fixture();
    const graph = createRepoSemanticGraphV2(world);
    const design = createWorldDesignSpecV3(world, createWorldPlan(world), graph);

    const routeMutation = structuredClone(design);
    (routeMutation.routes[0] as { evidence: string }).evidence += ":mutated";
    expect(() => assertWorldDesignSpecV3Integrity(routeMutation, graph)).toThrow(/structure key/u);

    const envelopeMutation = structuredClone(design);
    (envelopeMutation.terrain.envelope as { width: number }).width *= 2;
    expect(() => assertWorldDesignSpecV3Integrity(envelopeMutation, graph)).toThrow(
      /incoherent terrain envelope/u,
    );
  });

  it("binds topology, terrain zones, ecology, and POIs into one structural cache identity", () => {
    const world = fixture();
    const graph = createRepoSemanticGraphV2(world);
    const design = createWorldDesignSpecV3(world, createWorldPlan(world), graph);

    const mutations = [
      (candidate: WorldDesignSpecV3) => {
        (candidate.sourcePlan as { topologyKey: string }).topologyKey += ":mutated";
      },
      (candidate: WorldDesignSpecV3) => {
        (candidate.terrain.zones[0] as { id: string }).id += ":mutated";
      },
      (candidate: WorldDesignSpecV3) => {
        (candidate.ecology.groves[0] as { id: string }).id += ":mutated";
      },
      (candidate: WorldDesignSpecV3) => {
        (candidate.pois[0] as { prominence: number }).prominence += 0.01;
      },
    ];

    for (const mutate of mutations) {
      const candidate = structuredClone(design);
      mutate(candidate);
      expect(() => assertWorldDesignSpecV3Integrity(candidate, graph)).toThrow(/structure key/u);
    }
  });

  it("keeps region hierarchy and entity height evidence visible", () => {
    const world = fixture();
    const design = createWorldDesignSpecV3(
      world,
      createWorldPlan(world),
      createRepoSemanticGraphV2(world),
    );
    const primary = design.regions.filter((region) => region.hierarchy === "primary");
    const satellite = design.regions.filter((region) => region.hierarchy === "satellite");

    expect(primary).toHaveLength(4);
    expect(satellite).toHaveLength(1);
    expect(satellite[0]!.hamlet?.maxBuildings).toBe(4);
    expect(
      design.regions.some((region) => region.heightScaleRange.max > region.heightScaleRange.min),
    ).toBe(true);
    expect(design.pois.length).toBeGreaterThan(0);
    expect(design.ecology.groves.length).toBeGreaterThan(0);
  });

  it("changes only appearance identity when the season changes", () => {
    const spring = fixture();
    const winter: KingdomWorld = { ...spring, season: "winter" };
    const springGraph = createRepoSemanticGraphV2(spring);
    const winterGraph = createRepoSemanticGraphV2(winter);
    const springDesign = createWorldDesignSpecV3(spring, createWorldPlan(spring), springGraph);
    const winterDesign = createWorldDesignSpecV3(winter, createWorldPlan(winter), winterGraph);

    expect(winterDesign.structureKey).toBe(springDesign.structureKey);
    expect(winterDesign.appearanceKey).not.toBe(springDesign.appearanceKey);
    expect(winterDesign.regions).toEqual(springDesign.regions);
    expect(winterDesign.routes).toEqual(springDesign.routes);
    expect(winterDesign.terrain).toEqual(springDesign.terrain);
  });

  it("rejects a source plan built for a different ecological theme", () => {
    const world = fixture();
    const otherTheme: KingdomWorld = {
      ...world,
      worldTheme: world.worldTheme === "enchanted-forest" ? "kingdom-valley" : "enchanted-forest",
    };

    expect(() =>
      createWorldDesignSpecV3(world, createWorldPlan(otherTheme), createRepoSemanticGraphV2(world)),
    ).toThrow(/different world theme/u);
  });

  it("uses explicit manifest relationships as route intent without fabricating more", () => {
    const world = fixture();
    const first = world.entities.find((entity) => entity.path.length > 0);
    const second = world.entities.find(
      (entity) => entity.path.length > 0 && entity.path !== first?.path,
    );
    const graph = createRepoSemanticGraphV2(world, {
      dependencies: [
        {
          fromPath: first!.path,
          toPath: second!.path,
          reference: "workspace-manifest",
        },
      ],
    });
    const design = createWorldDesignSpecV3(world, createWorldPlan(world), graph);

    expect(design.routes.filter((route) => route.basis === "manifest-dependency")).toEqual([
      expect.objectContaining({ evidence: "workspace-manifest" }),
    ]);
  });
});
