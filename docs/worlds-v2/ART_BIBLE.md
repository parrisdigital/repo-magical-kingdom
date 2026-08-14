# Worlds v2 stylized-realism art bible

## North star

Build a living, authored-looking repository landscape that is readable as a world from Orbit and believable as a place from Walk. The target is stylized realism: simplified shapes and controlled palettes supported by credible scale, materials, terrain contact, lighting, water, ecology, and motion.

The visual shorthand is **storybook naturalism with game-world discipline**. Forms may be exaggerated, but physical relationships may not be careless.

### We want

- one coherent landform with a strong silhouette and nested large, middle, and local relief;
- repository-driven settlements and landmarks with deliberate negative space;
- tactile, restrained PBR surfaces whose texture scale holds up in Walk;
- water that belongs to a watershed and remains legible at eye level;
- ecological clusters, clearings, edges, and landmarks instead of uniform scatter;
- varied, grounded life and ambient motion;
- cinematic depth without crushed shadows, clipped highlights, or fog that erases form; and
- compact product chrome that lets the world dominate.

### We reject

- a floating lawn, flat height field, or one-noise-scale terrain;
- random asset confetti used as a substitute for composition;
- photoreal materials mixed with toy-like geometry without a unifying treatment;
- identical houses, trees, rotations, scales, or animation phases;
- water as a flat blue shape with no banks, depth cues, or relationship to terrain;
- oversized roads, razor-edged material boundaries, floating props, or buried foundations;
- uniform ambient lighting, unstructured bloom, and fog-colored everything; and
- “AAA” language justified by a green build, high polygon count, or a single attractive screenshot.

## Repository semantics remain visible

Repository data controls world identity; it does not directly dictate every vertex.

| Repository evidence      | World expression                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Repository size          | Bounded land envelope, settlement capacity, travel distance, and LOD—not unbounded object count |
| Directories/provinces    | Distinct districts or hamlets connected by readable routes                                      |
| Files                    | Buildings, landmarks, or truthful aggregate structures                                          |
| File size                | Bounded prominence, footprint, or height; never an unreadable skyscraper spike                  |
| Category/language        | Material family, prop vocabulary, civic role, and controlled color accents                      |
| Tests/docs/config/assets | Defensive, archival, infrastructural, or cultivated environmental signals                       |
| Commit identity          | Deterministic topology and placement                                                            |
| Season                   | Appearance and atmosphere only; structural identity does not move                               |
| Theme                    | Material vocabulary and ecology density/masks; terrain, settlements, and routes do not move     |

Compact worlds should feel intimate and composed. Medium worlds should add a meaningful district and travel rhythm. Vast worlds should reveal hierarchy and distance, not simply more tiny objects.

## Composition from Orbit

Every overview needs a three-read hierarchy:

1. **Two-second read:** land silhouette, dominant escarpment or highland, primary water body, and settlement hierarchy.
2. **Ten-second read:** connected watershed, routes, grove masses, clearings, and distinct districts.
3. **Inspection read:** file-derived buildings, landmarks, props, local material changes, animals, and micro-detail.

The rear third carries the strongest highland silhouette. The middle third carries settlement relationships and the watershed course. The foreground resolves the water body, approach, or estuary and must not become an empty texture field.

Do not center every feature. Use asymmetry, overlap, foreground framing, and atmospheric separation. Empty space is intentional only when it improves hierarchy or traversal.

## Terrain and ground

Terrain is the shared support system, not a decorative mesh beneath independent assets.

- Blend macro landform, regional relief, and local surface variation at visibly different frequencies.
- Give cliffs, banks, paths, meadows, wet margins, and settlement ground distinct slope- and use-aware material behavior.
- Preserve readable terrain normals under both the sun and fill light.
- Keep texture texel density consistent from one material family to another.
- Break long straight borders and repeated contour rhythms.
- Seat buildings, fences, trees, rocks, and detail against sampled terrain height and slope.
- Treat exposed world edges as authored geology or coastline; never as an accidental vertical skirt.

At Walk distance, the ground must still contain a coherent material response and cover hierarchy. Large untextured polygons, black seams, spike grass, and isolated identical flower markers are revision failures.

## Water and shoreline

Water must read as part of a catchment from Orbit and as a physical surface from Walk.

- Source water in or below highland relief and route it downhill.
- Vary river width and curvature; form banks rather than drawing a ribbon on top of terrain.
- Resolve into a lake, pool, broad reach, or estuary with an unmistakable shoreline.
- Use depth, roughness, normal motion, reflection, refraction/color falloff, and contact treatment in a restrained stack.
- Add reeds, stones, wet soil, debris, and foam only where hydrology and slope justify them.
- Keep shoreline props out of paths and water unless they are intentionally aquatic.

The `walk-shoreline` frame must visibly contain water and a readable bank. Its name is a review requirement, not an automated assertion.

## Architecture and settlements

Buildings share a construction culture but require silhouette and state variation.

