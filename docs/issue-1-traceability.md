# Issue #1 implementation traceability

This document maps the umbrella security-hardening issue to code, tests, and
release evidence. A checkbox is only marked complete after the corresponding
test or packaging proof runs in CI.

## Boundary and capability model

- [ ] The public initializer accepts an exclusively owned host-created root;
      guest code receives no selector or ambient-document authority.
- [ ] Raw stylesheet text is unavailable in the strict profile.
- [ ] URL and request-producing sinks are denied by default and approved by a
      host-provided, per-sink policy.
- [ ] Event payloads are immutable primitive snapshots and retain no native
      event or DOM graph after synchronous dispatch.

## Ownership and lifecycle

- [ ] Registries, brands, and wrapper caches are scoped to one safe document.
- [ ] Wrappers are canonical per owner and cross-owner resources are rejected.
- [ ] Mutations validate actual placement and revoke nodes reparented outside
      the assigned mount.
- [ ] Detach is reversible; dispose/revoke is irreversible and idempotent.
- [ ] Document disposal removes owned resources and listeners and invalidates
      every wrapper.
- [ ] Pre-existing active/custom elements are never generically adapted.
- [ ] Form, identifier, and named-property behavior is isolated from the host.
- [ ] Node, listener, text, attribute, style, and request quotas are explicit
      and release their accounting on disposal.

## Runtime and API correctness

- [ ] Completed documents, wrappers, events, and nested records are hardened;
      the documented strict bootstrap requires SES lockdown before import.
- [ ] Inline style operations use a coherent method API rather than a Proxy
      with inconsistent traps.
- [ ] Keyboard, mouse, pointer, touch, focus, and generic event snapshots have
      discriminated primitive fields.
- [ ] Lookup preserves canonical specialized wrappers.
- [ ] Errors and rejections follow one stable typed contract and never expose
      native/custom exception objects to guest code.
- [ ] Runtime arguments are primitive-checked and normalized exactly once.
- [ ] Numeric and media setters enforce finite, integer, and range constraints.
- [ ] All DOM construction and Web IDL operations use the root's realm.
- [ ] Public types encode vocabularies, readonly snapshots, list overloads,
      and void-versus-container restrictions where runtime enforces them.

## Verification and release evidence

- [ ] Unit, property, and fuzz tests cover policies, lifecycle, and malformed
      inputs.
- [ ] Chromium, Firefox, and WebKit tests intercept requests/navigation and
      prove the outside-root invariants.
- [ ] SES integration runs after lockdown with a host and two mutually
      distrusting compartments.
- [ ] Type fixtures run on the documented minimum and current TypeScript.
- [ ] One CI `check` gate runs typecheck, lint, unit/property tests, browser
      tests, SES tests, and package tests.
- [ ] A pristine packed tarball is installed and its ESM runtime and
      declarations are exercised; the tested artifact is the publishable one.
- [ ] README documents bootstrap, threat model, ownership, policies, lifecycle,
      compatibility, ESM-only status, and the same-agent availability non-goal.
- [ ] Package-manager/dependency pins, metadata, source maps, changelog, release
      process, provenance/SBOM/checksum guidance, and protected publishing are
      documented or implemented as repository-verifiable engineering controls.
- [ ] GPLv3 source-correspondence and the historical npm 0.1.0 license mismatch
      are recorded as release risks requiring owner/legal confirmation; this
      repository does not present that record as legal advice.

### Runtime-core evidence (partial)

- `src/platform.ts` captures root-owner-realm Web IDL methods/accessors once and
  normalizes every platform failure to a fresh `SafeDOMError`.
- `test/platform-boundary.test.ts` covers native invalid topology plus malicious
  own root/node getters and methods that throw DOM/global/function values.
- `test/lifecycle-placement.test.ts` proves placement revocation physically
  clears URL/style/listener effects before accounting is reusable, and that
  denied or malformed URL setter calls consume operation and cumulative-request
  attempt budgets.

This runtime-core evidence is intentionally partial and does not by itself
complete the form-isolation, primitive/numeric, public-type, or SES criteria
above.

### SES completion evidence (partial)

- `src/context.ts` requires and behaviorally validates a host-supplied
  `Hardener`, then uses one completion seam to harden before canonical wrapper
  registration or public return. No runtime SES import or dependency is added.
- `test/completion-boundary.test.ts` covers missing/accessor/non-function,
  no-op, shallow, identity-changing, throwing, replacement-returning, and
  stateful hardeners, including rollback of a failed root claim.
- `test/ses.node.mjs` runs after SES 2.2.0 lockdown with two compartments and
  independent roots; it checks authority absence, immutable live capabilities,
  cross-owner isolation, post-disposal typed errors, and pass-style 1.8.1 for
  primitive-only error and URL records.
- `test/browser/ses.spec.mjs` runs the browser bundle after real lockdown in the
  existing Chromium, Firefox, and WebKit Playwright projects.

This evidence remains partial and deliberately leaves the final issue
checkboxes unchanged until the excluded primitive/form/type work and final
integration traceability pass are complete.

## Acceptance evidence

The final integration pass will replace this section with exact test files,
commands, CI job names, and commit/PR links for all thirteen acceptance criteria
from issue #1.
