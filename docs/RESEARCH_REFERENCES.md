# Research references

Research helps shape Repo Magical Kingdom, but a citation is not a software or
asset license. This document records ideas studied during design and the narrow
way each source influenced the project.

## WorldClaw

Chunchao Guo, Jinpeng Li, Yang Li, and Zilong Huang. “WorldClaw: Agentic 3D
Open-World Generation at Scale.” 2026.

- Paper: <https://arxiv.org/abs/2608.05248>
- DOI: <https://doi.org/10.48550/arXiv.2608.05248>
- Project repository:
  <https://github.com/Tencent-Hunyuan/Hunyuan3D-WorldClaw>
- Reviewed commit:
  <https://github.com/Tencent-Hunyuan/Hunyuan3D-WorldClaw/commit/d9901019f561c32921e38d0f0f5cabc8f9f2ce48>

Ideas studied:

- A structured intermediate scene representation
- Coarse global planning before local detail
- A semantic region layout shared across terrain, materials, and placement
- Selective enrichment of visually important regions
- Addressable objects instead of one monolithic generated mesh
- Render, inspect, validate, and refine loops for offline assets

Repo Magical Kingdom applies those principles independently to deterministic
repository visualization. WorldClaw is not a runtime dependency. Its repository
did not provide an implementation or license at the reviewed default-branch
revision, and no WorldClaw media or code is distributed here.

## Repository City design precedent

[Repository City](https://github.com/parrisdigital/repository-city) is a working
software predecessor rather than an academic citation. Its tested separation
between GitHub ingestion, pure TypeScript layout, rendering budgets, instanced
Three.js geometry, and browser interaction informed the engineering direction.

Reviewed commit:
<https://github.com/parrisdigital/repository-city/commit/0e61374af12387266c6fb13c273bee845b5f0864>

Repo Magical Kingdom changes the domain model from renderer-ready city geometry
to a versioned world package with immutable revisions, explicit coverage,
diverse realm regions, universe summaries, and source-proven semantic routes.

## Adding references

Add a source when it materially influences an algorithm, representation,
evaluation method, or product language. Record:

- Complete citation and stable link
- Exact code revision when a repository is involved
- Specific ideas used
- Whether implementation or assets were copied
- License status and resulting restrictions

Do not use a bibliography to obscure direct source adaptation. Adapted work
belongs in [SOURCE_LINEAGE.md](SOURCE_LINEAGE.md) and the attribution registry.
