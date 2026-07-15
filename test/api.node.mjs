import assert from "node:assert/strict";
import test from "node:test";
import "ses";

// This suite exercises the built package with Node's test runner.

import { JSDOM } from "jsdom";

lockdown();

const { createSafeDocument } = await import("../dist/index.js");

const options = Object.freeze({ harden });

function createRoot() {
  const dom = new JSDOM("<!doctype html><div id=host></div>", {
    url: "https://host.example.test/",
  });
  const host = dom.window.document.getElementById("host");
  host.style.contain = "paint";
  const root = host.attachShadow({ mode: "closed" });
  return { dom, root };
}

test("fails closed without a native ShadowRoot capability", () => {
  assert.throws(
    () => createSafeDocument("host", options),
    (error) => error?.code === "INVALID_ROOT" && !Object.hasOwn(error, "stack"),
  );
});

test("mounts only into the claimed ShadowRoot and treats markup as text", () => {
  const { root } = createRoot();
  const safeDocument = createSafeDocument(root, options);
  const message = safeDocument.createDiv();

  message.setText('<img src="x" onerror="alert(1)">');
  safeDocument.appendChild(message);

  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].tagName, "DIV");
  assert.equal(root.children[0].textContent, '<img src="x" onerror="alert(1)">');
});

test("requires paint containment on the host boundary", () => {
  const dom = new JSDOM("<!doctype html><div id=host></div>");
  const host = dom.window.document.getElementById("host");
  const root = host.attachShadow({ mode: "closed" });

  assert.throws(
    () => createSafeDocument(root, options),
    (error) => error?.code === "INVALID_ROOT"
      && error?.operation === "createSafeDocument.root.containment",
  );
});

test("exports the strict text factories and detached list-local helpers", () => {
  const { root } = createRoot();
  const safeDocument = createSafeDocument(root, options);
  const paragraph = safeDocument.createParagraph();
  const text = safeDocument.createTextNode();
  const list = safeDocument.createList("unordered");
  const item = list.createItem();

  assert.equal("createText" in safeDocument, false);
  assert.equal("createRawText" in safeDocument, false);
  assert.equal(paragraph.getText(), "");
  assert.equal(text.getText(), "");
  assert.equal(root.childNodes.length, 0);
  list.appendChild(item);
  safeDocument.appendChild(list);
  assert.equal(root.querySelector("ul")?.children.length, 1);
});

test("rejects password input state at the public runtime boundary", () => {
  const { root } = createRoot();
  const safeDocument = createSafeDocument(root, options);
  const input = safeDocument.createInput();

  assert.throws(
    () => input.setType("password"),
    (error) => error?.code === "ERR_INVALID_ARGUMENT",
  );
});

test("validates heading levels at the runtime boundary", () => {
  const { root } = createRoot();
  const safeDocument = createSafeDocument(root, options);

  assert.equal(safeDocument.createHeading(2).getText(), "");
  for (const invalid of [0, 7, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    assert.throws(
      () => safeDocument.createHeading(invalid),
      (error) => error?.code === "ERR_INVALID_ARGUMENT",
    );
  }
});

test("event cleanup removes the registered native listener", () => {
  const { dom, root } = createRoot();
  const safeDocument = createSafeDocument(root, options);
  const button = safeDocument.createButton();
  safeDocument.appendChild(button);
  let calls = 0;
  const cleanup = button.onClick(() => {
    calls += 1;
  });
  const realButton = root.querySelector("button");

  realButton.dispatchEvent(new dom.window.MouseEvent("click"));
  cleanup();
  realButton.dispatchEvent(new dom.window.MouseEvent("click"));

  assert.equal(calls, 1);
});
