import { z } from "zod";

export const CUSTOM_ASSET_CATALOG_V1_URL = "/assets/world-v2/catalog-v1.json";
export const CUSTOM_ASSET_CATALOG_V1_MAX_BYTES = 512 * 1024;
export const CUSTOM_ASSET_LOD_SILHOUETTE_V1 = Object.freeze({
  referenceSlot: "lod0" as const,
  maxEnvelopeDeltaRatio: 0.1 as const,
  maxExtentDeltaRatio: 0.1 as const,
  maxCenterDriftRatio: 0.1 as const,
  materialExtentEpsilonMeters: 0.01 as const,
  inspectionMode: "manual-and-crossfade" as const,
});

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const projectOriginalLicenseSchema = z.literal("LicenseRef-Repository-Worlds-Original");
const vec3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const positiveVec3Schema = z.tuple([
  z.number().finite().positive(),
  z.number().finite().positive(),
  z.number().finite().positive(),
]);
const vec2Schema = z.tuple([z.number().finite(), z.number().finite()]);
const positiveVec2Schema = z.tuple([
  z.number().finite().positive(),
  z.number().finite().positive(),
]);
const boundsSchema = z
  .strictObject({ min: vec3Schema, max: vec3Schema })
  .superRefine((bounds, context) => {
    for (let axis = 0; axis < 3; axis += 1) {
      if (bounds.max[axis]! <= bounds.min[axis]!) {
        context.addIssue({
          code: "custom",
          path: ["max", axis],
          message: "Bounds must have a strictly positive extent on every axis.",
        });
      }
    }
  });
const silhouetteExtentRatioVec3Schema = z.tuple([
  z.number().finite().min(0).max(CUSTOM_ASSET_LOD_SILHOUETTE_V1.maxExtentDeltaRatio),
  z.number().finite().min(0).max(CUSTOM_ASSET_LOD_SILHOUETTE_V1.maxExtentDeltaRatio),
  z.number().finite().min(0).max(CUSTOM_ASSET_LOD_SILHOUETTE_V1.maxExtentDeltaRatio),
]);
const silhouetteEnvelopeRatioVec3Schema = z.tuple([
  z.number().finite().min(0).max(CUSTOM_ASSET_LOD_SILHOUETTE_V1.maxEnvelopeDeltaRatio),
  z.number().finite().min(0).max(CUSTOM_ASSET_LOD_SILHOUETTE_V1.maxEnvelopeDeltaRatio),
  z.number().finite().min(0).max(CUSTOM_ASSET_LOD_SILHOUETTE_V1.maxEnvelopeDeltaRatio),
]);
const silhouetteCenterRatioVec3Schema = z.tuple([
  z.number().finite().min(0).max(CUSTOM_ASSET_LOD_SILHOUETTE_V1.maxCenterDriftRatio),
  z.number().finite().min(0).max(CUSTOM_ASSET_LOD_SILHOUETTE_V1.maxCenterDriftRatio),
  z.number().finite().min(0).max(CUSTOM_ASSET_LOD_SILHOUETTE_V1.maxCenterDriftRatio),
]);
const projectPathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith("/") && !value.split("/").includes(".."), {
    message: "Expected a repository-relative path without traversal segments.",
  })
  .refine((value) => !/^[a-z][a-z\d+.-]*:/iu.test(value), {
    message: "External or protocol-bearing source paths are forbidden.",
  });
const worldAssetUriSchema = z
  .string()
  .regex(/^\/assets\/world-v2\/[a-z0-9/_-]+\.(?:glb|ktx2)$/u)
  .refine((value) => !value.includes("..") && !/%2e/iu.test(value), {
    message: "Asset URI traversal is forbidden.",
  });

const sourceFileSchema = z.strictObject({
  path: projectPathSchema,
  sha256: sha256Schema,
  bytes: z.number().int().positive(),
});

const metricsSchema = z.strictObject({
  meshes: z.number().int().positive(),
  drawCalls: z.number().int().positive(),
  materials: z.number().int().positive(),
  vertices: z.number().int().positive(),
  triangles: z.number().int().positive(),
  geometryBytes: z.number().int().positive(),
  estimatedGpuBytes: z.number().int().positive(),
  bounds: boundsSchema,
});

