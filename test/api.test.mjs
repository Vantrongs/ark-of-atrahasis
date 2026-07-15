import assert from "node:assert/strict";
import test from "node:test";

import { createSafeDocument } from "../dist/index.js";
import { installFakeDom } from "./helpers/fake-dom.mjs";

test("fails closed when the configured root does not exist", () => {
  const { fakeDocument } = installFakeDom();
  fakeDocument.getElementById = () => null;

  assert.throws(
    () => createSafeDocument("missing-root"),
    /No HTML element with the 'missing-root' id was found/u,
  );
});

test("creates fixed elements and writes markup-shaped input as text", () => {
  const { root } = installFakeDom();
  const safeDocument = createSafeDocument("plugin-root");
  const safeRoot = safeDocument.getElement("plugin-root");
  const message = safeDocument.createDiv();

  message.setText('<img src="x" onerror="alert(1)">');
  safeRoot?.appendChild(message);

  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].tagName, "DIV");
  assert.equal(root.children[0].textContent, '<img src="x" onerror="alert(1)">');
});

test("validates heading levels at the runtime boundary", () => {
  installFakeDom();
  const safeDocument = createSafeDocument("plugin-root");

  assert.equal(safeDocument.createHeading(2).getText(), "");
  assert.throws(() => safeDocument.createHeading(0), /Heading level must be 1-6/u);
  assert.throws(() => safeDocument.createHeading(7), /Heading level must be 1-6/u);
});

test("event cleanup removes the registered native listener", () => {
  const { createdElements } = installFakeDom();
  const safeDocument = createSafeDocument("plugin-root");
  const button = safeDocument.createButton();
  let calls = 0;
  const cleanup = button.onClick(() => {
    calls += 1;
  });
  const realButton = createdElements.at(-1);

  realButton.dispatch("click");
  cleanup();
  realButton.dispatch("click");

  assert.equal(calls, 1);
});
