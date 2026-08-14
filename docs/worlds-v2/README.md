# Worlds v2 visual foundation

Worlds v2 is the visual-quality contract for repository-built, explorable worlds. It does not declare the current renderer AAA, photoreal, or one-to-one with WorldClaw. It defines the evidence and quality bar required before anyone may make that claim.

The foundation has four parts:

1. [ART_BIBLE.md](./ART_BIBLE.md) defines the stylized-realism target and asset acceptance rules.
2. [BASELINE.md](./BASELINE.md) records the current Orbit and Walk evidence as an explicit **REVISE** baseline.
3. [GAUNTLET.md](./GAUNTLET.md) freezes the repository-scale gold matrix and the six required capture views.
4. `scripts/visual/run-gauntlet.mjs` preserves runtime checks while leaving aesthetic judgment to a named human reviewer.

## Product promise

A repository world should feel like a coherent place whose geography, settlements, landmarks, paths, ecology, and scale are consequences of repository evidence. Orbit must explain the whole world. Walk must make that same world convincing at eye level. Neither mode may become an unrelated showcase scene.

WorldClaw is the method-level reference for global spatial coherence, terrain-conditioned placement, rich local content, and render-inspect-refine iteration. The product remains a bounded Three.js experience with its own repository semantics, art direction, licensed asset pipeline, and renderer budgets.

## Frozen repository-scale matrix

| Gold case                 | Review label | Product scale tier | Eligible files | Pinned repository                             |
| ------------------------- | ------------ | ------------------ | -------------: | --------------------------------------------- |
| `compact-repository-city` | Compact      | `compact`          |             62 | `parrisdigital/repository-city@0e61374a`      |
| `medium-magical-kingdom`  | Medium       | `established`      |            336 | `parrisdigital/repo-magical-kingdom@55f590e3` |
| `vast-nextjs`             | Vast         | `vast`             |         29,719 | `vercel/next.js@3782922b`                     |

“Medium” is the visual-review label. `established` remains the product's code-level scale-tier name, so the fixture does not change existing repository classification.

## Promotion rule

A candidate can be promoted only when:

- all objective gauntlet checks pass;
- all applicable visual rows contain a named, dated `PASS` with useful notes;
- every required view actually depicts its named target;
- compact, medium, and vast worlds remain visibly distinct without breaking the shared art language; and
- the reviewer has inspected the PNG evidence, not only hashes or JSON.

Missing evidence, unclear evidence, or a semantically mislabeled frame is **REVISE**. Automated success never becomes an aesthetic pass.

Current validation state: **RED**. The latest bounded medium desktop smoke run wrote five of six required page captures, timed out at 240 seconds before `walk-shoreline`, and could not perform semantic Walk movement because headless pointer lock was denied. See the frozen run report in [GAUNTLET.md](./GAUNTLET.md); the six-view contract is defined but not yet satisfied.
