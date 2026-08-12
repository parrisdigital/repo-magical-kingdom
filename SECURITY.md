# Security policy

## Supported versions

Repo Magical Kingdom is currently under active development and has not issued
a stable release.

| Version                                  | Supported |
| ---------------------------------------- | --------- |
| `main`                                   | Yes       |
| Unreleased forks or modified deployments | No        |

Release support windows will be documented here when tagged releases begin.

## Reporting a vulnerability

Do not disclose vulnerabilities in a public issue, discussion, pull request,
or social post.

Use GitHub's private vulnerability reporting flow:

<https://github.com/parrisdigital/repo-magical-kingdom/security/advisories/new>

Include the affected revision, impact, reproduction steps, and any suggested
mitigation. Do not include real access tokens, private repository contents, or
other people's personal information. Maintainers will acknowledge a valid
report through the private advisory and coordinate remediation and disclosure
there. This project does not currently operate a paid bug-bounty program.

## Security boundaries

- The hosted service supports public GitHub repositories only unless a future
  release explicitly documents private-repository support.
- GitHub credentials are server-only and must never use a `NEXT_PUBLIC_` name.
- A repository must be verified public before its tree can enter a shared cache.
- Repository source is treated as untrusted data and is never executed.
- Labels, paths, URLs, manifests, and API responses must be validated or escaped
  at their trust boundary.
- Generated worlds link to immutable commit revisions for provenance.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the broader trust model.
