import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { test } from "vitest";

import { SafeDOMError } from "../src/errors.ts";
import { createSafeDocument } from "../src/index.ts";
import { createStylePolicy, type SafeStylePolicy } from "../src/style-policy.ts";

function fixture(): { dom: JSDOM; root: ShadowRoot } {
  const dom = new JSDOM("<!doctype html><html><head><meta name=sentinel></head><body></body></html>");
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  return { dom, root: host.attachShadow({ mode: "closed" }) };
}

test("strict document exposes no raw stylesheet authority and style is default-deny", () => {
  const { dom, root } = fixture();
  const headBefore = dom.window.document.head.innerHTML;
  const safeDocument = createSafeDocument(root);
  const element = safeDocument.createDiv();

  assert.equal("createStyle" in safeDocument, false);
  assert.equal(dom.window.document.head.innerHTML, headBefore);
  assert.equal(dom.window.document.querySelector("style"), null);

  assert.deepEqual(Object.keys(element.style), ["get", "set", "remove"]);
  assert.equal(Object.isFrozen(element.style), true);
  assert.equal(Object.isFrozen(element.style.get), true);
  assert.equal(Object.isFrozen(element.style.set), true);
  assert.equal(Object.isFrozen(element.style.remove), true);
  assert.equal(element.style.set("color", "red"), false);
  assert.equal(element.style.get("color"), undefined);
  assert.equal(element.style.remove("color"), false);

  assert.equal(Reflect.set(element.style, "color", "red"), false);
  assert.equal((element.style as unknown as Record<string, unknown>).color, undefined);
});

test("generic lookup cannot turn a pre-existing style element into raw CSS authority", () => {
  const { dom, root } = fixture();
  const existing = dom.window.document.createElement("style");
  existing.id = "existing";
  existing.textContent = ".sentinel { color: green }";
  root.appendChild(existing);
  const before = existing.textContent;

  const safeDocument = createSafeDocument(root, {
    stylePolicy: { allowedProperties: ["color"] },
  });

  assert.equal(safeDocument.getElement("existing"), null);
  assert.equal(existing.textContent, before);
  assert.throws(
    () => createSafeDocument(existing as unknown as ShadowRoot),
    (error: unknown) => error instanceof SafeDOMError && error.code === "INVALID_ROOT",
  );
});

test("explicit style policy canonicalizes known aliases and coherently gets/sets/removes", () => {
  const { root } = fixture();
  const safeDocument = createSafeDocument(root, {
    stylePolicy: {
      allowedProperties: ["color", "background-color", "cursor", "clip-path"],
    },
  });
  const style = safeDocument.createDiv().style;

  assert.equal(style.set("color", "rgb(255, 0, 0)"), true);
  assert.match(style.get("color") ?? "", /red|rgb\(255, 0, 0\)/);
  assert.equal(style.set("backgroundColor", "#fff"), true);
  assert.notEqual(style.get("background-color"), "");
  assert.equal(style.get("backgroundColor"), style.get("background-color"));

  assert.equal(style.set("width", "10px"), false, "library-safe but host-denied property");
  assert.equal(style.get("width"), undefined);
  assert.equal(style.remove("width"), false);

  assert.equal(style.remove("backgroundColor"), true);
  assert.equal(style.get("background-color"), "");
});

test("style values cannot smuggle URL/network CSS through escapes, comments, or indirection", () => {
  const { root } = fixture();
  const safeDocument = createSafeDocument(root, {
    stylePolicy: { allowedProperties: ["cursor", "clip-path", "color"] },
  });
  const style = safeDocument.createDiv().style;

  assert.equal(style.set("cursor", "pointer"), true);
  for (const value of [
    "url(https://attacker.test/pixel), auto",
    String.raw`u\72l(https://attacker.test/pixel), auto`,
    "u/**/r/**/l(https://attacker.test/pixel), auto",
    String.raw`image\2d set("https://attacker.test/pixel" 1x)`,
    'image("https://attacker.test/pixel")',
    'src("https://attacker.test/pixel")',
    String.raw`v\61r(--host-request)`,
    String.raw`e\6ev(request-token)`,
    String.raw`a\74tr(data-request type(<url>))`,
    '@import "https://attacker.test/a.css"',
    "red; background-image: url(https://attacker.test/pixel)",
    "pointer/*",
    "pointer\\",
  ]) {
    assert.equal(style.set("cursor", value), false, value);
    assert.equal(style.get("cursor"), "pointer", `rejected value changed state: ${value}`);
  }
});

test("style API never coerces hostile properties/values or consults a shadowed style getter", () => {
  const { root } = fixture();
  const safeDocument = createSafeDocument(root, {
    stylePolicy: { allowedProperties: ["color"] },
  });
  const element = safeDocument.createDiv();
  safeDocument.appendChild(element);
  const realElement = root.querySelector("div");
  assert.ok(realElement);

  let ownStyleReads = 0;
  Object.defineProperty(realElement, "style", {
    configurable: true,
    get() {
      ownStyleReads += 1;
      throw realElement;
    },
  });

  let coercions = 0;
  const hostile = {
    toString() {
      coercions += 1;
      return "color";
    },
    [Symbol.toPrimitive]() {
      coercions += 1;
      return "red";
    },
  };

  assert.equal(element.style.set(hostile as unknown as string, "red"), false);
  assert.equal(element.style.set("color", hostile as unknown as string), false);
  assert.equal(element.style.set("cssText", "color: red"), false);
  assert.equal(element.style.set("constructor", "red"), false);
  assert.equal(element.style.set("--request", "url(https://attacker.test)"), false);
  assert.equal(coercions, 0);

  assert.equal(element.style.set("color", "red"), true);
  assert.equal(element.style.get("color"), "red");
  assert.equal(ownStyleReads, 0, "captured HTMLElement.style getter bypasses own shadowing");
});

test("malicious host style policy accessors collapse to a stable safe error", () => {
  const { root } = fixture();
  const policy = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(policy, "allowedProperties", {
    get() {
      throw root;
    },
  });

  assert.throws(
    () => createStylePolicy(policy as unknown as SafeStylePolicy),
    (error: unknown) =>
      error instanceof SafeDOMError &&
      error.code === "ERR_INVALID_POLICY" &&
      error.operation === "stylePolicy.allowedProperties",
  );
});

test("an invalid style policy does not consume the ShadowRoot capability", () => {
  const { root } = fixture();
  assert.throws(
    () => createSafeDocument(root, { stylePolicy: { allowedProperties: ["width", "nope"] as never } }),
    (error: unknown) => error instanceof SafeDOMError && error.code === "ERR_INVALID_POLICY",
  );
  assert.doesNotThrow(() => createSafeDocument(root));
});
