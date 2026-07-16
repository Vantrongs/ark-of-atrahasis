# Changelog

All notable changes to this project are recorded here. A release-candidate
heading is prepared before publication; release automation rejects a tag without
an exact package-version and dated heading. A heading alone is not evidence that
the tag, npm package, or GitHub release exists.

## [Unreleased]

## [0.5.0] - 2026-07-16

This is the ESNext/Node 26 modernization release candidate. As of 2026-07-16,
npm `latest` remains `0.3.1`; no `v0.5.0` tag, npm publication, or immutable
GitHub release is claimed here.

### Changed

- Raised the exact build, test, package, and release runtime from Node.js
  22.22.2 to Node.js 26.5.0 and the published engine floor to `>=26.5.0`.
- Moved TypeScript libraries, emitted syntax, declaration fixtures, packed
  README examples, and tsup output from fixed ES2022 to rolling `ESNext`, which
  is the TypeScript 6/7 spelling for the TC39-next surface because neither
  compiler accepts a literal `ES2026` target.
- Upgraded Biome from 2.5.3 to 2.5.4 and Vitest from 3.2.7 to 4.1.10. The
  esbuild override moves from 0.27.2 to 0.28.1 because the 0.27 line is affected
  by GHSA-g7r4-m6w7-qqqr; the complete build and release-package gates cover the
  stable esbuild API surface used by tsup 8.5.1.
- Updated the check workflow to the pinned `actions/checkout` 7.0.0 revision
  already used by the release workflow, and added an exact `.node-version`
  source/build contract to the verified package.
- Retained npm 11.18.0 because npm 12.0.1 no longer accepts the publishable
  `npm-shrinkwrap.json` for `npm ci` or `npm sbom`; the reproducible install,
  exact dependency inventory, and CycloneDX 1.7 gates therefore stay on the
  latest compatible npm line.
- Retained TypeScript 5.0.4 as the minimum consumer declaration fixture and
  TypeScript 6.0.3 for tsup declaration generation while continuing to check
  current TypeScript 7.0.2; TypeScript 7 exposes no compiler API for tsup.

## [0.4.0] - 2026-07-15

This is the repository release candidate. As of 2026-07-15, npm `latest` remains
`0.3.1`; no tag, npm publication, or immutable GitHub release is claimed here.

### Added

- Added a strict-default policy denial for the complete public form surface
  (`button`, `fieldset`, `img`, `input`, `label`, `legend`, `optgroup`, `option`,
  `output`, `select`, and `textarea`), an exact
  `allowNonCredentialFormElements: true` host grant, operation metering before
  policy evaluation, and unit/API/type/SES/three-engine coverage for stable
  pre-creation failure.
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
- Reproducible tarball verification from a clean Git archive, exact installed
  root runtime-export namespace enforcement, minimum/current
  TypeScript declaration checks, offline consumer installation, source rebuild
  comparison, literal typecheck/browser execution of every executable packed
  README fence, SHA-256 checksums, and a byte-reproducible, strict-validated
  CycloneDX 1.7 SBOM bound to the exact tarball SHA-256 and reconciled with the
  complete non-root, non-link packed-shrinkwrap component inventory.
- A tag-triggered release workflow whose write/OIDC job targets the protected
  `npm` environment, transfers only the verified tarball, checksum, and SBOM,
  verifies their identity, uses npm trusted publishing, and publishes a
  populated draft GitHub release.
- Release-engineering documentation for reproducible packaging, external owner
  controls, preferred source information, and historical package metadata risk.
- An explicit internationalization contract and tests for BCP 47 language-tag
  round-tripping, distinct unknown/inherited language states, resettable HTML
  direction keywords, multilingual/Unicode string preservation, exact
  non-normalized identifiers, inherited translation instructions, semantic
  `<bdi>` isolation, locale-independent error codes, localized ARIA ownership,
  and the explicit `isComposing`-only IME boundary.
- Specialized localized `optgroup` labels and media-track kind/language/label/
  default operations, with `track.src` routed through the same default-deny URL,
  request-accounting, lifecycle, and three-engine network boundary as existing
  sinks.
- Flow-relative block/inline size, inset, margin, padding, border-side, and
  corner-radius longhands in the fixed deny-by-default style ceiling for
  direction-neutral host grants.

### Changed

- Upgraded the Node DOM test realm to `jsdom` 29.1.1 and replaced its deprecated
  `whatwg-encoding` chain with the maintained `@exodus/bytes` implementation.
- Replaced the abandoned `ajv-formats-draft2019` SBOM-validator peer with a
  narrow Ajv adapter retaining its direct RFC 5321 parser semantics, promoted
  CI/release/package Node deprecations to failures, and added a zero-deprecated
  lock gate.
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
  unique target and empty `[Unreleased]` headings, with the latter immediately
  before the dated release heading.
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
- External raw reparent/adopt/detach placement violations—including entries
  already revoked by an unproven rollback—now revoke wrapper setters/listeners
  and release logical accounting without mutating host-owned markup,
  URL/style/identifier attributes, IDL state, or tree placement.
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

[Unreleased]: https://github.com/notwindstone/ark-of-atrahasis/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/notwindstone/ark-of-atrahasis/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/notwindstone/ark-of-atrahasis/compare/v0.3.1...v0.4.0
[0.3.1]: https://www.npmjs.com/package/ark-of-atrahasis/v/0.3.1
