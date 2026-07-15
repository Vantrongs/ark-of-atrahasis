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

Call the initializer in trusted host code. Do not give guest code the factory,
the root ID, `document`, a DOM node, or any other host selector capability.

```html
<div id="plugin-a-root"></div>
<script type="module">
  import { createSafeDocument } from "ark-of-atrahasis";

  // The ID must identify a dedicated host-created mount, not user content.
  const safeDocument = createSafeDocument("plugin-a-root");
  const mount = safeDocument.getElement("plugin-a-root");
  const message = safeDocument.createText();

  message.setText("Hello from a trusted integration");
  mount?.appendChild(message);
</script>
```

The example describes the current light-DOM API and is suitable only when the
code receiving `safeDocument` is trusted. An application handling mutually
distrusting code needs the strict profile proposed in issue #1: the host creates
and exclusively owns a `ShadowRoot` plus an inner mount, retains the raw root,
and endows only a hardened wrapper that cannot select, clear, rename, style, or
remove the outer host container.

### SES ordering

Run SES `lockdown()` before importing this package or creating/endowing any
wrapper. The `ses` package is a host application dependency, not a dependency of
this library.

```js
import "ses";

lockdown();

const { createSafeDocument } = await import("ark-of-atrahasis");
const safeDocument = createSafeDocument("plugin-a-root");

// 0.3.1 wrappers are not yet a complete hardened pass-by-copy/capability
// surface. Endow this object only to code you already trust.
const compartment = new Compartment({ safeDocument });
```

Lockdown is a prerequisite, not a DOM sandbox. Without it, a host function's
constructor and mutable intrinsics defeat attempts to construct a same-realm
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
- Declarations and the packed artifact are checked with the pinned development
  TypeScript version. TypeScript is not a consumer peer dependency.
- Node can import the module for packaging/tooling checks, but DOM operations
  require a browser-like host.

## Development

Use the package manager version recorded in `packageManager` and install exactly
the lockfile:

```sh
npm ci
npm run check
```

Available gates:

| Command | Purpose |
| --- | --- |
| `npm run lint` | Lint TypeScript and test/release scripts |
| `npm run typecheck` | Strict source typecheck without emitting |
| `npm test` | Build from source and run runtime smoke tests |
| `npm run test:package` | Test a tarball built from a pristine Git archive |
| `npm run check` | Run the complete CI gate |
| `npm run pack:verified` | Write an already-tested tarball to `.artifacts/` |

Browser, SES-compartment, policy-fuzzing, and cross-realm security suites belong
with the strict API. Adding placeholder green tests for the insecure 0.3.1
surface would give a false assurance signal.

See [RELEASING.md](./RELEASING.md) for the exact-artifact release procedure and
source-correspondence engineering notes.

## License and security reports

The current package is licensed `GPL-3.0-only`; see [LICENSE](./LICENSE). Report
security concerns through the repository issue tracker without including live
secrets or exploit data that should remain private.