- Use a consistent modular scale for doors, windows, storeys, fences, and path widths.
- Preserve authored PBR maps and physical material roles.
- Add modest bevels or geometry breaks where a perfectly sharp edge destroys scale.
- Vary roofline, footprint, orientation, annexes, chimneys, shutters, signs, carts, gardens, and wear.
- Compose 2–4 primary settlement groups; only large worlds may add clearly subordinate satellites.
- Give each group a center, edge, internal route, service space, and relationship to terrain or water.
- Avoid repeated towers or hero assets competing at equal prominence.

Every architecture asset must have a stable pivot, ground contact, bounded collision proxy, correct outward normals, valid UVs, and an LOD or batching strategy before broad use.

## Materials and texture acceptance

- Base color contains no baked directional light.
- Normal orientation is verified under a moving key light; inverted channels are rejected.
- Roughness variation describes the material rather than adding generic noise.
- Metalness is physically plausible and sparse.
- Texture seams, mirroring, and obvious repeat periods are not visible at required distances.
- Transparent windows sort predictably and do not erase interior or adjacent geometry.
- Emission is localized to intended windows, lamps, runes, or effects.
- One asset family does not appear dramatically sharper, glossier, or more photoreal than its neighbors.

Worlds v2 acceptance budgets are approximately 200 main-pass draws / 2,000,000 visible triangles in Orbit and 220 main-pass draws / 3,000,000 visible triangles in Walk. These are explicit upper targets for the next renderer generation, not permission to spend the budget indiscriminately. Visual gains must still come from hierarchy, batching, LOD, material discipline, and selective near-field detail. Any change to those targets requires updated accounting and gold-matrix evidence.

## Ecology and surface detail

Use at least three distinct plant silhouettes per temperate world, then distribute them as systems:

- dense grove cores;
- softer mixed edges;
- route and settlement clearings;
- wet shoreline vegetation;
- slope-appropriate scrub or rock; and
- rare solitary specimens that act as landmarks.

Randomness must be deterministic, seeded, spatially correlated, and constrained by slope, water, routes, structures, and habitat. Scale and rotation variation must preserve species identity. Walk needs understory and ground cover; Orbit needs legible massing.

## Life and motion

A living world needs at least two visible motion systems in a live Walk review: grounded animals or inhabitants plus environmental motion such as water, foliage, weather, smoke, or particles.

- Offset loop phase, speed, route, and idle duration.
- Keep feet, wheels, and bodies attached to terrain.
- Stop actors from clipping buildings, fences, water, or each other.
- Give motion a habitat and purpose; do not roam uniformly across the map.
- Keep idle frames alive without turning the whole image into constant noise.
- Reduced motion may remove decorative movement but must preserve navigation feedback and world readability.

A still screenshot can prove staging, not animation quality. The human review note must state that motion was observed live.

## Lighting, atmosphere, and seasons

Use a clear key direction, readable contact shadow, restrained sky/fill, and distance atmosphere that separates planes.

- Preserve material color while giving forms enough contrast to read.
- Keep fog chromatically related to the sky, but not identical to every surface.
- Use exposure and tone mapping consistently across Orbit and Walk.
- Prevent emissive surfaces from flattening rock, foliage, or buildings.
- Make the season visible in foliage, ground, water, sky, light, particles, and activity—not only UI labels.
- Keep season changes topologically stable so gold comparisons remain meaningful.

## Cameras and interface

Orbit overview, Orbit close, and Walk are one continuous product experience.

- Orbit overview contains the world silhouette without excessive dead space or crop.
- Orbit close preserves spatial orientation while exposing material and asset quality.
- Walk starts at a safe, path-side, lived-in point near a readable structure and visible water when possible.
- Eye height, field of view, movement speed, collision, and head motion must feel human-scaled.
- The HUD stays compact, legible, and subordinate. It must not hide the feature being reviewed.
- Pointer-lock denial may degrade controls gracefully, but it cannot be presented as a successful movement test.

## Asset review checklist

Before an asset joins a production family, record:

- source, license, author, immutable revision, and derivative history;
- real dimensions and in-world target height;
- forward axis, up axis, pivot, ground plane, and collision proxy;
- triangle count, primitive count, material count, texture dimensions, and runtime memory;
- base-color, normal, roughness, metalness, alpha, and emission behavior;
- near, middle, and far presentation strategy;
- seasonal compatibility and palette treatment;
- shadow behavior and contact at representative slopes; and
- screenshots in at least Orbit close and the relevant Walk view.

No third-party visual may enter the art bible or gold evidence merely as mood-board decoration. References must remain linked, attributed, and separate from shipped product media.

## Human visual acceptance

Each required capture is reviewed at native resolution. `PASS` means the named target is clearly visible and meets this bible. `REVISE` means any criterion fails, evidence is ambiguous, the named target is missing, or the reviewer only inspected automated output.

Strong architecture cannot compensate for weak terrain. Strong Orbit composition cannot compensate for poor Walk materials. The gate is non-compensating.
