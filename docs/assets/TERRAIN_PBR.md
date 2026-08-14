# Terrain PBR atlas

The desktop vertical slice ships a compact, four-material terrain vocabulary
derived from Poly Haven's original CC0 textures. Only the reviewed 1K diffuse,
OpenGL normal, and roughness maps are used; source ZIPs, 8K maps, displacement,
ambient occlusion, metalness, previews, and HDRIs are not distributed.

## Sources and license proof

| Atlas role    | Official asset page                                        | Artist        | Physical capture width |
| ------------- | ---------------------------------------------------------- | ------------- | ---------------------: |
| Grass         | [Sparse Grass](https://polyhaven.com/a/sparse_grass)       | Amal Kumar    |                    2 m |
| Soil and path | [Dirt Floor](https://polyhaven.com/a/dirt_floor)           | eye-candy.xyz |                 2.07 m |
| Exposed rock  | [Rocks Ground 02](https://polyhaven.com/a/rocks_ground_02) | Rob Tuytel    |                    2 m |
| Damp shore    | [Coast Sand 01](https://polyhaven.com/a/coast_sand_01)     | Rob Tuytel    |                   15 m |

Each official asset page identifies its author, exposes the selected diffuse,
Normal (GL), and roughness maps, and declares the asset's CC0 license. Poly
Haven's [official asset-license page](https://polyhaven.com/license) states that
all of its assets are released under CC0 and may be redistributed. The canonical
[CC0 1.0 legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode)
is the governing license text.

The runtime [atlas manifest](../../public/assets/world/terrain/polyhaven/terrain-atlas.json)
records every exact download URL, upstream byte count and MD5 from Poly Haven's
public API, an independently calculated source SHA-256, the artist, physical
dimensions, conversion settings, final output URLs, and output SHA-256 values.
The twelve source JPEGs are deliberately not checked into the repository.

## Runtime contract

The three material channels are horizontal atlases with slots ordered left to
right as `grass`, `soil`, `rock`, and `shore`.

| Tier    | Albedo                    | OpenGL normal                | Roughness                    | Atlas       | Base decoded RGBA | With runtime mips |
| ------- | ------------------------- | ---------------------------- | ---------------------------- | ----------- | ----------------: | ----------------: |
| Desktop | `terrain-albedo.webp`     | `terrain-normal-gl.webp`     | `terrain-roughness.webp`     | 4096 x 1024 |            48 MiB |            64 MiB |
| Low     | `terrain-albedo-low.webp` | `terrain-normal-gl-low.webp` | `terrain-roughness-low.webp` | 2048 x 512  |            12 MiB |            16 MiB |

- Albedo uses `SRGBColorSpace`.
- OpenGL tangent-space normal and roughness use `NoColorSpace`.
- The roughness atlas is explicit grayscale copied to opaque RGB; sample `.r`.
- Every atlas is opaque and has no alpha semantics.
- Set the outer texture to `ClampToEdgeWrapping`; repeat manually within a slot.
- Desktop cells are 1024 pixels with a 64-pixel copied-edge gutter and an
  896-pixel usable tile.
- Low cells are 512 pixels with a 32-pixel copied-edge gutter and a 448-pixel
  usable tile.

The exact slot UV formulas are machine-readable in `terrain-atlas.json`. The
proportional power-of-two gutters remain at least one-half mip texel wide through
LOD 7 on desktop and LOD 6 on the low tier. The common LOD 6 guarantee prevents
bilinear filtering from crossing into a neighboring material at the supported
overview minification while allowing a triplanar shader to bind three atlases
instead of twelve independent texture maps.

No displacement map is included because repository-derived terrain geometry is
the authoritative large-scale surface. No AO map is included because terrain
does not have a stable secondary UV set and the renderer supplies environmental
occlusion. No HDRI is included because the existing dynamic sun/sky path owns
lighting; adding a second environment-lighting contract would increase loading
and memory without improving this texture slice.

## Rebuild

Download only the twelve 1K JPEG files named in `terrain-atlas.json` into a
local source directory. Do not download or commit the large source archives.
The builder refuses any file whose API MD5, SHA-256, dimensions, or format does
not match the reviewed source:

```bash
pnpm assets:terrain:build -- --source "/path/to/reviewed-polyhaven-1k-jpegs"
```

The build uses Sharp 0.35.3 already installed as Next.js's optional production
image dependency. It resizes each source tile, creates copied-edge gutters,
packs both quality tiers, and encodes six browser-native WebPs. It makes no
network requests.

Verify the committed result with:

```bash
pnpm assets:terrain:verify
node attribution/validate.mjs
```

The focused verifier rejects source-provenance drift, incorrect slot order,
wrong dimensions or color-space declarations, alpha, non-WebP outputs,
roughness channel divergence, unregistered files, stale output hashes, a copied-edge
gutter below the documented LOD guarantee, and a combined compressed payload
above 4 MiB. The current six atlases total 2.82 MiB.
