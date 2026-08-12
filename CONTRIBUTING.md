# Contributing

Thank you for helping make repository architecture explorable. Contributions
to code, design, documentation, accessibility, performance, world semantics,
and properly licensed assets are welcome.

Please read the [Code of Conduct](CODE_OF_CONDUCT.md) and sign off your commits
under the [Developer Certificate of Origin](DCO).

## Before opening a change

- Search existing issues and discussions before proposing duplicate work.
- Use an issue for substantial behavior or world-language changes so the
  meaning can be agreed before implementation.
- Never make decorative scenery imply a repository relationship unless the
  compiler has evidence for that relationship.
- Review [the asset policy](docs/ASSET_POLICY.md) before adding any media.
- Report vulnerabilities using [the private security process](SECURITY.md), not
  a public issue.

## Local development

Requirements:

- Node.js 22.17 or newer
- pnpm 10.32.1, as declared by `packageManager`
- A browser with WebGL 2 support for the full 3D experience

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Public repositories work without a GitHub token at a lower API quota. If you
provide `GITHUB_TOKEN`, use a token restricted to public repository read access
and never expose it through a `NEXT_PUBLIC_` variable.

## Validation

Run the full local gate before requesting review:

```bash
pnpm validate
pnpm test:e2e
node attribution/validate.mjs
```

If a browser is not installed for Playwright yet, install the Chromium runtime
using Playwright's documented installation command before running end-to-end
tests.

For scene or UI changes, include desktop and mobile evidence. For performance
changes, record the fixture, device/browser, frame rate, draw calls, and asset
bytes so results can be reproduced.

## Pull requests

Keep pull requests focused and explain:

- What changed and why
- Which repository evidence drives any new visual meaning
- How deterministic output and source coverage were preserved
- Tests and manual checks performed
- Performance impact
- Accessibility impact
- New dependencies, assets, or attribution requirements

Pull requests should update documentation and tests in the same change as the
behavior they describe.

## Commit sign-off

All commits must include a DCO sign-off:

```text
Signed-off-by: Your Name <your-email@example.com>
```

Create it automatically with `git commit -s`. By signing off, you certify the
statement in [DCO](DCO). Pull requests run a required local-policy check that
verifies every non-merge commit has a valid `Signed-off-by:` trailer matching
the commit author's email; the pull-request checkbox is not a substitute for
the commit trailer.

## Dependencies and assets

New runtime dependencies must be compatible with this MIT-licensed project and
added to `attribution/registry.json` when they are direct dependencies.
Dependency review uses an explicit license allowlist covering the currently
installed dependency graph. A dependency with a new license family requires a
documented compatibility review and an intentional allowlist change; unknown,
noncommercial, and no-derivatives licenses fail by default.

Every distributed model, texture, HDRI, image, sound, font, icon, shader
snippet, or generated-media artifact must include:

- Canonical source or generation provenance
- Creator or model/tool attribution
- License and version
- Modification notes
- Exact local file paths
- Any required attribution text

Unknown, noncommercial, no-derivatives, or redistribution-prohibited assets
will not be accepted.

## Recognition

Git history is the canonical authorship record. Material contributors may be
added to project credits with their permission. Third-party work remains
credited to its original creators regardless of who contributed the integration.
