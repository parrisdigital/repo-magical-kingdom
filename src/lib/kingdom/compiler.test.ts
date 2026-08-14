import { describe, expect, it } from "vitest";

import type { RepositorySnapshot } from "@/lib/github";

import { compileKingdom } from "./compiler";
import { createDemoKingdom, createDemoUniverse } from "./demo-world";
import {
  compiledKingdomWorldSchema,
  kingdomWorldSchema,
  legacyKingdomWorldSchema,
} from "./schemas";
import { KINGDOM_SEASONS } from "./types";

function snapshot(paths: ReadonlyArray<string>, repositoryId = 77): RepositorySnapshot {
  return {
    repositoryId,
    owner: "owner",
    repository: "repository",
    description: "Fixture repository",
    defaultBranch: "main",
    commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    commitTreeSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    committedAt: "2026-08-12T12:00:00.000Z",
    canonicalUrl: "https://github.com/owner/repository",
    license: "MIT",
    files: paths.map((path, index) => ({ path, size: 100 + index * 13, sha: `blob-${index}` })),
    treeTruncated: false,
    treeRecovered: false,
    relatedRepositories: [],
    warnings: [],
  };
}

function horizontalDistance(
  first: Readonly<{ position: Readonly<{ x: number; z: number }> }>,
  second: Readonly<{ position: Readonly<{ x: number; z: number }> }>,
): number {
  return Math.hypot(first.position.x - second.position.x, first.position.z - second.position.z);
}

