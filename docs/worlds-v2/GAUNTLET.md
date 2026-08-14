# Worlds v2 gold-matrix gauntlet

The gauntlet captures objective runtime evidence and structured human-review evidence from the production repository-world route. It never converts a rendered canvas into an aesthetic `PASS`.

## Frozen gold fixtures

| Scenario prefix           | Fixture                                                                  | Review scale | Product tier  | Eligible / represented files | Source commit                                 | Appearance                               |
| ------------------------- | ------------------------------------------------------------------------ | ------------ | ------------- | ---------------------------: | --------------------------------------------- | ---------------------------------------- |
| `compact-repository-city` | `src/components/kingdom/test-fixtures/repository-city-live-world.json`   | Compact      | `compact`     |                      62 / 62 | `parrisdigital/repository-city@0e61374a`      | Spring, harness-default Enchanted Forest |
| `medium-magical-kingdom`  | `src/components/kingdom/test-fixtures/magical-kingdom-medium-world.json` | Medium       | `established` |                    336 / 336 | `parrisdigital/repo-magical-kingdom@55f590e3` | Summer, Enchanted Forest                 |
| `vast-nextjs`             | `src/components/kingdom/test-fixtures/nextjs-large-world.json`           | Vast         | `vast`        |     29,719 / 29,053 captured | `vercel/next.js@3782922b`                     | Spring, Kingdom Valley                   |

The medium fixture was compiled without network access from the exact local Git tree at `55f590e300e9f778f258a1fa5f32f2b669ddb4e4`: 337 discovered files, 336 eligible files, exact blob SHAs, and one omitted lockfile. Local Git does not retain GitHub's numeric repository database ID, so `source.repositoryId` is the explicit offline sentinel `0` and the fixture carries `OFFLINE_LOCAL_GIT_CAPTURE`. The commit, tree, paths, sizes, blob identities, canonical URL, license, and compiler output are real and pinned.

The existing Next.js fixture deliberately retains its immutable source commit and 29,719-file scale signal, but its reduced entity collection represents 29,053 files. The harness applies the same explicit legacy-coverage reconciliation as the application compatibility parser and records `LEGACY_COVERAGE_RECONCILED`; it does not pretend the absent 666 entity details were captured. This is sufficient for the frozen vast visual-scale case, not a strict compiler-output fixture.

`src/components/kingdom/test-fixtures/visual-gold-matrix.test.ts` freezes source identity, build key, coverage, link pinning, and product scale tier for all three fixtures.

## Scenario IDs

Each gold fixture is combined with the three existing surface definitions:

- `desktop-normal` — 1440×900, normal motion;
- `mobile-normal` — 390×844, normal motion; and
- `desktop-reduced` — 1440×900, reduced motion.

The complete matrix contains nine stable scenario IDs:

```text
compact-repository-city--desktop-normal
compact-repository-city--mobile-normal
compact-repository-city--desktop-reduced
medium-magical-kingdom--desktop-normal
medium-magical-kingdom--mobile-normal
medium-magical-kingdom--desktop-reduced
vast-nextjs--desktop-normal
vast-nextjs--mobile-normal
vast-nextjs--desktop-reduced
```

Existing compact and vast IDs remain unchanged.

## Capture view IDs

| View ID           | Surface            | Human review target                                                                                        |
| ----------------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `orbit-overview`  | Desktop and mobile | Complete silhouette, terrain hierarchy, watershed, settlements, and scale read                             |
| `orbit-close`     | Desktop and mobile | Material scale, grounding, grove shape, and mid-distance building quality after the existing orbit gesture |
| `walk-spawn`      | Desktop            | First playable eye-level frame, depth, control clarity, visible life, and immediate world quality          |
| `walk-settlement` | Desktop            | Path-side architecture, variation, contact, route dressing, and lived-in density                           |
| `walk-forest`     | Desktop            | Vegetation silhouettes, understory, spacing, ground cover, and navigable clearings                         |
| `walk-shoreline`  | Desktop            | Visible water, bank geometry, shoreline transition, reflection, and terrain contact                        |

The harness uses the deterministic living spawn, resets Walk between semantic captures, and attempts bounded pointer-lock look/movement gestures. Pointer-lock denial is recorded and never described as successful movement. A view ID expresses **review intent**, not automated visual recognition. If `walk-forest` does not visibly show a forest or `walk-shoreline` does not visibly show water and a bank, the human row is `REVISE` even when the file exists and all runtime checks pass.

Walk is intentionally not offered on the current mobile product surface because it requires a keyboard and fine pointer. Mobile scenarios keep Orbit evidence and the existing responsive/runtime gates; they do not fabricate Walk captures.

## Run commands

Start the application separately:

