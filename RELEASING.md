# Release engineering

This document records reproducible packaging and source-correspondence measures.
It is an engineering checklist, not legal advice or a legal conclusion.

The repository contains the `0.4.0` release candidate. A live observation on
2026-07-15 found npm `latest` at `0.3.1`, `0.4.0` absent, and no `v0.4.0` tag or
GitHub release. That observation is historical and must be repeated before an
owner release. The repository evidence below is code-complete release
engineering, not evidence that external owner controls are configured or that a
release has occurred.

## Prerequisites

- Use Node.js 22.22.2 and the exact npm version in
  `package.json#packageManager`.
- Start from the release commit with a clean index and working tree.
- Use `npm ci --ignore-scripts --no-audit --no-fund`; never refresh dependencies
  or run dependency lifecycle scripts during a release install.
- Bump `package.json` and `npm-shrinkwrap.json` to a version that is not already
  present on npm. Never reuse or overwrite a published version.
- Promote every `[Unreleased]` changelog entry to the sole dated target-version
  heading and leave exactly one `[Unreleased]` heading structurally empty
  immediately before it.
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
be byte-identical. Every executable fenced block in the exact packed README is
classified across the CommonMark backtick/tilde, length, and indentation forms,
copied without rewriting into the consumer, checked as JavaScript by both
supported TypeScript versions, and executed in Chromium against the exact
installed tarball. Unsupported executable fence languages and unclosed fences
fail the package gate.

`pack:verified` copies that same, already-tested tarball to `.artifacts/` and
also writes a CycloneDX SBOM and a SHA-256 checksum file covering both assets.
These local artifacts are for inspection; do not publish from the worktree or a
developer credential.

## Immutable artifact handoff

The release workflow does not rebuild in the credentialed job. Its credential-
free `verify` job runs the complete gate, invokes `pack:verified`, permits exactly
one tarball, one SBOM, and one checksum manifest, and uploads those three files
under an artifact name bound to `github.sha`. The protected `publish` job has no
checkout and downloads only that artifact. Workflow-level concurrency serializes
all release tags rather than only identical refs.

Before publishing, the protected job checks the exact filenames, verifies the
two SHA-256 entries with `sha256sum --check --strict`, and reads the packed
manifest to bind package name/version to the release tag. It creates a draft
GitHub release or resumes the only draft for that tag after verifying the live
annotated tag target and every existing asset's name, size, state, and SHA-256
digest. Missing expected assets may be uploaded; duplicate, unexpected, or
mismatched assets and conflicting release state fail closed. GitHub may leave a
zero-byte `starter` asset after an interrupted upload; while the release is
still a draft, the workflow may delete only a uniquely named expected starter
with a valid asset ID, zero size, and no digest, then relist and re-upload it.
Every other starter state fails closed.

The job then publishes that exact `.tgz` with scripts disabled through npm
trusted publishing and provenance. Because npm package versions are immutable,
a recovery run may skip publication only when registry `dist.integrity` and
`dist.shasum` match the local tarball and the downloaded registry tarball is
byte-identical, and npm's signature audit cryptographically verifies a SLSA
provenance bundle whose subject digest, repository, workflow path, release ref,
and source commit exactly match this run. The audit runs without npm publish
credentials. Missing, invalid, ambiguous, or mismatched provenance fails closed.
Any other existing version fails closed. A new version must also advance the
stable `latest` tag. Only after the npm bytes and provenance are verified does
the job make the populated GitHub release non-draft; an already-published
release is accepted only when the same tag, commit, three assets, npm bytes, and
provenance all match.

This repository-enforced identity chain does not make GitHub releases immutable
by itself. The canonical repository owner must enable immutable releases and
protect the tag/ref policy outside the workflow.

Stable-version parsing, comparison, and the requirement to advance npm
`latest` live in the shared `scripts/stable-version.mjs` contract used by both
metadata verification and interrupted-release recovery. The credentialed job
extracts that module beside `release-recovery.mjs` from the already verified
tarball before invoking recovery; it does not recreate version logic in the
workflow shell.

## Protected release path

After the external controls below are audited, create a signed, annotated
`v<version>` tag at the reviewed release commit and push it to the canonical
upstream repository. `.github/workflows/release.yml`:

The workflow verifies that the tag is annotated and resolves to the release
commit. It cannot establish signer trust from repository content alone; tag
signature requirements and trusted signer identities are external owner
controls and must be audited separately.

1. requires a stable version that advances npm's current `latest` tag, requires
   the release tag, package version, and dated changelog entry to agree, and
   requires the immediately preceding `[Unreleased]` section to be empty;
2. requires the annotated tag to resolve to the checked-out commit and requires
   the npm version to be absent or a byte-identical, exact-provenance
   interrupted-run recovery;
3. reruns the complete gate without publishing credentials;
4. transfers only the verified tarball, SBOM, and checksums into the protected
   `npm` environment;
5. creates or resumes only an exact draft, publishes the tarball at most once
   with lifecycle scripts disabled, npm trusted publishing, and provenance, and
   verifies the registry tarball bytes and trusted-publish provenance; and
6. verifies the same three GitHub assets before promoting the draft, which
   owners must make immutable through repository settings.

```sh
git tag -s "v<version>" -m "ark-of-atrahasis <version>"
git push origin "v<version>"
```

`prepublishOnly` rejects ordinary directory publishing as a guardrail. It is not
an authorization boundary because npm flags can bypass lifecycle scripts; the
trusted-publisher and repository settings below are the actual owner controls.

Do not create a release tag for 0.3.1: that version was already published at the
historical observation above. The release workflow deliberately fails for an
existing version unless it is the byte-identical result of the same interrupted
release.

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

Repository tests execute first-run, partial-asset, recoverable empty-starter,
post-npm-failure, exact-rerun, provenance-match/mismatch, and conflicting-state
recovery behavior in addition to checking least-privilege job separation,
action SHA pins, and artifact identity. They do **not** prove any of these
external states:

- that npm trusted publishing is configured for the canonical repository,
  workflow, and `npm` environment;
- that the protected environment and required reviewers exist;
- that `main` and release tags have the required protection and signed-tag
  policy;
- that GitHub immutable releases are enabled; or
- that the npm account and historical-package/legal follow-up is complete.

Do not tag or publish until the owner confirms those states independently.

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
