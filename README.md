# ark-of-atrahasis

`ark-of-atrahasis` is an ESM-only, capability-oriented DOM wrapper for
host-controlled Secure ECMAScript (SES) integrations. The repository is at the
`0.4.0` release-candidate source state: it requires a host-created `ShadowRoot`
whose host has effective CSS paint containment, plus a host-supplied SES
`harden`. It exposes fixed wrapper operations rather than raw DOM nodes, denies
URL and inline-style authority unless the host grants it, and deterministically
revokes owned wrappers and tracked effects. Repository documentation does not
assert the candidate's current publication status.

A live observation on 2026-07-15 found npm `latest` at `0.3.1`. That version has
the retired string-ID/light-DOM API and does **not** implement the strict
boundary documented here. Recheck npm and the protected release evidence before
treating `npm install ark-of-atrahasis` as this release candidate.

## Public capability boundary

The package has one ESM root export and no package subpaths. Its runtime exports
are exactly:

- the authority-bearing `createSafeDocument` factory;
- `DEFAULT_SAFE_DOCUMENT_QUOTAS` and `DEFAULT_SAFE_DOCUMENT_RATES`;
- the pure policy helpers `createURLPolicy`, `createStylePolicy`,
  `canonicalizeStyleProperty`, and their frozen ceilings `URL_SINKS` and
  `SAFE_STYLE_PROPERTIES`;
- the pure validators `requireFiniteNumber`, `requireInteger`,
  `requirePrimitiveBoolean`, `requirePrimitiveString`, and
  `scanCSSNetworkRisk`;
- the `isSafeDOMError` record guard; and
- the frozen vocabulary arrays `ARIA_IDREF_LIST_NAMES`, `ARIA_IDREF_NAMES`,
  `ARIA_ROLES`, `AUTOCOMPLETE_VALUES`, `BUTTON_TYPES`, `DIR_VALUES`,
  `ENTER_KEY_HINT_VALUES`, `FORMATTING_TAGS`, `HEADING_LEVELS`,
  `IMAGE_LOADING_VALUES`, `INPUT_MODE_VALUES`, `INPUT_TYPES`, `LIST_TYPES`,
  `SPECIALIZED_ELEMENT_KINDS`, `TABLE_SCOPE_VALUES`, and
  `TEXTAREA_WRAP_VALUES`.

Only `createSafeDocument(root, options)` grants DOM authority. The returned
`SafeDocument` has mount operations, fixed `create*` factories, logical local-ID
lookup, and `dispose()`. Its wrappers expose only their type-specific text,
attribute, inline-style, event, tree, detach, and disposal methods. There is no
public selector/document initializer, arbitrary-tag factory, raw-root/host/node
getter, raw stylesheet factory, or raw CSS rule/text API. The pure policy and
validation exports do not grant DOM authority.

The trusted host must retain the factory, raw `ShadowRoot`, outer host element,
`document`, `window`, and all raw DOM nodes. Guest code receives only the
completed `SafeDocument` or selected wrappers. From that boundary it cannot
remove, rename, style, or clear the outer host because no reference or wrapper
for the root or host is exposed; the trusted host itself retains that authority.

All public `create*` factories return detached wrappers, including
`list.createItem()` and the description-list `createTerm()`/
`createDescription()` conveniences. `createParagraph()` creates `<p>`, while
`createTextNode()` creates a text node. `setText()` replaces a container's DOM
children; wrappers for those detached descendants remain active and may be
explicitly reattached until they are disposed or revoked.

The `0.4.0` declarations retain additive transition aliases: `createText()` is
the exact same function as `createParagraph()`, `createRawText()` is the exact
same function as `createTextNode()`, and the former casing of `setReadonly()`,
`setAutofocus()`, `setColspan()`, and `setRowspan()` delegates to the preferred
`setReadOnly()`, `setAutoFocus()`, `setColSpan()`, and `setRowSpan()` functions.
The aliases are deprecated but preserve the same owner, lifecycle, validation,
and error behavior; they do not create a second authority path.

The emitted declarations enumerate the complete `SafeDocument`, specialized
wrapper, event, policy, error, vocabulary, and readonly/container-versus-void
type surface. `test/types/positive.ts` and `test/types/negative.ts` check that
surface with TypeScript 5.0.4 and 7.0.2.

## Host bootstrap

Call SES `lockdown()` before importing this package. Create one exclusively
owned `ShadowRoot`, and pass the resulting global `harden` as the required own
data property `options.harden`.

