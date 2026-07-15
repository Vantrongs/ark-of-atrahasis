# ark-of-atrahasis

`ark-of-atrahasis` is a small, ESM-only DOM wrapper intended for host-controlled
Secure ECMAScript (SES) integrations. It exposes fixed element factories and
wrapper objects instead of returning raw DOM nodes.

> **Security status of 0.3.1:** this release is a useful API prototype, not a
> defensible boundary for adversarial code. In particular, its initializer uses
> a document-global ID lookup and a light-DOM root, styles are installed in the
> document head, network URLs are not deny-by-default, and wrappers do not have
> owner-scoped revocation. Track the strict capability work in issue #1.

## Install

```sh
npm install ark-of-atrahasis
```

The package has no runtime dependencies and does not require consumers to
install TypeScript. Type declarations are shipped with the ESM build.

## Host bootstrap

Run SES `lockdown()` before importing this package. The trusted host must create
and retain a dedicated `ShadowRoot`, then pass the resulting `harden` function
as the required own data property `options.harden`. Do not endow guest code with
the factory, raw root, `document`, `window`, or any DOM node.

```js
import "ses";

lockdown();

const { createSafeDocument } = await import("ark-of-atrahasis");
const hostElement = document.querySelector("#plugin-a-root");
const root = hostElement.attachShadow({ mode: "closed" });
const safeDocument = createSafeDocument(root, { harden });

const compartment = new Compartment({ safeDocument });
```

The package has zero runtime dependencies and does not import SES. It validates
that the supplied function returns the same value and deeply freezes each
completed graph, including later calls, but JavaScript cannot prove the
function's provenance. Passing a test double outside tests does not satisfy the
security precondition. Lockdown is a prerequisite, not a DOM or availability
sandbox.

## Threat model and host responsibilities

The current wrapper helps reduce accidental DOM exposure: element names come
from fixed factories, text is written through `textContent`, and there is no
public raw-node getter. Those properties do not confine malicious code.

- **Root ownership:** allocate one dedicated mount per integration. Do not share
  its raw nodes with other owners. Version 0.3.1 cannot mount inside a
  `ShadowRoot`; a shadow-based, owner-branded profile is required before treating
  the wrapper as a capability boundary.
- **CSS:** do not expose `createStyle()` to untrusted code in 0.3.1. It writes a
  `<style>` element into the global document head, and string filtering is not a
  CSS parser. Inline style values also need a host-approved grammar.
- **Network and navigation:** URL setters currently accept absolute HTTP(S) URLs
  from any origin. Enforce CSP and host-side request/navigation controls. A
  strict deployment must inject a deny-by-default, per-sink policy and verify it
  with browser request interception.
- **Forms:** keep the mount outside host forms. Buttons, named controls,
  autocomplete, autofill, labels, and composed/bubbling events can affect host
  behavior. A shadow tree alone does not neutralize these effects.
- **Lifecycle:** retain every event cleanup function and call it during teardown.
  `remove()` detaches a node; in 0.3.1 it is not owner-wide revocation, and there
  is no document-level `dispose()`. Stop guest execution before removing the
  mount.
- **Layout and events:** Shadow DOM is a tree and style boundary, not a layout,
  event, network, or availability boundary.
- **Availability:** SES compartments on the same JavaScript agent cannot stop an
  infinite loop. Put hostile workloads behind a Worker, process, or RPC boundary
  that the host can terminate.

Do not treat CSP, Shadow DOM, URL regexes, or TypeScript types as substitutes for
runtime ownership and policy checks.

## Compatibility

- ESM only; CommonJS `require()` is not provided.
- Source and output target ES2022 plus standard DOM APIs.
- The package is intended for modern browsers. The current release does not yet
  claim a qualified cross-browser security matrix.
- Packed declarations are checked with TypeScript 5.0.4 (the documented
  consumer minimum) and 7.0.2 (the pinned current compiler); source is checked
  with the build compiler and TypeScript 7. The build uses pinned TypeScript
  6.0.3 because tsup 8's declaration bundler is not compatible with the
  TypeScript 7 compiler API. TypeScript is not a consumer peer dependency.
- Node can import the module for packaging/tooling checks, but DOM operations
  require a browser-like host.

## Development

Development and release automation use Node.js 22.22.2 and npm 11.18.0. Install
exactly `npm-shrinkwrap.json` without dependency lifecycle scripts:

```sh
npm ci --ignore-scripts
npm run check
```

Available gates:

| Command | Purpose |
| --- | --- |
| `npm run lint` | Lint TypeScript and test/release scripts |
| `npm run typecheck` | Strict source typecheck without emitting |
| `npm test` | Build from source and run runtime smoke tests |
| `npm run test:browser` | Run the browser boundary and SES bootstrap in Chromium, Firefox, and WebKit |
| `npm run test:ses` | Run real SES 2.2.0 with two compartments/roots and pass-style data checks |
| `npm run audit` | Fail on any known locked-dependency advisory |
| `npm run test:package` | Test a tarball built from a pristine Git archive |
| `npm run check` | Run the complete CI gate |
| `npm run pack:verified` | Write the tested tarball, SBOM, and checksums |

See [RELEASING.md](./RELEASING.md) for the exact-artifact release procedure and
source-correspondence engineering notes.

## License and security reports

The current package is licensed `GPL-3.0-only`; see [LICENSE](./LICENSE). Report
security concerns through the repository issue tracker without including live
secrets or exploit data that should remain private.
