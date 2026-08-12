# Production 3D asset pipeline

Repo Magical Kingdom ships an audited, deliberately small set of authored 3D
models. Repository data decides what the world means and where features appear;
the asset bundle supplies the visual vocabulary used to express that world.

## Shipped set

| Collection | Source pack                                                                                                           | Models | Runtime role                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------- | -----: | -------------------------------------------------------- |
| `medieval` | [Quaternius Medieval Village MegaKit](https://quaternius.com/packs/medievalvillagemegakit.html) Standard free edition |     22 | Textured modular settlement architecture and props       |
| `nature`   | [Quaternius Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html) Standard free edition   |     18 | Textured trees, foliage, flowers, rocks, and path detail |
| `animals`  | [Quaternius Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html)                 |      3 | Rigged deer, fox, and stag wildlife                      |

All three sources declare
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). Exact
upstream license files are preserved under
`public/assets/world/quaternius/licenses/`. CC0 does not require attribution;
the project still credits Quaternius everywhere the visual foundation is
described.

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
- Maximum transformed texture edge: 1024 pixels
- Static animation tracks: none
- Wildlife: at least 12 original clips; `Idle`, `Eating`, `Walk`, and `Gallop`
  are runtime-stable names

The typed URL, name, animation, and orientation contract is
[`src/lib/assets/quaternius.ts`](../src/lib/assets/quaternius.ts).

## Rebuilding

The repository does not silently download third-party media. First obtain and
review the free source archives from their canonical Quaternius pages. Then run
the selected transformations with local source directories:

```bash
pnpm assets:build -- \
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

## Verification and budget

Run:

```bash
pnpm assets:verify
node attribution/validate.mjs
```

The asset verifier fails on a missing model, an unexpected collection count, a
non-triangle primitive, a missing required compression extension, a static
animation track, missing wildlife clips, or a bundle above 12 MiB. The current
bundle contains 43 GLBs totaling 9.95 MiB, with 86,201 triangles and 89 source
primitives before runtime reuse.

The attribution validator independently checks every redistributed file against
its SHA-256 hash and rejects any unregistered model or image. The
machine-readable file list is the authoritative inventory.

## QA decisions

The renderer should instance repeated nature assets and reuse loaded scenes.
Large trees are appropriate as silhouette anchors; smaller trees and foliage
should create irregular density rather than even rows. Modular building pieces
must be composed into sparse, authored settlement clusters instead of chart-like
rings.

An older material-color-only Medieval Village Pack was evaluated for complete
buildings but rejected from the shipped set: conversion exposed invalid line
primitives and visually flat materials. Those files are not distributed or
registered. Only production-suitable textured modules remain.
