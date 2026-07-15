// @vitest-environment jsdom

import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { ARIA_IDREF_LIST_NAMES, ARIA_IDREF_NAMES } from "../src/index.ts";
import { createTestSafeDocument as createSafeDocument } from "./support/create-safe-document.ts";
import {
  assertStableBoundaryError,
  captureThrown,
  propertyParameters,
} from "./support/property-config.ts";

function makeRoot(): ShadowRoot {
  const host = document.createElement("div");
  host.style.contain = "paint";
  document.body.appendChild(host);
  return host.attachShadow({ mode: "open" });
}

function requireElement<ElementType extends Element>(value: ElementType | null): ElementType {
  if (value === null) throw new Error("expected the test DOM element to exist");
  return value;
}

describe("identifier namespace", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("keeps a forward label reference opaque and returns the canonical local target", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const label = safeDocument.createLabel();
    label.setFor("later");
    safeDocument.appendChild(label);

    const rawLabel = requireElement(root.querySelector("label"));
    const forwardToken = rawLabel.getAttribute("for");
    expect(forwardToken).toMatch(/^aoa-i-[0-9a-f]{48}$/);
    expect(forwardToken).not.toContain("later");

    const target = safeDocument.createInput();
    target.setId("later");
    safeDocument.appendChild(target);
    const rawTarget = requireElement(root.querySelector("input"));

    expect(rawTarget.id).toBe(forwardToken);
    expect(rawTarget.id).not.toBe("later");
    expect(root.getElementById("later")).toBeNull();
    expect(label.getFor()).toBe("later");
    expect(target.getId()).toBe("later");
    expect(safeDocument.getElement("later")).toBe(target);

    const duplicate = safeDocument.createDiv();
    expect(() => duplicate.setId("later")).toThrowError(
      expect.objectContaining({
        code: "DUPLICATE_IDENTIFIER",
        operation: "SafeElement.setId.value",
      }),
    );
    expect(duplicate.getId()).toBe("");
    expect(target.getId()).toBe("later");
    expect(rawTarget.id).toBe(forwardToken);
    expect(rawLabel.getAttribute("for")).toBe(forwardToken);

    target.dispose();
    expect(rawLabel.getAttribute("for")).toBe(forwardToken);
    const replacement = safeDocument.createInput();
    replacement.setId("later");
    safeDocument.appendChild(replacement);
    expect(requireElement(root.querySelector("input")).id).toBe(forwardToken);
    expect(safeDocument.getElement("later")).toBe(replacement);
  });

  it("maps shared logical names per document while preserving native radio grouping", () => {
    const firstRoot = makeRoot();
    const firstDocument = createSafeDocument(firstRoot);
    const first = firstDocument.createInput();
    const second = firstDocument.createInput();
    const other = firstDocument.createSelect();
    first.setType("radio");
    second.setType("radio");
    first.setName("choice");
    second.setName("choice");
    other.setName("other");
    firstDocument.appendChild(first);
    firstDocument.appendChild(second);
    firstDocument.appendChild(other);

    const radios = [...firstRoot.querySelectorAll("input")];
    const physicalName = radios[0]?.name;
    expect(physicalName).toMatch(/^aoa-n-[0-9a-f]{48}$/);
    expect(radios[1]?.name).toBe(physicalName);
    expect(firstRoot.querySelector("select")?.name).not.toBe(physicalName);
    expect(firstRoot.querySelector("select")?.getAttribute("autocomplete")).toBe("off");
    radios[0]?.click();
    radios[1]?.click();
    expect(radios.map((radio) => radio.checked)).toEqual([false, true]);

    const secondRoot = makeRoot();
    const secondDocument = createSafeDocument(secondRoot);
    const crossDocument = secondDocument.createInput();
    crossDocument.setName("choice");
    secondDocument.appendChild(crossDocument);
    expect(secondRoot.querySelector("input")?.name).not.toBe(physicalName);
  });

  it("translates headers and every ARIA IDREF sink without exposing physical tokens", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const cell = safeDocument.createTd();
    const element = safeDocument.createDiv();
    cell.setHeaders("first\tsecond\nfirst");
    safeDocument.appendChild(cell);
    safeDocument.appendChild(element);

    const rawCell = requireElement(root.querySelector("td"));
    const physicalHeaders = rawCell.getAttribute("headers")?.split(" ") ?? [];
    expect(physicalHeaders).toHaveLength(3);
    expect(physicalHeaders[0]).toMatch(/^aoa-i-[0-9a-f]{48}$/);
    expect(physicalHeaders[2]).toBe(physicalHeaders[0]);
    expect(cell.getHeaders()).toBe("first second first");

    const rawElement = requireElement(root.querySelector("div"));
    for (const key of ARIA_IDREF_NAMES) {
      expect(element.getAria(key)).toBeUndefined();
      element.setAria(key, "first");
      expect(element.getAria(key)).toBe("first");
      expect(rawElement.getAttribute(`aria-${key}`)).toBe(physicalHeaders[0]);
    }
    for (const key of ARIA_IDREF_LIST_NAMES) {
      element.setAria(key, "second  first\rsecond");
      expect(element.getAria(key)).toBe("second first second");
      const physical = rawElement.getAttribute(`aria-${key}`)?.split(" ") ?? [];
      expect(physical).toHaveLength(3);
      expect(physical[0]).toBe(physical[2]);
      expect(physical).not.toContain("first");
      expect(physical).not.toContain("second");
    }
    element.setAria("label", "literal guest value");
    expect(element.getAria("label")).toBe("literal guest value");
    expect(rawElement.getAttribute("aria-label")).toBe("literal guest value");

    const first = safeDocument.createSpan();
    const second = safeDocument.createSpan();
    first.setId("first");
    second.setId("second");
    safeDocument.appendChild(first);
    safeDocument.appendChild(second);
    expect(root.getElementById(physicalHeaders[0] ?? "")).not.toBeNull();
    expect(root.getElementById(physicalHeaders[1] ?? "")).not.toBeNull();
  });

  it("splits IDREF lists only on HTML ASCII whitespace and canonicalizes separators", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const cell = safeDocument.createTh();
    cell.setHeaders(" \tfirst\nsecond\rfirst\f ");
    safeDocument.appendChild(cell);

    expect(cell.getHeaders()).toBe("first second first");
    expect(root.querySelector("th")?.getAttribute("headers")?.split(" ")).toHaveLength(3);

    cell.setHeaders("\u00a0");
    expect(cell.getHeaders()).toBe("\u00a0");
    expect(root.querySelector("th")?.getAttribute("headers")).toMatch(/^aoa-i-[0-9a-f]{48}$/);
  });

  it("enforces exact live mapping/reference/UTF-8 budgets with net replacement and release", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root, {
      quotas: {
        identifierMappings: 1,
        identifierReferences: 2,
        identifierBytes: 1,
      },
    });
    const cell = safeDocument.createTd();
    cell.setHeaders("a a");
    safeDocument.appendChild(cell);
    const physical = requireElement(root.querySelector("td")).getAttribute("headers");

    expect(() => cell.setHeaders("bb bb")).toThrowError(expect.objectContaining({
      code: "QUOTA_EXCEEDED",
      operation: "SafeDocument quota exceeded: identifierBytes",
    }));
    expect(cell.getHeaders()).toBe("a a");
    expect(root.querySelector("td")?.getAttribute("headers")).toBe(physical);

    cell.setHeaders("b b");
    expect(cell.getHeaders()).toBe("b b");
    const target = safeDocument.createDiv();
    expect(() => target.setId("c")).toThrowError(expect.objectContaining({
      code: "QUOTA_EXCEEDED",
      operation: "SafeDocument quota exceeded: identifierMappings",
    }));

    cell.dispose();
    target.setId("c");
    expect(target.getId()).toBe("c");
  });

  it("keeps detached IDs reserved while mounted lookup remains canonical and fail closed", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const target = safeDocument.createInput();
    target.setId("stable");
    safeDocument.appendChild(target);
    const physical = requireElement(root.querySelector("input")).id;

    target.detach();
    expect(safeDocument.getElement("stable")).toBeNull();
    expect(() => safeDocument.createDiv().setId("stable")).toThrowError(
      expect.objectContaining({ code: "DUPLICATE_IDENTIFIER" }),
    );
    safeDocument.appendChild(target);
    expect(safeDocument.getElement("stable")).toBe(target);

    const foreign = document.createElement("div");
    foreign.id = physical;
    root.prepend(foreign);
    expect(safeDocument.getElement("stable")).toBeNull();
    foreign.remove();
    expect(safeDocument.getElement("stable")).toBe(target);
  });

  it("rejects more than 256 list occurrences before allocating namespace state", () => {
    const safeDocument = createSafeDocument(makeRoot(), {
      quotas: { identifierMappings: 1, identifierReferences: 256, identifierBytes: 1 },
    });
    const cell = safeDocument.createTd();
    expect(() => cell.setHeaders(Array.from({ length: 257 }, () => "a").join(" ")))
      .toThrowError(expect.objectContaining({
        code: "QUOTA_EXCEEDED",
        operation: "IdentifierNamespace.referenceTokens",
      }));
    const target = safeDocument.createDiv();
    target.setId("a");
    expect(target.getId()).toBe("a");
  });

  it("rolls back logical, physical, and quota state when the captured DOM write fails", () => {
    const root = makeRoot();
    const prototype = window.Element.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "setAttribute");
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      throw new Error("expected Element.prototype.setAttribute");
    }
    const nativeSetAttribute = descriptor.value;
    let failNextId = false;
    Object.defineProperty(prototype, "setAttribute", {
      ...descriptor,
      value(this: Element, name: string, value: string): void {
        if (failNextId && name === "id") {
          failNextId = false;
          throw document.body;
        }
        Reflect.apply(nativeSetAttribute, this, [name, value]);
      },
    });

    try {
      const safeDocument = createSafeDocument(root, {
        quotas: { identifierMappings: 1, identifierBytes: 3, attributeBytes: 56 },
      });
      const target = safeDocument.createDiv();
      target.setId("old");
      safeDocument.appendChild(target);
      const raw = requireElement(root.querySelector("div"));
      const oldPhysical = raw.id;

      failNextId = true;
      expect(() => target.setId("new")).toThrowError(expect.objectContaining({
        code: "DOM_OPERATION_FAILED",
        operation: "Element.setAttribute",
      }));
      expect(target.getId()).toBe("old");
      expect(raw.id).toBe(oldPhysical);

      target.setId("new");
      expect(target.getId()).toBe("new");
      expect(raw.id).toMatch(/^aoa-i-[0-9a-f]{48}$/);
      expect(raw.id).not.toBe(oldPhysical);
    } finally {
      Object.defineProperty(prototype, "setAttribute", descriptor);
    }
  });

  it("retains failed ID, name, and IDREF writes until terminal cleanup removes them", () => {
    const prototype = window.Element.prototype;
    const setDescriptor = Object.getOwnPropertyDescriptor(prototype, "setAttribute");
    const removeDescriptor = Object.getOwnPropertyDescriptor(prototype, "removeAttribute");
    if (
      setDescriptor === undefined
      || typeof setDescriptor.value !== "function"
      || removeDescriptor === undefined
      || typeof removeDescriptor.value !== "function"
    ) {
      throw new Error("expected Element attribute methods");
    }
    const nativeSetAttribute = setDescriptor.value;
    const nativeRemoveAttribute = removeDescriptor.value;
    const cases = [
      {
        attribute: "id",
        prepare(safeDocument: ReturnType<typeof createSafeDocument>) {
          const wrapper = safeDocument.createDiv();
          return { wrapper, mutate: () => wrapper.setId("pending") };
        },
      },
      {
        attribute: "name",
        prepare(safeDocument: ReturnType<typeof createSafeDocument>) {
          const wrapper = safeDocument.createInput();
          return { wrapper, mutate: () => wrapper.setName("pending") };
        },
      },
      {
        attribute: "for",
        prepare(safeDocument: ReturnType<typeof createSafeDocument>) {
          const wrapper = safeDocument.createLabel();
          return { wrapper, mutate: () => wrapper.setFor("pending") };
        },
      },
    ] as const;

    for (const testCase of cases) {
      const root = makeRoot();
      let failWrite = false;
      let failRestore = false;
      Object.defineProperty(prototype, "setAttribute", {
        ...setDescriptor,
        value(this: Element, name: string, value: string): void {
          Reflect.apply(nativeSetAttribute, this, [name, value]);
          if (failWrite && name === testCase.attribute) {
            failWrite = false;
            throw document.body;
          }
        },
      });
      Object.defineProperty(prototype, "removeAttribute", {
        ...removeDescriptor,
        value(this: Element, name: string): void {
          if (failRestore && name === testCase.attribute) {
            failRestore = false;
            throw window;
          }
          Reflect.apply(nativeRemoveAttribute, this, [name]);
        },
      });

      try {
        const safeDocument = createSafeDocument(
          root,
          testCase.attribute === "id" ? { quotas: { identifierMappings: 1 } } : undefined,
        );
        const prepared = testCase.prepare(safeDocument);
        const replacement = testCase.attribute === "id" ? safeDocument.createDiv() : undefined;
        safeDocument.appendChild(prepared.wrapper);
        const raw = requireElement(root.firstElementChild);
        failWrite = true;
        failRestore = true;
        expect(prepared.mutate).toThrowError(expect.objectContaining({
          code: "DOM_OPERATION_FAILED",
          operation: "IdentifierNamespace.rollback",
        }));
        expect(raw.getAttribute(testCase.attribute)).toMatch(/^aoa-[in]-[0-9a-f]{48}$/);
        if (replacement !== undefined) {
          expect(() => replacement.setId("replacement")).toThrowError(expect.objectContaining({
            code: "QUOTA_EXCEEDED",
            operation: "SafeDocument quota exceeded: identifierMappings",
          }));
        }

        prepared.wrapper.dispose();
        expect(raw.hasAttribute(testCase.attribute)).toBe(false);
        if (replacement !== undefined) {
          replacement.setId("replacement");
          expect(replacement.getId()).toBe("replacement");
        }
      } finally {
        Object.defineProperty(prototype, "setAttribute", setDescriptor);
        Object.defineProperty(prototype, "removeAttribute", removeDescriptor);
      }
    }
  });

  it("does not release pending physical attribute accounting before retry cleanup", () => {
    const root = makeRoot();
    const prototype = window.Element.prototype;
    const setDescriptor = Object.getOwnPropertyDescriptor(prototype, "setAttribute");
    const removeDescriptor = Object.getOwnPropertyDescriptor(prototype, "removeAttribute");
    if (
      setDescriptor === undefined
      || typeof setDescriptor.value !== "function"
      || removeDescriptor === undefined
      || typeof removeDescriptor.value !== "function"
    ) {
      throw new Error("expected Element attribute methods");
    }
    const nativeSetAttribute = setDescriptor.value;
    const nativeRemoveAttribute = removeDescriptor.value;
    let failWrite = false;
    let failRestore = false;
    Object.defineProperty(prototype, "setAttribute", {
      ...setDescriptor,
      value(this: Element, name: string, value: string): void {
        Reflect.apply(nativeSetAttribute, this, [name, value]);
        if (failWrite && name === "id") {
          failWrite = false;
          throw document.body;
        }
      },
    });
    Object.defineProperty(prototype, "removeAttribute", {
      ...removeDescriptor,
      value(this: Element, name: string): void {
        if (failRestore && name === "id") {
          failRestore = false;
          throw window;
        }
        Reflect.apply(nativeRemoveAttribute, this, [name]);
      },
    });

    try {
      const safeDocument = createSafeDocument(root, { quotas: { attributeBytes: 56 } });
      const target = safeDocument.createDiv();
      const replacement = safeDocument.createDiv();
      safeDocument.appendChild(target);
      failWrite = true;
      failRestore = true;
      expect(() => target.setId("pending")).toThrowError(expect.objectContaining({
        operation: "IdentifierNamespace.rollback",
      }));
      expect(() => replacement.setId("replacement")).toThrowError(expect.objectContaining({
        code: "QUOTA_EXCEEDED",
        operation: "SafeDocument quota exceeded: attributeBytes",
      }));

      target.dispose();
      replacement.setId("replacement");
      expect(replacement.getId()).toBe("replacement");
    } finally {
      Object.defineProperty(prototype, "setAttribute", setDescriptor);
      Object.defineProperty(prototype, "removeAttribute", removeDescriptor);
    }
  });

  it("retains an existing ID when removal and rollback both write before throwing", () => {
    const root = makeRoot();
    const prototype = window.Element.prototype;
    const setDescriptor = Object.getOwnPropertyDescriptor(prototype, "setAttribute");
    const removeDescriptor = Object.getOwnPropertyDescriptor(prototype, "removeAttribute");
    if (
      setDescriptor === undefined
      || typeof setDescriptor.value !== "function"
      || removeDescriptor === undefined
      || typeof removeDescriptor.value !== "function"
    ) {
      throw new Error("expected Element attribute methods");
    }
    const nativeSetAttribute = setDescriptor.value;
    const nativeRemoveAttribute = removeDescriptor.value;
    let failRemoval = false;
    let failRestore = false;
    Object.defineProperty(prototype, "setAttribute", {
      ...setDescriptor,
      value(this: Element, name: string, value: string): void {
        Reflect.apply(nativeSetAttribute, this, [name, value]);
        if (failRestore && name === "id") {
          failRestore = false;
          throw document.body;
        }
      },
    });
    Object.defineProperty(prototype, "removeAttribute", {
      ...removeDescriptor,
      value(this: Element, name: string): void {
        Reflect.apply(nativeRemoveAttribute, this, [name]);
        if (failRemoval && name === "id") {
          failRemoval = false;
          throw window;
        }
      },
    });

    try {
      const safeDocument = createSafeDocument(root, {
        quotas: { identifierMappings: 1, identifierBytes: 3 },
      });
      const target = safeDocument.createDiv();
      const replacement = safeDocument.createDiv();
      target.setId("old");
      safeDocument.appendChild(target);
      const raw = requireElement(root.firstElementChild);
      const oldPhysical = raw.id;

      failRemoval = true;
      failRestore = true;
      expect(() => target.setId("")).toThrowError(expect.objectContaining({
        code: "DOM_OPERATION_FAILED",
        operation: "IdentifierNamespace.rollback",
      }));
      expect(raw.id).toBe(oldPhysical);
      expect(() => replacement.setId("old")).toThrowError(expect.objectContaining({
        code: "DUPLICATE_IDENTIFIER",
      }));

      target.dispose();
      expect(raw.hasAttribute("id")).toBe(false);
      expect(root.firstElementChild).toBeNull();
      replacement.setId("old");
      expect(replacement.getId()).toBe("old");
    } finally {
      Object.defineProperty(prototype, "setAttribute", setDescriptor);
      Object.defineProperty(prototype, "removeAttribute", removeDescriptor);
    }
  });

  it("fails closed after eight owner-realm entropy collisions and reuses released state", () => {
    const crypto = document.defaultView?.crypto;
    if (crypto === undefined) throw new Error("expected owner-realm crypto");
    const prototype = Object.getPrototypeOf(crypto);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "getRandomValues");
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      throw new Error("expected Crypto.prototype.getRandomValues");
    }
    let calls = 0;
    Object.defineProperty(prototype, "getRandomValues", {
      ...descriptor,
      value(array: Uint8Array): Uint8Array {
        calls += 1;
        array.fill(0);
        return array;
      },
    });

    try {
      const safeDocument = createSafeDocument(makeRoot());
      const first = safeDocument.createDiv();
      const second = safeDocument.createDiv();
      first.setId("a");
      expect(() => second.setId("b")).toThrowError(expect.objectContaining({
        code: "DOM_OPERATION_FAILED",
        operation: "IdentifierNamespace.token",
      }));
      expect(calls).toBe(9);
      expect(second.getId()).toBe("");

      first.dispose();
      second.setId("b");
      expect(calls).toBe(10);
      expect(second.getId()).toBe("b");
    } finally {
      Object.defineProperty(prototype, "getRandomValues", descriptor);
    }
  });

  it("rejects ASCII whitespace in single IDREF tokens before consuming operation quota", () => {
    const safeDocument = createSafeDocument(makeRoot(), { quotas: { operations: 3 } });
    const target = safeDocument.createDiv();
    const label = safeDocument.createLabel();
    expect(() => target.setId("bad id")).toThrowError(expect.objectContaining({
      code: "ERR_INVALID_ARGUMENT",
      operation: "SafeElement.setId.value",
    }));
    expect(() => label.setFor("bad\tid")).toThrowError(expect.objectContaining({
      code: "ERR_INVALID_ARGUMENT",
      operation: "SafeLabelElement.setFor.value",
    }));
    expect(() => target.setAria("activedescendant", "bad\nid")).toThrowError(
      expect.objectContaining({
        code: "ERR_INVALID_ARGUMENT",
        operation: "SafeElement.setAria.value",
      }),
    );
    expect(() => target.setTitle("last metered operation")).not.toThrow();
  });
});

