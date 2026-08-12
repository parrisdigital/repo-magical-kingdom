# Asset and media policy

Every distributed asset must be legally reusable, technically appropriate for
the web, and traceable to its origin. This policy covers 3D models, textures,
materials, HDRIs, fonts, icons, images, screenshots, audio, video, shader
snippets, and generated media.

## Preferred sources

Use assets in this order:

1. Original procedural assets created in this repository
2. Original commissioned assets with written redistribution rights
3. CC0 or public-domain assets
4. CC BY 4.0 assets with complete attribution
5. Other compatible assets approved through explicit license review

## Rejected by default

- Missing, unclear, or unverifiable licenses
- Noncommercial licenses
- No-derivatives licenses when conversion, optimization, or modification occurs
- Marketplace terms that prohibit source or application redistribution
- Assets extracted from demos, screenshots, videos, games, or websites
- Trademarked characters or recognizable franchise material
- WorldClaw or Tencent imagery, figures, meshes, materials, or generated output
- AI-generated media without tool/model and prompt provenance

An asset being downloadable does not make it redistributable.

## Required provenance

Before an asset is merged, add an entry to
[`attribution/registry.json`](../attribution/registry.json) containing:

- Stable ID and descriptive title
- Creator or organization
- Canonical source URL
- Source version, commit, or retrieval date
- SPDX license identifier where available
- Exact local file paths
- Original and modified content hashes
- Modifications and conversion pipeline
- Required attribution text
- Whether the asset is generated or human-created

The pull request should include the original license text when the license
requires redistribution or when an upstream link may not remain available.

## Technical requirements

### 3D models

- Prefer glTF 2.0 binary (`.glb`).
- Use meters, Y-up coordinates, consistent origins, and named logical nodes.
- Remove unused nodes, cameras, lights, and animation tracks.
- Declare polygon count, material count, draw-call impact, and bounding size.
- Compress geometry intentionally with Meshopt or Draco and record the method.
- Validate normals, UVs, texture color spaces, and transparent materials.
- Provide LODs or a procedural fallback for large hero assets.

### Textures and environment maps

- Prefer KTX2/Basis for runtime textures where the target browser permits it.
- Use power-of-two dimensions only when the rendering path benefits.
- Record color space and intended channel packing.
- Avoid oversized textures that provide no visible improvement at target scale.

### Audio

- Provide a mute control and never autoplay unbounded loud audio.
- Loop cleanly and use compressed browser-compatible formats.
- Avoid voice or field recordings containing unconsented personal information.

### Images and video

- Optimize for repository and application delivery.
- Include meaningful alt text when the asset communicates information.
- Avoid embedding essential text in an image.

## Generated media

Generated assets are not provenance-free. Record:

- Generator tool, model, and version
- ISO 8601 generation date
- Full prompt and explicit negative constraints
- Every reference asset and the rights to use it, or an empty reference list
- Human edits and conversion steps (use an explicit `None` step when applicable)
- Source-output hash in `generatedMediaProvenance.sourceContentHashes`
- Final distributed-file hash in the entry's `contentHashes`
- Reusable attribution text
- Named reviewer, review date, and affirmative confirmation that the result does
  not imitate protected project imagery or contain third-party logos or
  characters

These fields are schema-enforced through `generatedMediaProvenance` for every
`kind: generated-media` entry. The registry validator also requires at least
one redistributed file and verifies its final SHA-256 hash. Reference assets
with a `localFile` must stay inside this repository and exist at validation
time.

The final README hero will be generated only after the production kingdom's
visual language is stable. It must use original application captures as design
references, avoid WorldClaw imagery, and be registered before it is linked from
the README.

## Runtime attribution

The application Credits screen and repository notices should be generated from
the same registry. Attribution required inside the experience must remain
visible and readable; it cannot exist only in source control.

## Removal and replacement

If provenance is disputed or a license becomes incompatible, stop distributing
the asset, remove it from future releases and caches where practical, document
the change, and replace it with a procedural or clearly licensed alternative.
