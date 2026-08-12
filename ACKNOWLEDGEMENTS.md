# Acknowledgements

Repo Magical Kingdom stands on ideas, tools, and open-source work created by a
much larger community. Recognition here describes the relationship precisely;
it does not imply sponsorship or endorsement.

## Foundational inspiration

### Repository City

[Repository City](https://github.com/parrisdigital/repository-city), created by
Parris Digital, established the original repository-to-place concept used as
the product predecessor for this project. Repo Magical Kingdom evolves that
idea from deterministic isometric cities into explorable, four-season worlds.

The reviewed reference revision is
[`0e61374af12387266c6fb13c273bee845b5f0864`](https://github.com/parrisdigital/repository-city/commit/0e61374af12387266c6fb13c273bee845b5f0864).
Repository City is licensed under the MIT License. No Repository City source
file is currently redistributed here; any future adapted file must be recorded
in [the source-lineage document](docs/SOURCE_LINEAGE.md) and the attribution
registry.

### WorldClaw research

The structured, coarse-to-fine world-planning approach is informed by:

> Chunchao Guo, Jinpeng Li, Yang Li, and Zilong Huang. “WorldClaw: Agentic 3D
> Open-World Generation at Scale.” 2026.
> [arXiv:2608.05248](https://arxiv.org/abs/2608.05248) ·
> [DOI](https://doi.org/10.48550/arXiv.2608.05248)

The reviewed repository revision is
[`d9901019f561c32921e38d0f0f5cabc8f9f2ce48`](https://github.com/Tencent-Hunyuan/Hunyuan3D-WorldClaw/commit/d9901019f561c32921e38d0f0f5cabc8f9f2ce48).
That revision did not include a software license. Repo Magical Kingdom cites
the research but does not copy or redistribute WorldClaw code, figures,
imagery, meshes, website assets, or generated results.

## Living project identity

### ShieldCN

[ShieldCN](https://shieldcn.dev/) renders the live, theme-aware GitHub badges in
this project's README. The badges report repository state rather than
hard-coded claims, and the CI badge uses ShieldCN's reduced-motion-aware SVG
animation.

The integration was reviewed against ShieldCN revision
[`af169e6c6030d289142546df7300acfe0eba7468`](https://github.com/jal-co/shieldcn/commit/af169e6c6030d289142546df7300acfe0eba7468),
licensed under MIT. ShieldCN is an external presentation service and is not a
runtime dependency of the application.

## World art and living systems

### Quaternius

The kingdom's authored environment and wildlife assets are created by
[Quaternius](https://quaternius.com/). We redistribute curated, web-optimized
derivatives from three CC0 packs:

- [Medieval Village MegaKit](https://quaternius.com/packs/medievalvillagemegakit.html)
  supplies textured modular walls, roofs, windows, doors, vines, fences, and
  settlement props.
- [Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html)
  supplies textured trees, bushes, flowers, grass, mushrooms, rocks, and path
  details.
- [Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html)
  supplies the rigged deer, fox, and stag, including their living animation
  clips.

All three packs declare the
[CC0 1.0 Universal dedication](https://creativecommons.org/publicdomain/zero/1.0/).
CC0 does not require attribution; this project gives explicit recognition
because those models are a material part of the world's visual foundation.
Exact upstream license texts are preserved beside the runtime assets in
`public/assets/world/quaternius/licenses/`. The selected models are packaged as
self-contained GLBs, Meshopt-compressed, and use WebP textures where applicable;
the complete transformation and file hashes are recorded in the asset-pipeline
documentation and attribution registry.

## Open-source engine and application stack

The browser experience is built with
[Three.js](https://threejs.org/),
[React Three Fiber](https://r3f.docs.pmnd.rs/),
[Drei](https://github.com/pmndrs/drei),
[Next.js](https://nextjs.org/), and
[React](https://react.dev/). Runtime validation and state management use
[Zod](https://zod.dev/) and [Zustand](https://zustand.docs.pmnd.rs/).

Exact versions and license metadata are recorded in
[attribution/registry.json](attribution/registry.json). The lockfile is the
authoritative dependency inventory for a given revision.

## Contributors and repository authors

Every contribution matters. Git history is the canonical authorship record;
GitHub's contributor graph and the ShieldCN contributor badge provide a living
view of that community.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution process and
[docs/ASSET_POLICY.md](docs/ASSET_POLICY.md) before submitting media or 3D
assets.
