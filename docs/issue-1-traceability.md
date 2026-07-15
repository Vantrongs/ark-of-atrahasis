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

### Property and model evidence

- `fast-check` is pinned as the development-only dependency `4.9.0`; the
  shrinkwrap records the official registry artifact with integrity
  `sha512-7ms6T7SybUev/PQITciI0yLM2pOSFy5zpG8Ty7tQofcVaQUvrMXp6CBwqF6fThLCLOrfBtuHAtwq6Yu4XPCllg==`.
  The package remains at zero runtime dependencies, and the package test checks
  the development pin semantically.
- `test/support/property-config.ts` fixes the default seed at `0x0a7a4515` and
  accepts `FC_SEED`, `FC_PATH`, `FC_COMMAND_REPLAY_PATH`, and the explicit
  minimal-counterexample switch `FC_END_ON_FAILURE=1`. Normal gate runs keep
  shrinking enabled.
- `test/property/security-inputs.test.ts` runs 20 generated properties at 300
  cases each. It covers CSS token grammar and malformed input, URL dimensions
  and exact parsing, hostile non-coercion, numeric relations, UTF-8 accounting,
  and normalization of capability-bearing thrown values.
- `test/identifier-namespace.test.ts` adds generated forward/backward IDREF and
  IDREF-list order, per-document opaque tokens, duplicate/rebind behavior,
  invalid input, and hostile-object non-coercion at 300 cases per property.
- `test/property/lifecycle-model.test.ts` compares the public wrapper seam to a
  reference model after every command. The 100-run topology profile uses at
  most 40 commands; each case in the 150-run exact-quota profile selects one
  quota and a limit from 0 through 8 while holding every prerequisite quota at
  the proven topology budget, with at most 24 commands. Text, ordinary
  attributes, IDREFs, requests, identifiers, styles, and listeners all have
  reachable successful transitions and deterministic exact release/reacquisition
  witnesses. Deterministic traces cover every command family and both
  runner-path and command-replay-path reproduction. A temporary cleanup
  mutant was caught because `color: red`, the approved request, and listener
  accounting survived raw reparenting; the mutant was restored before commit.
- `test/property/tsconfig.json` is checked by both TypeScript 6.0.3 and 7.0.2,
  so `fast-check` command/model generics are not validated by transpilation
  alone.

### Browser and isolated-runtime evidence

- `test/browser/boundary.spec.mjs` runs a committed minimal CSS/URL/ID/lifecycle
  corpus in Chromium, Firefox, and WebKit. It rejects comment/escape/import CSS,
  malformed and cross-origin URLs, keeps `__proto__`, selector syntax, bidi,
  and astral logical IDs behind opaque physical tokens, and verifies request,
  style, and identifier cleanup after raw reparenting. The browser ledger sees
  exactly one explicitly approved image request and no navigation or denied
  request.
- `test/browser/server.mjs` sends COOP/COEP/CORP headers so the harness is
  cross-origin isolated. `test/browser/worker-termination.spec.mjs` proves an
  indefinitely scheduled dedicated Worker is running via distinct shared
  counter values, then proves `terminate()` makes that specific counter exactly
  stable while the page remains responsive and only one worker script is
  requested.
- The Chromium build bundled with Playwright 1.61.1 did not preempt an
  unyielding `for (;;) Atomics.add(...)` worker, an infinite Promise-microtask
  variant, or a loop with one-millisecond `Atomics.wait` interruption points;
  the shared counter continued for the full two-second post-termination
  deadline. Firefox stopped the original tight loop. The browser test therefore
  claims scheduled-worker termination, not arbitrary engine preemption.
- `test/worker-termination.node.test.mjs` provides the complementary hard
  runtime boundary: a Node `worker_threads` worker runs the exact unyielding
  shared-counter loop, the host proves progress, awaits `terminate()`, and then
  proves exact stability. Same-agent guest execution remains an availability
  non-goal; use a runtime/process boundary whose termination semantics match the
  hostile workload.

### SES completion evidence

- `src/context.ts` requires and behaviorally validates a host-supplied
  `Hardener`, then uses one completion seam to harden before canonical wrapper
  registration or public return. No runtime SES import or dependency is added.
- `test/completion-boundary.test.ts` covers missing/accessor/non-function,
  no-op, shallow, identity-changing, throwing, replacement-returning, and
  stateful hardeners, including rollback of a failed root claim.
- `test/ses.node.mjs` runs a fixed lifecycle trace after SES 2.2.0 lockdown in
  each of two compartments with independent roots: create/append, local logical
  lookup, listener/event dispatch, allowed inline style, denied request,
  detach/reattach, cross-owner rejection, and disposal. URL decisions, safe
  errors, and data-only event target snapshots are `copyRecord` under pass-style
  1.8.1.
- A whole `SafeEvent` is deliberately a hardened synchronous local control
  record, not a pass-by-copy value: its time-bounded `preventDefault` method is
  callable only during dispatch and closes afterward. Data-only nested records
  remain primitive and pass-by-copy; the test does not promise eventual-send
  transport for the whole event.
- `test/browser/ses.spec.mjs` runs a representative fixed lifecycle trace in a
  real browser Compartment after lockdown in all three Playwright projects. It
  checks hardening, logical lookup, style, denied request, detach/reattach,
  listener delivery, closed event control, disposal, and a zero-activity
  request/navigation ledger.

## Acceptance evidence

The complete gate is the single GitHub Actions job `check` in
`.github/workflows/check.yml`, using Node 22.22.2, npm 11.18.0, a frozen
`npm-shrinkwrap.json`, and Playwright 1.61.1 Chromium, Firefox, and WebKit.
`npm run check` discovers the property, generated identifier, and Node Worker
tests through `test:unit`; it does not run the property directory twice.

| Command | Concrete acceptance proof |
| --- | --- |
| `npm run test:property` | 20 pure/generated properties plus seven lifecycle-model/replay tests with fixed seed and shrinking |
| `npm run typecheck` | Source and property/model commands under TypeScript 6.0.3 and 7.0.2 |
| `npm run lint` | Biome diagnostics for source, scripts, and all test harnesses |
| `npm test` | Full Vitest unit discovery, API runtime smoke, release contract, generated namespace properties, and hard Node Worker termination |
| `npm run test:browser` | Committed corpus, browser SES trace, and scheduled Worker termination in Chromium, Firefox, and WebKit |
| `npm run test:ses` | Real lockdown and two mutually distrusting Compartment lifecycle traces with pass-style checks |
| `npm run audit` | Locked dependency advisory gate at low severity |
| `npm run test:package` | Clean Git archive, exact manifest/dependency pins, publish allowlist, packed ESM runtime, and declaration compatibility |
| `npm run check` | The same aggregate command executed by the protected CI job |

Publication and terminal CI links are added to this section only after the
draft pull request exists and its live `check` job succeeds.
