# Repository-world visual gauntlet

This gauntlet is the reproducible review process for the **production repository-world surface**. It complements the art-direction rubric in [VISUAL_ACCEPTANCE.md](./VISUAL_ACCEPTANCE.md); it does not replace human visual judgment or promote the development-only `/visual-review` candidate.

The process is informed by the public [Claude of Duty](https://github.com/mshumer/Claude-of-Duty) workflow: isolate browser pages, settle a fixed frame budget, profile distributions and hitches rather than one median, run scripted interaction probes, and keep one sequential owner for coupled review passes. That is process inspiration only. Repo Magical Kingdom keeps its own product, renderer, fixtures, visual language, and acceptance rubric.

## What runs

The default matrix has six scenarios and executes them strictly in order, with a fresh browser context and page for every scenario:

| Repository fixture                               | Scale   | Desktop normal | Mobile normal | Desktop reduced motion |
| ------------------------------------------------ | ------- | -------------- | ------------- | ---------------------- |
| `parrisdigital/repository-city` captured package | Compact | 1440×900       | 390×844       | 1440×900               |
| `vercel/next.js` captured package                | Vast    | 1440×900       | 390×844       | 1440×900               |

Both JSON fixtures are read-only inputs. The older Repository City capture predates the required `worldTheme` field, so the harness supplies `enchanted-forest` in memory without rewriting the historical fixture. The vast Next.js capture keeps its captured `kingdom-valley` identity.

Each page:

1. intercepts only `/api/kingdom` and serves the selected captured package;
2. opens the real `/kingdom/{owner}/{repository}/{commit}` product route;
3. waits for kingdom mode, the repository heading, a visible canvas, and a non-empty drawing buffer;
4. applies a fixed post-canvas delay followed by exactly four browser animation frames;
5. rejects visible error toasts and any still-visible `Rendering…` indicator;
6. requires completed GLB resources and a nontrivial canvas frame before accepting the scene as populated rather than a terrain-only Suspense frame;
7. captures overview evidence and SHA-256 hashes even when a later interaction gate fails;
8. samples browser frame intervals and reports p50, p95, p99, worst, mean, and hitch counts;
9. sends one bounded camera drag plus a zoom, records its phase durations and a short post-gesture p50/p95/p99/worst frame window, and verifies that the renderer survives;
10. captures an exploration screenshot and SHA-256 hash; and
11. closes the complete browser context before opening the next scenario.

Reduced-motion scenarios capture the stabilized canvas twice on the same page, two seconds apart, to test the actual motion freeze. They also capture the canvas again in another isolated page to test cross-context reproducibility. All exact hashes are retained, then decoded canvas pixels are compared with strict thresholds (mean absolute RGB-channel delta no greater than `0.02`, and no more than `0.0005` of pixels changing by over three channel values). That tolerates a handful of platform rasterization pixels without accepting scene motion, and avoids treating unrelated font rasterization as a 3D failure. Normal-motion screenshots still receive provenance hashes, but those hashes are **not** compared: moving water, foliage, particles, and actors make pixel equality an invalid expectation.

## Commands

Keep the Next.js server in a separate terminal:

```sh
pnpm dev
pnpm visual:gauntlet
```

The bounded smoke mode keeps all six scenarios but lowers settle, hover, camera, and frame-sample budgets:

```sh
pnpm visual:gauntlet:smoke
```

Smoke scenarios and their isolated repeat pages have a hard 75-second context deadline; the full process uses 240 seconds. A timeout becomes a structured automated failure and the sequential matrix continues instead of hanging on one overloaded SwiftShader page.

Useful controls:

```sh
pnpm visual:gauntlet -- \
  --base-url http://localhost:3000 \
  --scenario compact-repository-city--desktop-reduced,vast-nextjs--desktop-reduced \
  --settle-ms 4500 \
  --frame-samples 180 \
  --output /absolute/path/to/run
```

Environment equivalents are `GAUNTLET_BASE_URL`, `GAUNTLET_SETTLE_MS`, `GAUNTLET_FRAME_SAMPLES`, and `GAUNTLET_ARTIFACT_DIR`. Run `pnpm visual:gauntlet -- --help` for the complete CLI.

The default output is timestamped beneath the gitignored `artifacts/visual-review/gauntlet/` directory. Every run writes:

- `scorecard.json` — portable, machine-readable results;
- `*--overview.png` — fixed-viewport review evidence;
- `*--exploration.png` — evidence after the camera gesture; and
- `*--overview-canvas.png` and `*--same-page-stability.png` — the two-second reduced-motion freeze probe;
- `*--repeat.png` — isolated full-page provenance for reduced-motion scenarios; and
- `*--repeat--canvas.png` — the isolated canvas repeat used for cross-context comparison.

## Automated gates

Automated `PASS` means only that the page completed these objective checks:

- production kingdom mode mounted;
- one visible, non-empty canvas owns one instrumented WebGL context;
- the context and drawing buffer remain live before and after interaction;
- no context-loss or restore event occurred;
- no WebGL/scene fallback appeared;
- no visible error toast or unfinished `Rendering…` state appeared;
- no page exception, `console.error`, failed local request, or local HTTP error appeared;
- no document overflow appeared at the fixed viewport;
- model resources completed and the canvas produced a nontrivial populated frame;
- the center-prioritized deterministic canvas sweep found a visible repository label as a separate interaction gate; and
- the camera gesture was dispatched without losing the renderer.

A bounded hover miss is an automated interaction failure, but it never suppresses the screenshots needed to diagnose that failure visually. Population-readiness failures are also recorded alongside any screenshot evidence the live canvas can provide.

For reduced motion, a stable frame must change after the camera gesture, the two same-page canvas captures two seconds apart must pass the strict decoded-pixel stability threshold, and an isolated canvas repeat must pass the same cross-context threshold. Every SHA-256 hash remains in the scorecard even when a few rasterization pixels differ. In normal motion, a changed frame cannot be attributed only to the camera because the world itself is alive, so the delta is informational.

Frame-interval, hover-attempt, camera-phase, and post-gesture frame distributions all include p50, p95, p99, worst, mean, and hitch counts. The five camera phase durations describe input-dispatch cost; the bounded post-gesture frame window is the meaningful rendering-tail distribution. These measures reflect browser event-loop responsiveness while the mounted scene runs. They are useful for tail and hitch comparison, but they are not GPU timing queries and the harness does not invent pass thresholds for hardware-dependent performance. The scorecard also records observed long-task distributions when Chromium exposes them.

## Human visual review is mandatory

The harness never converts a successful render into an aesthetic `PASS`. Every visual row starts as `HUMAN_REVIEW`. If automated prerequisites fail, its rows become `REVISE`. This covers composition, terrain/material coherence, settlement spacing, ecology, life, season, HUD restraint, and viewport framing.

A reviewer can apply explicit decisions with `--reviews /path/to/reviews.json`:

```json
{
  "reviewedBy": "Reviewer name",
  "reviewedAt": "2026-08-13T18:00:00.000Z",
  "scenarios": {
    "compact-repository-city--desktop-normal": {
      "rows": {
        "world-composition": {
          "status": "PASS",
          "notes": "Compact scale, three settlements, and negative space are legible."
        },
        "terrain-materials": {
          "status": "REVISE",
          "notes": "The foreground shoreline still reads too uniformly."
        }
      }
    }
  }
}
```

An explicit row requires `PASS` or `REVISE`, non-empty notes, a named reviewer, and a review timestamp. Unreviewed rows remain `HUMAN_REVIEW`. Use `--strict-review` only when a release gate should fail until all selected visual rows are explicitly `PASS`.

The scorecard verdicts are deliberately separate:

- `automatedVerdict`: objective runtime and interaction checks only;
- `visualVerdict`: `HUMAN_REVIEW`, `REVISE`, or explicitly reviewed `PASS`; and
- `overallVerdict`: fails on runtime breakage, otherwise preserves the visual verdict.

Do not call a run visually approved from screenshot hashes, an automated green result, or a median frame time alone.
