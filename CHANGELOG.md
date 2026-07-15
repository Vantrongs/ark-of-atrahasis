# Changelog

All notable changes to this project are recorded here. Release headings use the
package version and publication date; release automation rejects a tag without
a matching heading.

## [Unreleased]

### Changed

- The strict initializer now requires a host-supplied SES-compatible `harden`
  own data option and completes each document, specialized wrapper, nested
  style, event, cleanup capability, and URL result before exposure.
- Replaced the native `Error` subclass boundary with hardened primitive-only
  typed error records and an explicit `isSafeDOMError()` guard.

### Security

- Added fail-closed validation for missing, accessor, non-function, no-op,
  shallow, identity-changing, throwing, replacement-returning, and stateful
  hardeners without claiming hardener provenance.
- Added real SES 2.2.0 compartment tests, pass-style 1.8.1 data checks, and
  browser lockdown coverage across the existing three-engine Playwright gate.

## [0.4.0] - 2026-07-15

### Added

- A single lint, typecheck, test, audit, and pristine-package CI gate.
- Reproducible tarball verification from a clean Git archive, minimum/current
  TypeScript declaration checks, offline consumer installation, source rebuild
  comparison, SHA-256 checksums, and a CycloneDX SBOM.
- A tag-triggered release workflow whose write/OIDC job targets the protected
  `npm` environment, transfers only the verified tarball, checksum, and SBOM,
  verifies their identity, uses npm trusted publishing, and publishes a
  populated draft GitHub release.
- Release-engineering documentation for reproducible packaging, external owner
  controls, preferred source information, and historical package metadata risk.

### Changed

- Replaced the Bun lock and unbounded Bun types with a publishable npm build
  lock and exact development dependency versions.
- Added explicit TypeScript 5.0.4/7.0.2 compatibility checks while retaining
  TypeScript 6.0.3 for tsup 8 declaration generation.
- Removed the unnecessary consumer TypeScript peer dependency and enabled ESM
  source maps with embedded source content.
- Replaced the legacy string-ID/light-DOM initializer with the breaking strict
  profile: a host-owned `ShadowRoot`, root-realm DOM operations, canonical
  owner-branded wrappers, placement checks, quotas, and idempotent disposal.
- Replaced raw global stylesheet authority and allow-all network sinks with
  root-scoped typed style operations and deny-by-default URL policies.
- Replaced live/native event exposure with immutable primitive snapshots and
  dispatch-scoped cancellation capabilities.

### Security

- Added fail-closed handling for cross-owner, reparenting, active-element,
  form-default, malformed primitive, and post-disposal behavior in the strict
  profile.

## [0.3.1] - 2026-07-10

### Added

- Restored `createListItem()`, `createTerm()`, and `createDescription()` on
  `SafeDocument`.

[Unreleased]: https://github.com/notwindstone/ark-of-atrahasis/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/notwindstone/ark-of-atrahasis/compare/v0.3.1...v0.4.0
[0.3.1]: https://www.npmjs.com/package/ark-of-atrahasis/v/0.3.1