const textureReferenceSchema = z.strictObject({
  channel: z.enum(["baseColor", "normal", "orm", "emissive"]),
  uri: worldAssetUriSchema.refine((value) => value.endsWith(".ktx2"), {
    message: "Texture references must use KTX2 containers.",
  }),
  colorSpace: z.enum(["srgb", "linear"]),
  sha256: sha256Schema,
  bytes: z.number().int().positive(),
  width: z.literal(512),
  height: z.literal(512),
  mipLevels: z.literal(10),
  encoding: z.literal("uastc-zstd"),
  decodedGpuBytes: z
    .number()
    .int()
    .positive()
    .max(2 * 1024 * 1024),
});

const materialSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    id: z.string().regex(/^MAT_[A-Za-z0-9_]+$/u),
    mode: z.literal("constant-pbr"),
    textureSet: z.null(),
    ktx2Ready: z.literal(true),
  }),
  z.strictObject({
    id: z.string().regex(/^MAT_[A-Za-z0-9_]+$/u),
    mode: z.literal("textured-pbr"),
    textureSet: z.strictObject({
      id: slugSchema,
      container: z.literal("ktx2"),
      maps: z.array(textureReferenceSchema).min(1).max(4),
    }),
    ktx2Ready: z.literal(true),
  }),
]);

const lodSchema = z.strictObject({
  slot: z.enum(["lod0", "lod1", "lod2"]),
  uri: worldAssetUriSchema.refine((value) => value.endsWith(".glb"), {
    message: "LOD assets must ship as GLB.",
  }),
  sha256: sha256Schema,
  bytes: z.number().int().positive(),
  maxDistance: z.number().finite().positive(),
  geometryCompression: z.enum(["none-batch-1-proof", "meshopt"]),
  metrics: metricsSchema,
  silhouette: z.strictObject({
    referenceSlot: z.literal(CUSTOM_ASSET_LOD_SILHOUETTE_V1.referenceSlot),
    envelopeDeltaRatio: silhouetteEnvelopeRatioVec3Schema,
    extentDeltaRatio: silhouetteExtentRatioVec3Schema,
    centerDriftRatio: silhouetteCenterRatioVec3Schema,
    passes: z.literal(true),
  }),
});

const collisionNodeSchema = z
  .strictObject({
    name: z.string().regex(/^COLLIDER_[A-Za-z0-9_]+$/u),
    shape: z.enum(["box", "sphere", "capsule"]),
    center: vec3Schema,
    halfExtents: positiveVec3Schema,
  })
  .superRefine((node, context) => {
    const [halfX, halfY, halfZ] = node.halfExtents;
    if (
      node.shape === "sphere" &&
      (Math.abs(halfX - halfY) > 0.000001 || Math.abs(halfX - halfZ) > 0.000001)
    ) {
      addIssue(
        context,
        ["halfExtents"],
        "Sphere collision half-extents must encode one equal radius on every axis.",
      );
    }
    if (node.shape === "capsule") {
      if (Math.abs(halfX - halfZ) > 0.000001) {
        addIssue(
          context,
          ["halfExtents"],
          "Capsule collision half-extents must use the same X/Z radius.",
        );
      }
      if (halfY + 0.000001 < halfX) {
        addIssue(
          context,
          ["halfExtents"],
          "Capsule collision half-height cannot be smaller than its radius.",
        );
      }
    }
  });

const orientationSchema = z.strictObject({
  forwardAxis: z.literal("+Z"),
  markerNode: z.string().regex(/^FORWARD_[A-Za-z0-9_]+$/u),
  markerPosition: vec3Schema,
});

const animationSchema = z.strictObject({
  name: z.string().min(1),
  durationSeconds: z.number().finite().positive(),
  targetNodes: z.array(z.string().regex(/^ANIM_[A-Za-z0-9_]+$/u)).min(1),
  channels: z.number().int().positive(),
  loop: z.boolean(),
});

const assetBiomeSchema = z.enum([
  "settlement",
  "settlement-edge",
  "roadside",
  "work-yard",
  "garden",
  "meadow",
  "forest",
  "wetland",
  "shore",
  "alpine",
]);

const footprintSchema = z.strictObject({
  shape: z.enum(["ellipse", "rectangle"]),
  center: vec2Schema,
  halfExtents: positiveVec2Schema,
  clearanceMeters: z.number().finite().min(0).max(24),
});

