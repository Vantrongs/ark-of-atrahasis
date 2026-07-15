import assert from "node:assert/strict";
import test from "node:test";
import "ses";
import { JSDOM } from "jsdom";

lockdown();

const { createSafeDocument, isSafeDOMError } = await import("../dist/index.js");
// pass-style's documented root export includes eventual-send support. Its
// public shim supplies the HandledPromise global expected by that dependency.
await import("@endo/eventual-send/shim.js");
const { passStyleOf } = await import("@endo/pass-style");

function fixture() {
  const dom = new JSDOM(
    `<!doctype html><body>
    <p id="outside">host-owned</p>
    <div id="first"></div>
    <div id="second"></div>
  </body>`,
    { url: "https://host.example.test/" },
  );
  const firstHost = dom.window.document.querySelector("#first");
  const secondHost = dom.window.document.querySelector("#second");
  return {
    dom,
    outside: dom.window.document.querySelector("#outside"),
    firstRoot: firstHost.attachShadow({ mode: "closed" }),
    secondRoot: secondHost.attachShadow({ mode: "closed" }),
  };
}

test("real SES completes capabilities for two mutually distrusting compartments", () => {
  const { dom, outside, firstRoot, secondRoot } = fixture();
  const firstDocument = createSafeDocument(firstRoot, { harden });
  const secondDocument = createSafeDocument(secondRoot, { harden });
  const firstGuest = new Compartment({ safeDocument: firstDocument });
  const secondGuest = new Compartment({ safeDocument: secondDocument });

  assert.deepEqual(
    firstGuest.evaluate("[typeof createSafeDocument, typeof root, typeof document, typeof window]"),
    ["undefined", "undefined", "undefined", "undefined"],
  );

  firstGuest.evaluate(`
    globalThis.input = safeDocument.createInput();
    input.setId("first-input");
    input.setValue("first-value");
    safeDocument.appendChild(input);
    globalThis.cleanup = input.onClick(event => {
      globalThis.snapshot = event;
      event.preventDefault();
    });
  `);
  const firstInput = firstGuest.evaluate("input");
  const cleanup = firstGuest.evaluate("cleanup");
  const firstPoisonAttempts = firstGuest.evaluate(`({
    document: Reflect.defineProperty(safeDocument, "poison", { value: true }),
    style: Reflect.defineProperty(input.style, "poison", { value: true }),
    prototype: Reflect.defineProperty(Object.getPrototypeOf(safeDocument), "poison", { value: true }),
  })`);

  assert.equal(Object.isFrozen(firstDocument), true);
  assert.equal(Object.isFrozen(firstInput), true);
  assert.equal(Object.isFrozen(firstInput.getValue), true);
  assert.equal(Object.isFrozen(firstInput.style), true);
  assert.equal(Object.isFrozen(firstInput.style.set), true);
  assert.equal(Object.isFrozen(cleanup), true);
  assert.equal(firstDocument.getElement("first-input"), firstInput);
  assert.deepEqual(firstPoisonAttempts, {
    document: false,
    style: false,
    prototype: false,
  });

  secondGuest.evaluate(`
    globalThis.div = safeDocument.createDiv();
    div.setText("second-value");
    safeDocument.appendChild(div);
  `);
  assert.equal(secondGuest.evaluate("div.getText()"), "second-value");
  assert.equal(secondGuest.evaluate("'poison' in safeDocument || 'poison' in div.style"), false);

  secondGuest.globalThis.foreign = firstInput;
  assert.equal(
    secondGuest.evaluate(`
    try {
      safeDocument.appendChild(foreign);
      "unexpected-success";
    } catch (error) {
      error.code;
    }
  `),
    "CROSS_OWNER",
  );

  const nativeInput = firstRoot.querySelector("input");
  nativeInput.dispatchEvent(new dom.window.MouseEvent("click", { cancelable: true }));
  const snapshot = firstGuest.evaluate("snapshot");
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.target), true);
  assert.equal(Object.isFrozen(snapshot.preventDefault), true);
  assert.equal(snapshot.preventDefault(), false, "event control closes after dispatch");
  assert.equal(outside.textContent, "host-owned");
  assert.equal(secondRoot.textContent, "second-value");

  firstDocument.dispose();
  const disposedError = firstGuest.evaluate(`
    try {
      input.getValue();
      undefined;
    } catch (error) {
      error;
    }
  `);
  assert.equal(isSafeDOMError(disposedError), true);
  assert.equal(disposedError.code, "DOCUMENT_DISPOSED");
  assert.equal(passStyleOf(disposedError), "copyRecord");
});

test("primitive-only errors and URL decisions are pass-by-copy data", () => {
  const { firstRoot } = fixture();
  const safeDocument = createSafeDocument(firstRoot, { harden });
  const decision = safeDocument.createImage().setSrc("https://denied.example.test/pixel.png");
  let error;
  try {
    safeDocument.createHeading(0);
  } catch (candidate) {
    error = candidate;
  }

  assert.equal(decision.allowed, false);
  assert.equal(isSafeDOMError(error), true);
  assert.equal(isSafeDOMError(decision.error), true);
  assert.equal(passStyleOf(error), "copyRecord");
  assert.equal(passStyleOf(decision), "copyRecord");
  assert.equal(passStyleOf(decision.error), "copyRecord");
  assert.equal(Object.getPrototypeOf(error), Object.prototype);
  assert.deepEqual(Reflect.ownKeys(error), ["name", "code", "operation", "message"]);
  assert.equal(Object.hasOwn(error, "stack"), false);
  assert.equal(Object.hasOwn(error, "cause"), false);

  const hostilePrototype = harden({ capability: () => "authority" });
  const spoof = harden(Object.assign(Object.create(hostilePrototype), {
    name: "SafeDOMError",
    code: "ERR_INVALID_ARGUMENT",
    operation: "spoof",
    message: "The operation received an invalid argument",
  }));
  assert.equal(isSafeDOMError(spoof), false);
  assert.throws(() => passStyleOf(spoof));
});
