# Changelog

All notable changes to this project are recorded here. A release-candidate
heading is prepared before publication; release automation rejects a tag without
an exact package-version and dated heading. A heading alone is not evidence that
the tag, npm package, or GitHub release exists.

## [Unreleased]

## [0.4.0] - 2026-07-15

This is the repository release candidate. As of 2026-07-15, npm `latest` remains
`0.3.1`; no tag, npm publication, or immutable GitHub release is claimed here.

### Added

- Added a strict-default policy denial for guest-readable native `input`,
  `textarea`, and `select` values, an exact explicit non-credential host grant,
  and unit/API/type/SES/three-engine coverage for stable pre-creation failure.
- Added a dedicated Chrome-for-Testing Chromium address-Autofill limitation
  witness: opted-in email remains guest-readable after autofill while external
  host form/named state remains unchanged; no password-manager claim is made.
- Added exported fixed-window operation and request-attempt rate defaults,
  captured owner-realm monotonic timing, exact boundary/reset/property tests,
  and stable fail-closed rate configuration/runtime errors alongside the
  existing lifetime quotas.
- Added a disposable strict event fence at the `ShadowRoot` bubble seam and at
  owned `focus`/`blur` targets, with three-engine delegated click/hotkey/action/
  form/focus coverage and an explicit trusted-host capture-phase obligation.
- Expanded post-lockdown Chromium, Firefox, and WebKit SES coverage to every
  advertised event family, all 21 public event types, and every public snapshot
  field, cancellation reentrancy, hostile getters, and a documented
  trusted-touch substitute where WebKit rejects scripted `Touch` construction.
- Enforced computed paint containment on the `ShadowRoot` host and added
  Chromium, Firefox, and WebKit geometry/hit-test coverage for explicitly
  granted fixed, viewport-sized, high-z-index guest styles.
- Expanded real-browser SES coverage across the browser-relevant issue #1
  authority, event/error, policy, form, owner, lifecycle, numeric, and quota
  seams.
- A single lint, typecheck, test, audit, and pristine-package CI gate.
- Real Chromium, Firefox, and WebKit request/navigation interception, browser
  SES bootstrap, and unyielding dedicated-Worker termination coverage.
- Fixed-seed generated CSS, URL, numeric, identifier, and lifecycle/model tests,
  including exact quota failure/release and replay paths.
- Reproducible tarball verification from a clean Git archive, minimum/current
  TypeScript declaration checks, offline consumer installation, source rebuild
  comparison, literal typecheck/browser execution of every executable packed
  README fence, SHA-256 checksums, and a CycloneDX SBOM.
- A tag-triggered release workflow whose write/OIDC job targets the protected
  `npm` environment, transfers only the verified tarball, checksum, and SBOM,
  verifies their identity, uses npm trusted publishing, and publishes a
  populated draft GitHub release.
- Release-engineering documentation for reproducible packaging, external owner
  controls, preferred source information, and historical package metadata risk.

### Changed

- Renamed the paragraph and text-node factories to `createParagraph()` and
  `createTextNode()` while retaining deprecated same-function `createText()` and
  `createRawText()` aliases, made list-local creation helpers consistently
  detached, and documented that descendants replaced by `setText()` remain
  reusable.
- Added preferred `setReadOnly()`, `setAutoFocus()`, `setColSpan()`, and
  `setRowSpan()` casing while retaining the deprecated former spellings as
  exact-function aliases with identical lifecycle and validation behavior.
- Centralized all public handler event types, snapshot kinds, and root/target
  fence placement in one authoritative catalog consumed by runtime
  registration, fence installation, and exhaustive unit/browser checks.
- Centralized stable version parsing/comparison/advance checks in one module
  shared by release metadata and interrupted-publication recovery, and required
  an empty `[Unreleased]` section immediately before the dated release heading.
- Removed `password` from the public input vocabulary and runtime state machine;
  credential-confidentiality deployments now explicitly require a separately
  trusted origin/iframe or process boundary.
- Consolidated UTF-8 quota accounting and enabled TypeScript unused-local and
  unused-parameter diagnostics.
- Replaced the Bun lock and unbounded Bun types with a publishable npm build
  lock and exact development dependency versions.
- Added explicit TypeScript 5.0.4/7.0.2 compatibility checks while retaining
  TypeScript 6.0.3 for tsup 8 declaration generation.
- Removed the unnecessary consumer TypeScript peer dependency and enabled ESM
  source maps with embedded source content.
- Replaced the legacy string-ID/light-DOM initializer with the breaking strict
  profile: a host-owned `ShadowRoot`, root-realm DOM operations, canonical
  owner-branded wrappers, placement checks, quotas, and idempotent disposal.
- The strict initializer now requires a host-supplied SES-compatible `harden`
  own data option and completes each document, specialized wrapper, nested
  style, event, cleanup capability, and URL result before exposure.
- Replaced raw global stylesheet authority and allow-all network sinks with
  root-scoped typed style operations and deny-by-default URL policies.
- Replaced live/native event exposure with immutable primitive snapshots and
  dispatch-scoped cancellation capabilities.
- Replaced the native `Error` subclass boundary with hardened primitive-only
  typed error records and an explicit `isSafeDOMError()` guard.
- Added per-document opaque identifier/name/IDREF namespaces, non-form control
  defaults, canonical specialized lookup, literal list overloads, readonly
  event/type vocabularies, and runtime container-versus-void enforcement.

### Security

- Added fail-closed handling for cross-owner, reparenting, active-element,
  form-default, malformed primitive, and post-disposal behavior in the strict
  profile.
- Added fail-closed validation for missing, accessor, non-function, no-op,
  shallow, identity-changing, throwing, replacement-returning, and stateful
  hardeners without claiming hardener provenance.
- Added real SES 2.2.0 two-compartment tests, pass-style 1.8.1 checks for copied
  data records, and browser lockdown coverage in all three Playwright engines.
- Documented that a whole `SafeEvent` is a hardened synchronous local control
  record rather than SES pass-by-copy, and that same-agent availability remains
  outside the DOM capability contract.

## [0.3.1] - 2026-07-10

### Added

- Restored `createListItem()`, `createTerm()`, and `createDescription()` on
  `SafeDocument`.

[Unreleased]: https://github.com/notwindstone/ark-of-atrahasis/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/notwindstone/ark-of-atrahasis/compare/v0.3.1...v0.4.0
[0.3.1]: https://www.npmjs.com/package/ark-of-atrahasis/v/0.3.1
