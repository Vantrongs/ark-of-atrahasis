// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { isSafeDOMError } from "../src/index.ts";
import { createTestSafeDocument as createSafeDocument } from "./support/create-safe-document.ts";

function makeRoot(documentValue: Document = document): ShadowRoot {
  const host = documentValue.createElement("div");
  documentValue.body.appendChild(host);
  return host.attachShadow({ mode: "open" });
}

describe("strict ShadowRoot capability core", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("requires a real ShadowRoot rather than resolving a global id", () => {
    const host = document.createElement("div");
    host.id = "guessable";
    document.body.appendChild(host);

    expect(() => createSafeDocument("guessable" as unknown as ShadowRoot)).toThrowError(
      expect.objectContaining({ code: "INVALID_ROOT" }),
    );
    expect(host.childNodes).toHaveLength(0);
  });

  it("uses the supplied root ownerDocument realm", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const foreignDocument = iframe.contentDocument;
    if (!foreignDocument) throw new Error("iframe document was not created");
    const root = makeRoot(foreignDocument);

    const safeDocument = createSafeDocument(root);
    const child = safeDocument.createDiv();
    safeDocument.appendChild(child);

    expect(root.firstElementChild?.ownerDocument).toBe(foreignDocument);
    expect(root.firstElementChild?.localName).toBe("div");
  });

  it("returns the canonical specialized wrapper from lookup", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const input = safeDocument.createInput();
    input.setId("canonical");
    safeDocument.appendChild(input);

    const lookedUp = safeDocument.getElement("canonical");
    expect(lookedUp).toBe(input);
    expect((lookedUp as typeof input).getValue).toBe(input.getValue);
  });

  it("rejects wrappers owned by another SafeDocument", () => {
    const first = createSafeDocument(makeRoot());
    const second = createSafeDocument(makeRoot());
    const foreignChild = first.createDiv();

    expect(() => second.appendChild(foreignChild)).toThrowError(
      expect.objectContaining({ code: "CROSS_OWNER" }),
    );
  });

  it("allows only one SafeDocument to claim a root", () => {
    const root = makeRoot();
    createSafeDocument(root);

    expect(() => createSafeDocument(root)).toThrowError(
      expect.objectContaining({ code: "ROOT_ALREADY_CLAIMED" }),
    );
  });

  it("does not expose a wrapper for the ShadowRoot or its host", () => {
    const root = makeRoot();
    const host = root.host;
    const safeDocument = createSafeDocument(root);
    const child = safeDocument.createSpan();
    safeDocument.appendChild(child);

    expect("root" in safeDocument).toBe(false);
    expect("host" in safeDocument).toBe(false);
    expect(host.hasAttributes()).toBe(false);
    expect(root.firstElementChild?.localName).toBe("span");
  });

  it("uses a stable boundary error type", () => {
    try {
      createSafeDocument(null as unknown as ShadowRoot);
      throw new Error("expected createSafeDocument to fail");
    } catch (error) {
      expect(isSafeDOMError(error)).toBe(true);
      if (isSafeDOMError(error)) expect(error.code).toBe("INVALID_ROOT");
    }
  });
});