```js
import "ses";

lockdown();

const { createSafeDocument } = await import("ark-of-atrahasis");
const hostElement = document.querySelector("#plugin-a-root");
if (!(hostElement instanceof HTMLElement)) throw new Error("plugin host is missing");
hostElement.style.contain = "paint";
const root = hostElement.attachShadow({ mode: "closed" });
const safeDocument = createSafeDocument(root, {
  harden,
  rates: {
    operations: { limit: 10_000, windowMs: 1_000 },
    requestAttempts: { limit: 32, windowMs: 1_000 },
  },
  stylePolicy: { allowedProperties: ["color", "display"] },
  urlPolicy: {
    baseURL: "https://app.example/",
    sinks: {
      "image.src": {
        allowedOrigins: ["https://cdn.example"],
        allowedProtocols: ["https:"],
      },
    },
  },
});

const compartment = new Compartment({ safeDocument });
```

Initialization reads the host's computed `contain` and `display` values through
captured APIs from the `ShadowRoot` owner realm. It rejects a missing paint
containment component and display boxes on which paint containment is
ineffective: absent boxes (`none`/`contents`), non-atomic inline boxes, internal
ruby boxes, and internal table boxes other than cells. The `paint`, `content`,
and `strict` containment forms are accepted on supported block, atomic-inline,
table-cell, flex, grid, list-item, flow-root, and table boxes. The host must
establish containment before calling `createSafeDocument()` and maintain it,
together with controlled host bounds, for the lifetime of the `SafeDocument`.

Omitting `urlPolicy` denies all six URL sinks. An omitted sink is denied;
enabled sinks separately constrain canonical origin (including port), protocol,
credentials, query, fragment, and maximum length. Omitting `stylePolicy` denies
all inline-style properties. A style grant selects from the library's fixed
property ceiling; values containing URL/request grammar, indirection, malformed
CSS, or non-primitive input are rejected. Raw stylesheets and global selectors
are not part of the API.

The package has zero runtime dependencies and does not import SES. It
behaviorally checks that the supplied hardener returns the same value and deeply
freezes each completed graph, including later wrappers, nested style methods,
event records, cleanups, decisions, and errors. JavaScript cannot prove the
hardener's provenance: a test double outside tests does not satisfy the security
precondition.

The default strict profile does not create native `input`, `textarea`, or
`select` controls because each has a live value that browser Autofill or an
extension may populate and guest code could then read. Those factories fail
before native node creation with `FORM_CONTROL_POLICY_REQUIRED`. A host that
needs same-origin, non-credential form structure must explicitly acknowledge
the weaker surface with the exact own-data option
`formControlPolicy: { allowGuestReadableNonCredentialValues: true }`.

The policy and its grant are read once through own data descriptors. Accessors,
non-records, extra keys, and values other than primitive `true` fail with
`ERR_INVALID_POLICY` without claiming the root, so corrected initialization can
retry. The grant does not enable password, hidden, file, submit, or reset input
states and does not promise autofill or PII confidentiality.

## Threat model and lifecycle contract

- **Ownership and placement:** one `SafeDocument` claims one native
  `ShadowRoot`. Wrappers are canonical and owner-branded. Cross-owner/forged
  wrappers fail. Each operation audits actual owner-document placement; raw-host
  reparent, adoption, or detach-then-external insertion revokes the affected
  wrappers before a later guest mutation can touch external DOM.
- **Identifiers and forms:** logical IDs, names, IDREFs, and IDREF lists map to
  per-document opaque physical tokens. The strict default denies the three
  guest-readable native value factories (`input`, `textarea`, and `select`).
  The explicit non-credential opt-in initializes them with structural non-form
  defaults; buttons remain `type="button"`, and password, hidden, file,
  submit, and reset states remain unavailable. Address, email, telephone, or
  username-like values may still be autofilled and read by the guest despite
  `autocomplete="off"`, opaque identifiers, `form === null`, and Shadow DOM.
  The HTML autofill standard permits user-agent override of author hints and
  does not make a ShadowRoot a no-autofill boundary
  ([WHATWG HTML autofill](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill)).
  If an integration handles credentials or requires autofill/PII
  confidentiality, place the UI behind a separately trusted cross-origin
  iframe/origin or a separate process/RPC boundary, then test the deployed
  browser and credential agent directly.
- **Events and errors:** handlers receive deeply frozen primitive snapshots made
  through captured standard accessors. Malicious getters and platform failures
  collapse to primitive defaults or frozen `SafeDOMError` records without
  native/custom exceptions, stacks, causes, DOM nodes, globals, or functions.
  Cancellation functions are usable only during the synchronous callback and
  return `false` afterward. Captured listeners stop advertised bubbling events
  at the strict `ShadowRoot` seam and stop native composed, non-bubbling
  `focus`/`blur` at each owned target. Host or document bubble-delegated
  handlers, hotkeys, or action/form gadgets therefore do not run, while
  target-local `SafeElement` handlers do. This is not generic
  capture-phase isolation: capture listeners on `document`, the host, or another
  earlier ancestor have already run before the event reaches the root. Trusted
  integrations must keep capture handlers capability-safe and filter plugin
  origins there when capture observation itself matters.
  One authoritative catalog defines all 21 public handler methods, native event
  types, snapshot families, and root/target fence placement. Unit registration
  checks and post-lockdown Chromium, Firefox, and WebKit dispatch tests consume
  that catalog directly, so an advertised handler cannot silently drift from
  its runtime fence or snapshot kind.