const biomeAffinitySchema = z
  .strictObject({
    primary: assetBiomeSchema,
    compatible: z.array(assetBiomeSchema).min(1),
  })
  .superRefine((affinity, context) => {
    if (!affinity.compatible.includes(affinity.primary)) {
      addIssue(context, ["compatible"], "Compatible biomes must include the primary biome.");
    }
    if (new Set(affinity.compatible).size !== affinity.compatible.length) {
      addIssue(context, ["compatible"], "Compatible biomes must be unique.");
    }
  });

const familySchema = z.strictObject({
  id: slugSchema,
  title: z.string().min(1),
  kind: z.enum(["hero-building", "tree", "rock", "animal", "prop"]),
  batch: z.literal("batch-1-proof"),
  quality: z.literal("proof-not-aaa"),
  original: z.literal(true),
  sourceRecipe: projectPathSchema,
  pivot: z.strictObject({
    mode: z.literal("ground-center"),
    position: vec3Schema,
  }),
  orientation: z.union([orientationSchema, z.null()]),
  bounds: boundsSchema,
  footprint: footprintSchema,
  biomeAffinity: biomeAffinitySchema,
  materials: z.array(materialSchema).min(1),
  lods: z.tuple([lodSchema, lodSchema, lodSchema]),
  collision: z.strictObject({
    kind: z.literal("compound"),
    nodes: z.array(collisionNodeSchema).min(1),
  }),
  animations: z.array(animationSchema).min(1),
  tags: z.array(slugSchema).min(1),
  limitations: z.array(z.string().min(1)).min(1),
});

function addIssue(
  context: z.RefinementCtx,
  path: ReadonlyArray<string | number>,
  message: string,
): void {
  context.addIssue({ code: "custom", path: [...path], message });
}

