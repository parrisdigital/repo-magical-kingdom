# Source lineage

This document distinguishes inspiration, dependency use, source adaptation, and
redistribution. Precise language protects upstream creators and helps future
contributors understand which obligations follow each file.

## Current lineage

| Source                                                                                                | Reviewed revision                          | Relationship                          | Code or assets redistributed? |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------- | ----------------------------- |
| [Repository City](https://github.com/parrisdigital/repository-city)                                   | `0e61374af12387266c6fb13c273bee845b5f0864` | Product and architectural predecessor | No                            |
| [ShieldCN](https://github.com/jal-co/shieldcn)                                                        | `af169e6c6030d289142546df7300acfe0eba7468` | External README badge service         | No                            |
| [WorldClaw](https://github.com/Tencent-Hunyuan/Hunyuan3D-WorldClaw)                                   | `d9901019f561c32921e38d0f0f5cabc8f9f2ce48` | Research reference                    | No                            |
| [Quaternius Medieval Village MegaKit](https://quaternius.com/packs/medievalvillagemegakit.html)       | Standard free edition, 2026-08-12          | CC0 runtime asset source              | Yes, modified subset          |
| [Quaternius Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html)         | Standard free edition, 2026-08-12          | CC0 runtime asset source              | Yes, modified subset          |
| [Quaternius Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html) | July 2021 edition, 2026-08-12              | CC0 runtime asset source              | Yes, modified subset          |
| [Kenney Nature Kit](https://kenney.nl/assets/nature-kit)                                              | 2.1, 2026-08-12                            | CC0 seasonal asset source             | Yes, modified subset          |
| [Kenney Holiday Kit](https://www.kenney.nl/assets/holiday-kit)                                        | 2.0, 2026-08-12                            | CC0 seasonal asset source             | Yes, modified subset          |

No application source file is declared as a copy or adaptation of upstream
source code. The Quaternius rows explicitly identify modified, redistributed
media. Runtime packages are consumed through the package manager and recorded
separately in [`attribution/registry.json`](../attribution/registry.json).

## Relationship vocabulary

- **Inspired by:** independently implemented after learning from a product,
  design, paper, or general architecture.
- **Built with:** uses a declared dependency under its license.
- **Adapted from:** contains recognizable upstream source or a derivative and
  must identify its exact origin and license.
- **Redistributed:** includes the original or modified upstream file in this
  repository or a release artifact.
- **External service:** embeds a response from a hosted service but does not
  distribute that service's implementation.

Do not use “based on” when a more precise phrase is available.

## Repository City

Repo Magical Kingdom evolves the repository-as-place concept pioneered in
Repository City. The initial implementation is being written independently
around a deeper, renderer-neutral kingdom contract. If a Repository City file
is copied or adapted later, the pull request must:

1. Identify the exact upstream file and commit.
2. Confirm its MIT license at that revision.
3. Preserve required copyright and license notices.
4. Describe material modifications.
5. Add both a source header and registry entry.

Suggested file header:

```ts
// SPDX-License-Identifier: MIT
// Adapted from Repository City:
// https://github.com/parrisdigital/repository-city/blob/<commit>/<path>
// Original copyright (c) 2026 Parris Digital.
// Modifications: <concise description>
```

Use this only for genuine adaptation, not conceptual similarity.

## ShieldCN

The README references SVG endpoints hosted by `shieldcn.dev`. ShieldCN reads
public repository metadata and renders theme-aware badges. No ShieldCN package,
source file, or generated badge is committed to this repository.

If badge images are ever vendored for offline use, their provenance and license
must be reassessed and the local files registered.

## WorldClaw

WorldClaw contributes research ideas: structured scene specifications,
coarse-to-fine generation, shared semantic regional layouts, selective detail,
and an offline validation loop.

The reviewed default branch did not declare a software license. Therefore:

- No WorldClaw source code is copied or adapted.
- No paper figure, teaser, website image, video, mesh, material, or generated
  output is distributed.
- No WorldClaw model or runtime is represented as an installed dependency.
- The authors and paper are cited wherever the research relationship is
  described.

Future explicit licensing may change what is technically possible, but any
change to this policy requires legal review and a documented pull request.

## Quaternius

Three Quaternius asset packs provide independently licensed runtime media. Each
pack declares CC0 1.0 Universal, and each exact license text is retained beside
the optimized GLBs. The application uses a selected subset, not the complete
packs.

The source glTF geometry, materials, textures, rigs, and animations are
recognizable derivatives. Browser-delivery modifications include GLB
packaging, pruning, deduplication, quantization, Meshopt geometry compression,
and WebP texture conversion where applicable. Geometry simplification is
disabled for static architecture and nature. Wildlife uses the default
optimization sequence, including simplification and animation resampling,
while preserving its named clip set. The transformation script, runtime
contract, verification budgets, exact file list, and hashes are recorded in
[`docs/ASSET_PIPELINE.md`](ASSET_PIPELINE.md),
[`src/lib/assets/quaternius.ts`](../src/lib/assets/quaternius.ts), and the
attribution registry.

CC0 does not require attribution. Repo Magical Kingdom nevertheless names
Quaternius in the application, README, acknowledgements, credits, notices, and
registry as a project policy and a clear account of its visual foundation.

## Kenney seasonal variants

[Kenney Nature Kit 2.1](https://kenney.nl/assets/nature-kit) and
[Kenney Holiday Kit 2.0](https://www.kenney.nl/assets/holiday-kit) provide a
separately licensed, minimal seasonal vocabulary. Both official pack pages and
their archived license files declare CC0 1.0 Universal.

The project redistributes nineteen Nature Kit and seven Holiday Kit models. Browser
delivery flattens, prunes, deduplicates, welds, quantizes, and Meshopt-compresses
the original geometry without simplification, mesh joining, or palette
conversion. Holiday Kit's shared external colormap is embedded as a 512-pixel
WebP image. Exact archive and output hashes, preserved licenses, selected names,
and build commands are recorded in the attribution registry and
[`docs/ASSET_PIPELINE.md`](ASSET_PIPELINE.md).

The variant interface preserves a fixed number of canopy and ground-detail
slots. Seasons may swap their appearance but never move repository-derived
geography, relationships, or semantic hit regions. See the
[seasonal asset playbook](SEASONAL_ASSET_PLAYBOOK.md).

## Updating lineage

Every pull request that introduces upstream source or media must update this
document, `THIRD_PARTY_NOTICES.md`, and the machine-readable registry in the
same change. CI checks file registration; reviewers remain responsible for
confirming that the declared license actually permits the proposed use.
