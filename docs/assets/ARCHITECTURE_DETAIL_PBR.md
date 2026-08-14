# Architecture detail PBR bundle

This bundle stages a legally auditable, deterministic PBR detail layer for the current Quaternius modular homes. It does not replace their authored look. The runtime helper preserves each material's base color, base-color map, normal map, metallic/roughness map, transparency, and other authored properties, then optionally adds two high-frequency data samples in explicitly enabled high-quality Walk mode.

The planned scene now consumes this bundle through one lazy, shared texture owner, but only after high-quality Walk is active. Orbit and low quality retain the authored materials with zero added texture loads, samplers, or shader reads; high-quality Orbit retains an already-loaded owner across a Walk toggle so the 42.67 MiB runtime pair is not decoded repeatedly.

## Audited CC0 sources

All four sources are official [Poly Haven](https://polyhaven.com/) texture assets, retrieved on 2026-08-14 under [Poly Haven's CC0 declaration](https://polyhaven.com/license) and the [CC0 1.0 legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode). CC0 does not require attribution, but the authors, processing roles, official download URLs, API byte counts, upstream MD5 values, and independently computed SHA-256 values remain recorded in [`architecture-detail-atlas.json`](../../public/assets/world/architecture/polyhaven/architecture-detail-atlas.json).

| Atlas slot | Family    | Poly Haven asset                                             | Recorded author credit                                    | Physical coverage |
| ---------: | --------- | ------------------------------------------------------------ | --------------------------------------------------------- | ----------------: |
|          0 | plaster   | [White Plaster 02](https://polyhaven.com/a/white_plaster_02) | Rob Tuytel — all                                          |       1.0 × 1.0 m |
|          1 | brick     | [Brick Wall 005](https://polyhaven.com/a/brick_wall_005)     | Dario Barresi — processing; Dimitrios Savva — photography |     1.44 × 1.44 m |
|          2 | wood      | [Wood Table 001](https://polyhaven.com/a/wood_table_001)     | Dimitrios Savva — photography; Rico Cilliers — processing |       1.5 × 1.5 m |
|          3 | roof tile | [Roof Tiles](https://polyhaven.com/a/roof_tiles)             | Stephan Seeliger — all                                    |       2.0 × 2.0 m |

Each slot includes an albedo, OpenGL `+Y` tangent normal, and roughness source. The reviewed 1K JPEG inputs are not redistributed. The source manifest is the acquisition ledger and rebuild allowlist.

## Deterministic atlas layout

The committed output contains six opaque RGB WebPs:

| Tier |  Atlas size |    Cell | Copied-edge gutter | Usable tile | Bilinear-safe through |           Decoded all channels |
| ---- | ----------: | ------: | -----------------: | ----------: | --------------------: | -----------------------------: |
| high | 4096 × 1024 | 1024 px |              64 px |      896 px |                 mip 7 | 48 MiB base / 64 MiB with mips |
| low  |  2048 × 512 |  512 px |              32 px |      448 px |                 mip 6 | 12 MiB base / 16 MiB with mips |

The outer atlas clamps. Shader tile repetition uses `fract`, copied-edge gutters, and explicit `textureGrad` derivatives so a repeated tile does not borrow an adjacent material's mip data. The high-Walk shader caps its requested gradient at the protected mip-7 footprint and fades normal/roughness influence from mip 6 to 7, rather than sampling unsafe coarser atlas levels. The complete six-WebP bundle is 2,116,302 bytes (2.02 MiB).

The current high-Walk runtime contract deliberately loads only normal and roughness. That retained pair costs 32 MiB decoded at the base level and approximately 42.67 MiB with its generated mip chains. The high albedo atlas is included for source completeness, visual comparison, and a future explicitly reviewed base-material workflow; the additive helper neither loads nor samples it. The low tier is similarly staged but is not used while low quality is required to stay at zero added reads.

Rebuild from a directory containing exactly the twelve reviewed source JPEG filenames:

```sh
node scripts/assets/build-architecture-detail-assets.mjs --source /absolute/path/to/reviewed-polyhaven-jpegs
node scripts/assets/verify-architecture-detail-assets.mjs
```

The builder verifies source MD5 and SHA-256, enforces square 1024-pixel JPEG inputs, performs deterministic Lanczos3 resize and copied-edge extension with the Next.js-bundled Sharp 0.35.3, and applies fixed WebP settings. The verifier checks license and attribution fields, atlas geometry, mip-safe gutters, source/output hash formats, file allowlisting, WebP dimensions/channels, grayscale roughness, per-slot roughness means, the 5 MiB shipped budget, and decoded memory accounting.

## Truthful modular-home mapping

The current GLBs expose explicit, non-fuzzy material roles and `TEXCOORD_0` on the relevant primitives:

| Exact authored name | Detail family |
| ------------------- | ------------- |
| `MI_Plaster`        | plaster       |
| `MI_UnevenBrick`    | brick         |
| `MI_WoodTrim`       | wood          |
| `MI_RoundTiles`     | roof tile     |

Those target materials also carry authored base-color, tangent-space normal, and metallic/roughness textures. The helper requires all three plus UV0 before it creates a clone. Names such as `MI_Brick`, `MI_RockTrim`, `MI_WoodTrim_Wear`, or suffixed/fuzzy variants intentionally remain unmatched until separately audited.

The first integration does not need to invent tuning. `PLANNED_ARCHITECTURE_DETAIL_DEFAULT_TUNING` exports the conservative audited starting table below; every value remains inside the hard limits and can be adjusted after the gauntlet:

| Family    | UV repeat | Normal strength | Roughness strength |
| --------- | --------: | --------------: | -----------------: |
| plaster   |     3 × 3 |            0.20 |               0.08 |
| brick     |     1 × 1 |            0.10 |               0.05 |
| wood      |     3 × 3 |            0.16 |               0.08 |
| roof tile |     1 × 1 |            0.09 |               0.05 |

Plaster and fine-grain wood can tolerate modest repetition. Brick and roof tile retain 1 × 1 because their sources contain directional macro structure that can fight the authored pattern if miniaturized. Their starting strengths are correspondingly lower. Omitting surface tuning uses this table by exact classified family.

The dedicated window asset exposes one additional exact role: `MI_WindowGlass` on `/assets/world/quaternius/medieval/Window_Wide_Round1.glb`. It is its own transparent, double-sided primitive. High-quality Walk may therefore clone only that glass material and set bounded emissive color/intensity uniforms. The wall-window modules themselves contain plaster, brick, and wood but no glass role, so whole-wall glow is explicitly forbidden. The window treatment adds zero draw calls, zero samplers, and zero texture reads.

## Renderer-independent integration contract

[`planned-architecture-detail-material.ts`](../../src/components/kingdom/planned-architecture-detail-material.ts) is pure Three.js integration code with no React or renderer ownership. Integration must follow this order:

1. Pass `{ detailEnabled: true, navigationMode: "walk", quality: "high" }`. Every other gate returns before the texture loader is touched.
2. Load the shared runtime atlas owner once. It loads normal and roughness only, configures linear data color space, clamp wrapping, mip filtering, `flipY = false`, and anisotropy capped at 8.
3. Clone/style each source GLTF material once, then pass that already-owned clone, its geometry, the gate, the shared textures, optional surface tuning, and bounded window-emissive tuning to `finalizePlannedArchitectureMaterial`. Omitted surface tuning uses the audited table above.
4. The composite helper classifies the exact role. It patches eligible detail surfaces, applies zero-sampler emission to dedicated window glass, or returns authored-only fallback without creating another clone.
5. Assign the returned final material to the primitive. The source GLTF material and all authored texture references remain unchanged.
6. Call the returned idempotent disposer when the mesh/cache owner releases the final material, then dispose the shared atlas owner after all finalized materials are gone.

The material patch adds exactly two samplers and two fragment texture reads: one OpenGL detail-normal sample and one roughness sample. Roughness is centered on each source's audited mean before being added, avoiding a systematic global roughness shift. Surface family, atlas slot, repeat, strengths, and texture instances are uniforms, so all four roles share one chained program-cache variant. The patch first calls any authored `onBeforeCompile`; if the current Three standard shader anchors are absent, it leaves the authored shader untouched instead of crashing.

The composite helper owns exactly the already-cloned material it receives. It never clones that material again and never disposes the source GLTF material, authored maps, or shared atlas textures. Even an authored-only fallback returns a disposer for the owned clone, preventing gate or eligibility failures from leaking it. The texture owner disposes its two loaded atlases once, including fulfilled textures from a partial load failure. Both cleanup contracts are idempotent. The lower-level clone helpers remain available for isolated consumers, but scene integration should use the single composite boundary to avoid duplicate ownership.

## Required visual gate

The assets, exact material/UV mapping, and fail-closed scene wiring are verified, but physical UV scale and stylistic strength still require the desktop browser gauntlet before visual acceptance. Brick and roof sources contain directional structure, so a poor repeat value can fight the authored masonry or tile pattern. The integration pass must tune each exact role at ground-level near/mid distances, confirm no atlas seams or normal inversion, check transparent window ordering, and compare daylight/night exposure. Until that pass succeeds, the bundle remains restricted to the explicit high-quality Walk gate.
