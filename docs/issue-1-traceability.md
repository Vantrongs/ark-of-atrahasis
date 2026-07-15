# Issue #1 implementation traceability

This document maps the live umbrella security-hardening
[issue #1](https://github.com/Vantrongs/ark-of-atrahasis/issues/1) to source,
tests, CI, and release-owner evidence. The audited integration base for this
evidence pass is `f5097879cf21c1ee53d9a354ee4bcc4180ae8974`; that is a historical
base, not a claim that the commit containing this document has the same SHA. A
criterion is marked satisfied only where a committed test or artifact check
directly exercises the claim. Repository-complete release machinery is kept
separate from external owner configuration and from an actual tag/publication.

Exact checks for a later code or documentation commit are per-commit CI
evidence. The final live SHA, check-run link, counts, and artifact digest belong
in issue/PR status after CI runs for that immutable commit; embedding them here
would make the next documentation commit stale by construction.

## Exact public boundary

`src/index.ts` exports the sole DOM-authority factory
`createSafeDocument(root: ShadowRoot, options: SafeDocumentOptions)`. The host
must supply `harden` as an own data property and must retain the factory, raw
root, outer host, ambient globals, and raw nodes. The completed `SafeDocument`
exposes only fixed mount operations, fixed element/text factories, logical
local-ID lookup, and irreversible document disposal. Type-specific wrappers
expose only declared operations and no raw node. There is no selector/document
initializer, arbitrary tag factory, root/host/raw-node wrapper or getter,
`createStyle`, raw stylesheet text, or raw CSS rule API.

The other runtime exports are frozen defaults/vocabularies, pure policy
compilers and validators, and the `isSafeDOMError` record guard; they carry no
DOM capability. `src/types.ts`, `src/vocabularies.ts`, and the emitted
declarations define the complete type surface. `test/types/positive.ts` and
`test/types/negative.ts` assert literal list overloads, specialized canonical
lookup, readonly snapshots/vocabularies, and container-versus-void restrictions
with TypeScript 5.0.4 and 7.0.2 during the package gate.

## Implementation evidence by concern

### Root, ownership, placement, and lifecycle

- `src/context.ts` validates a native `ShadowRoot` through its owner realm,
  claims it once, owns per-document policies/quotas/registry/namespace, audits
  every placement, and implements wrapper/document disposal.
- `src/registry.ts` gives each document a private owner brand, one wrapper per
  real node, stable active/disposed/revoked states, and cross-owner rejection.
- `src/platform.ts` captures root-owner-realm DOM/Web IDL methods and accessors;
  platform or attacker-thrown values are normalized before crossing the API.
- `test/capability-core.test.ts`, `test/lifecycle-placement.test.ts`,
  `test/platform-boundary.test.ts`, and
  `test/property/lifecycle-model.test.ts` cover root guessing, aliases,
  cross-owner resources, iframe/second-realm behavior, raw reparent/adopt/
  detach-to-external revocation, cleanup ordering, stable terminal behavior,
  and exact accounting release/reacquisition.

`detach()` is reversible. Disposal is irreversible and idempotent: it aborts
wrapper-owned listeners, removes tracked request/style/identifier effects,
detaches owned nodes still in the mount, releases live accounting after cleanup,
and blocks all later wrapper operations. This is not an erase-all-DOM-fields
contract. Ordinary safe attributes, text, and IDL state are not all tracked
resources; if trusted raw DOM retains a node outside the mount, such inert state
may remain after revocation/disposal. Issue #1's broader phrase “remove owned
resources” is therefore ambiguous if it intends erasure of every ordinary DOM
field; that stricter interpretation is an open scope/contract risk.

### Policy, forms, events, and errors

- `src/url-policy.ts` compiles a host-selected base and per-sink origin, port,
  protocol, credentials, query, fragment, and length decisions. Missing policy
  or sink denies. Each enabled runtime input is primitive-checked and parsed
  exactly once through the root realm's captured URL constructor.
- `src/style-policy.ts`, `src/style.ts`, and `src/validation.ts` replace raw CSS
  and the old Proxy contract with explicit default-deny `get`/`set`/`remove`
  methods over a fixed property ceiling and fail-closed request-grammar scan.
- `src/identifier-namespace.ts`, `src/attribute-contract.ts`, and
  `src/input-state-contract.ts` map guest IDs/names/IDREFs to per-document opaque
  tokens, force non-form defaults, and validate primitive/vocabulary/state
  relations before reflected IDL mutation.
- `src/event.ts` snapshots captured standard getters into frozen discriminated
  primitive records and closes cancellation cells in handler `finally` blocks.
  `src/errors.ts` exposes only frozen four-field `SafeDOMError` copy records.
- `test/url-policy.test.ts`, `test/style-membrane.test.ts`,
  `test/form-isolation.test.ts`, `test/identifier-namespace.test.ts`,
  `test/input-state-contract.test.ts`, `test/event-membrane.test.ts`,
  `test/numeric-media-contract.test.ts`, and
  `test/property/security-inputs.test.ts` directly cover those contracts,
  hostile getters/coercion, native/custom exception replacement, exact numeric
  relations, and generated malformed inputs.

A whole `SafeEvent` is deliberately a hardened synchronous local control
record, not an SES pass-by-copy value and not an eventual-send value, because it
contains dispatch-scoped cancellation methods. Its copied target/touch data
records, URL decisions, and `SafeDOMError` records are pass-by-copy. This is the
contract asserted by `test/ses.node.mjs`; no broader whole-event transport claim
is made.

### Browser, SES, and availability

- `test/browser/boundary.spec.mjs` runs a committed CSS/URL/ID/lifecycle corpus,
  request/navigation interception, opaque identifier/form isolation, raw-host
  placement cases, one explicitly approved image request, and owner-realm
  iframe behavior in Chromium, Firefox, and WebKit.
- `test/browser/ses.spec.mjs` runs a representative lifecycle after SES 2.2.0
  lockdown in a real Compartment in all three engines and proves hardening,
  lookup, style, denied URL, detach/reattach, event closure, disposal, and a
  zero-unapproved-activity ledger.
- `test/ses.node.mjs` runs two mutually distrusting compartments with independent
  roots and checks copied records with `@endo/pass-style` 1.8.1.
- `test/browser/worker-termination.spec.mjs` proves host termination of a
  specific indefinitely progressing, scheduled dedicated Worker in Chromium,
  Firefox, and WebKit while the page remains responsive.
- `test/worker-termination.node.test.mjs` separately proves that Node
  `worker_threads` terminates an unyielding CPU/`Atomics.add` loop after the host
  observes shared-memory progress.

Playwright 1.61.1's bundled Chromium did not preempt the tested unyielding tight
`Atomics.add` loop, infinite Promise-microtask loop, or loop with one-millisecond
`Atomics.wait` interruption points. The committed browser test therefore proves
scheduled-Worker termination, not arbitrary same-agent browser preemption.
Same-thread SES denial of service remains an explicit non-goal.

## Thirteen acceptance criteria

| # | Status | Direct source and test evidence | Limits / outstanding authority |
| ---: | --- | --- | --- |
| 1 | **Satisfied** | `src/index.ts` accepts only a native `ShadowRoot` and returns mount operations without root/host access; `src/context.ts` claims it once. `test/capability-core.test.ts`, `test/api.node.mjs`, and `test/ses.node.mjs` reject string IDs and show the guest has no factory/root/document/window endowment. | The trusted host still owns and can mutate the outer host; immutability is from the guest boundary. |
| 2 | **Satisfied** | `DocumentContextImplementation.#auditPlacements()` revokes before each operation and `#clearOwnedResources()` removes tracked effects. `test/lifecycle-placement.test.ts` and `test/browser/boundary.spec.mjs` cover raw reparent, adopt, and detach-to-external cases without later guest mutation of external DOM. | Ordinary inert DOM state may remain on a raw node already retained externally; see disposal ambiguity above. |
| 3 | **Satisfied for the documented boundary values** | `src/platform.ts`, `src/event.ts`, and `src/errors.ts` replace platform exceptions and event graphs with frozen primitive records. `test/platform-boundary.test.ts`, `test/event-membrane.test.ts`, `test/completion-boundary.test.ts`, and `test/ses.node.mjs` check no DOM/global/function/native exception escapes and copied nested data has the documented pass style. | A whole `SafeEvent` is a local hardened control record, deliberately not pass-by-copy/eventual-send. |
| 4 | **Satisfied** | `src/event.ts` uses captured branded accessors, primitive defaults, deep completion, independent native-event cells, and dispatch-scoped cancellation. `test/event-membrane.test.ts` covers malicious value/type/modifier getters, all event families, reentrancy, callback throws, and closed controls. | Cancellation is synchronous only by design. |
| 5 | **Satisfied for all public URL sinks** | `src/url-policy.ts` is default-deny and per-sink; element URL setters apply only an allowed canonical string. `test/browser/boundary.spec.mjs` intercepts request/navigation/form activity and observes exactly one explicitly approved image request in the grant case and none for denied sinks/actions. | The host remains responsible for policy selection and defense-in-depth CSP/navigation controls. |
| 6 | **Satisfied** | `src/identifier-namespace.ts` isolates physical names/IDs; form factories force safe defaults. `test/form-isolation.test.ts`, `test/identifier-namespace.test.ts`, and the three-engine form/namespace browser case prove host submission, named access, radio grouping, labels, IDREFs, and autocomplete state remain unchanged. | Host raw-DOM authority remains outside the wrapper contract. |
| 7 | **Satisfied under the documented disposal contract** | `src/registry.ts` enforces canonical owner identity; `src/context.ts` implements idempotent terminal states and effect cleanup. `test/capability-core.test.ts`, `test/lifecycle-placement.test.ts`, `test/property/lifecycle-model.test.ts`, and browser SES tests cover cross-owner failure, cleanup, accounting release, repeated dispose, and stable post-dispose errors. | Disposal removes wrapper-owned capabilities/tracked effects, not every ordinary attribute/text/IDL field on externally retained raw nodes. Issue wording may require owner clarification. |
| 8 | **Satisfied** | `src/context.ts` resolves the supplied root's `ownerDocument/defaultView`; `src/platform.ts` captures that realm without ambient `instanceof`. `test/platform-boundary.test.ts` and the browser iframe case poison ambient constructors/methods while owner-realm operations continue. | No claim is made for non-standard DOM implementations outside the checked contracts. |
| 9 | **Satisfied** | `src/attribute-contract.ts`, `src/input-state-contract.ts`, `src/primitives.ts`, `src/platform.ts`, and `src/errors.ts` enforce primitive, finite/integer/range/relation rules and one stable error-record policy. Numeric/input/platform/property tests cover hostile inputs, atomic failures, media IDL, and native exception replacement. | The stable rejection value is a record, not an `Error` subclass. |
| 10 | **Satisfied** | `src/types.ts` and `src/vocabularies.ts` encode readonly snapshots, literal vocabularies, specialized lookup, list overloads, and container/void shapes. `test/types/{positive,negative}.ts` and `test/element-types-runtime.test.ts` align declarations with runtime; package tests compile fixtures with TypeScript 5.0.4 and 7.0.2. | Source/property-model typecheck itself runs TypeScript 6.0.3 and 7.0.2; the minimum compiler check is on packed declarations. |
| 11 | **Satisfied with platform-specific termination scope** | `DEFAULT_SAFE_DOCUMENT_QUOTAS` fixes all eleven limits; property/lifecycle tests exercise exact 0–8 limits, release, shrinking, and replay. Browser Worker tests prove scheduled Worker termination in all three engines; Node proves an unyielding CPU/Atomics loop terminates. | No arbitrary same-agent browser preemption claim; bundled Chromium failed the tested unyielding variants. `operations` and `requestAttempts` are cumulative rather than released. |
| 12 | **Partially satisfied** | `test/browser/boundary.spec.mjs`, `test/browser/ses.spec.mjs`, and `test/browser/worker-termination.spec.mjs` pass 8 cases per engine under Playwright 1.61.1 and SES 2.2.0. | The three-engine suite is a committed representative boundary corpus, not a per-engine repetition of every Node/jsdom property, numeric, lifecycle-model, type, and packaging invariant in criteria 1–11. The broad literal wording “these invariants pass” is not fully proven for every invariant in every engine. |
| 13 | **Repository-complete; publication outstanding** | `scripts/test-package.mjs` creates a pristine Git archive, frozen-installs, builds twice byte-identically, installs the exact tarball offline, checks ESM/declarations, rebuilds packed `dist` from included source/lock, and emits the tested tarball/SBOM/checksums. `scripts/release-recovery.mjs`, `test/release.test.mjs`, and `.github/workflows/release.yml` execute first-run, interrupted upload (including an exact empty `starter`), exact-rerun, npm provenance identity, conflict, and no-duplicate-publication behavior while preserving the exact artifact handoff. | No repository evidence here claims a `0.4.0` tag/publication. npm trusted publisher, protected environment/tag policy, signed-tag trust, immutable releases, and actual publish/provenance evidence are external owner actions. |

Because criteria 12 and 13 retain the gaps above, this document does not claim
issue #1 is closed.

## Property/model and reproducibility details

- `fast-check` is pinned at `4.9.0`; `test/support/property-config.ts` fixes the
  default seed at `0x0a7a4515` and supports `FC_SEED`, `FC_PATH`,
  `FC_COMMAND_REPLAY_PATH`, and `FC_END_ON_FAILURE=1`.
- `test/property/security-inputs.test.ts` has 20 generated properties at 300
  cases each across CSS grammar, URL dimensions/normalization, hostile
  non-coercion, numeric relations, UTF-8 accounting, and thrown-value
  normalization.
- `test/property/lifecycle-model.test.ts` has seven topology/quota/replay tests:
  a 100-run topology profile up to 40 commands, a 150-run exact-quota profile
  with limits 0–8 and up to 24 commands, deterministic command-family traces,
  and runner/command replay paths.
- `scripts/test-package.mjs` requires Node 22.22.2 and the npm 11.18.0 CLI via
  `npm_execpath`, a clean committed tree, no pre-existing `dist/` in the Git
  archive, exact manifest/lock pins and registry integrity records, relative
  source maps with embedded content, two byte-identical prepack tarballs, an
  offline consumer install, minimum/current declaration checks, and a byte-for-
  byte `dist` rebuild.

## PR chain and live CI

At the 2026-07-15 evidence observation, umbrella
[PR #7](https://github.com/Vantrongs/ark-of-atrahasis/pull/7) was an open draft
from `agent/issue-1-integration` to `main`. That state is historical, and PR prose
or state is not acceptance evidence by itself.

Initial draft stacks [#2](https://github.com/Vantrongs/ark-of-atrahasis/pull/2),
[#3](https://github.com/Vantrongs/ark-of-atrahasis/pull/3),
[#4](https://github.com/Vantrongs/ark-of-atrahasis/pull/4),
[#5](https://github.com/Vantrongs/ark-of-atrahasis/pull/5), and
[#6](https://github.com/Vantrongs/ark-of-atrahasis/pull/6) were also open drafts
at that observation; their PR state is not evidence of merge. Selected work was
integrated into PR #7 and then completed by these merged PRs to
`agent/issue-1-integration`:

- [#8](https://github.com/Vantrongs/ark-of-atrahasis/pull/8) protected release
  workflow (`d640dde`);
- [#9](https://github.com/Vantrongs/ark-of-atrahasis/pull/9) real-browser
  harness (`979aa0d`);
- [#10](https://github.com/Vantrongs/ark-of-atrahasis/pull/10) owner-realm
  platform boundary (`c9937cd`);
- [#11](https://github.com/Vantrongs/ark-of-atrahasis/pull/11) SES capability
  completion (`eb55770`);
- [#12](https://github.com/Vantrongs/ark-of-atrahasis/pull/12) input/attribute
  contracts (`5eb3b77`);
- [#13](https://github.com/Vantrongs/ark-of-atrahasis/pull/13) identifier/form
  namespace (`022c308`);
- [#14](https://github.com/Vantrongs/ark-of-atrahasis/pull/14) terminal detach
  rollback fix (`9b5e9de`);
- [#15](https://github.com/Vantrongs/ark-of-atrahasis/pull/15) public type/runtime
  completion (`0361972`); and
- [#16](https://github.com/Vantrongs/ark-of-atrahasis/pull/16) property/model and
  hard Worker coverage, merged at `cc8df22`; and
- [#17](https://github.com/Vantrongs/ark-of-atrahasis/pull/17) final evidence
  documentation, merged into the audited integration base `f509787`.

A historical [check job](https://github.com/Vantrongs/ark-of-atrahasis/actions/runs/29410388350/job/87335805917)
completed successfully on 2026-07-15 for exact SHA `cc8df22`: Node 22.22.2,
npm 11.18.0, Playwright 1.61.1, 55 linted files, source/property typecheck under
TypeScript 6.0.3 and 7.0.2, 545 Vitest tests, 4 built API tests, 7 release tests,
24 browser tests (8 per engine), 2 Node SES tests, zero audit findings, and a
verified pristine `ark-of-atrahasis-0.4.0.tgz` with SHA-256
`b8930b3c17af7bbe7f0c26fb89f3a07a3b13108a5f43cb1eae6388dfae8fe078`.
Those counts and that digest describe only `cc8df22`, not later commits.

## External owner and legal status

Repository code/tests cannot configure npm trusted publishing, a protected
GitHub `npm` environment, required reviewers, branch/tag protection, a signed-
tag trust policy, immutable GitHub releases, npm account controls, or retention
policy. On the Vantrongs fork, the live GitHub API reported `main` unprotected
and no accessible `npm` environment on 2026-07-15; the canonical upstream's
private/owner settings could not be verified with the available authority.

The exact release source and build inputs are included in the package allowlist,
but an owner with qualified legal advice must still select and document the
applicable GPLv3 section 6 conveyance method. The published npm `0.1.0` manifest
and its included license reportedly disagree (MIT versus GPLv3); no code or
documentation change here retroactively relicenses it. Deprecation wording and
any legal claim remain owner/legal actions.
