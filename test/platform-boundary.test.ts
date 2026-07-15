// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { isSafeDOMError } from "../src/index.ts";
import { createContainedRoot as makeRoot } from "./support/contained-root.ts";
import { createTestSafeDocument as createSafeDocument } from "./support/create-safe-document.ts";

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

    expect(isSafeDOMError(thrown)).toBe(true);
    if (!isSafeDOMError(thrown)) return;
    expect(thrown).toMatchObject({
      name: "SafeDOMError",
      code: "DOM_OPERATION_FAILED",
      operation: "ShadowRoot.removeChild",
    });
    expect(Object.hasOwn(thrown, "stack")).toBe(false);
    expect(Object.hasOwn(thrown, "cause")).toBe(false);
  });

  it("keeps owner-realm entropy and typed-array operations captured after construction", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const foreignDocument = iframe.contentDocument;
    const foreignWindow = iframe.contentWindow;
    if (foreignDocument === null || foreignWindow === null) throw new Error("expected iframe realm");
    const root = makeRoot(foreignDocument);
    const safeDocument = createSafeDocument(root);
    const cryptoPrototype = Object.getPrototypeOf(foreignWindow.crypto);
    const randomDescriptor = Object.getOwnPropertyDescriptor(cryptoPrototype, "getRandomValues");
    if (randomDescriptor === undefined) throw new Error("expected getRandomValues descriptor");
    const uintDescriptor = Object.getOwnPropertyDescriptor(foreignWindow, "Uint8Array");
    const typedArrayPrototype = Object.getPrototypeOf(foreignWindow.Uint8Array.prototype);
    const iteratorDescriptor = Object.getOwnPropertyDescriptor(
      typedArrayPrototype,
      Symbol.iterator,
    );
    if (iteratorDescriptor === undefined) throw new Error("expected typed-array iterator descriptor");

    Object.defineProperty(cryptoPrototype, "getRandomValues", {
      ...randomDescriptor,
      value: () => { throw foreignDocument.body; },
    });
    Object.defineProperty(foreignWindow, "Uint8Array", {
      configurable: true,
      value: () => { throw foreignWindow; },
    });
    Object.defineProperty(typedArrayPrototype, Symbol.iterator, {
      ...iteratorDescriptor,
      value: () => { throw foreignDocument.documentElement; },
    });

    try {
      const input = safeDocument.createInput();
      input.setId("logical-id");
      input.setName("logical-name");
      safeDocument.appendChild(input);
      const raw = root.querySelector("input");
      expect(raw?.id).toMatch(/^aoa-i-[0-9a-f]{48}$/);
      expect(raw?.name).toMatch(/^aoa-n-[0-9a-f]{48}$/);
      expect(input.getId()).toBe("logical-id");
    } finally {
      Object.defineProperty(cryptoPrototype, "getRandomValues", randomDescriptor);
      Object.defineProperty(typedArrayPrototype, Symbol.iterator, iteratorDescriptor);
      if (uintDescriptor === undefined) delete (foreignWindow as { Uint8Array?: unknown }).Uint8Array;
      else Object.defineProperty(foreignWindow, "Uint8Array", uintDescriptor);
    }
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

  it("uses captured owner-realm CSSOM and the native ShadowRoot host accessor", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const foreignDocument = iframe.contentDocument;
    if (foreignDocument === null) throw new Error("expected an iframe document");
    const root = makeRoot(foreignDocument);
    Object.defineProperty(root, "host", {
      configurable: true,
      get: () => { throw document.body; },
    });
    const ambientDescriptor = Object.getOwnPropertyDescriptor(window, "getComputedStyle");
    Object.defineProperty(window, "getComputedStyle", {
      configurable: true,
      get: () => { throw document.documentElement; },
    });

    try {
      expect(() => createSafeDocument(root)).not.toThrow();
    } finally {
      if (ambientDescriptor === undefined) delete (window as { getComputedStyle?: unknown }).getComputedStyle;
      else Object.defineProperty(window, "getComputedStyle", ambientDescriptor);
    }
  });

  it("normalizes a hostile owner-realm computed-style failure and leaves the root unclaimed", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const foreignDocument = iframe.contentDocument;
    const foreignWindow = iframe.contentWindow;
    if (foreignDocument === null || foreignWindow === null) throw new Error("expected iframe realm");
    const root = makeRoot(foreignDocument);
    const descriptor = Object.getOwnPropertyDescriptor(foreignWindow, "getComputedStyle");
    Object.defineProperty(foreignWindow, "getComputedStyle", {
      configurable: true,
      value: () => { throw foreignDocument.body; },
    });

    try {
      expect(() => createSafeDocument(root)).toThrowError(expect.objectContaining({
        code: "DOM_OPERATION_FAILED",
        operation: "Window.getComputedStyle",
      }));
    } finally {
      if (descriptor === undefined) delete (foreignWindow as { getComputedStyle?: unknown }).getComputedStyle;
      else Object.defineProperty(foreignWindow, "getComputedStyle", descriptor);
    }

    expect(() => createSafeDocument(root)).not.toThrow();
  });

  it("normalizes a hostile owner-realm computed-style getter during capture", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const foreignDocument = iframe.contentDocument;
    const foreignWindow = iframe.contentWindow;
    if (foreignDocument === null || foreignWindow === null) throw new Error("expected iframe realm");
    const root = makeRoot(foreignDocument);
    const descriptor = Object.getOwnPropertyDescriptor(foreignWindow, "getComputedStyle");
    Object.defineProperty(foreignWindow, "getComputedStyle", {
      configurable: true,
      get: () => { throw foreignDocument.documentElement; },
    });

    try {
      expect(() => createSafeDocument(root)).toThrowError(expect.objectContaining({
        code: "DOM_OPERATION_FAILED",
        operation: "PlatformOps.capture",
      }));
    } finally {
      if (descriptor === undefined) delete (foreignWindow as { getComputedStyle?: unknown }).getComputedStyle;
      else Object.defineProperty(foreignWindow, "getComputedStyle", descriptor);
    }

    expect(() => createSafeDocument(root)).not.toThrow();
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
    root.host.style.display = "block";
    const computedStyle = root.host.style;
    const getComputedStyleDescriptor = Object.getOwnPropertyDescriptor(
      foreignWindow,
      "getComputedStyle",
    );
    Object.defineProperty(foreignWindow, "getComputedStyle", {
      configurable: true,
      value: () => computedStyle,
    });
    let reads = 0;
    Object.defineProperty(foreignDocument, "defaultView", {
      configurable: true,
      get: () => {
        reads += 1;
        if (reads > 1) throw document.body;
        return foreignWindow;
      },
    });

    try {
      const safeDocument = createSafeDocument(root);
      const wrapper = safeDocument.createDiv();
      expect(() => safeDocument.appendChild(wrapper)).not.toThrow();
      expect(reads).toBe(1);
      expect(() => safeDocument.dispose()).not.toThrow();
    } finally {
      if (getComputedStyleDescriptor) {
        Object.defineProperty(foreignWindow, "getComputedStyle", getComputedStyleDescriptor);
      } else {
        delete (foreignWindow as Partial<Window>).getComputedStyle;
      }
    }
  });

  it("uses the iframe owner realm for representative reflected IDL families", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const foreignDocument = iframe.contentDocument;
    const foreignWindow = iframe.contentWindow;
    if (foreignDocument === null || foreignWindow === null) {
      throw new Error("expected an iframe document and window");
    }
    const root = makeRoot(foreignDocument);
    const safeDocument = createSafeDocument(root);
    const textarea = safeDocument.createTextarea();
    const video = safeDocument.createVideo();
    const canvas = safeDocument.createCanvas();
    const cell = safeDocument.createTd();
    const progress = safeDocument.createProgress();
    const meter = safeDocument.createMeter();
    for (const wrapper of [textarea, video, canvas, cell, progress, meter]) {
      safeDocument.appendChild(wrapper);
    }

    textarea.setMaxLength(10);
    textarea.setMinLength(2);
    textarea.setRows(3);
    textarea.setCols(4);
    video.setWidth(640);
    video.setHeight(360);
    video.setControls(true);
    video.setMuted(true);
    canvas.setWidth(100);
    canvas.setHeight(100);
    cell.setColspan(2);
    cell.setRowspan(0);
    progress.setMax(2);
    progress.setValue(1);
    meter.setMin(-1);
    meter.setMax(2);
    meter.setValue(1);

    const rawTextarea = root.querySelector("textarea");
    const rawVideo = root.querySelector("video");
    const rawCanvas = root.querySelector("canvas");
    const rawCell = root.querySelector("td");
    const rawProgress = root.querySelector("progress");
    const rawMeter = root.querySelector("meter");
    expect(rawTextarea).toBeInstanceOf(foreignWindow.HTMLTextAreaElement);
    expect(rawVideo).toBeInstanceOf(foreignWindow.HTMLVideoElement);
    expect(rawCanvas).toBeInstanceOf(foreignWindow.HTMLCanvasElement);
    expect(rawCell).toBeInstanceOf(foreignWindow.HTMLTableCellElement);
    expect(rawProgress).toBeInstanceOf(foreignWindow.HTMLProgressElement);
    expect(rawMeter).toBeInstanceOf(foreignWindow.HTMLMeterElement);
    expect({ minLength: rawTextarea?.minLength, maxLength: rawTextarea?.maxLength, rows: rawTextarea?.rows, cols: rawTextarea?.cols }).toEqual({ minLength: 2, maxLength: 10, rows: 3, cols: 4 });
    expect({ width: rawVideo?.width, height: rawVideo?.height, controls: rawVideo?.controls, muted: rawVideo?.muted }).toEqual({ width: 640, height: 360, controls: true, muted: true });
    expect({ width: rawCanvas?.width, height: rawCanvas?.height }).toEqual({ width: 100, height: 100 });
    expect({ colSpan: rawCell?.colSpan, rowSpan: rawCell?.rowSpan }).toEqual({ colSpan: 2, rowSpan: 0 });
    expect({ value: rawProgress?.value, max: rawProgress?.max }).toEqual({ value: 1, max: 2 });
    expect({ value: rawMeter?.value, min: rawMeter?.min, max: rawMeter?.max }).toEqual({ value: 1, min: -1, max: 2 });
  });

  it("keeps captured reflected IDL accessors after ambient, instance, and prototype poisoning", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const textarea = safeDocument.createTextarea();
    const video = safeDocument.createVideo();
    const canvas = safeDocument.createCanvas();
    const cell = safeDocument.createTd();
    const progress = safeDocument.createProgress();
    const meter = safeDocument.createMeter();
    for (const wrapper of [textarea, video, canvas, cell, progress, meter]) {
      safeDocument.appendChild(wrapper);
    }
    const rawTextarea = requireElement(root.querySelector("textarea"), "textarea");
    const rawVideo = requireElement(root.querySelector("video"), "video");
    const rawCanvas = requireElement(root.querySelector("canvas"), "canvas");
    const rawCell = requireElement(root.querySelector("td"), "cell");
    const rawProgress = requireElement(root.querySelector("progress"), "progress");
    const rawMeter = requireElement(root.querySelector("meter"), "meter");
    const entries = [
      { prototype: HTMLTextAreaElement.prototype, name: "rows", instance: rawTextarea },
      { prototype: HTMLMediaElement.prototype, name: "muted", instance: rawVideo },
      { prototype: HTMLCanvasElement.prototype, name: "width", instance: rawCanvas },
      { prototype: HTMLTableCellElement.prototype, name: "colSpan", instance: rawCell },
      { prototype: HTMLProgressElement.prototype, name: "value", instance: rawProgress },
      { prototype: HTMLMeterElement.prototype, name: "max", instance: rawMeter },
    ].map((entry) => ({ ...entry, descriptor: requireAccessor(entry.prototype, entry.name) }));
    const ambientEntries = [
      "HTMLTextAreaElement",
      "HTMLMediaElement",
      "HTMLCanvasElement",
      "HTMLTableCellElement",
      "HTMLProgressElement",
      "HTMLMeterElement",
    ].map((name) => ({ name, descriptor: requireConfigurableProperty(globalThis, name) }));

    try {
      for (const { name } of ambientEntries) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          writable: true,
          value: () => { throw document; },
        });
      }
      for (const { prototype, name, instance } of entries) {
        Object.defineProperty(prototype, name, {
          configurable: true,
          enumerable: true,
          get: () => { throw window; },
          set: () => { throw document.body; },
        });
        Object.defineProperty(instance, name, {
          configurable: true,
          get: () => { throw document; },
          set: () => { throw window; },
        });
      }

      textarea.setRows(3);
      video.setMuted(true);
      canvas.setWidth(100);
      cell.setColspan(2);
      progress.setValue(0.5);
      meter.setMax(2);

      expect(readCaptured(entries[0], rawTextarea)).toBe(3);
      expect(readCaptured(entries[1], rawVideo)).toBe(true);
      expect(readCaptured(entries[2], rawCanvas)).toBe(100);
      expect(readCaptured(entries[3], rawCell)).toBe(2);
      expect(readCaptured(entries[4], rawProgress)).toBe(0.5);
      expect(readCaptured(entries[5], rawMeter)).toBe(2);
    } finally {
      for (const { prototype, name, descriptor } of entries) {
        Object.defineProperty(prototype, name, descriptor);
      }
      for (const { name, descriptor } of ambientEntries) {
        Object.defineProperty(globalThis, name, descriptor);
      }
    }
  });

  it("rolls back reflected attributeBytes when a captured owner-realm setter throws", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const foreignDocument = iframe.contentDocument;
    const foreignWindow = iframe.contentWindow;
    if (foreignDocument === null || foreignWindow === null) {
      throw new Error("expected an iframe document and window");
    }
    const descriptor = requireAccessor(foreignWindow.HTMLTextAreaElement.prototype, "rows");
    Object.defineProperty(foreignWindow.HTMLTextAreaElement.prototype, "rows", {
      ...descriptor,
      set: () => { throw foreignDocument.body; },
    });

    try {
      const root = makeRoot(foreignDocument);
      const safeDocument = createSafeDocument(root, { quotas: { attributeBytes: 20 } });
      const textarea = safeDocument.createTextarea();
      safeDocument.appendChild(textarea);

      expectSafeError(() => textarea.setRows(3), "DOM_OPERATION_FAILED", "HTMLTextAreaElement.rows.set");
      expect(() => textarea.setClass("")).not.toThrow();
      expect(root.querySelector("textarea")?.hasAttribute("rows")).toBe(false);
      expect(root.querySelector("textarea")?.getAttribute("class")).toBe("");
    } finally {
      Object.defineProperty(foreignWindow.HTMLTextAreaElement.prototype, "rows", descriptor);
    }
  });

  it("uses iframe input IDL and RegExp semantics from the owner realm", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const foreignDocument = iframe.contentDocument;
    const foreignWindow = iframe.contentWindow;
    if (foreignDocument === null || foreignWindow === null) throw new Error("expected iframe realm");
    const root = makeRoot(foreignDocument);
    const safeDocument = createSafeDocument(root);
    const input = safeDocument.createInput();
    safeDocument.appendChild(input);

    input.setMaxLength(5);
    input.setMinLength(2);
    input.setPattern("[a--b]");
    input.setType("search");
    expectSafeError(() => input.setPattern("[a-b-c]"), "ERR_INVALID_ARGUMENT", "SafeInputElement.setPattern.value");

    const raw = root.querySelector("input");
    expect(raw).toBeInstanceOf(foreignWindow.HTMLInputElement);
    expect({ type: raw?.type, minLength: raw?.minLength, maxLength: raw?.maxLength, pattern: raw?.pattern }).toEqual({
      type: "search",
      minLength: 2,
      maxLength: 5,
      pattern: "[a--b]",
    });
  });

  it("keeps captured input IDL and RegExp after ambient, prototype, and instance poisoning", () => {
    const root = makeRoot();
    const safeDocument = createSafeDocument(root);
    const input = safeDocument.createInput();
    safeDocument.appendChild(input);
    const raw = requireElement(root.querySelector("input"), "input");
    const inputPrototype = HTMLInputElement.prototype;
    const accessors = [
      { prototype: inputPrototype, name: "type", descriptor: requireAccessor(inputPrototype, "type") },
      { prototype: inputPrototype, name: "minLength", descriptor: requireAccessor(inputPrototype, "minLength") },
      { prototype: inputPrototype, name: "maxLength", descriptor: requireAccessor(inputPrototype, "maxLength") },
    ];
    const ambient = ["HTMLInputElement", "RegExp"].map((name) => ({
      name,
      descriptor: requireConfigurableProperty(globalThis, name),
    }));

    try {
      for (const { name } of ambient) {
        Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: () => { throw document; } });
      }
      for (const { prototype, name } of accessors) {
        Object.defineProperty(prototype, name, {
          configurable: true,
          get: () => { throw window; },
          set: () => { throw document.body; },
        });
        Object.defineProperty(raw, name, {
          configurable: true,
          get: () => { throw document; },
          set: () => { throw window; },
        });
      }

      input.setMaxLength(5);
      input.setMinLength(2);
      input.setPattern("[a--b]");
      input.setType("search");

      expect(Reflect.apply(accessors[0]?.descriptor.get ?? (() => undefined), raw, [])).toBe("search");
      expect(Reflect.apply(accessors[1]?.descriptor.get ?? (() => undefined), raw, [])).toBe(2);
      expect(Reflect.apply(accessors[2]?.descriptor.get ?? (() => undefined), raw, [])).toBe(5);
      expect(raw.getAttribute("pattern")).toBe("[a--b]");
    } finally {
      for (const { prototype, name, descriptor } of accessors) Object.defineProperty(prototype, name, descriptor);
      for (const { name, descriptor } of ambient) Object.defineProperty(globalThis, name, descriptor);
    }
  });

  it("normalizes an input IDL setter throw and rolls back reflected attributeBytes", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const foreignDocument = iframe.contentDocument;
    const foreignWindow = iframe.contentWindow;
    if (foreignDocument === null || foreignWindow === null) throw new Error("expected iframe realm");
    const descriptor = requireAccessor(foreignWindow.HTMLInputElement.prototype, "minLength");
    Object.defineProperty(foreignWindow.HTMLInputElement.prototype, "minLength", {
      ...descriptor,
      set: () => { throw foreignDocument.body; },
    });

    try {
      const root = makeRoot(foreignDocument);
      const safeDocument = createSafeDocument(root, { quotas: { attributeBytes: 71 } });
      const input = safeDocument.createInput();
      safeDocument.appendChild(input);
      expectSafeError(() => input.setMinLength(2), "DOM_OPERATION_FAILED", "HTMLInputElement.minLength.set");
      expect(() => input.setId("x")).not.toThrow();
      expect(root.querySelector("input")?.hasAttribute("minlength")).toBe(false);
      expect(root.querySelector("input")?.id).toMatch(/^aoa-i-[0-9a-f]{48}$/);
      expect(input.getId()).toBe("x");
    } finally {
      Object.defineProperty(foreignWindow.HTMLInputElement.prototype, "minLength", descriptor);
    }
  });
});

