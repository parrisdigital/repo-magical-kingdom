import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CUSTOM_ASSET_LOD_SILHOUETTE_V1,
  CUSTOM_ASSET_CATALOG_V1_MAX_BYTES,
  CustomAssetCatalogValidationError,
  loadCustomAssetCatalogV1,
  measureCustomAssetLodSilhouetteV1,
  parseCustomAssetCatalogV1,
} from "./custom-asset-catalog-v1";

function readCatalogFixture(): unknown {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "public/assets/world-v2/catalog-v1.json"), "utf8"),
  );
}

function parsedFixture() {
  return parseCustomAssetCatalogV1(readCatalogFixture());
}

type MutableCatalogFixture = {
  conventions: {
    lodSilhouette: {
      maxEnvelopeDeltaRatio: number;
      maxExtentDeltaRatio: number;
      maxCenterDriftRatio: number;
    };
  };
  families: Array<{
    kind: string;
    orientation: null | {
      forwardAxis: string;
      markerNode: string;
      markerPosition: [number, number, number];
    };
    bounds: { min: [number, number, number]; max: [number, number, number] };
    footprint: {
      shape: string;
      center: [number, number];
      halfExtents: [number, number];
      clearanceMeters: number;
    };
    biomeAffinity: { primary: string; compatible: string[] };
    lods: Array<{
      metrics: { bounds: { min: [number, number, number]; max: [number, number, number] } };
      silhouette: {
        envelopeDeltaRatio: [number, number, number];
        extentDeltaRatio: [number, number, number];
        centerDriftRatio: [number, number, number];
      };
    }>;
    collision: {
      nodes: Array<{
        shape: string;
        center: [number, number, number];
        halfExtents: [number, number, number];
      }>;
    };
  }>;
};

function mutableCatalogFixture(): MutableCatalogFixture {
  return readCatalogFixture() as MutableCatalogFixture;
}

function response(
  body: string,
  options: Readonly<{ status?: number; contentType?: string; contentLength?: string }> = {},
) {
  const status = options.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({
      "content-type": options.contentType ?? "application/json; charset=utf-8",
      ...(options.contentLength ? { "content-length": options.contentLength } : {}),
    }),
    text: async () => body,
  };
}