export const customAssetCatalogV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: z.literal("repository-worlds-v2-original-assets"),
    generatedAt: z.iso.datetime(),
    provenance: z.strictObject({
      origin: z.literal("project-original"),
      thirdPartyArt: z.literal(false),
      networkInputs: z.tuple([]),
      license: projectOriginalLicenseSchema,
      authors: z
        .array(
          z.strictObject({
            name: z.string().min(1),
            role: z.string().min(1),
          }),
        )
        .min(1),
      sourceFiles: z.array(sourceFileSchema).min(2),
      generator: z.strictObject({
        id: z.literal("repository-worlds-v2-procedural-v1"),
        engine: z.string().regex(/^three-r\d+$/u),
        deterministic: z.literal(true),
        blenderRequired: z.literal(false),
        blenderPolicy: z.literal("offline-background-only"),
      }),
    }),
    conventions: z.strictObject({
      shippingFormat: z.literal("glb"),
      coordinateSystem: z.literal("right-handed"),
      units: z.literal("meters"),
      upAxis: z.literal("+Y"),
      forwardAxis: z.literal("+Z"),
      pivot: z.literal("ground-center"),
      textureContainer: z.literal("ktx2"),
      geometryCompressionTarget: z.literal("meshopt"),
      lodSilhouette: z.strictObject({
        referenceSlot: z.literal(CUSTOM_ASSET_LOD_SILHOUETTE_V1.referenceSlot),
        maxEnvelopeDeltaRatio: z.literal(CUSTOM_ASSET_LOD_SILHOUETTE_V1.maxEnvelopeDeltaRatio),
        maxExtentDeltaRatio: z.literal(CUSTOM_ASSET_LOD_SILHOUETTE_V1.maxExtentDeltaRatio),
        maxCenterDriftRatio: z.literal(CUSTOM_ASSET_LOD_SILHOUETTE_V1.maxCenterDriftRatio),
        materialExtentEpsilonMeters: z.literal(
          CUSTOM_ASSET_LOD_SILHOUETTE_V1.materialExtentEpsilonMeters,
        ),
        inspectionMode: z.literal(CUSTOM_ASSET_LOD_SILHOUETTE_V1.inspectionMode),
      }),
    }),
    textureDelivery: z.strictObject({
      status: z.literal("ktx2-shipping"),
      preferredContainer: z.literal("ktx2"),
      source: z.literal("project-authored-procedural"),
      encoder: z.strictObject({
        id: z.literal("toktx"),
        version: z.literal("4.4.2"),
        envOverride: z.literal("WORLD_ASSETS_V2_TOKTX_BIN"),
      }),
      localTranscoder: z.strictObject({
        basePath: z.literal("/assets/world-v2/basis/"),
        dependency: z.literal("three"),
        version: z.literal("0.185.1"),
        art: z.literal(false),
      }),
      channels: z.strictObject({
        baseColor: z.literal("srgb"),
        emissive: z.literal("srgb"),
        normal: z.literal("linear-opengl-y-positive"),
        orm: z.literal("linear-occlusion-roughness-metalness"),
      }),
    }),
    families: z.array(familySchema).min(1),
  })
  .superRefine((catalog, context) => {
    const sourcePaths = new Set<string>();
    for (const [index, source] of catalog.provenance.sourceFiles.entries()) {
      if (sourcePaths.has(source.path)) {
        addIssue(context, ["provenance", "sourceFiles", index, "path"], "Duplicate source path.");
      }
      sourcePaths.add(source.path);
    }

    const familyIds = new Set<string>();
    const textureUris = new Set<string>();
    let texturedMaterialCount = 0;
    for (const [familyIndex, family] of catalog.families.entries()) {
      const familyPath = ["families", familyIndex] as const;
      if (familyIds.has(family.id)) {
        addIssue(context, [...familyPath, "id"], "Duplicate asset family id.");
      }
      familyIds.add(family.id);
      if (family.pivot.position.some((value) => value !== 0)) {
        addIssue(context, [...familyPath, "pivot", "position"], "Ground pivot must be [0,0,0].");
      }
      if (family.kind === "animal") {
        if (family.orientation === null) {
          addIssue(
            context,
            [...familyPath, "orientation"],
            "Animal assets require an explicit +Z forward marker.",
          );
        } else if (
          Math.abs(family.orientation.markerPosition[0]) > 0.000001 ||
          family.orientation.markerPosition[2] <= 0
        ) {
          addIssue(
            context,
            [...familyPath, "orientation", "markerPosition"],
            "The +Z forward marker must lie on the centerline ahead of the origin.",
          );
        }
      } else if (family.orientation !== null) {
        addIssue(
          context,
          [...familyPath, "orientation"],
          "Batch-1 forward markers are reserved for animal assets.",
        );
      }
      if (Math.abs(family.bounds.min[1]) > 0.000001) {
        addIssue(context, [...familyPath, "bounds", "min", 1], "Family bounds must touch Y=0.");
      }
      const footprintMinimumX = family.footprint.center[0] - family.footprint.halfExtents[0];
      const footprintMaximumX = family.footprint.center[0] + family.footprint.halfExtents[0];
      const footprintMinimumZ = family.footprint.center[1] - family.footprint.halfExtents[1];
      const footprintMaximumZ = family.footprint.center[1] + family.footprint.halfExtents[1];
      if (
        footprintMinimumX < family.bounds.min[0] - 0.000001 ||
        footprintMaximumX > family.bounds.max[0] + 0.000001 ||
        footprintMinimumZ < family.bounds.min[2] - 0.000001 ||
        footprintMaximumZ > family.bounds.max[2] + 0.000001
      ) {
        addIssue(
          context,
          [...familyPath, "footprint"],
          "Placement footprint must stay inside the canonical LOD0 horizontal bounds.",
        );
      }
      if (!family.limitations.some((value) => value.toLowerCase().includes("not aaa"))) {
        addIssue(
          context,
          [...familyPath, "limitations"],
          "Batch-1 proof must explicitly state that it is not AAA-complete.",
        );
      }

      const expectedSlots = ["lod0", "lod1", "lod2"] as const;
      for (const [lodIndex, lod] of family.lods.entries()) {
        const lodPath = [...familyPath, "lods", lodIndex] as const;
        const expectedSlot = expectedSlots[lodIndex]!;
        if (lod.slot !== expectedSlot) {
          addIssue(context, [...lodPath, "slot"], `Expected ${expectedSlot}.`);
        }
        if (!lod.uri.includes(`/${family.id}/${family.id}-${lod.slot}.glb`)) {
          addIssue(context, [...lodPath, "uri"], "LOD URI must match its family id and slot.");
        }
        if (Math.abs(lod.metrics.bounds.min[1]) > 0.000001) {
          addIssue(context, [...lodPath, "metrics", "bounds"], "Each LOD must remain grounded.");
        }
        if (lod.metrics.estimatedGpuBytes < lod.metrics.geometryBytes) {
          addIssue(
            context,
            [...lodPath, "metrics", "estimatedGpuBytes"],
            "Estimated GPU bytes cannot be smaller than geometry bytes.",
          );
        }
        const measuredSilhouette = measureCustomAssetLodSilhouetteV1(
          family.bounds,
          lod.metrics.bounds,
        );
        for (let axis = 0; axis < 3; axis += 1) {
          if (
            Math.abs(
              measuredSilhouette.envelopeDeltaRatio[axis]! -
                lod.silhouette.envelopeDeltaRatio[axis]!,
            ) > 0.000001
          ) {
            addIssue(
              context,
              [...lodPath, "silhouette", "envelopeDeltaRatio", axis],
              "Declared LOD envelope drift does not match its measured bounds.",
            );
          }
          if (
            Math.abs(
              measuredSilhouette.extentDeltaRatio[axis]! - lod.silhouette.extentDeltaRatio[axis]!,
            ) > 0.000001
          ) {
            addIssue(
              context,
              [...lodPath, "silhouette", "extentDeltaRatio", axis],
              "Declared LOD extent drift does not match its measured bounds.",
            );
          }
          if (
            Math.abs(
              measuredSilhouette.centerDriftRatio[axis]! - lod.silhouette.centerDriftRatio[axis]!,
            ) > 0.000001
          ) {
            addIssue(
              context,
              [...lodPath, "silhouette", "centerDriftRatio", axis],
              "Declared LOD center drift does not match its measured bounds.",
            );
          }
        }
        if (lodIndex > 0) {
          const previous = family.lods[lodIndex - 1]!;
          if (lod.maxDistance <= previous.maxDistance) {
            addIssue(context, [...lodPath, "maxDistance"], "LOD distances must increase.");
          }
          if (lod.metrics.triangles >= previous.metrics.triangles) {
            addIssue(context, [...lodPath, "metrics", "triangles"], "LOD triangles must decrease.");
          }
          if (lod.metrics.vertices >= previous.metrics.vertices) {
            addIssue(context, [...lodPath, "metrics", "vertices"], "LOD vertices must decrease.");
          }
          if (lod.bytes >= previous.bytes) {
            addIssue(context, [...lodPath, "bytes"], "LOD shipped bytes must decrease.");
          }
        }
      }

      if (JSON.stringify(family.bounds) !== JSON.stringify(family.lods[0].metrics.bounds)) {
        addIssue(context, [...familyPath, "bounds"], "Family bounds must equal LOD0 bounds.");
      }
      const materialIds = family.materials.map((material) => material.id);
      if (new Set(materialIds).size !== materialIds.length) {
        addIssue(context, [...familyPath, "materials"], "Material ids must be unique.");
      }
      for (const [materialIndex, material] of family.materials.entries()) {
        if (material.mode !== "textured-pbr") continue;
        texturedMaterialCount += 1;
        const channels = material.textureSet.maps.map((map) => map.channel);
        if (new Set(channels).size !== channels.length) {
          addIssue(
            context,
            [...familyPath, "materials", materialIndex, "textureSet", "maps"],
            "KTX2 texture channels must be unique.",
          );
        }
        for (const [mapIndex, map] of material.textureSet.maps.entries()) {
          if (textureUris.has(map.uri)) {
            addIssue(
              context,
              [...familyPath, "materials", materialIndex, "textureSet", "maps", mapIndex, "uri"],
              "KTX2 texture URIs must be globally unique.",
            );
          }
          textureUris.add(map.uri);
          const expectedColorSpace =
            map.channel === "baseColor" || map.channel === "emissive" ? "srgb" : "linear";
          if (map.colorSpace !== expectedColorSpace) {
            addIssue(
              context,
              [
                ...familyPath,
                "materials",
                materialIndex,
                "textureSet",
                "maps",
                mapIndex,
                "colorSpace",
              ],
              `${map.channel} must use ${expectedColorSpace}.`,
            );
          }
        }
      }
    }
    if (texturedMaterialCount === 0) {
      addIssue(
        context,
        ["textureDelivery", "status"],
        "KTX2 shipping status requires at least one textured PBR material.",
      );
    }
  });

