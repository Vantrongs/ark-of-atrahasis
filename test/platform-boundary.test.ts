// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { createSafeDocument, SafeDOMError } from "../src/index.ts";

function makeRoot(documentValue: Document = document): ShadowRoot {
  const host = documentValue.createElement("div");
  documentValue.body.appendChild(host);
  return host.attachShadow({ mode: "open" });
}

describe("owner-realm platform boundary", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("normalizes a native invalid-topology exception without retaining the platform value", () => {
    const safeDocument = createSafeDocument(makeRoot());
    const parent = safeDocument.createDiv();
    const nestedChild = safeDocument.createSpan();
    parent.appendChild(nestedChild);
    safeDocument.appendChild(parent);

    let thrown: unknown;
    try {
      safeDocument.removeChild(nestedChild);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SafeDOMError);
    if (!(thrown instanceof SafeDOMError)) return;
    expect(thrown).toMatchObject({
      name: "SafeDOMError",
      code: "DOM_OPERATION_FAILED",
      operation: "ShadowRoot.removeChild",
      stack: undefined,
    });
    expect(Object.hasOwn(thrown, "cause")).toBe(false);
  });

  it("normalizes native invalid topology from an owned element tree", () => {
    const safeDocument = createSafeDocument(makeRoot());
    const parent = safeDocument.createDiv();
    const child = safeDocument.createSpan();
    parent.appendChild(child);

    expectSafeError(() => parent.appendChild(parent), "DOM_OPERATION_FAILED");
    expectSafeError(() => child.removeChild(parent), "DOM_OPERATION_FAILED");
  });

  it("bypasses malicious own root methods that throw raw platform values", () => {
    const root = makeRoot();
    Object.defineProperties(root, {
      appendChild: { configurable: true, value: () => { throw document.body; } },
      getElementById: { configurable: true, value: () => { throw window; } },
      removeChild: { configurable: true, value: () => { throw document; } },
    });
    const safeDocument = createSafeDocument(root);
    const wrapper = safeDocument.createDiv();
    wrapper.setId("owned");

    expect(() => safeDocument.appendChild(wrapper)).not.toThrow();
    expect(safeDocument.getElement("owned")).toBe(wrapper);
    expect(() => safeDocument.removeChild(wrapper)).not.toThrow();
  });

  it("bypasses malicious own node accessors and methods across placement, tree, text, and attributes", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const parent = safeDocument.createDiv();
    safeDocument.appendChild(parent);
    const rawParent = root.querySelector("div");
    if (rawParent === null) throw new Error("expected the owned element");

    Object.defineProperties(rawParent, {
      ownerDocument: { configurable: true, get: () => { throw document.body; } },
      parentNode: { configurable: true, get: () => { throw window; } },
      textContent: {
        configurable: true,
        get: () => { throw document; },
        set: () => { throw document.body; },
      },
      appendChild: { configurable: true, value: () => { throw document.body; } },
      getAttribute: { configurable: true, value: () => { throw window; } },
      setAttribute: { configurable: true, value: () => { throw document; } },
      remove: { configurable: true, value: () => { throw document.body; } },
    });

    const child = safeDocument.createSpan();
    expect(() => parent.appendChild(child)).not.toThrow();
    expect(() => parent.setText("captured text")).not.toThrow();
    expect(parent.getText()).toBe("captured text");
    expect(() => parent.setId("captured-id")).not.toThrow();
    expect(parent.getId()).toBe("captured-id");
    expect(() => parent.detach()).not.toThrow();
  });

  it("normalizes hostile root/options/quota access without leaking thrown DOM or functions", () => {
    const hostileRoot = makeRoot();
    Object.defineProperty(hostileRoot, "ownerDocument", {
      configurable: true,
      get: () => { throw document.body; },
    });

    expectSafeError(() => createSafeDocument(hostileRoot), "INVALID_ROOT");

    const hostileOptions = Object.defineProperty({}, "quotas", {
      get: () => { throw window; },
    });
    expectSafeError(
      () => createSafeDocument(makeRoot(), hostileOptions),
      "INVALID_QUOTA",
    );

    const hostileQuotas = Object.defineProperty({}, "operations", {
      get: () => { throw () => document.body; },
    });
    expectSafeError(
      () => createSafeDocument(makeRoot(), { quotas: hostileQuotas }),
      "INVALID_QUOTA",
    );

    const hostilePolicyOptions = Object.defineProperty({}, "urlPolicy", {
      get: () => { throw document; },
    });
    expectSafeError(
      () => createSafeDocument(makeRoot(), hostilePolicyOptions),
      "ERR_INVALID_POLICY",
    );
  });

  it("captures the root realm once even when defaultView access is stateful", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const foreignDocument = iframe.contentDocument;
    const foreignWindow = iframe.contentWindow;
    if (foreignDocument === null || foreignWindow === null) {
      throw new Error("expected an iframe document and window");
    }
    const root = makeRoot(foreignDocument);
    let reads = 0;
    Object.defineProperty(foreignDocument, "defaultView", {
      configurable: true,
      get: () => {
        reads += 1;
        if (reads > 1) throw document.body;
        return foreignWindow;
      },
    });

    const safeDocument = createSafeDocument(root);
    const wrapper = safeDocument.createDiv();
    expect(() => safeDocument.appendChild(wrapper)).not.toThrow();
    expect(reads).toBe(1);
    expect(() => safeDocument.dispose()).not.toThrow();
  });
});

function expectSafeError(action: () => unknown, code: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(SafeDOMError);
  if (!(thrown instanceof SafeDOMError)) return;
  expect(thrown.code).toBe(code);
  expect(thrown.stack).toBeUndefined();
  expect(Object.hasOwn(thrown, "cause")).toBe(false);
}