describe("CustomAssetCatalogV1", () => {
  it("accepts and recursively freezes the generated original-only catalog", () => {
    const catalog = parsedFixture();
    const family = catalog.families[0]!;

    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.provenance).toMatchObject({
      origin: "project-original",
      thirdPartyArt: false,
      networkInputs: [],
    });
    expect(family).toMatchObject({
      id: "archive-spire",
      kind: "hero-building",
      batch: "batch-1-proof",
      quality: "proof-not-aaa",
      original: true,
    });
    expect(family.lods.map((lod) => lod.slot)).toEqual(["lod0", "lod1", "lod2"]);
    expect(family.lods.map((lod) => lod.metrics.triangles)).toEqual([1668, 568, 176]);
    expect(family.collision.nodes[0]?.name).toBe("COLLIDER_archive_spire_core");
    expect(family.footprint).toEqual({
      shape: "rectangle",
      center: [0, 0],
      halfExtents: [4.8, 4.8],
      clearanceMeters: 1.5,
    });
    expect(family.biomeAffinity).toEqual({
      primary: "settlement",
      compatible: ["settlement", "work-yard", "garden"],
    });
    expect(family.animations[0]?.name).toBe("BeaconPulse");
    expect(catalog.families.find((entry) => entry.id === "patch-fox")?.orientation).toEqual({
      forwardAxis: "+Z",
      markerNode: "FORWARD_patch_fox",
      markerPosition: [0, 1.38, 3.15],
    });
    expect(catalog.families.map((entry) => entry.kind)).toEqual([
      "hero-building",
      "tree",
      "rock",
      "animal",
      "prop",
    ]);
    expect(catalog.families.every((entry) => entry.lods.length === 3)).toBe(true);
    expect(catalog.textureDelivery).toMatchObject({
      status: "ktx2-shipping",
      source: "project-authored-procedural",
      encoder: { id: "toktx", version: "4.4.2" },
    });
    expect(catalog.conventions.lodSilhouette).toEqual(CUSTOM_ASSET_LOD_SILHOUETTE_V1);
    for (const candidateFamily of catalog.families) {
      for (const lod of candidateFamily.lods) {
        expect(lod.silhouette).toMatchObject(
          measureCustomAssetLodSilhouetteV1(candidateFamily.bounds, lod.metrics.bounds),
        );
        expect(Math.max(...lod.silhouette.envelopeDeltaRatio)).toBeLessThanOrEqual(0.1);
        expect(Math.max(...lod.silhouette.extentDeltaRatio)).toBeLessThanOrEqual(0.1);
        expect(Math.max(...lod.silhouette.centerDriftRatio)).toBeLessThanOrEqual(0.1);
      }
    }
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(family.lods[0]?.metrics)).toBe(true);
  });

  it("fails closed on unknown fields, third-party provenance, and external asset URIs", () => {
    const catalog = parsedFixture();
    const family = catalog.families[0]!;

    expect(() => parseCustomAssetCatalogV1({ ...catalog, unexpected: true })).toThrow(
      CustomAssetCatalogValidationError,
    );
    expect(() =>
      parseCustomAssetCatalogV1({
        ...catalog,
        provenance: { ...catalog.provenance, thirdPartyArt: true },
      }),
    ).toThrow(CustomAssetCatalogValidationError);
    expect(() =>
      parseCustomAssetCatalogV1({
        ...catalog,
        families: [
          {
            ...family,
            lods: [
              { ...family.lods[0], uri: "https://example.com/model.glb" },
              ...family.lods.slice(1),
            ],
          },
        ],
      }),
    ).toThrow(CustomAssetCatalogValidationError);
  });

  it("rejects dishonest pivots, LOD order, and non-decreasing complexity", () => {
    const catalog = parsedFixture();
    const family = catalog.families[0]!;

    expect(() =>
      parseCustomAssetCatalogV1({
        ...catalog,
        families: [{ ...family, pivot: { ...family.pivot, position: [0, 1, 0] } }],
      }),
    ).toThrow(/Ground pivot must be/iu);
    expect(() =>
      parseCustomAssetCatalogV1({
        ...catalog,
        families: [
          {
            ...family,
            lods: [family.lods[1], family.lods[0], family.lods[2]],
          },
        ],
      }),
    ).toThrow(/Expected lod0|LOD distances must increase/iu);
    expect(() =>
      parseCustomAssetCatalogV1({
        ...catalog,
        families: [
          {
            ...family,
            lods: [
              family.lods[0],
              {
                ...family.lods[1],
                metrics: {
                  ...family.lods[1].metrics,
                  triangles: family.lods[0].metrics.triangles,
                },
              },
              family.lods[2],
            ],
          },
        ],
      }),
    ).toThrow(/LOD triangles must decrease/iu);
  });

  it.each([0, 1, 2] as const)(
    "rejects zero and negative collision half-extents on axis %i",
    (axis) => {
      for (const invalidValue of [0, -0.01]) {
        const candidate = mutableCatalogFixture();
        candidate.families[0]!.collision.nodes[0]!.halfExtents[axis] = invalidValue;
        expect(() => parseCustomAssetCatalogV1(candidate)).toThrow(
          CustomAssetCatalogValidationError,
        );
      }
    },
  );

  it("rejects a convex-hull label when no authored hull geometry is supplied", () => {
    const candidate = mutableCatalogFixture();
    const ridge = candidate.families.find((family) => family.kind === "rock")!;
    ridge.collision.nodes[0]!.shape = "convex-hull";

    expect(() => parseCustomAssetCatalogV1(candidate)).toThrow(CustomAssetCatalogValidationError);
  });

  it("rejects collision dimensions that cannot exactly represent spheres or capsules", () => {
    const asymmetricSphere = mutableCatalogFixture();
    const sphereNode = asymmetricSphere.families[0]!.collision.nodes[0]!;
    sphereNode.shape = "sphere";
    sphereNode.halfExtents = [1, 1.1, 1];
    expect(() => parseCustomAssetCatalogV1(asymmetricSphere)).toThrow(
      /equal radius on every axis/iu,
    );

    const asymmetricCapsule = mutableCatalogFixture();
    const capsuleNode = asymmetricCapsule.families[1]!.collision.nodes[0]!;
    capsuleNode.halfExtents = [0.8, 3.6, 0.9];
    expect(() => parseCustomAssetCatalogV1(asymmetricCapsule)).toThrow(/same X\/Z radius/iu);

    const shortCapsule = mutableCatalogFixture();
    const shortCapsuleNode = shortCapsule.families[1]!.collision.nodes[0]!;
    shortCapsuleNode.halfExtents = [0.8, 0.7, 0.8];
    expect(() => parseCustomAssetCatalogV1(shortCapsule)).toThrow(
      /half-height cannot be smaller/iu,
    );
  });

  it("rejects invalid placement footprints and biome affinities", () => {
    const zeroFootprint = mutableCatalogFixture();
    zeroFootprint.families[0]!.footprint.halfExtents[0] = 0;
    expect(() => parseCustomAssetCatalogV1(zeroFootprint)).toThrow(
      CustomAssetCatalogValidationError,
    );

    const outsideBounds = mutableCatalogFixture();
    outsideBounds.families[0]!.footprint.center[0] = 100;
    expect(() => parseCustomAssetCatalogV1(outsideBounds)).toThrow(/footprint must stay inside/iu);

    const incoherentBiome = mutableCatalogFixture();
    incoherentBiome.families[0]!.biomeAffinity.primary = "forest";
    expect(() => parseCustomAssetCatalogV1(incoherentBiome)).toThrow(
      /must include the primary biome/iu,
    );
  });

  it.each([0, 1, 2] as const)(
    "rejects zero-width and reversed family bounds on axis %i",
    (axis) => {
      for (const invalidDelta of [0, -0.01]) {
        const candidate = mutableCatalogFixture();
        const family = candidate.families[0]!;
        const invalidMax = family.bounds.min[axis] + invalidDelta;
        family.bounds.max[axis] = invalidMax;
        family.lods[0]!.metrics.bounds.max[axis] = invalidMax;
        expect(() => parseCustomAssetCatalogV1(candidate)).toThrow(/strictly positive extent/iu);
      }
    },
  );

  it("rejects non-positive bounds inside any LOD metrics contract", () => {
    const candidate = mutableCatalogFixture();
    const bounds = candidate.families[0]!.lods[1]!.metrics.bounds;
    bounds.max[2] = bounds.min[2];

    expect(() => parseCustomAssetCatalogV1(candidate)).toThrow(/strictly positive extent/iu);
  });

  it("fails closed when a lower LOD exceeds the 10% canonical extent envelope", () => {
    const candidate = mutableCatalogFixture();
    const family = candidate.families.find((entry) => entry.kind === "tree")!;
    const lod = family.lods[2]!;
    const referenceExtent = family.bounds.max[0] - family.bounds.min[0];
    lod.metrics.bounds.min[0] = family.bounds.min[0];
    lod.metrics.bounds.max[0] = family.bounds.min[0] + referenceExtent * 0.75;
    lod.silhouette.envelopeDeltaRatio[0] = 0.25;
    lod.silhouette.extentDeltaRatio[0] = 0.25;
    lod.silhouette.centerDriftRatio[0] = 0.125;

    expect(() => parseCustomAssetCatalogV1(candidate)).toThrow(/<=0\.1/iu);
  });

  it("fails closed when a lower LOD center drifts over 10% or understates measured drift", () => {
    const shifted = mutableCatalogFixture();
    const family = shifted.families.find((entry) => entry.kind === "animal")!;
    const lod = family.lods[2]!;
    const referenceExtent = family.bounds.max[2] - family.bounds.min[2];
    lod.metrics.bounds.min[2] = family.bounds.min[2] + referenceExtent * 0.11;
    lod.metrics.bounds.max[2] = family.bounds.max[2] + referenceExtent * 0.11;
    lod.silhouette.envelopeDeltaRatio[2] = 0.11;
    lod.silhouette.extentDeltaRatio[2] = 0;
    lod.silhouette.centerDriftRatio[2] = 0.11;
    expect(() => parseCustomAssetCatalogV1(shifted)).toThrow(/<=0\.1/iu);

    const understated = mutableCatalogFixture();
    understated.families[0]!.lods[1]!.silhouette.extentDeltaRatio[0] = 0.05;
    expect(() => parseCustomAssetCatalogV1(understated)).toThrow(
      /Declared LOD extent drift does not match/iu,
    );
  });

  it("does not allow unknown input to relax the fixed silhouette thresholds", () => {
    const candidate = mutableCatalogFixture();
    candidate.conventions.lodSilhouette.maxEnvelopeDeltaRatio = 1;
    candidate.conventions.lodSilhouette.maxExtentDeltaRatio = 1;
    candidate.conventions.lodSilhouette.maxCenterDriftRatio = 1;

    expect(() => parseCustomAssetCatalogV1(candidate)).toThrow(CustomAssetCatalogValidationError);
  });

  it("rejects missing, sideways, or misplaced animal forward markers", () => {
    for (const orientation of [
      null,
      { forwardAxis: "+X", markerNode: "FORWARD_patch_fox", markerPosition: [0, 1.38, 3.15] },
      { forwardAxis: "+Z", markerNode: "FORWARD_patch_fox", markerPosition: [3.15, 1.38, 0] },
    ]) {
      const candidate = mutableCatalogFixture();
      const animal = candidate.families.find((family) => family.kind === "animal")!;
      animal.orientation = orientation as MutableCatalogFixture["families"][number]["orientation"];
      expect(() => parseCustomAssetCatalogV1(candidate)).toThrow(CustomAssetCatalogValidationError);
    }
  });

  it("accepts only KTX2 texture contracts with channel-correct color spaces", () => {
    const catalog = parsedFixture();
    const family = catalog.families[0]!;
    const texturedMaterial = family.materials.find((material) => material.mode === "textured-pbr");
    expect(texturedMaterial?.textureSet.maps.map((map) => map.channel)).toEqual([
      "baseColor",
      "normal",
      "orm",
    ]);
    if (!texturedMaterial || texturedMaterial.mode !== "textured-pbr") {
      throw new Error("Fixture is missing its KTX2 material proof");
    }
    const normalMap = texturedMaterial.textureSet.maps.find((map) => map.channel === "normal")!;
    expect(() =>
      parseCustomAssetCatalogV1({
        ...catalog,
        families: [
          {
            ...family,
            materials: [
              {
                ...texturedMaterial,
                textureSet: {
                  ...texturedMaterial.textureSet,
                  maps: texturedMaterial.textureSet.maps.map((map) =>
                    map.channel === "normal" ? { ...normalMap, colorSpace: "srgb" } : map,
                  ),
                },
              },
              ...family.materials.slice(1),
            ],
          },
        ],
      }),
    ).toThrow(/normal must use linear/iu);
  });
});