- **SES pass style:** copied event target/touch records, URL decisions, and
  `SafeDOMError` records are pass-by-copy. A whole `SafeEvent` is deliberately a
  hardened synchronous local control record, not SES pass-by-copy and not an
  eventual-send value, because it contains time-bounded cancellation methods.
- **Detach and disposal:** `detach()` (and deprecated `remove()`) is reversible.
  Wrapper or document `dispose()` is irreversible and idempotent, closes future
  wrapper mutation, aborts wrapper-owned listeners, removes tracked URL/style
  and identifier effects, detaches owned nodes still in the mount, releases live
  accounting, and returns stable disposed/revoked errors on later operations.
  Safe ordinary attributes, text, and IDL state are not all tracked resources;
  if trusted raw DOM has already moved a node outside the mount, such inert state
  may remain after revocation/disposal. The contract is removal of wrapper-owned
  capabilities and tracked effects, not a promise to erase every ordinary DOM
  field from an externally retained raw node.
- **Layout and host authority:** required paint containment clips guest paint
  and hit testing to the bounded host even when the host grants fixed,
  viewport-sized, high-z-index styles. The event fence is deliberately
  narrower than an event sandbox and cannot undo earlier capture listeners. The
  host must still control host geometry, raw nodes, endowments, navigation,
  CSP, capture handlers, and integration lifetime.

### Lifetime quotas and window rates

Lifetime quotas are per `SafeDocument`. Supplied limits must be non-negative
safe integers. The defaults are:

| Quota | Default | Accounting |
| --- | ---: | --- |
| `nodes` | 1,000 | live wrappers |
| `listeners` | 1,000 | live wrapper-owned listeners |
| `operations` | 100,000 | calls entering the active context |
| `textBytes` | 1,000,000 | live UTF-8 guest text/value bytes |
| `attributeBytes` | 256,000 | live serialized attribute name/value bytes |
| `styleBytes` | 256,000 | live approved inline-style bytes |
| `requests` | 64 | live URL-bearing attribute slots |
| `requestAttempts` | 256 | every URL setter attempt, including denied input |
| `identifierMappings` | 4,096 | live logical ID/name records |
| `identifierReferences` | 8,192 | live logical IDREF occurrences |
| `identifierBytes` | 256,000 | live UTF-8 logical ID/name bytes |

Resource accounting is released only after terminal cleanup succeeds.
`operations` and `requestAttempts` are lifetime call ceilings and are not
released; they are not rates.

`SafeDocumentOptions.rates` independently applies fixed windows to the same two
call categories. A supplied entry must be an own data record with a
non-negative safe-integer `limit` and positive safe-integer `windowMs`; missing
entries use the deeply frozen `DEFAULT_SAFE_DOCUMENT_RATES`:

| Rate | Default | Counted calls |
| --- | ---: | --- |
| `operations` | 10,000 per 1,000 ms | calls entering the active context |
| `requestAttempts` | 32 per 1,000 ms | every URL setter attempt, including malformed and denied input |

The first counted call anchors each independent window. Exactly `limit` calls
are allowed; the next fails with a frozen `RATE_LIMIT_EXCEEDED` record until
`windowMs` has elapsed, and a call exactly at the boundary starts a new window.
Time comes from a captured `Performance.now()` capability in the supplied
`ShadowRoot` owner realm, never ambient `Date`, an ambient/guest clock, or an
option callback. Accessor/non-record/non-primitive/invalid configuration fails
with `INVALID_RATE` before the root is claimed. A throwing, non-finite,
negative, or backwards owner clock fails closed with the same stable rate error
and cannot reopen that document's rate window.

## Availability boundary

Same-agent SES code can block its JavaScript agent indefinitely. The browser
acceptance test proves that the host terminates an unyielding dedicated Worker
that continuously mutates shared memory without yielding while the page remains
responsive in Chromium, Firefox, and WebKit. It returns control to the browser
harness after `terminate()`, waits outside the inspected page evaluation, and
then proves through fresh observations that shared effects stopped. The Node
`worker_threads` test separately proves termination of an unyielding
CPU/`Atomics.add` loop after observable shared-memory progress.