type BoundsLike = Readonly<{
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}>;

function roundedRatio(value: number): number {
  return Number(value.toFixed(6));
}

export function measureCustomAssetLodSilhouetteV1(
  referenceBounds: BoundsLike,
  candidateBounds: BoundsLike,
) {
  const envelopeDeltaRatio: [number, number, number] = [0, 0, 0];
  const extentDeltaRatio: [number, number, number] = [0, 0, 0];
  const centerDriftRatio: [number, number, number] = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    const referenceMinimum = referenceBounds.min[axis]!;
    const referenceMaximum = referenceBounds.max[axis]!;
    const referenceExtent = referenceMaximum - referenceMinimum;
    if (referenceExtent < CUSTOM_ASSET_LOD_SILHOUETTE_V1.materialExtentEpsilonMeters) continue;
    const candidateMinimum = candidateBounds.min[axis]!;
    const candidateMaximum = candidateBounds.max[axis]!;
    const candidateExtent = candidateMaximum - candidateMinimum;
    const referenceCenter = (referenceMinimum + referenceMaximum) * 0.5;
    const candidateCenter = (candidateMinimum + candidateMaximum) * 0.5;
    envelopeDeltaRatio[axis] = roundedRatio(
      Math.max(
        Math.abs(candidateMinimum - referenceMinimum),
        Math.abs(candidateMaximum - referenceMaximum),
      ) / referenceExtent,
    );
    extentDeltaRatio[axis] = roundedRatio(
      Math.abs(candidateExtent - referenceExtent) / referenceExtent,
    );
    centerDriftRatio[axis] = roundedRatio(
      Math.abs(candidateCenter - referenceCenter) / referenceExtent,
    );
  }
  return Object.freeze({
    envelopeDeltaRatio: Object.freeze(envelopeDeltaRatio),
    extentDeltaRatio: Object.freeze(extentDeltaRatio),
    centerDriftRatio: Object.freeze(centerDriftRatio),
  });
}

