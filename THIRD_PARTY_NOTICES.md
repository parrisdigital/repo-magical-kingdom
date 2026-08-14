# Third-party notices

This document records the direct runtime dependencies and external project
relationships known at this revision. It is not a replacement for each
dependency's complete license text. The package lockfile and generated release
SBOM are the authoritative dependency inventory for a specific build.

## Direct runtime dependencies

| Project                                                          | Version | License | Use                          |
| ---------------------------------------------------------------- | ------- | ------- | ---------------------------- |
| [Next.js](https://github.com/vercel/next.js)                     | 16.3.0  | MIT     | Web application framework    |
| [React](https://github.com/react/react)                          | 19.2.8  | MIT     | Application UI               |
| [React DOM](https://github.com/react/react)                      | 19.2.8  | MIT     | Browser rendering            |
| [Three.js](https://github.com/mrdoob/three.js)                   | 0.185.1 | MIT     | WebGL and 3D primitives      |
| [React Three Fiber](https://github.com/pmndrs/react-three-fiber) | 9.7.0   | MIT     | React renderer for Three.js  |
| [Drei](https://github.com/pmndrs/drei)                           | 10.7.8  | MIT     | React Three Fiber helpers    |
| [Zod](https://github.com/colinhacks/zod)                         | 4.4.3   | MIT     | Runtime boundary validation  |
| [Zustand](https://github.com/pmndrs/zustand)                     | 5.0.14  | MIT     | Application state management |

Each dependency is copyright its respective contributors and is used under its
own license. Production builds may bundle and redistribute portions of these
packages under their declared licenses even though their upstream source files
are not copied as standalone files into this Git repository. License texts are
available in the dependency distributions and linked repositories.

## Community policy sources

### Contributor Covenant

`CODE_OF_CONDUCT.md` is adapted from Contributor Covenant version 2.1, created
by Coraline Ada Ehmke and the Contributor Covenant community and licensed under
CC BY 4.0. The project-specific enforcement contact and presentation are local
modifications. Source: <https://www.contributor-covenant.org/version/2/1/code_of_conduct/>

### Developer Certificate of Origin

`DCO` reproduces the Developer Certificate of Origin version 1.1, copyright
2004 and 2006 The Linux Foundation and its contributors. The text permits
verbatim copying and distribution and has not been modified. Source:
<https://developercertificate.org/>

## Referenced projects

### Repository City

- Source: <https://github.com/parrisdigital/repository-city>
- Reviewed revision: `0e61374af12387266c6fb13c273bee845b5f0864`
- License: MIT
- Relationship: conceptual and architectural predecessor
- Redistribution status: no upstream source files are currently redistributed

### ShieldCN

- Source: <https://github.com/jal-co/shieldcn>
- Service: <https://shieldcn.dev/>
- Reviewed revision: `af169e6c6030d289142546df7300acfe0eba7468`
- License: MIT
- Relationship: external service rendering README badges
- Redistribution status: no ShieldCN source files are redistributed

### WorldClaw

- Source: <https://github.com/Tencent-Hunyuan/Hunyuan3D-WorldClaw>
- Paper: <https://doi.org/10.48550/arXiv.2608.05248>
- Reviewed revision: `d9901019f561c32921e38d0f0f5cabc8f9f2ce48`
- License at reviewed revision: not declared
- Relationship: research citation and conceptual inspiration only
- Redistribution status: no source code, figures, imagery, meshes, website
  assets, or generated results are redistributed

### Tiny World Builder

- Source: <https://github.com/jasonkneen/tiny-world-builder>
- Reviewed revision: `de89a516f7d08786436f3b63bf74942759e8d98b`
- License: AGPL-3.0
- Relationship: procedural-system research reference for explicit world scale,
  deterministic terrain, chunk/LOD boundaries, and bounded animal movement
- Redistribution status: no source code, assets, UI, generated worlds, or
  visual style are copied, adapted, redistributed, or loaded at runtime

## Project-generated media

The README hero, social preview, Four-Season Cycle application mark and
installable icons, and Orbital Mountain favicon are original project media
generated with OpenAI's image generation tool from this project's own reviewed
application artwork. They are distributed under CC BY 4.0 rather than the
repository's default MIT source-code license. Full prompts, supplied-reference
rights, original output hashes, conversion steps, final file hashes, and human
review records are maintained in `attribution/registry.json`.

## Assets

| Creator                               | Pack                          | License | Runtime use                                       |
| ------------------------------------- | ----------------------------- | ------- | ------------------------------------------------- |
| [Quaternius](https://quaternius.com/) | Medieval Village MegaKit      | CC0-1.0 | Textured modular settlement architecture          |
| [Quaternius](https://quaternius.com/) | Stylized Nature MegaKit       | CC0-1.0 | Trees, foliage, flowers, rocks, and path details  |
| [Quaternius](https://quaternius.com/) | Ultimate Animated Animal Pack | CC0-1.0 | Rigged deer, fox, and stag with animation clips   |
| [Kenney](https://kenney.nl/)          | Nature Kit 2.1                | CC0-1.0 | Six paired tree families and seasonal ground art  |
| [Kenney](https://kenney.nl/)          | Holiday Kit 2.0               | CC0-1.0 | Snow trees and snow-and-stone surface treatments  |
| [Poly Haven](https://polyhaven.com/)  | Four terrain textures         | CC0-1.0 | Packed grass, soil, rock, and shore PBR channels  |
| [Poly Haven](https://polyhaven.com/)  | Four architecture textures    | CC0-1.0 | Plaster, brick, wood, and roof material detail    |
| [Poly Haven](https://polyhaven.com/)  | Kloofendal Overcast Pure Sky  | CC0-1.0 | Optional reflection and image-based lighting HDRI |

The project redistributes a curated subset rather than each complete source
pack. Source glTF files were packaged as self-contained GLBs, pruned,
deduplicated, quantized, Meshopt-compressed, and converted to WebP textures
where applicable with glTF Transform 4.4.2. Geometry simplification was
disabled for the modular architecture and nature collections; wildlife uses
the default optimize sequence, including simplification and animation
resampling, while preserving its named clip set. Exact license texts are
preserved in `public/assets/world/quaternius/licenses/` and
`public/assets/world/kenney/licenses/`; exact output hashes and file lists are
in `attribution/registry.json`.

The Poly Haven terrain texture selection is distributed as six guarded WebP
atlases. Its official asset-page URLs, named artists, exact source hashes,
conversion settings, output hashes, and CC0 declaration are documented in
`docs/assets/TERRAIN_PBR.md` and
`public/assets/world/terrain/polyhaven/terrain-atlas.json`. The original 1K
JPEG inputs and complete source archives are not redistributed.

The Poly Haven architecture detail selection is distributed as six guarded
high/low WebP atlases. White Plaster 02, Brick Wall 005, Wood Table 001, and
Roof Tiles supply auditable surface detail for exact modular-home material
roles; the runtime preserves the authored base materials and samples only the
high normal and roughness atlases in high-quality Walk. Source URLs, named
artists, source and output hashes, conversion settings, runtime limits, and the
CC0 declaration are documented in `docs/assets/ARCHITECTURE_DETAIL_PBR.md` and
`public/assets/world/architecture/polyhaven/architecture-detail-atlas.json`.
The twelve reviewed 1K JPEG inputs and complete source archives are not
redistributed.

Poly Haven's official 1K Kloofendal Overcast (Pure Sky) Radiance HDR is
redistributed byte-for-byte for optional reflections and image-based lighting,
never as the visible scene background. Its exact source metadata, author,
hashes, usage restriction, and runtime memory contract are documented in
`docs/assets/ENVIRONMENT_HDRI.md` and
`public/assets/world/environment/polyhaven/environment-manifest.json`.

The original works are dedicated under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
Attribution is not legally required, but recognition of Quaternius, Kenney, and
Poly Haven's named artists is retained throughout the project because the
assets materially shape the experience. Kenney's Holiday Kit palette is
embedded as a 512-pixel WebP image;
its selected models and the Nature Kit variants are flattened, pruned,
deduplicated, welded, quantized, and Meshopt-compressed without geometry
simplification.

See [the asset policy](docs/ASSET_POLICY.md) and
[the production asset pipeline](docs/ASSET_PIPELINE.md) before adding or
replacing any model, texture, environment map, font, sound, image, video, or
generated media file.