function requireElement<T extends Element>(value: T | null, label: string): T {
  if (value === null) throw new Error(`expected ${label}`);
  return value;
}

function requireAccessor(prototype: object, name: string): PropertyDescriptor & Required<Pick<PropertyDescriptor, "get" | "set">> {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
  if (descriptor?.get === undefined || descriptor.set === undefined || descriptor.configurable !== true) {
    throw new Error(`expected configurable ${name} accessor`);
  }
  return descriptor as PropertyDescriptor & Required<Pick<PropertyDescriptor, "get" | "set">>;
}

function requireConfigurableProperty(object: object, name: string): PropertyDescriptor {
  const descriptor = Object.getOwnPropertyDescriptor(object, name);
  if (descriptor === undefined || descriptor.configurable !== true) {
    throw new Error(`expected configurable ${name} property`);
  }
  return descriptor;
}

function readCaptured(entry: { readonly descriptor: PropertyDescriptor & Required<Pick<PropertyDescriptor, "get">> }, instance: Element): unknown {
  return Reflect.apply(entry.descriptor.get, instance, []);
}

function expectSafeError(action: () => unknown, code: string, operation?: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }

  expect(isSafeDOMError(thrown)).toBe(true);
  if (!isSafeDOMError(thrown)) return;
  expect(thrown.code).toBe(code);
  if (operation !== undefined) expect(thrown.operation).toBe(operation);
  expect(Object.hasOwn(thrown, "stack")).toBe(false);
  expect(Object.hasOwn(thrown, "cause")).toBe(false);
}
