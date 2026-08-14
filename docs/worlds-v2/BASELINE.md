# Worlds v2 current visual baseline

Status: **REVISE**

This baseline records what is visibly present after the first terrain, material, environment, Walk-detail, and regional-dressing pass. It is not a quality claim.

## Evidence

| View  | Existing artifact                                          | Dimensions | SHA-256                                                            |
| ----- | ---------------------------------------------------------- | ---------: | ------------------------------------------------------------------ |
| Orbit | `artifacts/visual-review/worldclaw-phase2/after-orbit.jpg` |   1280×720 | `70a8055e8c0344569e9fbc20ac5415e51ce5519950865f0aaf4110ee85f2357d` |
| Walk  | `artifacts/visual-review/worldclaw-phase2/after-walk.jpg`  |   1280×720 | `00de2389be231dcca4c20f7d32a55a587389b398a4633a08bea20ac3bd5e96c5` |

The artifacts are local review evidence and are intentionally excluded from the product bundle. Findings below come from native-resolution inspection of those exact files.

These 1280×720 JPEGs are historical baseline evidence only. New desktop gold-gauntlet captures target 1440×900; they must not be described as pixel-matched replacements for this baseline.

## Orbit findings

| Area                    | Status | Visible finding                                                                                                                                                                                                                |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| World silhouette        | REVISE | The world is connected and has a lake/highland read, but the polygonal perimeter and exposed edge still feel like a floating game board rather than authored geology or coastline.                                             |
| Terrain hierarchy       | REVISE | Rear mountains, middle slopes, and foreground exist, yet most playable ground remains broad and smooth. Local relief and terrain-use transitions are too weak to carry the vast scale.                                         |
| Escarpment              | REVISE | The rear mass is larger than the buildings and creates a silhouette, but it is pale, softly modeled, and materially unresolved. Snow boundaries are stark and cliff structure is limited.                                      |
| Water                   | REVISE | The lake is unmistakable and the river/waterfall connection is visible. The water surface is milky and flat, banks are abrupt, and the shoreline lacks depth, wet transition, and hydrological detail.                         |
| Settlements             | REVISE | Multiple separated clusters and routes are readable. Repeated red-roof modules and similarly weighted towers make districts feel cloned rather than repository-specific.                                                       |
| Ecology                 | REVISE | Tree color and silhouette families are visible, but large bands read as planted rows while much of the terrain remains sparsely and evenly dotted. Grove cores, edges, clearings, and slope response need stronger authorship. |
| Lighting and atmosphere | REVISE | The scene is readable but low-contrast and uniformly pastel. Terrain, mountains, water, and sky converge in value, reducing depth and contact.                                                                                 |
| Repository scale        | REVISE | The vast world covers a large envelope, but much of the foreground is empty low-information surface while buildings and life become tiny. Scale has not yet translated into richer travel rhythm.                              |
| HUD                     | REVISE | Controls are compact relative to the canvas, but the repository card and full toolbar still compete with the upper composition. HUD review must include all gold scales and mobile.                                            |

## Walk findings

| Area                     | Status | Visible finding                                                                                                                                                                                                    |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| First playable frame     | REVISE | The spawn provides buildings, a path, a fence, and visible water, which is the correct content mix. The frame still reads as a sparse prototype space rather than a dense living environment.                      |
| Architecture             | REVISE | Stone, plaster, timber, and tile separation is materially stronger than Orbit's distant read. Repeated modules, empty openings, sharp edges, and weak foundation contact prevent a finished settlement impression. |
| Ground and roads         | REVISE | The near terrain is a broad olive surface and the tan route occupies a large unbroken area. Dark seams, abrupt boundaries, and minimal fine-scale breakup flatten the foreground.                                  |
| Vegetation               | REVISE | Grass, reeds, flowers, trees, and shoreline plants are present. Many near assets read as isolated spikes or repeated markers; understory and density gradients are not convincing.                                 |
| Water and shoreline      | REVISE | Water is visible from spawn, satisfying the intended camera relationship. It lacks strong reflection/refraction cues, animated normal detail, bank material transition, and contact treatment.                     |
| Props and route dressing | REVISE | The fence gives the route useful human scale. The surrounding space lacks enough purposeful settlement props, wear, gardens, debris, and varied edge treatment.                                                    |
| Depth and light          | REVISE | The sky and horizon are clean, but broad fill and weak contact shadow leave buildings, ground, and distant vegetation visually detached.                                                                           |
| Life and animation       | REVISE | This still does not visibly contain a legible animal or inhabitant. A screenshot cannot prove movement quality; a live Walk review is mandatory.                                                                   |
| HUD and controls         | REVISE | The centered location prompt, reticle, and bottom controls are understandable, but their weight must be judged while moving and against denser scenes.                                                             |

## Baseline conclusion

The implementation now contains the correct categories of systems—coherent terrain, watershed, settlements, assets, Walk, collision, vegetation, and environment—but their visible integration remains below the art-bible bar. The dominant deficiencies are:

1. terrain silhouette and material hierarchy;
2. eye-level ground, road, and shoreline quality;
3. authored settlement variation and contact;
4. ecological density structure and near-field vegetation; and
5. lighting, atmosphere, and live motion readability.

The next render pass must improve those relationships, then rerun the gold matrix. Adding more unrelated props without addressing hierarchy does not resolve the baseline.
