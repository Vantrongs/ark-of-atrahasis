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
- `DEFAULT_SAFE_DOCUMENT_QUOTAS`;
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
hostElement.style.contain = "paint";
const root = hostElement.attachShadow({ mode: "closed" });
const safeDocument = createSafeDocument(root, {
  harden,
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

## Threat model and lifecycle contract

- **Ownership and placement:** one `SafeDocument` claims one native
  `ShadowRoot`. Wrappers are canonical and owner-branded. Cross-owner/forged
  wrappers fail. Each operation audits actual owner-document placement; raw-host
  reparent, adoption, or detach-then-external insertion revokes the affected
  wrappers before a later guest mutation can touch external DOM.
- **Identifiers and forms:** logical IDs, names, IDREFs, and IDREF lists map to
  per-document opaque physical tokens. Created form controls start with safe
  non-form defaults (`button` type, control type, autocomplete, and autofocus
  constraints); password, submit/reset, and file-like states are not guest
  vocabularies. `autocomplete="off"`, opaque names, and Shadow DOM are structural
  isolation measures, not a promise about every browser extension or password
  manager. If an integration handles credentials or requires autofill
  confidentiality, place it behind a separately trusted origin and iframe or a
  separate process/RPC boundary, then test the deployed credential agent and
  browser policy directly.
- **Events and errors:** handlers receive deeply frozen primitive snapshots made
  through captured standard accessors. Malicious getters and platform failures
  collapse to primitive defaults or frozen `SafeDOMError` records without
  native/custom exceptions, stacks, causes, DOM nodes, globals, or functions.
  Cancellation functions are usable only during the synchronous callback and
  return `false` afterward.
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
  viewport-sized, high-z-index styles. It is not an event, network, credential,
  or availability sandbox. The host must still control host geometry, raw
  nodes, endowments, navigation, CSP, and integration lifetime.

### Quotas

Quotas are per `SafeDocument`. Supplied limits must be non-negative safe
integers. The defaults are:

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

Resource accounting is released only after terminal cleanup succeeds;
`operations` and `requestAttempts` are cumulative rate ceilings and are not
released.

## Availability boundary

Same-agent SES code can block its JavaScript agent indefinitely. The browser
acceptance test proves that the host terminates one indefinitely progressing,
scheduled dedicated Worker while the page remains responsive in Chromium,
Firefox, and WebKit. The Node `worker_threads` test separately proves termination
of an unyielding CPU/`Atomics.add` loop after observable shared-memory progress.

Those are different claims. Playwright 1.61.1's bundled Chromium did not preempt
the tested unyielding loops (tight `Atomics.add`, infinite Promise microtasks, or
one-millisecond `Atomics.wait` interruption points). Therefore this project does
not claim arbitrary same-agent browser preemption. Choose and test a
Worker/process/RPC boundary whose termination semantics match the hostile
workload.

## Compatibility

- ESM only; CommonJS `require()` is not provided.
- Source and output target ES2022 plus standard DOM APIs.
- The checked browser matrix is the Chromium, Firefox, and WebKit builds bundled
  by Playwright 1.61.1.
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
1.61.1. Install the frozen `npm-shrinkwrap.json` without dependency lifecycle
scripts:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

| Command | Purpose |
| --- | --- |
| `npm run lint` | Lint TypeScript and test/release scripts |
| `npm run typecheck` | Check source and property/model commands with TypeScript 6.0.3 and 7.0.2 |
| `npm test` | Run unit/property/model tests, built ESM/API smoke, and release-contract tests |
| `npm run test:property` | Run only the fixed-seed generated security and lifecycle suites (already discovered by `test:unit`) |
| `npm run test:browser` | Run boundary, SES, and scheduled-Worker tests in Chromium, Firefox, and WebKit |
| `npm run test:ses` | Run SES 2.2.0 with two mutually distrusting compartments and pass-style checks |
| `npm run audit` | Fail on any known locked-dependency advisory |
| `npm run test:package` | Build and test a tarball from a pristine Git archive |
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
