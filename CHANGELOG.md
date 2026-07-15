# Changelog

All notable changes to this project are recorded here. Release headings use the
package version and publication date; release automation rejects a tag without
a matching heading.

## [Unreleased]

### Added

- A single lint, typecheck, test, audit, and pristine-package CI gate.
- Reproducible tarball verification from a clean Git archive, minimum/current
  TypeScript declaration checks, offline consumer installation, source rebuild
  comparison, SHA-256 checksums, and a CycloneDX SBOM.
- A protected tag release workflow that publishes the verified tarball with npm
  provenance and attaches the tarball, checksum, and SBOM to a GitHub release.
- Host-bootstrap, threat-model, compatibility, and release-engineering
  documentation.

### Changed

- Replaced the Bun lock and unbounded Bun types with a publishable npm build
  lock and exact development dependency versions.
- Added explicit TypeScript 5.0.4/7.0.2 compatibility checks while retaining
  TypeScript 6.0.3 for tsup 8 declaration generation.
- Removed the unnecessary consumer TypeScript peer dependency and enabled ESM
  source maps with embedded source content.

### Security

- Documented that the legacy 0.3.1 API is not an adversarial SES capability
  boundary and must not be endowed to untrusted code.

## [0.3.1] - 2026-07-10

### Added

- Restored `createListItem()`, `createTerm()`, and `createDescription()` on
  `SafeDocument`.

[Unreleased]: https://github.com/notwindstone/ark-of-atrahasis/compare/v0.3.1...HEAD
[0.3.1]: https://www.npmjs.com/package/ark-of-atrahasis/v/0.3.1
