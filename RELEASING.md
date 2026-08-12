# Releasing

Releases are maintainer operations. Do not publish from an unreviewed or dirty
working tree.

## Release requirements

- All required checks pass on the exact release commit.
- `CHANGELOG.md` describes user-visible changes and known limitations.
- Documentation and environment examples match shipped behavior.
- `node attribution/validate.mjs` passes.
- Direct dependencies and distributed assets have complete provenance.
- The production Vercel deployment has passed desktop, mobile, accessibility,
  camera, WebGL fallback, and error-state smoke checks.
- The release commit contains no secrets or private repository material.
- The world-package and compiler versions are reconciled with compatibility
  changes.

## Versioning

Use Semantic Versioning for application releases:

- Patch: compatible fixes and presentation improvements
- Minor: compatible features, analyzers, biomes, or interaction capabilities
- Major: incompatible world-package, route, storage, or public-contract changes

The compiler and serialized world schema have their own explicit versions and
must not be inferred solely from the application package version.

## Procedure

1. Create a release branch from an up-to-date `main`.
2. Move items from `Unreleased` into a dated version section.
3. Run the complete validation, browser, visual, accessibility, attribution,
   and performance gates.
4. Verify the Vercel preview, then merge through the protected branch.
5. Confirm the production deployment serves the release commit and public
   health checks pass.
6. Create a signed `vX.Y.Z` tag and a GitHub release from the same commit.
7. Attach checksums, an SPDX or CycloneDX SBOM, build provenance, and any
   downloadable artifacts.
8. Verify the release and ShieldCN badges resolve correctly after caches update.

The permanent README banner and social preview are release assets. They must be
generated only after the production visual language is stable, committed
locally, optimized, and registered with exact generation provenance.

## Rollback

If production validation fails, roll Vercel back to the last known-good
deployment, mark the affected release clearly, and publish a corrective patch.
Never retag an existing released version to a different commit.
