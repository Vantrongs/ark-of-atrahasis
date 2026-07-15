// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SafeURLPolicy } from "../src/index.ts";
import { createTestSafeDocument as createSafeDocument } from "./support/create-safe-document.ts";

const REQUEST_POLICY: SafeURLPolicy = {
  baseURL: "https://example.test/",
  sinks: {
    "image.src": { allowedOrigins: ["https://example.test"] },
    "anchor.href": { allowedOrigins: ["https://example.test"] },
  },
};

const STYLE_POLICY = {
  allowedProperties: ["color", "opacity"],
} as const;

function makeRoot(documentValue: Document = document): ShadowRoot {
  const host = documentValue.createElement("div");
  documentValue.body.appendChild(host);
  return host.attachShadow({ mode: "open" });
}

function expectCode(action: () => unknown, code: string): void {
  expect(action).toThrowError(expect.objectContaining({ code }));
}

function requireElement<ElementType extends Element>(value: ElementType | null): ElementType {
  if (value === null) throw new Error("expected the test DOM element to exist");
  return value;
}

describe("placement enforcement", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("revokes a raw-host reparent without mutating the external DOM", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const wrapper = safeDocument.createDiv();
    safeDocument.appendChild(wrapper);
    const raw = requireElement(root.firstElementChild);
    const outside = document.createElement("section");
    document.body.appendChild(outside);
    outside.appendChild(raw);

    expectCode(() => wrapper.setText("guest mutation"), "PLACEMENT_VIOLATION");
    expect(outside.firstElementChild).toBe(raw);
    expect(raw.textContent).toBe("");

    expectCode(() => wrapper.setTitle("again"), "NODE_REVOKED");
    expect(raw.hasAttribute("title")).toBe(false);
    expect(() => wrapper.dispose()).not.toThrow();
    expect(outside.firstElementChild).toBe(raw);
    safeDocument.dispose();
    expect(outside.firstElementChild).toBe(raw);
  });

  it("clears every physical namespace effect before releasing a raw-reparented subtree", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root, {
      quotas: {
        identifierMappings: 2,
        identifierReferences: 3,
        identifierBytes: 2,
      },
    });
    const parent = safeDocument.createDiv();
    const input = safeDocument.createInput();
    const label = safeDocument.createLabel();
    const cell = safeDocument.createTh();
    input.setId("x");
    input.setName("y");
    input.setAria("controls", "x");
    label.setFor("x");
    cell.setHeaders("x");
    parent.appendChild(input);
    parent.appendChild(label);
    parent.appendChild(cell);
    safeDocument.appendChild(parent);

    const rawParent = requireElement(root.querySelector("div"));
    const rawInput = requireElement(rawParent.querySelector("input"));
    const rawLabel = requireElement(rawParent.querySelector("label"));
    const rawCell = requireElement(rawParent.querySelector("th"));
    const outside = document.createElement("section");
    document.body.appendChild(outside);
    outside.appendChild(rawParent);

    expectCode(() => parent.getText(), "PLACEMENT_VIOLATION");
    for (const [element, names] of [
      [rawInput, ["id", "name", "aria-controls"]],
      [rawLabel, ["for"]],
      [rawCell, ["headers"]],
    ] as const) {
      for (const name of names) expect(element.hasAttribute(name)).toBe(false);
    }

    const replacementInput = safeDocument.createInput();
    const replacementLabel = safeDocument.createLabel();
    const replacementCell = safeDocument.createTh();
    replacementInput.setId("x");
    replacementInput.setName("y");
    replacementInput.setAria("controls", "x");
    replacementLabel.setFor("x");
    replacementCell.setHeaders("x");
  });

  it("retains namespace accounting after cleanup failure and releases it on retry", () => {
    const prototype = window.Element.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "removeAttribute");
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      throw new Error("expected Element.prototype.removeAttribute");
    }
    const nativeRemoveAttribute = descriptor.value;
    let failNextIdCleanup = false;
    Object.defineProperty(prototype, "removeAttribute", {
      ...descriptor,
      value(this: Element, name: string): void {
        if (failNextIdCleanup && name === "id") {
          failNextIdCleanup = false;
          throw document.body;
        }
        Reflect.apply(nativeRemoveAttribute, this, [name]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root, {
        quotas: { identifierMappings: 2, identifierBytes: 2 },
      });
      const input = safeDocument.createInput();
      input.setId("x");
      input.setName("y");
      safeDocument.appendChild(input);
      const raw = requireElement(root.querySelector("input"));
      const outside = document.createElement("section");
      document.body.appendChild(outside);
      outside.appendChild(raw);
      failNextIdCleanup = true;

      expectCode(() => input.getId(), "DOM_OPERATION_FAILED");
      expect(raw.hasAttribute("id")).toBe(true);
      expect(raw.hasAttribute("name")).toBe(false);
      const blocked = safeDocument.createDiv();
      expectCode(() => blocked.setId("z"), "QUOTA_EXCEEDED");

      expect(() => input.dispose()).not.toThrow();
      expect(raw.hasAttribute("id")).toBe(false);
      const replacement = safeDocument.createInput();
      replacement.setId("x");
      replacement.setName("y");
    } finally {
      Object.defineProperty(prototype, "removeAttribute", descriptor);
    }
  });

  it("clears nested URL, style, and listeners before releasing revoked accounting", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root, {
      quotas: { nodes: 2, listeners: 1, styleBytes: 3, requests: 1 },
      urlPolicy: REQUEST_POLICY,
      stylePolicy: STYLE_POLICY,
    });
    const parent = safeDocument.createDiv();
    const image = safeDocument.createImage();
    const handler = vi.fn();
    expect(image.style.set("color", "red")).toBe(true);
    expect(image.setSrc("https://example.test/image.png").allowed).toBe(true);
    image.onClick(handler);
    parent.appendChild(image);
    safeDocument.appendChild(parent);

    const rawParent = requireElement(root.querySelector("div"));
    const rawImage = requireElement(root.querySelector("img"));
    Object.defineProperty(rawImage, "removeAttribute", {
      configurable: true,
      value: () => { throw document.body; },
    });
    const outside = document.createElement("section");
    document.body.appendChild(outside);
    outside.appendChild(rawParent);

    expectCode(() => parent.getText(), "PLACEMENT_VIOLATION");
    expect(rawImage.hasAttribute("style")).toBe(false);
    expect(rawImage.hasAttribute("src")).toBe(false);
    rawImage.dispatchEvent(new Event("click"));
    expect(handler).not.toHaveBeenCalled();

    expect(() => parent.dispose()).not.toThrow();
    expect(() => image.dispose()).not.toThrow();
    const replacement = safeDocument.createImage();
    const secondReplacement = safeDocument.createDiv();
    expect(replacement.style.set("color", "red")).toBe(true);
    expect(replacement.setSrc("https://example.test/replacement.png").allowed).toBe(true);
    const cleanup = replacement.onClick(() => undefined);
    cleanup();
    secondReplacement.dispose();

    expect(() => safeDocument.dispose()).not.toThrow();
    expect(outside.firstElementChild).toBe(rawParent);
    expect(rawImage.hasAttribute("style")).toBe(false);
    expect(rawImage.hasAttribute("src")).toBe(false);
  });

  it("retries failed revoked descendant cleanup before releasing placement accounting", () => {
    const prototype = window.Element.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "removeAttribute");
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      throw new Error("expected Element.prototype.removeAttribute");
    }
    const nativeRemoveAttribute = descriptor.value;
    let failNextSourceCleanup = false;
    Object.defineProperty(prototype, "removeAttribute", {
      ...descriptor,
      value(this: Element, name: string): void {
        if (failNextSourceCleanup && name === "src") {
          failNextSourceCleanup = false;
          throw document.body;
        }
        Reflect.apply(nativeRemoveAttribute, this, [name]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root, {
        quotas: { nodes: 2, requests: 1 },
        urlPolicy: REQUEST_POLICY,
      });
      const parent = safeDocument.createDiv();
      const image = safeDocument.createImage();
      expect(image.setSrc("https://example.test/original.png").allowed).toBe(true);
      parent.appendChild(image);
      safeDocument.appendChild(parent);
      const rawParent = requireElement(root.querySelector("div"));
      const rawImage = requireElement(root.querySelector("img"));
      const outside = document.createElement("section");
      document.body.appendChild(outside);
      outside.appendChild(rawParent);
      failNextSourceCleanup = true;

      expectCode(() => parent.getText(), "DOM_OPERATION_FAILED");
      expect(rawImage.hasAttribute("src")).toBe(true);
      expect(() => parent.dispose()).not.toThrow();
      expect(rawImage.hasAttribute("src")).toBe(false);

      const replacementImage = safeDocument.createImage();
      const replacementParent = safeDocument.createDiv();
      expect(replacementImage.setSrc("https://example.test/replacement.png").allowed).toBe(true);
      replacementImage.dispose();
      replacementParent.dispose();
    } finally {
      Object.defineProperty(prototype, "removeAttribute", descriptor);
    }
  });

  it("treats a detached external parent as outside the owned tree", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const wrapper = safeDocument.createSpan();
    safeDocument.appendChild(wrapper);
    const raw = requireElement(root.firstElementChild);
    const detachedExternalParent = document.createElement("div");
    detachedExternalParent.appendChild(raw);

    expectCode(() => wrapper.setId("escaped"), "PLACEMENT_VIOLATION");
    expect(detachedExternalParent.firstElementChild).toBe(raw);
    expect(raw.hasAttribute("id")).toBe(false);
  });

  it("revokes a node adopted into another document", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const wrapper = safeDocument.createInput();
    wrapper.setId("adopted-id");
    wrapper.setName("adopted-name");
    safeDocument.appendChild(wrapper);
    const raw = requireElement(root.firstElementChild);
    const foreignDocument = document.implementation.createHTMLDocument("foreign");
    foreignDocument.adoptNode(raw);

    expectCode(() => wrapper.setText("cross-realm"), "PLACEMENT_VIOLATION");
    expect(raw.ownerDocument).toBe(foreignDocument);
    expect(raw.textContent).toBe("");
    expect(raw.parentNode).toBe(null);
    expect(raw.hasAttribute("id")).toBe(false);
    expect(raw.hasAttribute("name")).toBe(false);
    expect(() => wrapper.dispose()).not.toThrow();
    expect(raw.ownerDocument).toBe(foreignDocument);
    expect(raw.parentNode).toBe(null);
  });

  it("suppresses callbacks after raw placement is compromised", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const wrapper = safeDocument.createButton();
    const handler = vi.fn();
    wrapper.onClick(handler);
    safeDocument.appendChild(wrapper);
    const raw = requireElement(root.firstElementChild);
    const outside = document.createElement("div");
    outside.appendChild(raw);

    raw.dispatchEvent(new Event("click"));

    expect(handler).not.toHaveBeenCalled();
    expect(outside.firstElementChild).toBe(raw);
    expectCode(() => wrapper.getText(), "NODE_REVOKED");
  });
});

