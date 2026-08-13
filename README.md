<div align="center">

# Repo Magical Kingdom

**Turn a public GitHub repository into a living, explorable 3D world.**

<img
  src="public/readme-hero.png"
  alt="A realistic repository universe with terrestrial and ringed planets connected through a crystalline gateway to a living seasonal mountain kingdom with hamlets, forests, a river, and a lake"
  width="1942"
/>

<p align="center">
  <a href="https://github.com/parrisdigital/repo-magical-kingdom"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/group/github/ci/parrisdigital/repo-magical-kingdom+github/stars/parrisdigital/repo-magical-kingdom+github/license/parrisdigital/repo-magical-kingdom+github/contributors/parrisdigital/repo-magical-kingdom+github/last-commit/parrisdigital/repo-magical-kingdom.svg?workflow=ci.yml&amp;branch=main&amp;variant=outline&amp;size=sm&amp;font=geist&amp;animate=glow&amp;mode=dark" /><img alt="CI passing, GitHub stars, MIT license, contributors, and latest commit" src="https://shieldcn.dev/group/github/ci/parrisdigital/repo-magical-kingdom+github/stars/parrisdigital/repo-magical-kingdom+github/license/parrisdigital/repo-magical-kingdom+github/contributors/parrisdigital/repo-magical-kingdom+github/last-commit/parrisdigital/repo-magical-kingdom.svg?workflow=ci.yml&amp;branch=main&amp;variant=outline&amp;size=sm&amp;font=geist&amp;animate=glow&amp;mode=light" /></picture></a>
</p>