describe("generated logical identifier and IDREF contracts", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  const adversarialIdentifiers = [
    "__proto__",
    "constructor",
    "#host>[name=value]",
    "\u0000",
    "\u202eopaque",
    "astral-\u{1f680}",
    `long-${"x".repeat(1_024)}`,
  ] as const;
  const logicalIdentifier = fc.oneof(
    fc.constantFrom(...adversarialIdentifiers),
    fc.string({ unit: "binary", minLength: 1, maxLength: 96 })
      .filter((value) => !/[\t\n\f\r ]/u.test(value)),
  );

  it("keeps generated forward/backward IDREFs opaque, canonical, ordered, and rebindable", () => {
    fc.assert(fc.property(
      logicalIdentifier,
      logicalIdentifier,
      (logicalId, secondLogicalId) => {
        fc.pre(logicalId !== secondLogicalId);
        const root = makeRoot();
        const safeDocument = createSafeDocument(root);
        const label = safeDocument.createLabel();
        const cell = safeDocument.createTh();
        const described = safeDocument.createDiv();
        label.setFor(logicalId);
        cell.setHeaders(`${logicalId} ${secondLogicalId} ${logicalId}`);
        described.setAria("controls", `${secondLogicalId} ${logicalId}`);
        safeDocument.appendChild(label);
        safeDocument.appendChild(cell);
        safeDocument.appendChild(described);

        const rawLabel = requireElement(root.querySelector("label"));
        const rawCell = requireElement(root.querySelector("th"));
        const rawDescribed = requireElement(root.querySelector("div"));
        const firstToken = rawLabel.getAttribute("for");
        const headerTokens = rawCell.getAttribute("headers")?.split(" ") ?? [];
        const ariaTokens = rawDescribed.getAttribute("aria-controls")?.split(" ") ?? [];
        expect(firstToken).toMatch(/^aoa-i-[0-9a-f]{48}$/u);
        expect(headerTokens).toHaveLength(3);
        expect(headerTokens[0]).toBe(firstToken);
        expect(headerTokens[2]).toBe(firstToken);
        expect(headerTokens[1]).toMatch(/^aoa-i-[0-9a-f]{48}$/u);
        expect(ariaTokens).toEqual([headerTokens[1], firstToken]);
        for (const physical of [firstToken, ...headerTokens, ...ariaTokens]) {
          expect(physical).toMatch(/^aoa-i-[0-9a-f]{48}$/u);
          expect(physical).not.toBe(logicalId);
          expect(physical).not.toBe(secondLogicalId);
        }

        const target = safeDocument.createInput();
        const secondTarget = safeDocument.createSpan();
        target.setId(logicalId);
        secondTarget.setId(secondLogicalId);
        safeDocument.appendChild(target);
        safeDocument.appendChild(secondTarget);
        const rawTarget = requireElement(root.querySelector("input"));
        expect(rawTarget.id).toBe(firstToken);
        expect(target.getId()).toBe(logicalId);
        expect(label.getFor()).toBe(logicalId);
        expect(cell.getHeaders()).toBe(`${logicalId} ${secondLogicalId} ${logicalId}`);
        expect(described.getAria("controls")).toBe(`${secondLogicalId} ${logicalId}`);
        expect(safeDocument.getElement(logicalId)).toBe(target);

        const hostCollision = document.createElement("input");
        hostCollision.id = logicalId;
        document.body.prepend(hostCollision);
        expect(safeDocument.getElement(logicalId)).toBe(target);

        const duplicate = safeDocument.createDiv();
        const duplicateError = captureThrown(() => duplicate.setId(logicalId));
        assertStableBoundaryError(duplicateError, "DUPLICATE_IDENTIFIER");
        expect(duplicate.getId()).toBe("");
        expect(rawTarget.id).toBe(firstToken);

        target.dispose();
        const replacement = safeDocument.createInput();
        replacement.setId(logicalId);
        safeDocument.appendChild(replacement);
        const rawReplacement = [...root.querySelectorAll("input")].find((value) => value.id === firstToken);
        expect(rawReplacement?.id).toBe(firstToken);
        expect(safeDocument.getElement(logicalId)).toBe(replacement);
      },
    ), propertyParameters(300));
  });

  it("keeps empty/invalid behavior stable and never coerces identifier objects", () => {
    const invalid = fc.oneof(
      fc.constantFrom(" ", "a b", "a\tb", "a\nb", "a\rb", "a\fb"),
      fc.tuple(
        fc.string({ unit: "binary", maxLength: 24 }),
        fc.constantFrom(" ", "\t", "\n", "\r", "\f"),
        fc.string({ unit: "binary", maxLength: 24 }),
      ).map(([left, separator, right]) => `${left}${separator}${right}`),
    );
    fc.assert(fc.property(invalid, (value) => {
      const wrapper = createSafeDocument(makeRoot()).createDiv();
      wrapper.setId("active");
      const error = captureThrown(() => wrapper.setId(value));
      assertStableBoundaryError(error, "ERR_INVALID_ARGUMENT");
      expect(wrapper.getId()).toBe("active");
      wrapper.setId("");
      expect(wrapper.getId()).toBe("");

      let traps = 0;
      const hostile = new Proxy({}, {
        get() {
          traps += 1;
          throw new Error("coercion trap executed");
        },
      });
      const hostileError = captureThrown(() => Reflect.apply(wrapper.setId, wrapper, [hostile]));
      assertStableBoundaryError(hostileError, "ERR_INVALID_ARGUMENT");
      expect(traps).toBe(0);
    }), propertyParameters(300));
  });
});