describe("loadCustomAssetCatalogV1", () => {
  it("loads JSON with no-store same-origin semantics", async () => {
    const body = JSON.stringify(readCatalogFixture());
    let observedInput = "";
    let observedInit: RequestInit | undefined;
    const catalog = await loadCustomAssetCatalogV1({
      fetcher: async (input, init) => {
        observedInput = input;
        observedInit = init;
        return response(body);
      },
    });

    expect(observedInput).toBe("/assets/world-v2/catalog-v1.json");
    expect(observedInit).toMatchObject({ cache: "no-store", credentials: "same-origin" });
    expect(catalog.families[0]?.id).toBe("archive-spire");
  });

  it("rejects HTTP failures, wrong content types, oversized bodies, and invalid JSON", async () => {
    await expect(
      loadCustomAssetCatalogV1({ fetcher: async () => response("missing", { status: 404 }) }),
    ).rejects.toThrow(/HTTP 404/iu);
    await expect(
      loadCustomAssetCatalogV1({
        fetcher: async () => response("{}", { contentType: "text/plain" }),
      }),
    ).rejects.toThrow(/application\/json/iu);
    await expect(
      loadCustomAssetCatalogV1({
        fetcher: async () =>
          response("{}", { contentLength: String(CUSTOM_ASSET_CATALOG_V1_MAX_BYTES + 1) }),
      }),
    ).rejects.toThrow(/512 KiB/iu);
    await expect(
      loadCustomAssetCatalogV1({
        fetcher: async () => response("x".repeat(CUSTOM_ASSET_CATALOG_V1_MAX_BYTES + 1)),
      }),
    ).rejects.toThrow(/512 KiB/iu);
    await expect(
      loadCustomAssetCatalogV1({ fetcher: async () => response("not json") }),
    ).rejects.toThrow(/not valid JSON/iu);
  });
});
