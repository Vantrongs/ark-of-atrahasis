# Release engineering

This document records reproducible packaging and source-correspondence measures.
It is an engineering checklist, not legal advice or a legal conclusion.

## Prerequisites

- Use the exact npm version in `package.json#packageManager`.
- Start from the release commit with a clean index and working tree.
- Use `npm ci`; never refresh dependencies during a release run.
- Review the version, changelog, license metadata, repository tag, and protected
  publishing configuration before publishing.

## Verify and create the artifact

```sh
npm ci
npm run check
npm run pack:verified
```

`test:package` and `pack:verified` do not package the caller's existing `dist/`.
The script requires a clean checkout, exports `HEAD` with `git archive`, asserts
that the archive contains no `dist/`, performs a frozen install there, and lets
the tarball's `prepack` build create `dist/`. It then installs that tarball into
an isolated consumer and checks both ESM import and TypeScript declarations.

`pack:verified` copies that same, already-tested tarball to `.artifacts/` and
prints its SHA-256 digest. Publish the file, not the worktree:

```sh
npm publish .artifacts/ark-of-atrahasis-<version>.tgz --provenance
```

Record the digest, immutable source commit/tag, CI run, and registry provenance
with the release. Publishing credentials and branch/tag protections are
repository-administration concerns and must not be stored in this repository.

## Preferred source and build information

The npm tarball includes:

- the TypeScript preferred form for modification under `src/`;
- `package.json` with exact direct development dependency versions and scripts;
- `tsconfig.json` and `tsup.config.ts`;
- this release procedure, README, and GPLv3 license; and
- generated ESM, declarations, and source maps under `dist/`.

The lockfile and full Git history remain in the corresponding tagged repository
source. Release owners should obtain qualified legal review of the selected
GPLv3 section 6 conveyance method and confirm that the durable source location,
build information, dependencies, and any required installation information are
adequate for the actual distribution channel.

## Historical npm 0.1.0 ambiguity

The published `0.1.0` manifest reportedly identifies the package as MIT while
the included license file is GPLv3. Do not silently reinterpret or retroactively
relicense that artifact. Preserve the evidence, consider deprecating the version
with a factual notice, and obtain qualified legal guidance before making a
license claim about it.