The browser test must not hold one long inspector evaluation open while waiting
for termination: in Chromium that harness shape delays the parent-thread forced
termination task and can falsely look like a Worker guarantee failure. This
dedicated-Worker result still does not claim arbitrary same-agent page-main-
thread preemption. Choose and test a Worker/process/RPC boundary whose
termination semantics match the hostile workload.

## Compatibility

- ESM only; CommonJS `require()` is not provided.
- Source and output target ES2022 plus standard DOM APIs.
- The checked browser matrix is the Chromium, Firefox, and WebKit builds bundled
  by Playwright 1.61.1.
- The standard three-engine projects prove strict default denial plus external
  host form/submission/named-access/label/radio isolation for the explicit
  non-credential profile. A separate `chromium-autofill` project uses the
  Chrome-for-Testing `chromium` channel and Chromium's address Autofill CDP
  domain to preserve the positive limitation: an opt-in safe email can be
  filled and read while external host state stays unchanged. Playwright exposes
  CDP sessions only for Chromium
  ([Playwright `newCDPSession`](https://playwright.dev/docs/api/class-browsercontext#browser-context-new-cdp-session)),
  and the [CDP Autofill domain](https://chromedevtools.github.io/devtools-protocol/tot/Autofill/)
  seeds address/card data, not a browser password store. This is not
  password-manager proof.
- Post-lockdown browser event tests dispatch every one of the 21 advertised
  public event types from the authoritative source catalog and cover generic,
  keyboard, mouse, pointer, touch, focus, and input snapshots, every public
  field, hostile getters, cancellation lifetime, and reentrancy in every
  engine. Chromium and Firefox use full synthetic `Touch`/`TouchEvent` records
  under touch emulation. WebKit 26.5 rejects those constructors, so its explicit
  substitute uses Playwright trusted touch injection and checks all public
  touch fields; malicious pre-dispatch touch getters are not claimed for that
  engine path.
- Real SES checks use SES 2.2.0, `@endo/pass-style` 1.8.1, and
  `@endo/eventual-send` 1.5.0.
- Packed declarations are checked with TypeScript 5.0.4 (consumer minimum) and
  7.0.2 (pinned current). Source and property-model commands run under pinned
  TypeScript 6.0.3 and 7.0.2. The build remains on TypeScript 6.0.3 because
  tsup 8.5.1 declaration generation is not compatible with the TypeScript 7
  compiler API. TypeScript is not a consumer peer dependency.
- Node can import the module for packaging/tooling checks, but DOM operations
  require a browser-like host.

## Development

The exact CI/release toolchain is Node.js 22.22.2, npm 11.18.0, and Playwright
1.61.1. First run `npm ci --ignore-scripts --no-audit --no-fund` to install the
frozen `npm-shrinkwrap.json` without dependency lifecycle scripts. Then run
`npm run check`.

On a non-FHS host, `ARK_PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH` may point to a local
wrapper that launches Playwright 1.61.1's exact bundled WebKit executable with
the required system libraries. CI and ordinary FHS hosts leave it unset.

| Command | Purpose |
| --- | --- |
| `npm run lint` | Lint TypeScript and test/release scripts |
| `npm run typecheck` | Check source and property/model commands with TypeScript 6.0.3 and 7.0.2 |
| `npm test` | Run unit/property/model tests, built ESM/API smoke, and release-contract tests |
| `npm run test:property` | Run only the fixed-seed generated security and lifecycle suites (already discovered by `test:unit`) |
| `npm run test:browser` | Run boundary, SES, and unyielding-Worker termination tests in Chromium, Firefox, and WebKit plus the dedicated Chromium address-Autofill limitation witness |
| `npm run test:ses` | Run SES 2.2.0 with two mutually distrusting compartments and pass-style checks |
| `npm run audit` | Fail on any known locked-dependency advisory |
| `npm run test:package` | Build and test a tarball from a pristine Git archive, including literal typecheck/browser execution of every executable packed README fence |
| `npm run check` | Run the complete CI gate |
| `npm run pack:verified` | Test and write the exact tarball, CycloneDX SBOM, and SHA-256 checksums |

See [RELEASING.md](./RELEASING.md) for immutable artifact handoff, protected
publishing, and source-correspondence engineering notes. The complete mapping of
issue #1's acceptance criteria is in
[docs/issue-1-traceability.md](./docs/issue-1-traceability.md).

## License and security reports

The package declares `GPL-3.0-only`; see [LICENSE](./LICENSE). This is not a
legal conclusion about the historical npm `0.1.0` metadata or the correct GPLv3
section 6 conveyance method; those remain owner/legal decisions documented in
[RELEASING.md](./RELEASING.md).

Report security concerns through the repository issue tracker without including
live secrets or exploit data that should remain private.
