# Repository Worlds V2 original art source

Everything in this directory is project-authored for Repository Worlds V2. Batch 1 downloads, embeds, traces, or derives from no third-party art.

`batch-1-original-assets.recipe.json` is the deterministic source recipe for five proof families: Archive Spire (hero building), Ledger Pine (tree), Commit Ridge (rock/cliff), Patch Fox (animated animal), and Branch Lantern (prop). `archive-spire/archive-spire.blend` is a real Blender 5.1.2 authoring source created from that recipe. The committed shipping LODs are rebuilt by project-authored Three.js generation code so all five families share deterministic naming and metrics.

`blender/archive_spire_authoring.py` is offline-only. It requires `bpy.app.background`, accepts local paths, imports no HTTP/package/subprocess modules, saves a `.blend`, and exports GLB. Invoke it through the audited wrapper with an explicit tool override:

```sh
WORLD_ASSETS_V2_BLENDER_BIN="/absolute/path/to/Blender" \
node scripts/assets-v2/build-blender-authoring.mjs \
  --recipe art/world-v2/batch-1-original-assets.recipe.json \
  --family archive-spire \
  --blend-output art/world-v2/archive-spire/archive-spire.blend \
  --output /absolute/local/path/archive-spire.glb
```

Blender 5.1.2 is a build-time authoring tool only. The web application never invokes Blender, KTX-Software, or glTF Transform and never generates art at request time.

Batch 1 is a procedural proof, not an AAA-complete art set. It establishes original provenance, a real `.blend` source, grounded pivots, stable nodes/materials, three LOD slots, collision metadata, animation, and browser-ready GLB/KTX2 delivery. LOD0 is the canonical silhouette: generated lower LODs must preserve each materially nonzero axis within 10% for both envelope edges, total extent, and center drift, and the verifier recomputes that gate from the shipped GLBs. Sculpted high-poly bakes, full-family texture coverage, and final art direction remain later batches.