export type CustomAssetCatalogV1 = Readonly<z.infer<typeof customAssetCatalogV1Schema>>;

export class CustomAssetCatalogValidationError extends Error {
  readonly issues: ReadonlyArray<z.core.$ZodIssue>;

  constructor(issues: ReadonlyArray<z.core.$ZodIssue>) {
    const summary = issues
      .slice(0, 4)
      .map((issue) => `${issue.path.join(".") || "catalog"}: ${issue.message}`)
      .join("; ");
    super(`CustomAssetCatalogV1 rejected: ${summary}`);
    this.name = "CustomAssetCatalogValidationError";
    this.issues = issues;
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function parseCustomAssetCatalogV1(input: unknown): CustomAssetCatalogV1 {
  const parsed = customAssetCatalogV1Schema.safeParse(input);
  if (!parsed.success) throw new CustomAssetCatalogValidationError(parsed.error.issues);
  return deepFreeze(parsed.data);
}

export type CustomAssetCatalogFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "headers" | "ok" | "status" | "text">>;

export async function loadCustomAssetCatalogV1(
  options: Readonly<{
    signal?: AbortSignal;
    fetcher?: CustomAssetCatalogFetch;
  }> = {},
): Promise<CustomAssetCatalogV1> {
  const fetcher: CustomAssetCatalogFetch = options.fetcher ?? fetch;
  const response = await fetcher(CUSTOM_ASSET_CATALOG_V1_URL, {
    cache: "no-store",
    credentials: "same-origin",
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`Custom asset catalog request failed with HTTP ${response.status}.`);
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("Custom asset catalog response must be application/json.");
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > CUSTOM_ASSET_CATALOG_V1_MAX_BYTES) {
    throw new Error("Custom asset catalog exceeds the 512 KiB response budget.");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > CUSTOM_ASSET_CATALOG_V1_MAX_BYTES) {
    throw new Error("Custom asset catalog exceeds the 512 KiB response budget.");
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    throw new Error("Custom asset catalog response is not valid JSON.");
  }
  return parseCustomAssetCatalogV1(candidate);
}