[Live demo](https://repo-magical-kingdom.vercel.app) ·
[Architecture](docs/ARCHITECTURE.md) ·
[Contributing](CONTRIBUTING.md) ·
[Seasonal assets](docs/SEASONAL_ASSET_PLAYBOOK.md) ·
[Credits](docs/CREDITS.md) ·
[Security](SECURITY.md)

</div>

Repo Magical Kingdom turns repository structure into geography you can orbit,
zoom through, inspect, and eventually cross between. Each repository receives a
deterministic realm identity—a Source Forge, Warden Reach, Archive Domain,
Observatory Frontier, Garden Realm, or Crossroads—while every
repository-derived landmark remains traceable to an exact source revision.

> [!NOTE]
> The first open-source release is under active development. Interfaces and
> world-package contracts may change before 1.0; tagged releases will document
> compatibility guarantees.

## From source tree to living world

```text
GitHub URL
  → public-repository verification
  → immutable commit snapshot
  → repository semantics and coverage
  → deterministic world style + seasonal WorldPackage
  → React Three Fiber kingdom
```

The world hierarchy is deliberately legible:

| Repository concept                     | Kingdom expression               |
| -------------------------------------- | -------------------------------- |
| GitHub profile or organization         | Planetary repository universe    |
| Repository                             | Enterable kingdom or world       |
| Repository root                        | Crown Nexus                      |
| Workspace, package, or major subsystem | Province                         |
| Module or folder cluster               | Settlement                       |
| File or symbol                         | Landmark or aggregated structure |
| Verified internal relationship         | Road, bridge, or route           |
| External dependency                    | Outbound gateway                 |
| Indexed repository relationship        | Enterable portal                 |

Decorative trees, animals, particles, weather, and water do not secretly claim
to be files or quality scores. When scenery communicates repository data, the
experience says so and links back to its evidence.

## Choose the world, then choose its season

World style and season are separate, shareable choices. Repository evidence
selects a default style, while an explorer can override it before forging or
from inside a kingdom.

- **Kingdom Valley** builds an open inhabited watershed with hamlets,
  escarpments, routes, forests, wildlife, and a foreground lake.
- **Enchanted Forest** keeps the same traceable repository geography but adds
  denser ancient groves, moss-covered architecture, root arches, runestones,
  mushroom circles, and restrained magical life.
- **Spring, summer, autumn, and winter** recolor and relight either world without
  silently changing its repository-derived placement.

Canonical links preserve both axes, for example
`?world=enchanted-forest&season=autumn`. Additional world types can extend the
same versioned contract without turning every repository into the same scene.

Profile pages now present repositories as a real planetary system. Deterministic
repository evidence selects a terrestrial, ringed gas giant, ice giant, or rocky
planet; entering that planet loads its complete kingdom rather than mounting toy
buildings on the overview sphere.

## Design principles

- **A world, not a reskinned city.** Repository evidence becomes terrain,
  settlements, archives, workshops, strongholds, paths, and portals through a
  coherent world archetype. World style and season are independently selectable
  over the same repository-derived geography.
- **Truth before spectacle.** Meaningful objects expose their repository path,
  immutable commit, and reason for existing.
- **Stable geography.** A seed and versioned compiler keep repeated builds
  deterministic and preserve locality across nearby revisions.
- **Complete coverage.** A file is represented directly, included in a named
  aggregate, or explicitly omitted with a reason.
- **Progressive scale.** Universe summaries remain light; full kingdoms load
  only when visited and use hierarchy, instancing, and LOD. Compact, established,
  expansive, and vast repositories receive different land envelopes, settlement
  counts, ecology budgets, and camera fits rather than the same map at a new color.
- **Open assets, deterministic composition.** Audited CC0 models and original
  runtime systems form each world without a paid asset, proprietary runtime, or
  GPU generation service.
- **Accessible outside the canvas.** Controls, source details, errors, credits,
  and fallback navigation remain available through semantic HTML.

## Local development

Requirements:

- Node.js 22.17 or newer
- pnpm 10.32.1
- A WebGL 2-capable browser for the complete 3D scene

```bash
git clone https://github.com/parrisdigital/repo-magical-kingdom.git
cd repo-magical-kingdom
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open <http://localhost:3000>. Public repositories work without a token at a
lower GitHub API quota. A server-only, public-read token can be added to
`.env.local`:

```dotenv
GITHUB_TOKEN=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Never expose a GitHub token through a `NEXT_PUBLIC_` environment variable.

## Quality gates

```bash
pnpm validate
pnpm test:e2e
pnpm assets:verify
node attribution/validate.mjs
```

The GitHub workflows run formatting, linting, type checks, unit tests,
production builds, Chromium journeys, CodeQL, dependency review, and attribution
validation. Third-party Actions are pinned to immutable commit SHAs.

## Architecture

The compiler and renderer have intentionally different responsibilities:

- The GitHub boundary handles canonical input, immutable revision resolution,
  public visibility, tree recovery, validation, rate limits, and provenance.
- Pure domain code classifies and aggregates repository evidence into a
  versioned kingdom graph.
- The realm compiler assigns a stable world archetype and default world style,
  then regions, terrain, landmarks, routes, camera anchors, LOD groups, and
  coverage metadata.
- The serialized `WorldPackage` contains no React, DOM, Three.js, or provider
  response objects.
- React Three Fiber renders the package and owns camera, picking, quality, and
  ambient living systems.

Read the complete [architecture specification](docs/ARCHITECTURE.md) and
[source-lineage policy](docs/SOURCE_LINEAGE.md). The
[seasonal asset playbook](docs/SEASONAL_ASSET_PLAYBOOK.md) documents the legal
sourcing, generation, and topology-preserving appearance workflow.

## Open-source trust model

The hosted service begins with public GitHub repositories only. Submitted source
is treated as untrusted data and is never executed. A repository must be
verified public before its tree can enter a shared cache, and shared kingdom
links resolve to an immutable commit SHA.

Project assets follow a provenance-first policy. Unknown, noncommercial,
no-derivatives, or redistribution-prohibited media is rejected by default. CI
checks direct runtime dependency coverage and rejects unregistered distributed
assets. See [the asset policy](docs/ASSET_POLICY.md) and the
[machine-readable registry](attribution/registry.json).

## Recognition and provenance

Repo Magical Kingdom is an independent open-source project built with and
informed by remarkable work:

- **[Repository City](https://github.com/parrisdigital/repository-city)** is the
  MIT-licensed product and architectural predecessor that established the
  original repository-to-place concept.
- **[ShieldCN](https://shieldcn.dev/)** renders the README's live, theme-aware
  repository badges. The animated CI badge uses pure SVG animation with a
  reduced-motion fallback; ShieldCN is not an application runtime dependency.
- **OpenAI image generation** produced the project-owned Four-Season Cycle
  application mark and Orbital Mountain favicon using only this project's
  registered release artwork as a reference. Full prompts, conversion steps,
  source/output hashes, rights review, and licensing are recorded in the
  [attribution registry](attribution/registry.json).
- **[WorldClaw](https://arxiv.org/abs/2608.05248)** informed the structured,
  coarse-to-fine world-planning direction as published research. Its reviewed
  repository revision did not declare a software license, so no WorldClaw code,
  figures, imagery, meshes, website assets, or generated results are copied or
  redistributed.
- **[Tiny World Builder](https://github.com/jasonkneen/tiny-world-builder)**
  informed the independent use of seeded terrain grids, scale-aware world
  envelopes, chunk/LOD thinking, and bounded local animal wandering. Its
  AGPL-3.0 code and assets are not copied, adapted, bundled, or required at
  runtime.
- **[Quaternius](https://quaternius.com/)** created the CC0 textured medieval
  architecture, stylized nature, and animated wildlife models that form the
  world's authored visual foundation. The shipped subset is optimized for the
  browser, fully registered, and distributed with its source license texts.
- **[Kenney](https://kenney.nl/)** created the CC0 Nature and Holiday kits used
  for paired green/autumn trees, snowy silhouettes, and seasonal ground
  treatments. The tiny curated subset is independently licensed, reproducible,
  and does not contain WorldClaw media.
- **[Three.js](https://threejs.org/),
  [React Three Fiber](https://r3f.docs.pmnd.rs/), and
  [Drei](https://github.com/pmndrs/drei)** form the open-source browser 3D
  foundation.

See [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md),
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and
[docs/CREDITS.md](docs/CREDITS.md) for exact revisions and relationships.

## Contributors

<p align="center">
  <a href="https://github.com/parrisdigital/repo-magical-kingdom/graphs/contributors">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/contributors/parrisdigital/repo-magical-kingdom.svg?title=false&amp;preset=transparent&amp;border=false&amp;mode=dark" />
      <img alt="Repo Magical Kingdom contributors" src="https://shieldcn.dev/contributors/parrisdigital/repo-magical-kingdom.svg?title=false&amp;preset=transparent&amp;border=false&amp;mode=light" />
    </picture>
  </a>
</p>

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), sign
off commits under the [Developer Certificate of Origin](DCO), and review the
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

Repo Magical Kingdom source code and original documentation are available under
the [MIT License](LICENSE) unless a file or registry entry says otherwise. The
generated README/social artwork, application mark, installable icons, and
favicon are distributed under CC BY 4.0 with complete provenance in the
[attribution registry](attribution/registry.json). Third-party software,
research, services, and assets retain their own copyrights and licenses.

<div align="center">

Live README signals rendered by [ShieldCN](https://shieldcn.dev/).

</div>
