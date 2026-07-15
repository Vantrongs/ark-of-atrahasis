# Release engineering

This document records reproducible packaging and source-correspondence measures.
It is an engineering checklist, not legal advice or a legal conclusion.

## Prerequisites

- Use Node.js 22.22.2 and the exact npm version in
  `package.json#packageManager`.
- Start from the release commit with a clean index and working tree.
- Use `npm ci --ignore-scripts --no-audit --no-fund`; never refresh dependencies
  or run dependency lifecycle scripts during a release install.
- Bump `package.json` and `npm-shrinkwrap.json` to a version that is not already
  present on npm. Never reuse or overwrite a published version.
- Promote the `[Unreleased]` changelog entries to a dated version heading.
- Review the license metadata and the external owner/legal controls below.

## Verify and create the artifact

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run pack:verified
```

`test:package` and `pack:verified` do not package the caller's existing `dist/`.
The script requires a clean checkout, exports `HEAD` with `git archive`, asserts
that the archive contains no `dist/`, performs a frozen install there, and lets
the tarball's `prepack` build create `dist/`. It then installs that tarball into
an isolated consumer with an empty cache and disabled registry, checks ESM
import plus declarations on the documented minimum and current TypeScript, and
rebuilds `dist/` from the source and lockfile included in the tarball. Two
consecutive prepack builds from the same clean archive and frozen install must
be byte-identical.

`pack:verified` copies that same, already-tested tarball to `.artifacts/` and
also writes a CycloneDX SBOM and a SHA-256 checksum file covering both assets.
These local artifacts are for inspection; do not publish from the worktree or a
developer credential.

## Protected release path

Create a signed, annotated `v<version>` tag at the reviewed release commit and
push it to the canonical upstream repository. `.github/workflows/release.yml`:

The workflow verifies that the tag is annotated and resolves to the release
commit. It cannot establish signer trust from repository content alone; tag
signature requirements and trusted signer identities are external owner
controls and must be audited separately.

1. requires a stable version that advances npm's current `latest` tag, and
   requires the release tag, package version, and dated changelog entry to agree;
2. requires the annotated tag to resolve to the checked-out commit and the npm
   version to be unpublished;
3. reruns the complete gate without publishing credentials;
4. transfers only the verified tarball, SBOM, and checksums into the protected
   `npm` environment;
5. verifies checksums and publishes the tarball with lifecycle scripts disabled,
   npm trusted publishing, and provenance; and
6. attaches the same assets to the GitHub release record, which owners must make
   immutable through repository settings.

```sh
git tag -s "v<version>" -m "ark-of-atrahasis <version>"
git push origin "v<version>"
```

`prepublishOnly` rejects ordinary directory publishing as a guardrail. It is not
an authorization boundary because npm flags can bypass lifecycle scripts; the
trusted-publisher and repository settings below are the actual owner controls.

Do not create a release tag for 0.3.1: that version is already published. The
release workflow deliberately fails if a version exists in the npm registry.

## Required owner controls

Before enabling releases, repository/package owners must:

- configure npm trusted publishing for the canonical repository, the
  `.github/workflows/release.yml` workflow, and its `npm` environment;
- configure the `npm` GitHub environment with required reviewers and restrict it
  to protected release tags;
- protect `main` with required `check` status and review, and protect release
  tags against deletion, rewrite, and unauthorized creation, with the approved
  signed-tag policy where the hosting plan supports it;
- require review from `.github/CODEOWNERS` for workflow, manifest, lockfile, and
  release-script changes;
- enable immutable GitHub releases, retain Actions logs/artifacts according to
  the release retention policy, and record the source commit, tag, checksum,
  SBOM, and npm provenance; and
- require strong npm account security and remove long-lived automation publish
  tokens after trusted publishing is proven.

These settings cannot be enforced by a pull request. A release owner must audit
them in both GitHub and npm before the first publication.

## Preferred source and build information

The npm tarball includes:

- the TypeScript preferred form for modification under `src/`;
- `package.json`, the publishable `npm-shrinkwrap.json`, exact development
  dependency resolutions and integrity digests;
- the tests, release/build scripts, `tsconfig.json`, and `tsup.config.ts`;
- this release procedure, README, and GPLv3 license; and
- generated ESM, declarations, and source maps under `dist/`.

The corresponding annotated tag and full Git history remain in the canonical
repository. Release owners should obtain qualified legal review of the selected
GPLv3 section 6 conveyance method and confirm that the durable source location,
build information, dependencies, and any required installation information are
adequate for the actual distribution channel. Including preferred source and a
build lock improves auditability; it does not itself select or prove a legal
conveyance method.

## Historical npm 0.1.0 ambiguity

The published `0.1.0` manifest reportedly identifies the package as MIT while
the included license file is GPLv3. Do not silently reinterpret or retroactively
relicense that artifact. Preserve the evidence, consider deprecating the version
with a factual notice, and obtain qualified legal guidance before making a
license claim about it.
