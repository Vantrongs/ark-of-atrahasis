import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

import { SafeDOMError } from "../src/errors.ts";
import { createSafeElement } from "../src/element.ts";
import { createSafeDocument } from "../src/index.ts";
import { createSafeStyle } from "../src/style.ts";
import { createStylePolicy, type SafeStylePolicy } from "../src/style-policy.ts";

function withDocument<T>(document: Document, operation: () => T): T {
  const view = document.defaultView;
  assert.ok(view);
  const replacements: Readonly<Record<string, unknown>> = {
    document,
    HTMLElement: view.HTMLElement,
    CSS: (view as unknown as { CSS?: unknown }).CSS ?? Object.freeze({
      escape: (value: string): string => value,
    }),
  };
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(replacements)) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
  }
  try {
    return operation();
  } finally {
    for (const [name, descriptor] of descriptors) {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
  }
}

test("strict document exposes no raw stylesheet authority and style is default-deny", () => {
  const dom = new JSDOM("<!doctype html><html><head><meta name=sentinel></head><body><div id=root></div></body></html>");

  withDocument(dom.window.document, () => {
    const headBefore = dom.window.document.head.innerHTML;
    const safeDocument = createSafeDocument("root");
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

    // The old Record/Proxy assignment contract is gone completely.
    assert.equal(Reflect.set(element.style, "color", "red"), false);
    assert.equal((element.style as unknown as Record<string, unknown>).color, undefined);
  });
});

test("generic lookup cannot turn a pre-existing style element into raw CSS authority", () => {
  const dom = new JSDOM(
    "<!doctype html><div id=root><style id=existing>.sentinel { color: green }</style></div>" +
      "<style id=style-root>.outside { color: blue }</style>",
  );

  withDocument(dom.window.document, () => {
    const before = dom.window.document.querySelector("#existing")?.textContent;
    const safeDocument = createSafeDocument("root", {
      stylePolicy: { allowedProperties: ["color"] },
    });

    assert.equal(safeDocument.getElement("existing"), null);
    assert.equal(dom.window.document.querySelector("#existing")?.textContent, before);
    assert.throws(
      () => createSafeDocument("style-root"),
      (error: unknown) => error instanceof SafeDOMError && error.code === "ERR_INVALID_ARGUMENT",
    );
    assert.throws(
      () => createSafeElement(dom.window.document.querySelector("#existing") as HTMLStyleElement),
      (error: unknown) => error instanceof SafeDOMError && error.code === "ERR_INVALID_ARGUMENT",
    );
  });
});

test("explicit style policy canonicalizes known aliases and coherently gets/sets/removes", () => {
  const dom = new JSDOM("<!doctype html><div id=root></div>");

  withDocument(dom.window.document, () => {
    const safeDocument = createSafeDocument("root", {
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
});

test("style values cannot smuggle URL/network CSS through escapes, comments, or indirection", () => {
  const dom = new JSDOM("<!doctype html><div></div>");
  const realElement = dom.window.document.querySelector("div") as HTMLDivElement;
  const style = createSafeStyle(realElement, createStylePolicy({
    allowedProperties: ["cursor", "clip-path", "color"],
  }));

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

test("style API never coerces hostile properties/values or invokes an own style getter", () => {
  const dom = new JSDOM("<!doctype html><div></div>");
  const realElement = dom.window.document.querySelector("div") as HTMLDivElement;
  let ownStyleReads = 0;
  Object.defineProperty(realElement, "style", {
    configurable: true,
    get() {
      ownStyleReads += 1;
      throw dom.window;
    },
  });

  const style = createSafeStyle(realElement, createStylePolicy({ allowedProperties: ["color"] }));
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

  assert.equal(style.set(hostile as unknown as string, "red"), false);
  assert.equal(style.set("color", hostile as unknown as string), false);
  assert.equal(style.set("cssText", "color: red"), false);
  assert.equal(style.set("constructor", "red"), false);
  assert.equal(style.set("--request", "url(https://attacker.test)"), false);
  assert.equal(coercions, 0);

  assert.equal(style.set("color", "red"), true);
  assert.equal(style.get("color"), "red");
  assert.equal(ownStyleReads, 0, "captured HTMLElement.style getter bypasses own shadowing");
});

test("malicious host style policy accessors collapse to a stable safe error", () => {
  const dom = new JSDOM();
  const policy = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(policy, "allowedProperties", {
    get() {
      throw dom.window.document.body;
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
