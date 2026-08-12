# Attribution registry

`registry.json` is the source of truth for direct dependencies, external
services, research influences, adapted source, and distributed assets.

Run the validator after changing dependencies, credits, or media:

```bash
node attribution/validate.mjs
```

The validator evaluates `registry.json` against `registry.schema.json`, then
checks semantic rules that JSON Schema alone does not cover: unique IDs, direct
runtime dependency coverage, safe repository-relative paths, symlink escape
protection, content hashes, referenced project files, and unregistered assets
across the source distribution. Generated media additionally requires complete
generation and human-review provenance under `generatedMediaProvenance`.
The schema evaluator is dependency-free and implements every JSON Schema
keyword used by this registry; it fails closed if a future schema edit adds an
unsupported keyword, so new constraints cannot be silently ignored.
`distribution: bundled-runtime` records packages whose code may be present in a
production bundle. `redistributedFiles` is reserved for discrete files tracked
in this repository, such as a copied source file, model, texture, font, sound,
or generated image; an empty list does not mean a runtime package is absent from
the deployment bundle.
Passing validation confirms registry completeness, not legal compatibility;
contributors and reviewers must still inspect the actual license terms.

Do not register an unknown license as permissive. An unlicensed source may be
cited for research, but its source or assets cannot be redistributed.

The asset inventory walks the repository while excluding external or generated
directories such as `.git`, `node_modules`, `.next`, `dist`, `build`, coverage,
and browser-test output. It covers common image, video, audio, environment,
font, shader, and 3D interchange formats. If a new distributable format is
introduced, add its extension to `assetExtensions` in `validate.mjs` in the
same pull request.
