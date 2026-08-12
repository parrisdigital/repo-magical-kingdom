# Seasonal asset playbook

This playbook translates Repo Magical Kingdom's research direction into a
repeatable, legally reviewable asset workflow. A repository receives one chosen
season at a time. Season changes appearance—foliage, snow, surface accents,
atmosphere—not repository-derived geography or semantic coverage.

## Research blueprint and project adaptation

[WorldClaw's paper](https://doi.org/10.48550/arXiv.2608.05248),
[source repository](https://github.com/Tencent-Hunyuan/Hunyuan3D-WorldClaw),
and [project page](https://tencent-hunyuan.github.io/Hunyuan3D-WorldClaw/)
publish a coarse-to-fine workflow: turn intent into a structured regional
specification, establish a semantic terrain foundation, selectively add
terrain-conditioned regional objects, then inspect and refine editable
instances. Its project page also describes a mixed sourcing strategy using
procedural scatter, downloaded assets, and 3D generation across the four
showcase seasons.

Repo Magical Kingdom adopts that high-level method, not WorldClaw's media or
code:

1. Repository semantics define regions, exclusions, density, and visual
   budgets before an asset is selected.
2. Terrain and water remain the shared global foundation.
3. Reusable audited assets fill only regions whose function calls for them.
4. Every instance stays independently placeable, selectable where semantic,
   and testable against terrain contact and collision constraints.
5. Render review drives revisions to composition, scale, contact, and palette.

No WorldClaw screenshot, video, mesh, texture, material, website asset, or
generated output is included. The reviewed WorldClaw revision did not declare a
software license; it remains a research citation.

## Published showcase patterns translated for repositories

The following scene briefs are **project-authored paraphrases and adaptations**
of patterns published on the
[WorldClaw project page](https://tencent-hunyuan.github.io/Hunyuan3D-WorldClaw/)
and in its [showcase data](https://github.com/Tencent-Hunyuan/Hunyuan3D-WorldClaw).
They are not quotes or Tencent-authored prompts. Each version replaces generic
scene population with traceable repository semantics and our legal asset
policy.

- **Multi-biome medieval repository world:** Create one coherent medieval
  kingdom whose strongest top-level subsystems occupy connected alpine,
  meadow, watershed, and dry-rock regions. Keep only two to four clustered
  hamlets, express remaining provinces through groves, shrines, landforms, and
  wildlife, and preserve a navigable shared terrain rather than four separate
  dioramas.
- **Snowbound riverside repository village:** Apply a winter treatment to a
  repository world's unchanged topology. Place its selected hamlets on safe
  terraces along both sides of a frozen river corridor, retain route-derived
  bridge crossings, keep interaction paths clear, and use snow trees and ground
  patches as appearance swaps rather than new semantic objects.
- **Canyon-and-river repository settlement:** Shape the repository envelope as
  a long canyon with a river crossing its full depth. Assign major subsystems to
  broad cliff benches and valley clearings, cluster settlements only on
  buildable terraces, and use rocks, sparse vegetation, and wildlife to express
  lower-priority regions without turning every folder into a building.
- **Large mountain-valley repository world:** Frame a broad explorable valley
  with a strong rear mountain silhouette. Nest two to four settlements beneath
  the slopes, route repository relationships through the valley floor, keep a
  foreground water feature visible from the overview camera, and represent
  unbuilt provinces through ecological or landmark regions with complete
  semantic hit coverage.

## Shipped seasonal vocabulary

The current supplemental collection is deliberately small and CC0:

| Season | Stable appearance slots                                                                | Composition intent                                  |
| ------ | -------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Spring | Six green tree families; flower and grass accents                                      | Fresh growth layered with existing blossom groves   |
| Summer | Six green tree families; melon, wheat, and grass accents                               | Full canopy, deeper shade, restrained ground detail |
| Autumn | Exact `_fall` variants for all six trees; pumpkin, carrot, mushroom, and wheat accents | Warm paired replacements without moving instances   |
| Winter | Three snow-tree silhouettes; four snow-and-stone ground treatments                     | Snow silhouette swaps and clustered surface cover   |

Official sources:

- [Kenney Nature Kit 2.1](https://kenney.nl/assets/nature-kit) — CC0-1.0,
  upstream license preserved as
  `public/assets/world/kenney/licenses/Nature_Kit_2.1_LICENSE.txt`.
- [Kenney Holiday Kit 2.0](https://www.kenney.nl/assets/holiday-kit) — CC0-1.0,
  upstream license preserved as
  `public/assets/world/kenney/licenses/Holiday_Kit_2.0_LICENSE.txt`.
- [Quaternius packs](https://quaternius.com/packs.html) — the existing CC0
  architecture, vegetation, surface detail, and wildlife foundation.

The typed variant slots in
[`src/lib/assets/kenney-seasonal.ts`](../src/lib/assets/kenney-seasonal.ts)
always expose six canopy and four ground-detail roles. A renderer may swap the
role's model for a season, but it must retain the role's deterministic transform
and semantic relationship.

## Season-by-season sourcing

### Spring

Start from irregular green and blossom groves, flowers at meadow transitions,
open hamlet clearings, and active wildlife. Prefer existing Quaternius assets
and the Kenney green/flower slots. Generate a new asset only for a distinct hero
landmark that cannot be expressed with the modular vocabulary.

### Summer

Increase canopy fullness and shadow, not object count. Use the same green
topology, deeper materials, reeds near shore transitions, and sparse meadow
detail. WorldClaw's showcase notes downloaded scatter assets for summer; this
project permits that route only through an official, authorized download whose
individual license and redistribution rights pass the gates below.

### Autumn

Swap each green Kenney tree family for its paired `_fall` model. Use pumpkins,
warm grass, mushrooms, bare branches, and leaf effects as clustered accents.
Do not rebuild paths, hamlets, water, province masks, or semantic hit regions.

### Winter

Swap canopy roles to the three snow-tree silhouettes, add snow piles or broad
patches only where slope and contact permit, and reduce ground color saturation.
Keep roads and interaction clear. Snow is a treatment of the same world, not a
second layout.

## Project-authored generation prompts

The following prompts are **adapted project prompts inspired by WorldClaw's
published high-level workflow**. They are paraphrased for this repository; they
are not Tencent-authored prompts and are not quoted from WorldClaw.

### Terrain asset

> Create one browser-ready, stylized low-poly terrain prototype for a coherent
> medieval fantasy world. Preserve an explicit Y-up, metre-scale origin and a
> clean ground-contact plane. Supply reusable landform parts for meadow,
> escarpment, shore, and watershed transitions; avoid baked buildings, roads,
> logos, text, camera-specific cheats, and photographic imitation. Deliver
> editable named meshes with one material family, clean normals, no hidden
> geometry, and a self-contained glTF 2.0 source suitable for Meshopt delivery.

### Settlement asset

> Create a modular medieval settlement kit, not a complete city. Include
> compatible wall, roof, door, window, chimney, stair, fence, and vine pieces
> with consistent metre scale, pivots at meaningful assembly points, and ground
> contact at y=0. Use a clean stylized PBR language, modest texture resolution,
> no readable signs, no heraldry or third-party marks, and no prearranged layout.
> Each module must remain an independently editable mesh.

### Vegetation family

> Create three distinct tree silhouettes as a matched seasonal family. Keep the
> trunk, pivot, footprint class, and approximate height stable across spring,
> summer, autumn, and winter variants; change only canopy density, color, leaf
> state, and snow treatment. Add a small set of clustered flowers, bushes,
> reeds, rocks, and snow patches. Use Y-up ground origins, opaque or tested alpha
> materials, no billboards tied to one camera, and no uniform scatter baked into
> the asset.

### Animal asset

> Create one stylized wildlife model with a clean rig and named Idle, Eat, Walk,
> and Run clips. Use realistic ground contact and restrained proportions suited
> to a low-poly fantasy landscape. Keep the file self-contained, Y-up,
> metre-scaled, free of logos and recognizable characters, and under the
> project's browser geometry and texture budgets. Do not bake a world position
> or camera into the asset.

Every generated result requires the generator, model/version, full prompt,
negative constraints, input references and rights, human edits, source hashes,
conversion steps, and reviewer attestations required by
[`docs/ASSET_POLICY.md`](ASSET_POLICY.md) and the attribution schema.

## Acceptance gates

An asset is eligible only when every gate passes:

1. **Rights:** canonical source, creator, version, exact license, official
   download route, source hash, redistribution permission, and modification
   permission are recorded. NC, ND, editorial, store-only, and unclear terms
   fail.
2. **Lineage:** original license text is retained; CC BY credit includes creator,
   title, source, license link, and modifications; generated media has complete
   provenance. CC0 credit remains project policy even when optional.
3. **Model integrity:** glTF 2.0 binary, Y-up, metre-like scale, logical names,
   ground contact near y=0, triangle primitives, valid normals/UVs, no hidden
   camera or light, and no unresolved external dependency.
4. **Browser budget:** explicit triangles, primitives, texture dimensions,
   encoded bytes, runtime reuse plan, Meshopt/texture-compression choice, and LOD
   or fallback for hero assets.
5. **Season contract:** model swaps preserve deterministic positions, semantic
   IDs, exclusions, collision truth, and repository coverage.
6. **Visual review:** overview and close views confirm silhouette variety,
   coherent material language, intentional negative space, correct contact,
   legible settlements, and no evenly distributed “asset confetti.”
7. **Reproduction:** the pinned build recreates byte-identical committed files;
   asset verification, attribution validation, tests, typecheck, lint, and
   formatting all pass.

## Vetted legal-resource table

“Vetted” means the source has a clear official license route; each chosen asset
still needs file-level review and registry entry.

| Resource                                                                                  | Rights category                                                         | Redistribution notes                                                                                                                                                                                                                | Project status                   |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| [Kenney Nature Kit](https://kenney.nl/assets/nature-kit)                                  | CC0-1.0                                                                 | Raw or modified files may be redistributed; preserve pack license, source hash, and Kenney recognition.                                                                                                                             | Curated subset bundled           |
| [Kenney Holiday Kit](https://www.kenney.nl/assets/holiday-kit)                            | CC0-1.0                                                                 | Raw or modified files may be redistributed; preserve pack license, source hash, and Kenney recognition.                                                                                                                             | Curated subset bundled           |
| [Quaternius](https://quaternius.com/packs.html)                                           | CC0-1.0 on reviewed packs                                               | Bundle only an audited subset with the exact pack license and transformation record.                                                                                                                                                | Curated subsets bundled          |
| [Poly Haven](https://polyhaven.com/license)                                               | CC0-1.0                                                                 | Official license permits asset redistribution; do not copy protected site copy, logos, or gallery renders. Record the asset page and download hash.                                                                                 | Approved source, no current file |
| [ambientCG](https://docs.ambientcg.com/license/)                                          | CC0-1.0                                                                 | Official license explicitly permits raw files in a project. Record asset ID, resolution, download hash, and transformations.                                                                                                        | Approved source, no current file |
| [Sketchfab downloadable models](https://sketchfab.com/developers/download-api/guidelines) | Per asset: CC0 or CC BY variants                                        | Use only an official authenticated download with the model page, creator, exact Creative Commons license, and source hash. CC BY attribution must follow the file. Reject NC, ND, editorial, store/royalty-free, and unclear files. | Conditional review; none bundled |
| [Creative Commons BY 4.0](https://creativecommons.org/licenses/by/4.0/) assets            | CC BY-4.0                                                               | Redistribution and modification are permitted only with appropriate credit, license link, and change notice; never imply endorsement.                                                                                               | Conditional review               |
| Project-generated assets                                                                  | Generator terms plus project provenance; not automatically CC0 or CC BY | Use only when generator terms permit open-source redistribution. Register prompt, model/version, inputs and rights, edits, hashes, and human review before assigning a project license.                                             | Conditional review               |

The policy intentionally favors CC0. CC BY is acceptable when its attribution
can remain attached throughout redistribution. A file being viewable or
downloadable is not evidence that it may be committed to this repository.
