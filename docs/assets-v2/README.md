# Repository Worlds V2 — Batch 1 asset foundation

This batch is an original-asset factory proof. It does not claim AAA-complete art.

## What ships

- Five original procedural families: hero building, tree, rock/cliff, animated animal, and prop.
- Three grounded GLB LODs per family with stable node/material names.
- A fail-closed LOD silhouette contract: each lower LOD stays within 10% of LOD0 on each per-axis envelope edge, total extent, and center drift for every materially nonzero axis.
- One named animation and one collision proxy per family.
- Explicit placement footprints, clearance radii, and biome affinities for deterministic composition.
- A project-authored 512×512 Archive Spire stone texture set: base color (sRGB), OpenGL normal (linear RGB), and ORM (linear R/G/B), each with 10 mips in UASTC + Zstd KTX2.
- A real Blender 5.1.2 `archive-spire.blend` authoring source and an offline background export proof.
- A fail-closed `CustomAssetCatalogV1`, deterministic source/output hashes, and an isolated development-only `/asset-lab` route.

The local Basis transcoder copied from the installed `three@0.185.1` package is runtime code, not art. Its MIT provenance and exact hashes live in `public/assets/world-v2/basis/runtime-dependencies.json`; it is intentionally separate from the original-art manifest.

## Rebuild

All external tool paths are opt-in environment overrides. No user-specific path is committed.

```sh
export WORLD_ASSETS_V2_BLENDER_BIN="/absolute/path/to/Blender"
export WORLD_ASSETS_V2_TOKTX_BIN="/absolute/path/to/toktx"
export WORLD_ASSETS_V2_KTX_BIN="/absolute/path/to/ktx"
export WORLD_ASSETS_V2_GLTF_TRANSFORM_BIN="/absolute/path/to/gltf-transform"

pnpm assets:v2:build
node scripts/assets-v2/build-blender-authoring.mjs \
  --recipe art/world-v2/batch-1-original-assets.recipe.json \
  --family archive-spire \
  --blend-output art/world-v2/archive-spire/archive-spire.blend \
  --output /tmp/archive-spire-authoring.glb
pnpm assets:v2:verify
pnpm assets:v2:verify:release
```

Tool versions are immutable in the scripts: Blender 5.1.2, KTX-Software 4.4.2,
and glTF Transform 4.4.2. Environment variables select binary paths only and
cannot relax those version pins. The normal verifier always checks the committed GLB/KTX2/catalog structure and
hashes. The release verifier additionally fails unless all four pinned offline
tool overrides above are present and report the expected versions. Original
art marked `LicenseRef-Repository-Worlds-Original` is covered by
`LICENSES/LicenseRef-Repository-Worlds-Original.txt`.

The texture generator clears `TOKTX_OPTIONS`, pins single-threaded UASTC output, creates its source pixels in a temporary directory, and records hashes/bytes in both the catalog and original-art manifest. Blender runs with `--background`, `--factory-startup`, and `--python-exit-code 1`; the wrapper rejects the wrong version, ungrounded output, missing collision data, or missing animation channels.

## Runtime API

Import from `@/lib/world-assets-v2`:

- `parseCustomAssetCatalogV1(input)` validates unknown data and recursively freezes the result.
- `loadCustomAssetCatalogV1({ signal?, fetcher? })` fetches `/assets/world-v2/catalog-v1.json` using same-origin/no-store semantics, enforces JSON and a 512 KiB ceiling, then validates.
- `customAssetCatalogV1Schema` is the strict Zod schema.
- `CustomAssetCatalogV1` is the inferred typed contract.

The catalog rejects unknown keys, external/traversing URIs, third-party or network provenance, invalid hashes, non-grounded or non-positive bounds, zero/negative collision half-extents, inexact sphere/capsule dimensions, unsupported collision claims, invalid or out-of-bounds placement footprints, incoherent biome affinities, invalid LOD ordering, non-decreasing LOD complexity, non-KTX2 texture references, wrong texture color spaces, and a texture-shipping claim without a textured material. Its LOD gate fixes LOD0 as the canonical envelope, independently derives edge-envelope delta, total-extent delta, and center drift from every LOD's measured GLB bounds, caps all three at 10% per axis, and rejects understated measurements or a relaxed threshold. V1 accepts only box, sphere, and capsule proxies because each can be represented exactly by catalog dimensions; Commit Ridge uses an honest box proxy until authored hull geometry exists. Animal assets also carry a validated exported `+Z` forward marker; verification checks the marker, the longitudinal geometry axis, and facial placement so sideways locomotion cannot silently return.

## Asset lab

Run `pnpm dev`, then open `/asset-lab`. It is intentionally unavailable in production. The lab exposes:

- selected-family turntable;
- five-family orbit and pointer-lock WASD walk lineups;
- manual LOD0/1/2 selection plus a scrubbed LOD0→LOD1 or LOD1→LOD2 crossfade inspection;
- beauty, albedo, normal, roughness, metalness, and emissive views;
- wireframe, contact-shadow, collision/placement-footprint, and animation toggles;
- catalog-measured vertices, triangles, draw calls, materials, file/GPU bytes, texture samplers, bounds, footprint/clearance, biome affinity, collision count, animation name, and maximum per-axis silhouette drift.

The beauty path applies the project-authored base-color, normal, and ORM KTX2 maps only to `MAT_archive_spire_stone`; all other authored source maps/materials remain untouched.

## Deliberate limitations

- The proof meshes are procedural low-poly forms, not sculpted or retopologized final art.
- Only one material has full KTX2 channel coverage.
- GLBs are not yet Meshopt-compressed; the contract records Meshopt as the target.
- The animal animation proves a named loop and runtime binding, not a production skeletal gait.
- The asset lab is an inspection surface, not the Repository Worlds scene integration.
