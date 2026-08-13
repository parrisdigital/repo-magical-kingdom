# WorldClaw visual acceptance gate

This gate answers one question: does the candidate read as a coherent, explorable 3D world rather than a collection of valid assets on a ground plane?

The candidate lives at the development-only `/visual-review` route. Captures and a passing runtime report are review evidence, not permission to replace the production renderer. The candidate remains **REVISE** until every visual criterion below is inspected and passes.

## Reference standard

WorldClaw's official material establishes the method-level standard:

- The [official project page](https://tencent-hunyuan.github.io/Hunyuan3D-WorldClaw/) describes a coherent global terrain with selectively rich local detail. Its terrain stage composes semantic regions into continuous, irregular landforms and then renders, inspects, and corrects transitions, material scale, and scattering.
- The [paper](https://arxiv.org/html/2608.05248v1) says an explorable world needs global spatial coherence, rich local content, a consistent terrain foundation, and terrain-conditioned object placement. Sections 2.2 and 2.3 are the primary acceptance references.
- The [official repository](https://github.com/Tencent-Hunyuan/Hunyuan3D-WorldClaw) publishes the method diagram used by the project page.

The paper is explicit about several failure modes relevant here: planar or weakly varying support is inadequate for mountains and other expressive landforms; a continuous composite height field should blend region-specific landforms and materials; rocks and vegetation should be scattered according to region, density, elevation, slope, and surface normal; and refinement should re-render predefined viewpoints to correct transitions, texture scale, distributions, lighting, and object–terrain contact.

Some requirements below are deliberately more specific than the paper. The dominant rear escarpment, foreground water, two-to-four hamlets, selectable world-style read, seasonal read, living motion, and restrained product HUD are this project's art direction. They must not be presented as WorldClaw paper claims.

## Strict PASS / REVISE rubric

| Area                             | PASS                                                                                                                                                                                                              | REVISE                                                                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Continuous terrain and hierarchy | One connected, visibly non-planar landform carries every settlement, route, and water feature. Major, middle, and local relief are readable; boundaries are irregular; objects sit on the surface.                | A flat or gently warped lawn, repeated pads, a smooth floating slab, abrupt terrain seams, or floating/embedded objects.                                                                         |
| Dominant rear escarpment         | An asymmetric, multi-peak mountain or cliff system anchors the rear third and is the strongest world-scale silhouette. It has readable rock/cliff structure and atmospheric depth.                                | One or two soft green humps, a ridge lower than the buildings/trees, a centered cone, or background relief that disappears at first glance.                                                      |
| Watershed and foreground water   | Water begins in or below the rear highlands, follows a visible valley with banks, changes width, and resolves into an unmistakable foreground pool, lake, or broad river reach with shoreline treatment.          | A uniform blue ribbon laid on top of the terrain, no banks or catchment, uphill flow, no foreground water mass, or water ending at the land edge without a basin.                                |
| Two-to-four spaced hamlets       | Exactly 2–4 legible settlement groups have internal structure and distinct identities. Terrain and clear negative space separate them; routes connect rather than merge them.                                     | One dense clump, a continuous suburb, more than four visually equal clusters, evenly spaced lone houses, or buildings that overlap each other.                                                   |
| Scattered multi-species groves   | At least three distinct tree/shrub silhouettes form density-shaped groves, edge trees, clearings, and a few solitary specimens. Placement is non-linear and responds to slope, water, and settlements.            | A row or grid, uniform spacing, single-species repetition, even random “confetti,” identical scale/rotation, or vegetation cutting through roads and buildings.                                  |
| Grass and surface detail         | The main ground reads as grass through correctly scaled color, normal/roughness response, and near-camera cover. Soil, paths, rock, cliff, and shoreline surfaces vary with landform and use.                     | A single green color, stretched/repeating stripes, plastic smoothness, grass on cliffs/water, or detail that vanishes in the exploration view.                                                   |
| Seasonal light and atmosphere    | The selected season is recognizable without reading UI. Foliage, ground, particles, sky, key light, shadows, fog, and water agree, while silhouettes retain depth. The same season is consistent across captures. | Flat ambient illumination, contradictory foliage and ground, weak/no contact shadows, clipped highlights, a palette that changes between identical captures, or a season visible only in labels. |
| Life and motion                  | A live review shows at least two legible motion systems, such as animals/people plus water/foliage/weather. Motion has varied timing, remains grounded, and is readable in an exploration view.                   | A still diorama, tiny life assets that cannot be recognized, synchronized/robotic loops, sliding or floating actors, or motion inferred only from source code.                                   |
| Restrained HUD                   | The default product view leaves the world dominant, uses compact labels, avoids giant type and persistent panels, and remains usable without overflow at 390×844. Secondary detail is dismissible or collapsed.   | Dashboard-like chrome, labels covering landmarks, persistent panels dominating the frame, mobile overflow, or controls that obscure the playfield.                                               |

Overall status is binary and non-compensating:

- **PASS** requires every row to pass, plus responsive parity and the automated runtime sanity checks.
- **REVISE** applies if any row fails or cannot be evaluated. Strong asset quality in one row cannot compensate for a terrain, layout, or composition failure.
- Desktop overview, mobile overview, and desktop exploration evidence must come from the same candidate and season.
- The clean route cannot prove the production HUD criterion. A production-surface capture is required before that row can pass.

## Planetary-universe gate

The profile overview has a separate acceptance gate because it is a navigation
summary, not a compressed kingdom. A passing repository planet must have a
spherical celestial silhouette, coherent lit and night hemispheres, a
class-specific procedural surface, and a restrained atmosphere. Terrestrial
worlds require readable oceans and continents; gas and ice giants require
latitude-driven bands; rings must be layered, elliptical in perspective, and
fully contained in overview and focus views. Literal houses, trees, fences, or
roads mounted on the overview sphere are a failure. Desktop overview, desktop
focus, 390×844 overview/focus, reduced-motion stability, and a 48-repository LOD
capture are all required before promotion.

## Deterministic capture harness

Start the development server in a separate terminal, then run:

```sh
pnpm dev
node scripts/visual/capture-worldclaw-review.mjs
```

The harness uses `http://localhost:3000` by default. Keep `localhost` for the Next.js development server; loopback-IP requests can be rejected for development chunks. It loads `/visual-review?world=enchanted-forest&season=spring&clean=1` by default, hides the Next.js development badge, waits a fixed post-canvas interval, and writes theme-qualified artifacts.

- `artifacts/visual-review/desktop-overview-enchanted-forest-spring.png` at 1440×900
- `artifacts/visual-review/mobile-overview-enchanted-forest-spring.png` at 390×844
- `artifacts/visual-review/desktop-exploration-enchanted-forest-spring.png` at 1440×900 after a fixed orbit-and-zoom gesture
- `artifacts/visual-review/sanity-report.json`

The artifact directory is intentionally gitignored. Optional controls are:

```sh
VISUAL_REVIEW_BASE_URL=http://localhost:3000 \
VISUAL_REVIEW_WORLD=enchanted-forest \
VISUAL_REVIEW_SEASON=spring \
VISUAL_REVIEW_SETTLE_MS=6500 \
VISUAL_REVIEW_CAPTURE_IDS=desktop-overview,mobile-overview \
VISUAL_REVIEW_ARTIFACT_DIR=/absolute/review/output \
node scripts/visual/capture-worldclaw-review.mjs
```

`VISUAL_REVIEW_CAPTURE_IDS` accepts `desktop-overview`, `mobile-overview`, and `desktop-exploration`.

## What automation honestly proves

For each capture, the JSON report asserts only:

- a visible, non-zero canvas;
- a live WebGL context and drawing buffer;
- no captured page exceptions or `console.error` messages;
- no document-level width or height overflow;
- no visible leaf-text element that is both exceptionally large and covers most of the viewport.

These checks catch broken rendering and gross UI regressions. They do **not** determine whether the image contains mountains, plausible grass, good scattering, correct settlements, convincing light, or life. A green canvas can pass every automated assertion and still receive an overall **REVISE** after image inspection.

## Current candidate review — 2026-08-12

Evidence: the fixed spring captures above, inspected at native resolution. Automated runtime status is **PASS**. The independent art status is **REVISE**.

| Area                             | Status        | Exact finding                                                                                                                                                                                                           |
| -------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Continuous terrain and hierarchy | REVISE        | The world is connected and non-flat, but its outline and dark vertical edge read as a rounded floating slab. Relief is mostly one smooth scale rather than a terrain hierarchy.                                         |
| Dominant rear escarpment         | REVISE        | The rear landmark is a pair of smooth green hills. It lacks a dominant multi-peak/cliff silhouette, rock structure, and atmospheric separation.                                                                         |
| Watershed and foreground water   | REVISE        | A rear-to-front river is present, but it remains a thin, nearly uniform strip with no legible banks, widening, shoreline, or foreground basin.                                                                          |
| Two-to-four spaced hamlets       | REVISE        | Roughly six or more visually equal building sites are distributed across the island. They read as outposts and lone structures, not 2–4 deliberately composed hamlets.                                                  |
| Scattered multi-species groves   | REVISE        | Trees are no longer in a single line and several silhouettes are present, which is a real improvement. Distribution is still broadly even and random, without convincing grove density, clearings, or ecological edges. |
| Grass and surface detail         | REVISE        | The surface is overwhelmingly one green, streaked material. Small rocks and ground-cover assets exist, but soil, bank, cliff, and near-camera grass differentiation are not yet legible.                                |
| Seasonal light and atmosphere    | REVISE        | Spring lighting is broad and flat, contact shadows are weak, and the saturated red/pink broadleaf canopy does not consistently read with the spring ground and sky.                                                     |
| Life and motion                  | REVISE        | Tiny figures/animals are present, but the overview does not communicate a living scene and a still capture cannot verify grounded, varied motion. A close live pass is still required.                                  |
| Restrained HUD                   | NOT EVALUATED | The clean capture correctly leaves the scene unobstructed, but it intentionally omits the production HUD. This row cannot pass from the candidate route.                                                                |
| Mobile parity                    | REVISE        | With the fixed settle time, assets do render at 390×844. The side edges and foreground outlet are cropped, so the full terrain/hamlet composition is not preserved as a readable mobile overview.                       |

Current score: **0/9 visual criteria passed, 8/9 require revision, and 1/9 is not evaluated**. Mobile composition also requires revision. The automated sanity PASS does not change the overall **REVISE** verdict.

### Revision priority

1. Replace the slab silhouette with a stronger continuous landform hierarchy and a dominant rear escarpment.
2. Make the water a watershed composition: carved valley, banks, variable width, and a foreground water body.
3. Recompose buildings into 2–4 separated hamlets before adding more props.
4. Shape vegetation as ecological groves and clearings, then establish terrain-dependent grass/soil/rock/shore materials.
5. Re-light spring, prove life in the exploration view, and review the actual product HUD separately.