describe("detach and disposal", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("keeps detach reversible and makes node disposal irreversible and idempotent", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const wrapper = safeDocument.createDiv();
    safeDocument.appendChild(wrapper);

    wrapper.detach();
    expect(root.childNodes).toHaveLength(0);
    wrapper.setText("still alive");
    safeDocument.appendChild(wrapper);
    expect(root.textContent).toBe("still alive");

    wrapper.dispose();
    wrapper.dispose();
    expect(root.childNodes).toHaveLength(0);
    expectCode(() => wrapper.getText(), "NODE_DISPOSED");
  });

  it("recursively disposes an owned subtree", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const parent = safeDocument.createDiv();
    const child = safeDocument.createSpan();
    parent.appendChild(child);
    safeDocument.appendChild(parent);

    parent.dispose();

    expect(root.childNodes).toHaveLength(0);
    expectCode(() => parent.getText(), "NODE_DISPOSED");
    expectCode(() => child.setText("retained"), "NODE_DISPOSED");
  });

  it("disposes a document twice and gives stable post-dispose errors", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const wrapper = safeDocument.createDiv();
    safeDocument.appendChild(wrapper);

    safeDocument.dispose();
    safeDocument.dispose();
    wrapper.dispose();

    expect(root.childNodes).toHaveLength(0);
    expectCode(() => safeDocument.createSpan(), "DOCUMENT_DISPOSED");
    expectCode(() => wrapper.getText(), "DOCUMENT_DISPOSED");
    expectCode(() => wrapper.style.get("color"), "DOCUMENT_DISPOSED");
  });

  it("retries a failed captured detach before releasing disposal tracking", () => {
    const prototype = window.Node.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "removeChild");
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      throw new Error("expected Node.prototype.removeChild");
    }
    const nativeRemoveChild = descriptor.value;
    let failNext = false;
    Object.defineProperty(prototype, "removeChild", {
      ...descriptor,
      value(this: Node, child: Node): Node {
        if (failNext) {
          failNext = false;
          throw document.body;
        }
        return Reflect.apply(nativeRemoveChild, this, [child]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root);
      const wrapper = safeDocument.createDiv();
      safeDocument.appendChild(wrapper);
      failNext = true;

      expectCode(() => safeDocument.dispose(), "DOM_OPERATION_FAILED");
      expect(root.childNodes).toHaveLength(1);
      expect(() => safeDocument.dispose()).not.toThrow();
      expect(root.childNodes).toHaveLength(0);
      expectCode(() => wrapper.getText(), "DOCUMENT_DISPOSED");
    } finally {
      Object.defineProperty(prototype, "removeChild", descriptor);
    }
  });

  it("retries failed descendant cleanup before releasing recursive disposal accounting", () => {
    const prototype = window.Element.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "removeAttribute");
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      throw new Error("expected Element.prototype.removeAttribute");
    }
    const nativeRemoveAttribute = descriptor.value;
    let failNextSourceCleanup = false;
    Object.defineProperty(prototype, "removeAttribute", {
      ...descriptor,
      value(this: Element, name: string): void {
        if (failNextSourceCleanup && name === "src") {
          failNextSourceCleanup = false;
          throw document.body;
        }
        Reflect.apply(nativeRemoveAttribute, this, [name]);
      },
    });

    try {
      const root = makeRoot();
      const safeDocument = createSafeDocument(root, {
        quotas: { nodes: 2, requests: 1 },
        urlPolicy: REQUEST_POLICY,
      });
      const parent = safeDocument.createDiv();
      const image = safeDocument.createImage();
      expect(image.setSrc("https://example.test/original.png").allowed).toBe(true);
      parent.appendChild(image);
      safeDocument.appendChild(parent);
      const rawImage = requireElement(root.querySelector("img"));
      failNextSourceCleanup = true;

      expectCode(() => parent.dispose(), "DOM_OPERATION_FAILED");
      expect(rawImage.hasAttribute("src")).toBe(true);
      expect(() => parent.dispose()).not.toThrow();
      expect(rawImage.hasAttribute("src")).toBe(false);

      const replacementImage = safeDocument.createImage();
      const replacementParent = safeDocument.createDiv();
      expect(replacementImage.setSrc("https://example.test/replacement.png").allowed).toBe(true);
      replacementImage.dispose();
      replacementParent.dispose();
    } finally {
      Object.defineProperty(prototype, "removeAttribute", descriptor);
    }
  });

  it("aborts retained listeners and clears owned styles and request resources", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root, {
      urlPolicy: REQUEST_POLICY,
      stylePolicy: STYLE_POLICY,
    });
    const button = safeDocument.createButton();
    const image = safeDocument.createImage();
    const handler = vi.fn();
    const cleanup = button.onClick(handler);
    expect(button.style.set("color", "red")).toBe(true);
    image.setSrc("https://example.test/image.png");
    safeDocument.appendChild(button);
    safeDocument.appendChild(image);
    const rawButton = requireElement(root.querySelector("button"));
    const rawImage = requireElement(root.querySelector("img"));

    rawButton.dispatchEvent(new Event("click"));
    expect(handler).toHaveBeenCalledTimes(1);

    safeDocument.dispose();
    cleanup();
    cleanup();
    rawButton.dispatchEvent(new Event("click"));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(root.childNodes).toHaveLength(0);
    expect(rawButton.hasAttribute("style")).toBe(false);
    expect(rawImage.hasAttribute("src")).toBe(false);
  });

  it("allows cleanup and disposal after the operation budget is exhausted", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root, { quotas: { operations: 2 } });
    const wrapper = safeDocument.createDiv();
    wrapper.setText("last metered operation");

    expectCode(() => wrapper.getText(), "QUOTA_EXCEEDED");
    expect(() => wrapper.dispose()).not.toThrow();
    expect(() => safeDocument.dispose()).not.toThrow();
  });

  it("uses captured attribute and listener methods despite hostile own shadowing", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root, {
      quotas: { attributeBytes: 56, listeners: 1 },
    });
    const wrapper = safeDocument.createDiv();
    safeDocument.appendChild(wrapper);
    const raw = requireElement(root.firstElementChild);
    Object.defineProperties(raw, {
      setAttribute: { configurable: true, value: () => { throw document.body; } },
      addEventListener: { configurable: true, value: () => { throw () => window; } },
    });

    expect(() => wrapper.setId("abc")).not.toThrow();
    expect(raw.getAttribute("id")).toMatch(/^aoa-i-[0-9a-f]{48}$/);
    expect(wrapper.getId()).toBe("abc");
    const handler = vi.fn();
    const cleanup = wrapper.onClick(handler);
    raw.dispatchEvent(new Event("click"));
    expect(handler).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

