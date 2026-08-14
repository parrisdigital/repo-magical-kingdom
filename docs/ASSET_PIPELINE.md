# Production 3D asset pipeline

Repo Magical Kingdom ships an audited, deliberately small set of authored 3D
models. Repository data decides what the world means and where features appear;
the asset bundle supplies the visual vocabulary used to express that world.

## Shipped set

| Collection       | Source pack                                                                                                           | Models | Runtime role                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- | -----: | -------------------------------------------------------- |
| `medieval`       | [Quaternius Medieval Village MegaKit](https://quaternius.com/packs/medievalvillagemegakit.html) Standard free edition |     22 | Textured modular settlement architecture and props       |
| `nature`         | [Quaternius Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html) Standard free edition   |     18 | Textured trees, foliage, flowers, rocks, and path detail |
| `animals`        | [Quaternius Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html)                 |      3 | Rigged deer, fox, and stag wildlife                      |
| `kenney/nature`  | [Kenney Nature Kit](https://kenney.nl/assets/nature-kit) 2.1                                                          |     19 | Six paired tree families and seasonal ground variants    |
| `kenney/holiday` | [Kenney Holiday Kit](https://www.kenney.nl/assets/holiday-kit) 2.0                                                    |      7 | Snowy tree silhouettes and snow-and-stone treatments     |

All five source packs declare
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). Exact
upstream license files are preserved under
`public/assets/world/quaternius/licenses/` and
`public/assets/world/kenney/licenses/`. CC0 does not require attribution; the
project still credits Quaternius and Kenney wherever the visual foundation is
described.

The terrain surface uses a separate four-material
[Poly Haven PBR atlas](assets/TERRAIN_PBR.md): Sparse Grass, Dirt Floor, Rocks
Ground 02, and Coast Sand 01. Poly Haven also declares these assets CC0. Six
guarded WebP atlases cover desktop and low-memory quality tiers without
redistributing the twelve source JPEGs or large source archives.

The authored modular homes use a separate four-family
[Poly Haven architecture detail atlas](assets/ARCHITECTURE_DETAIL_PBR.md):
White Plaster 02, Brick Wall 005, Wood Table 001, and Roof Tiles. The six
guarded WebPs stage high/low albedo, OpenGL normal, and roughness channels.
High-quality Walk loads only the high normal and roughness pair; Orbit and low
quality retain the authored Quaternius materials with zero extra texture reads.

The optional [neutral daylight environment](assets/ENVIRONMENT_HDRI.md) is Poly
Haven's official 1K Kloofendal Overcast (Pure Sky) Radiance HDR, distributed
unchanged for reflections and image-based lighting only. The procedural sky
remains visible; the HDRI must never become the scene background.

WorldClaw showcase images, videos, meshes, textures, materials, and generated
results are not present in this bundle.

### Reviewed source integrity

| Source input                             | SHA-256                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `Medieval Village MegaKit[Standard].zip` | `e60dea67c10f30dccccfbff92a7933f5ea5cfe99be0e2a0fa5118cceabeec5c4` |
| `Stylized Nature MegaKit[Standard].zip`  | `298f6732b872e4cf7b30e6e7abf9641c7f6dc6b326df37ac089533ed7e3d58c9` |
| `Deer.gltf`                              | `b8afd0647e7a74332ce802c8326dfefe1a2b76da67ab925a631aaddb5ae9bdd4` |
| `Fox.gltf`                               | `2f36e3c9c75ecddda85c5f9944e98ee1e88e7c679a546534aff1cea8ecde64c7` |
| `Stag.gltf`                              | `170b964909d16d1ab4d428b1d714f25016913d32481acd9c3d62923192583be6` |
| Kenney Nature Kit 2.1 `nature.zip`       | `fa7974a0d342bfe63c38664ba9f8ec1a4aab8ea25f099bdc56870e33588c4d9d` |
| Kenney Holiday Kit 2.0 `holiday.zip`     | `fde4d514d7297388d98058e8933ff614e071886f7ce57f9aea4b00d7698dd769` |

The animal files are the self-contained glTF downloads in Quaternius's
[official pack folder](https://drive.google.com/drive/folders/1uJ3N5HfB7jKTseJUNQr3N4YaN0UuEtHk):
Deer `1iGpXKrqYGyZCPGHPPSuDAoKnOXLhXJ0q`, Fox
`1z-CWoUC2vJxrqgGFTYlMaywpE1ooV-bA`, and Stag
`1URNoFeIFblJXPFOV6qwPrxZr5dLZ3YGx`. These IDs document the reviewed inputs;
contributors should still enter through the canonical pack page and re-check
the license before rebuilding.

## Runtime contract

- Format: self-contained glTF 2.0 binary (`.glb`)
- Coordinate convention: right-handed, Y-up
- Static asset origin: ground contact near `y = 0`
- Geometry compression: `EXT_meshopt_compression`
- Quantized attributes: `KHR_mesh_quantization`
- Texture delivery: embedded WebP where a source texture is present
- Maximum transformed texture edge: 1024 pixels for Quaternius; 512 pixels for
  the Kenney seasonal subset
- Static animation tracks: none
- Wildlife: at least 12 original clips; `Idle`, `Eating`, `Walk`, and `Gallop`
  are runtime-stable names
- Terrain PBR: opaque RGB WebP atlases; albedo is sRGB, OpenGL tangent-space
  normal and roughness are linear data, and slot order is grass, soil, rock,
  shore
- Terrain memory tiers: 4096 x 1024 desktop atlases (48 MiB base decoded RGBA,
  64 MiB with runtime mips) and 2048 x 512 low atlases (12 MiB base, 16 MiB
  with runtime mips)
- Terrain mip safety: proportional 64-pixel desktop and 32-pixel low copied-edge
  gutters protect bilinear sampling through a common minimum of LOD 6
- Architecture detail PBR: opaque RGB WebP atlases in plaster, brick, wood, and
  roof-tile slots; exact audited material names are required, while authored
  base colors and maps remain authoritative
- Architecture detail memory: six WebPs total 2.02 MiB; the high-Walk sampled
  normal/roughness pair retains approximately 42.67 MiB decoded with mips;
  Orbit and low quality add no samplers or decoded atlas memory
- Optional environment IBL: one 1024 x 512 Radiance HDR (1.12 MiB payload,
  4 MiB half-float decode, 6 MiB retained PMREM, approximately 16 MiB peak GPU
  during PMREM generation), excluded from `scene.background`

Typed URL, name, animation, variant-slot, and orientation contracts are
[`src/lib/assets/quaternius.ts`](../src/lib/assets/quaternius.ts) and
[`src/lib/assets/kenney-seasonal.ts`](../src/lib/assets/kenney-seasonal.ts).

## Rebuilding

The repository does not silently download third-party media. First obtain and
review the free source archives from their canonical Quaternius pages. Then run
the selected transformations with local source directories:

```bash
pnpm assets:quaternius:build -- \
  --medieval-source "/path/to/Medieval Village MegaKit[Standard]/glTF" \
  --nature-source "/path/to/Stylized Nature MegaKit[Standard]/glTF" \
  --animals-source "/path/to/animals" \
  --collections medieval,nature,animals
```

The committed script pins glTF Transform 4.4.2. Static assets use this transform:

```bash
pnpm dlx @gltf-transform/cli@4.4.2 optimize source.gltf output.glb \
  --compress meshopt \
  --texture-compress webp \
  --texture-size 1024 \
  --simplify false \
  --join false \
  --palette false
```

The self-contained animal glTF files are first copied to GLB, then run through
the default optimize sequence—including joining, welding, simplification, and
animation resampling—before Meshopt and WebP delivery. The original named clip
set is preserved. The build selection is explicit in
[`scripts/assets/build-quaternius-assets.mjs`](../scripts/assets/build-quaternius-assets.mjs),
so rebuilding a pack cannot silently add every upstream model.

The Kenney pipeline accepts only the two exact reviewed ZIP hashes, extracts
the explicit 26-model selection, embeds Holiday Kit's upstream shared palette,
and caps it at 512 pixels:

```bash
pnpm assets:seasonal:build -- \
  --nature-archive "/path/to/nature.zip" \
  --holiday-archive "/path/to/holiday.zip"
```

The selection and source hashes are pinned in
[`scripts/assets/kenney-seasonal-manifest.mjs`](../scripts/assets/kenney-seasonal-manifest.mjs).
The complete sourcing and generation policy is the
[seasonal asset playbook](SEASONAL_ASSET_PLAYBOOK.md).

The Poly Haven terrain bundle is rebuilt from only the twelve exact 1K JPEG
maps recorded in the runtime manifest:

```bash
pnpm assets:terrain:build -- \
  --source "/path/to/reviewed-polyhaven-1k-jpegs"
```

The terrain builder verifies source MD5 and SHA-256 values before creating the
desktop and low-memory atlases. Full source, channel, gutter, and runtime details
are in the [terrain PBR documentation](assets/TERRAIN_PBR.md).

The Poly Haven architecture detail bundle is rebuilt from only the twelve exact
1K JPEG maps recorded in its manifest:

```bash
pnpm assets:architecture:build -- \
  --source "/path/to/reviewed-polyhaven-architecture-jpegs"
```

The architecture builder verifies source MD5 and SHA-256 values before
creating the high and low atlases. Full source, exact material-role mapping,
channel, memory, ownership, and tuning contracts are in the
[architecture detail PBR documentation](assets/ARCHITECTURE_DETAIL_PBR.md).

The optional neutral environment is rebuilt without transformation from the
exact official 1K HDR recorded in its manifest:

```bash
pnpm assets:environment:build -- \
  --source "/path/to/kloofendal_overcast_puresky_1k.hdr"
```

The environment builder verifies the official byte count and MD5, independent
SHA-256, filename, Radiance encoding, and 1024 x 512 dimensions before copying
the bytes unchanged. Full runtime and disposal assumptions are in the
[environment HDRI documentation](assets/ENVIRONMENT_HDRI.md).

To rebuild both independently licensed collections in one pass, use the
aggregate command. It requires every reviewed source explicitly:

```bash
pnpm assets:build -- \
  --medieval-source "/path/to/Medieval Village MegaKit[Standard]/glTF" \
  --nature-source "/path/to/Stylized Nature MegaKit[Standard]/glTF" \
  --animals-source "/path/to/animals" \
  --kenney-nature-archive "/path/to/nature.zip" \
  --kenney-holiday-archive "/path/to/holiday.zip"
```

## Verification and budget

Run:

```bash
pnpm assets:verify
node attribution/validate.mjs
```

`assets:verify` aggregates the Quaternius, Kenney, terrain-PBR, environment
HDRI, and architecture-detail verifiers.
The named `assets:quaternius:verify`, `assets:seasonal:verify`, and
`assets:terrain:verify` commands remain available for focused development, as
do `assets:environment:verify` and `assets:architecture:verify`; the aggregate
gate is authoritative for CI.

The asset verifier fails on a missing model, an unexpected collection count, a
non-triangle primitive, a missing required compression extension, a static
animation track, missing wildlife clips, or a bundle above 12 MiB. The current
bundle contains 43 GLBs totaling 9.95 MiB, with 86,201 triangles and 89 source
primitives before runtime reuse.

The supplemental Kenney bundle contains 26 GLBs totaling 169.30 KiB, with 5,330
triangles and 47 source primitives. Its verifier additionally rejects external
buffers or textures, non-grounded roots, unexpected scene hierarchies, stale
license texts, and a bundle above 256 KiB or 6,000 triangles.

The Poly Haven terrain bundle contains six guarded WebP atlases totaling 2.82
MiB. Its focused verifier also rejects altered source provenance, incorrect
slot/channel contracts, alpha, stale hashes, a copied-edge gutter below the
documented LOD guarantee, and any terrain payload above 4 MiB.

The Poly Haven architecture detail bundle contains six guarded WebP atlases
totaling 2.02 MiB. Its focused verifier rejects altered provenance, incorrect
exact material mapping, missing authored UV/map prerequisites, unsafe atlas
geometry or mip gutters, alpha, stale hashes, non-grayscale roughness, drifted
roughness means, unexpected files, or a payload above 5 MiB.

The environment verifier pins the exact 1.12 MiB CC0 source and independently
rejects provenance, dimensions, encoding, hashes, usage, loader, PMREM budget,
directory inventory, or the 1.25 MiB payload ceiling if any contract drifts.

The attribution validator independently checks every redistributed file against
its SHA-256 hash and rejects any unregistered model or image. The
machine-readable file list is the authoritative inventory.

## QA decisions

The renderer should instance repeated nature assets and reuse loaded scenes.
Large trees are appropriate as silhouette anchors; smaller trees and foliage
should create irregular density rather than even rows. Modular building pieces
must be composed into sparse, authored settlement clusters instead of chart-like
rings.

Seasonal variants occupy stable typed slots: swapping spring, summer, autumn,
or winter appearance must not move repository-derived topology or semantic hit
areas.

An older material-color-only Medieval Village Pack was evaluated for complete
buildings but rejected from the shipped set: conversion exposed invalid line
primitives and visually flat materials. Those files are not distributed or
registered. Only production-suitable textured modules remain.