```sh
pnpm dev
```

Capture only the new medium desktop case:

```sh
pnpm visual:gauntlet -- \
  --scenario medium-magical-kingdom--desktop-normal \
  --output artifacts/visual-review/gauntlet/worlds-v2-medium-desktop
```

Run the complete compact/medium/vast matrix with shorter timings:

```sh
pnpm visual:gauntlet:smoke
```

Run the full matrix:

```sh
pnpm visual:gauntlet
```

The scorecard records `captureViewIds`, the full `captureViews` contract, and a per-scenario `screenshots.views` map. Legacy `overview`, `overviewCanvas`, and `exploration` fields and filenames remain available for existing review tooling.

## Latest bounded medium validation: RED

The 2026-08-14 smoke run is frozen at:

```text
artifacts/visual-review/gauntlet/worlds-v2-batch1-medium-smoke-green12
```

Despite the historical directory suffix, this is **not** a green run. The scenario owner reached its 240,000ms deadline while preparing `walk-shoreline`. The scorecard contains the selected scenario and `scenario-completed: FAIL`, reports `Scenario exceeded 240000ms`, has no summary, and intentionally does not publish a partial `screenshots.views` map as completed evidence.

Five required 1440×900 page PNGs were written and inspected natively:

- `medium-magical-kingdom--desktop-normal--orbit-overview.png` — captured; **REVISE**;
- `medium-magical-kingdom--desktop-normal--orbit-close.png` — captured; **REVISE**;
- `medium-magical-kingdom--desktop-normal--walk-spawn.png` — captured; **REVISE**;
- `medium-magical-kingdom--desktop-normal--walk-settlement.png` — captured but not semantically valid; **REVISE**; and
- `medium-magical-kingdom--desktop-normal--walk-forest.png` — captured but not semantically valid; **REVISE**.

`medium-magical-kingdom--desktop-normal--walk-shoreline.png` is missing. Headless pointer lock was denied, so the attempted settlement and forest gestures did not move the camera; both frames remain at the spawn composition and show an opened asset drawer. They must not be accepted as settlement or forest evidence. The last recorded stage timings were Walk spawn 142,342ms, settlement 192,794ms, forest 235,089ms, then shoreline preparation. No six-view freeze or visual `PASS` exists yet.

## Objective gates retained

The gauntlet continues to verify:

- production kingdom mode mounted;
- one visible, sized renderer canvas;
- live WebGL context and drawing buffer;
- no context loss or renderer fallback;
- no page exceptions or `console.error` messages;
- no failed local resources or HTTP error responses;
- no document overflow;
- current world schema accepted;
- populated GLB resources and nontrivial canvas content;
- discoverable repository hover label;
- dispatched Orbit camera interaction;
- post-gesture and post-Walk renderer health; and
- reduced-motion same-page and isolated repeatability.

Frame intervals and long tasks remain diagnostics, not hardware-independent performance verdicts.

The isolated scenario-owner timeout is 240 seconds in smoke mode and 480 seconds in full mode because one desktop scenario now owns six sequential evidence views. The canvas-readiness, populated-resource, renderer-health, error, overflow, interaction, and repeatability gates are unchanged; the larger owner window is not an aesthetic or performance pass. Every screenshot, input action, DOM-state transition, and animation-frame wait also has its own smaller stage deadline so the owner timer cannot conceal a hung capture.

## Human rows

Every scenario retains the existing composition, terrain/material, settlement, ecology, life/motion, season, HUD, and framing rows. Each row now lists its evidence `viewIds`. Every applicable capture view also gets a dedicated row:

```text
view-orbit-overview
view-orbit-close
view-walk-spawn
view-walk-settlement
view-walk-forest
view-walk-shoreline
```

Unreviewed rows are `HUMAN_REVIEW`. Failed automated prerequisites force `REVISE`. A named human may provide only `PASS` or `REVISE`, a non-empty note, and a valid review timestamp:

```json
{
  "reviewedBy": "Reviewer name",
  "reviewedAt": "2026-08-14T18:00:00.000Z",
  "scenarios": {
    "medium-magical-kingdom--desktop-normal": {
      "rows": {
        "world-composition": {
          "status": "REVISE",
          "notes": "The foreground still reads as a low-information plane."
        },
        "view-walk-shoreline": {
          "status": "PASS",
          "notes": "Water, bank, wet transition, reeds, and terrain contact are all legible at eye level."
        }
      }
    }
  }
}
```

Apply the file with `--reviews /absolute/path/reviews.json`. `--strict-review` exits non-zero until every selected applicable row is explicitly `PASS`.

Screenshot hashes prove artifact identity. They do not prove composition, realism, motion, semantics, or beauty.