describe("compileKingdom", () => {
  it("is deterministic and pins every source link to the immutable commit", () => {
    const first = createDemoKingdom();
    const second = createDemoKingdom();

    expect(second).toEqual(first);
    expect(first.source.revisionUrl).toContain(first.source.commitSha);
    expect(
      first.entities.every((entity) => entity.sourceUrl.includes(first.source.commitSha)),
    ).toBe(true);
    expect(first.coverage.representedFiles).toBe(first.coverage.eligibleFiles);
  });

  it("applies one explicitly selected season to the whole repository world", () => {
    const paths = [
      "alpha/index.ts",
      "bravo/index.ts",
      "charlie/index.ts",
      "delta/index.ts",
      "echo/index.ts",
      "foxtrot/index.ts",
    ];
    const worlds = KINGDOM_SEASONS.map((season) => compileKingdom(snapshot(paths), { season }));

    expect(worlds.map((world) => world.season)).toEqual(KINGDOM_SEASONS);
    expect(new Set(worlds.map((world) => world.buildKey))).toHaveProperty("size", 4);
    for (const world of worlds) {
      expect(world.provinces.every((province) => province.season === world.season)).toBe(true);
      expect(world.provinces.every((province) => province.biome === world.season)).toBe(true);
    }

    const [spring, ...otherSeasons] = worlds;
    for (const world of otherSeasons) {
      expect(world.entities).toEqual(spring?.entities);
      expect(world.routes).toEqual(spring?.routes);
      expect(
        world.provinces.map((province) => ({
          ...province,
          biome: "normalized",
          season: "normalized",
        })),
      ).toEqual(
        spring?.provinces.map((province) => ({
          ...province,
          biome: "normalized",
          season: "normalized",
        })),
      );
    }
  });

  it("derives an explainable world theme while allowing an explicit override", () => {
    const sourceHeavy = snapshot(
      Array.from({ length: 24 }, (_, index) => `src/feature-${index}.ts`),
    );
    const visualHeavy = snapshot([
      ...Array.from({ length: 8 }, (_, index) => `src/feature-${index}.ts`),
      ...Array.from({ length: 8 }, (_, index) => `docs/scene-${index}.md`),
      ...Array.from({ length: 8 }, (_, index) => `public/scene-${index}.png`),
    ]);

    expect(compileKingdom(sourceHeavy).worldTheme).toBe("kingdom-valley");
    expect(compileKingdom(visualHeavy).worldTheme).toBe("enchanted-forest");

    const valley = compileKingdom(visualHeavy, { worldTheme: "kingdom-valley" });
    const forest = compileKingdom(visualHeavy, { worldTheme: "enchanted-forest" });
    expect(valley.worldTheme).toBe("kingdom-valley");
    expect(forest.worldTheme).toBe("enchanted-forest");
    expect(forest.buildKey).not.toBe(valley.buildKey);
    expect(forest.entities).toEqual(valley.entities);
    expect(forest.routes).toEqual(valley.routes);
    expect(forest.provinces).toEqual(valley.provinces);
  });

  it("keeps geography and build identity stable when source files arrive out of order", () => {
    const paths = ["src/a.ts", "docs/guide.md", "tests/a.test.ts", "package.json"];
    const source = snapshot(paths);
    const ordered = compileKingdom(source);
    const reversed = compileKingdom({ ...source, files: [...source.files].reverse() });

    expect(reversed.buildKey).toBe(ordered.buildKey);
    expect(reversed.provinces).toEqual(ordered.provinces);
    expect(reversed.entities).toEqual(ordered.entities);
  });

  it("authors folder settlements along organic valley corridors rather than radial rings", () => {
    const paths = Array.from({ length: 12 }, (_, provinceIndex) =>
      Array.from(
        { length: 5 },
        (_, fileIndex) => `district-${provinceIndex}/feature-${fileIndex}.ts`,
      ),
    ).flat();
    const world = compileKingdom(snapshot(paths));
    const nexus = world.provinces.find((province) => province.role === "nexus")!;
    const settlements = world.provinces.filter((province) => province.role !== "nexus");

    expect(nexus.position).toEqual({ x: 0, y: 0, z: 24 });
    expect(settlements.every((province) => province.position.z < nexus.position.z)).toBe(true);
    expect(new Set(settlements.map((province) => province.position.x.toFixed(3))).size).toBe(
      settlements.length,
    );

    const radialDistances = settlements.map((province) =>
      Math.hypot(province.position.x, province.position.z),
    );
    expect(new Set(radialDistances.map((distance) => distance.toFixed(2))).size).toBeGreaterThan(
      Math.ceil(settlements.length * 0.75),
    );

    expect(world.routes).toHaveLength(settlements.length);
    expect(
      world.routes.some(
        (route) => route.from.x !== nexus.position.x || route.from.z !== nexus.position.z,
      ),
    ).toBe(true);
    expect(
      world.routes.every(
        (route) =>
          route.to.z < route.from.z &&
          world.bounds.radius >= Math.hypot(route.to.x, route.to.z) + 8,
      ),
    ).toBe(true);
  });

  it("keeps province plots separate and every entity inside its settlement bounds", () => {
    const paths = Array.from({ length: 10 }, (_, provinceIndex) =>
      Array.from(
        { length: 32 },
        (_, fileIndex) => `region-${provinceIndex}/nested/file-${fileIndex}.tsx`,
      ),
    ).flat();
    const world = compileKingdom(snapshot(paths));
    const provincesById = new Map(world.provinces.map((province) => [province.id, province]));

    for (let firstIndex = 0; firstIndex < world.provinces.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < world.provinces.length;
        secondIndex += 1
      ) {
        const first = world.provinces[firstIndex]!;
        const second = world.provinces[secondIndex]!;
        expect(horizontalDistance(first, second)).toBeGreaterThanOrEqual(
          first.radius + second.radius + 11.99,
        );
      }
    }

    for (const entity of world.entities) {
      const province = provincesById.get(entity.provinceId)!;
      const footprint = Math.max(entity.scale.x, entity.scale.z) / 2;
      expect(horizontalDistance(entity, province) + footprint).toBeLessThanOrEqual(
        province.radius + 0.001,
      );
      expect(Math.hypot(entity.position.x, entity.position.z) + footprint).toBeLessThanOrEqual(
        world.bounds.radius,
      );
    }

    expect(
      world.provinces.every(
        (province) =>
          Math.hypot(province.position.x, province.position.z) + province.radius <=
          world.bounds.radius,
      ),
    ).toBe(true);

    const groups = new Map<string, typeof world.entities>();
    for (const province of world.provinces) {
      groups.set(
        province.id,
        world.entities.filter((entity) => entity.provinceId === province.id),
      );
    }
    for (const group of groups.values()) {
      for (let firstIndex = 0; firstIndex < group.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < group.length; secondIndex += 1) {
          const first = group[firstIndex]!;
          const second = group[secondIndex]!;
          const minimumDistance =
            Math.max(first.scale.x, first.scale.z) / 2 +
            Math.max(second.scale.x, second.scale.z) / 2 +
            0.44;
          expect(horizontalDistance(first, second)).toBeGreaterThanOrEqual(minimumDistance);
        }
      }
    }
  });

  it("places related-world portals on an irregular foreground trail inside world bounds", () => {
    const relatedRepositories = Array.from({ length: 6 }, (_, index) => ({
      id: 1000 + index,
      owner: "owner",
      repository: `related-${index}`,
      description: `Related repository ${index}`,
      language: "TypeScript",
      stars: index,
      forks: 0,
      updatedAt: `2026-08-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
      defaultBranch: "main",
      canonicalUrl: `https://github.com/owner/related-${index}`,
    }));
    const source = {
      ...snapshot(["src/index.ts", "docs/guide.md"]),
      relatedRepositories,
    };
    const world = compileKingdom(source);
    const nexus = world.provinces.find((province) => province.role === "nexus")!;

    expect(world.portals).toHaveLength(relatedRepositories.length);
    expect(world.portals.every((portal) => portal.position.y === 0)).toBe(true);
    expect(world.portals.every((portal) => portal.position.z > nexus.position.z)).toBe(true);
    expect(
      new Set(
        world.portals.map((portal) => Math.hypot(portal.position.x, portal.position.z).toFixed(2)),
      ).size,
    ).toBeGreaterThan(4);
    expect(
      world.portals.every(
        (portal) => Math.hypot(portal.position.x, portal.position.z) + 10 <= world.bounds.radius,
      ),
    ).toBe(true);
  });

  it("defaults to spring while allowing deterministic alternate seasons", () => {
    const source = snapshot(["src/a.ts", "docs/guide.md", "tests/a.test.ts"]);
    const defaultWorld = compileKingdom(source);
    const spring = compileKingdom(source, { season: "spring" });
    const winter = compileKingdom(source, { season: "winter" });

    expect(defaultWorld).toEqual(spring);
    expect(winter).toEqual(compileKingdom(source, { season: "winter" }));
    expect(winter.buildKey).not.toBe(spring.buildKey);
  });

  it("aggregates large trees without silently losing a file", () => {
    const paths = Array.from(
      { length: 1_200 },
      (_, index) => `src/feature-${index % 40}/file-${index}.ts`,
    );
    const world = compileKingdom(snapshot(paths));
    const represented = world.entities.reduce(
      (total, entity) => total + entity.representedFiles,
      0,
    );

    expect(world.coverage.eligibleFiles).toBe(1_200);
    expect(world.coverage.directEntities).toBe(720);
    expect(world.coverage.aggregateEntities).toBeGreaterThan(0);
    expect(represented).toBe(1_200);
    expect(world.coverage.representedFiles).toBe(1_200);
    expect(compiledKingdomWorldSchema.safeParse(world).success).toBe(true);
  });

  it("strictly reconciles compiler coverage and explicitly migrates legacy summary counters", () => {
    const world = compileKingdom(
      snapshot(Array.from({ length: 1_200 }, (_, index) => `src/file-${index}.ts`)),
    );
    const actualDirect = world.entities.filter((entity) => !entity.aggregate).length;
    const actualAggregates = world.entities.filter((entity) => entity.aggregate).length;
    const actualRepresented = world.entities.reduce(
      (total, entity) => total + entity.representedFiles,
      0,
    );
    const legacy = {
      ...world,
      coverage: {
        ...world.coverage,
        directEntities: actualDirect + 7,
        aggregateEntities: actualAggregates + 3,
        representedFiles: actualRepresented + 11,
      },
    };

    expect(compiledKingdomWorldSchema.safeParse(legacy).success).toBe(false);
    expect(kingdomWorldSchema.safeParse(legacy).success).toBe(false);
    const compatible = legacyKingdomWorldSchema.safeParse(legacy);
    expect(compatible.success).toBe(true);
    if (!compatible.success) return;
    expect(compatible.data.coverage).toMatchObject({
      directEntities: actualDirect,
      aggregateEntities: actualAggregates,
      representedFiles: actualRepresented,
    });
    expect(compatible.data.warnings).toContainEqual(
      expect.objectContaining({ code: "LEGACY_COVERAGE_RECONCILED" }),
    );

    const wrongBytes = {
      ...world,
      statistics: { ...world.statistics, bytes: world.statistics.bytes + 1 },
    };
    expect(compiledKingdomWorldSchema.safeParse(wrongBytes).success).toBe(false);
  });

  it("reports intentional omissions by reason", () => {
    const world = compileKingdom(
      snapshot([
        "src/index.ts",
        "node_modules/pkg/index.js",
        "pnpm-lock.yaml",
        "public/app.min.js",
        "public/app.js.map",
      ]),
    );

    expect(world.coverage).toMatchObject({
      discoveredFiles: 5,
      eligibleFiles: 1,
      representedFiles: 1,
      omittedFiles: 4,
      sourceComplete: true,
    });
    expect(world.coverage.omissions.map((omission) => omission.reason)).toEqual([
      "vendored",
      "lockfile",
      "minified",
      "source-map",
    ]);
  });

  it("keeps an empty repository valid and navigable", () => {
    const world = compileKingdom(snapshot([]));

    expect(world.provinces).toHaveLength(1);
    expect(world.provinces[0]?.role).toBe("nexus");
    expect(world.entities).toHaveLength(0);
    expect(world.warnings).toContainEqual(expect.objectContaining({ code: "EMPTY_KINGDOM" }));
  });
});

describe("demo fixtures", () => {
  it("provides deterministic kingdom and universe packages", () => {
    expect(createDemoKingdom()).toEqual(createDemoKingdom());
    expect(createDemoUniverse()).toEqual(createDemoUniverse());
    expect(createDemoUniverse().repositories).toHaveLength(1);
  });
});