describe("exact quota accounting", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("enforces and releases the node quota", () => {
    const safeDocument = createSafeDocument(makeRoot(), { quotas: { nodes: 1 } });
    const first = safeDocument.createDiv();

    expectCode(() => safeDocument.createSpan(), "QUOTA_EXCEEDED");
    first.dispose();
    expect(() => safeDocument.createSpan()).not.toThrow();
  });

  it("enforces and releases the listener quota with idempotent cleanup", () => {
    const safeDocument = createSafeDocument(makeRoot(), { quotas: { listeners: 1 } });
    const wrapper = safeDocument.createDiv();
    const cleanup = wrapper.onClick(() => undefined);

    expectCode(() => wrapper.onClick(() => undefined), "QUOTA_EXCEEDED");
    cleanup();
    cleanup();
    const replacement = wrapper.onClick(() => undefined);
    wrapper.dispose();
    expect(() => replacement()).not.toThrow();
  });

  it("counts UTF-8 aggregate text bytes at the exact threshold and releases them", () => {
    const safeDocument = createSafeDocument(makeRoot(), { quotas: { textBytes: 4 } });
    const first = safeDocument.createDiv();
    const second = safeDocument.createDiv();

    first.setText("éa"); // 3 UTF-8 bytes
    second.setText("b");
    expectCode(() => second.setText("bb"), "QUOTA_EXCEEDED");
    expect(second.getText()).toBe("b");

    first.dispose();
    second.setText("bbbb");
    expect(second.getText()).toBe("bbbb");
  });

  it("counts aggregate serialized attribute name and value bytes", () => {
    const denied = createSafeDocument(makeRoot(), { quotas: { attributeBytes: 55 } });
    expectCode(() => denied.createDiv().setId("abc"), "QUOTA_EXCEEDED");

    const safeDocument = createSafeDocument(makeRoot(), { quotas: { attributeBytes: 56 } });
    const first = safeDocument.createDiv();

    first.setId("abc"); // `id` + a 54-byte opaque physical token = 56 bytes.
    expectCode(() => first.setTitle(""), "QUOTA_EXCEEDED");
    first.setId("abcd"); // Same-size physical replacement is allowed at the full budget.
    expect(first.getId()).toBe("abcd");

    first.dispose();
    const replacement = safeDocument.createDiv();
    replacement.setId("abc");
    expect(replacement.getId()).toBe("abc");
  });

  it("accounts inline style bytes across wrappers and releases exact usage", () => {
    const safeDocument = createSafeDocument(makeRoot(), {
      quotas: { styleBytes: 3 },
      stylePolicy: STYLE_POLICY,
    });
    const first = safeDocument.createDiv();
    const second = safeDocument.createDiv();

    expect(first.style.set("color", "red")).toBe(true);
    expectCode(() => second.style.set("opacity", "1"), "QUOTA_EXCEEDED");
    expect(second.style.get("opacity")).toBe("");

    expect(first.style.remove("color")).toBe(true);
    expect(second.style.set("opacity", "1")).toBe(true);
    expect(second.style.get("opacity")).toBe("1");
  });

  it("counts active request sinks and releases them on node disposal", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root, {
      quotas: { requests: 1 },
      urlPolicy: REQUEST_POLICY,
    });
    const image = safeDocument.createImage();
    const anchor = safeDocument.createAnchor();
    safeDocument.appendChild(image);
    safeDocument.appendChild(anchor);
    const rawAnchor = requireElement(root.querySelector("a"));

    image.setSrc("https://example.test/image.png");
    expectCode(() => anchor.setHref("https://example.test/next"), "QUOTA_EXCEEDED");
    expect(rawAnchor.hasAttribute("href")).toBe(false);

    image.dispose();
    anchor.setHref("https://example.test/next");
    expect(rawAnchor.getAttribute("href")).toBe("https://example.test/next");
  });

  it("limits cumulative approved request attempts even when one sink is reused", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root, {
      quotas: { requests: 1, requestAttempts: 2 },
      urlPolicy: REQUEST_POLICY,
    });
    const image = safeDocument.createImage();
    safeDocument.appendChild(image);
    const rawImage = requireElement(root.querySelector("img"));

    image.setSrc("https://example.test/one.png");
    image.setSrc("https://example.test/two.png");
    expectCode(
      () => image.setSrc("https://example.test/three.png"),
      "QUOTA_EXCEEDED",
    );
    expect(rawImage.getAttribute("src")).toBe("https://example.test/two.png");

    image.dispose(); // releases the active sink, not the lifetime attempt budget
    const anchor = safeDocument.createAnchor();
    expectCode(() => anchor.setHref("https://example.test/next"), "QUOTA_EXCEEDED");
  });

  it("meters denied URL setters as public operations", () => {
    const safeDocument = createSafeDocument(makeRoot(), {
      quotas: { operations: 1 },
    });
    const image = safeDocument.createImage();

    expectCode(
      () => image.setSrc("https://denied.example/image.png"),
      "QUOTA_EXCEEDED",
    );
  });

  it("counts malformed and denied URL calls as cumulative request attempts", () => {
    const safeDocument = createSafeDocument(makeRoot(), {
      quotas: { requestAttempts: 2 },
      urlPolicy: REQUEST_POLICY,
    });
    const image = safeDocument.createImage();

    expect(image.setSrc("https://%").allowed).toBe(false);
    expect(image.setSrc("https://denied.example/image.png").allowed).toBe(false);
    expectCode(
      () => image.setSrc("https://example.test/approved.png"),
      "QUOTA_EXCEEDED",
    );
  });

  it("rejects invalid quota configuration without claiming the root", () => {
    const root = makeRoot();
    expectCode(
      () => createSafeDocument(root, { quotas: { nodes: -1 } }),
      "INVALID_QUOTA",
    );
    expect(() => createSafeDocument(root)).not.toThrow();
  });
});
