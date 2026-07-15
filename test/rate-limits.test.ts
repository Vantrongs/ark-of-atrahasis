// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { createSafeDocument as createStrictSafeDocument, isSafeDOMError } from "../src/index.ts";
import { createContainedRoot } from "./support/contained-root.ts";
import { createControlledOwnerClock } from "./support/controlled-owner-clock.ts";
import { createTestSafeDocument as createSafeDocument } from "./support/create-safe-document.ts";
import { testHarden } from "./support/harden.ts";

function expectSafeRateError(action: () => unknown, operation: string): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(isSafeDOMError(caught)).toBe(true);
  expect(caught).toEqual(expect.objectContaining({
    code: "RATE_LIMIT_EXCEEDED",
    operation,
  }));
  expect(Object.isFrozen(caught)).toBe(true);
  expect(Object.hasOwn(caught as object, "cause")).toBe(false);
  expect(Object.hasOwn(caught as object, "stack")).toBe(false);
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("fixed-window operation rates", () => {
  it("counts strict policy denials at exact N/N+1 and resets at the window boundary", () => {
    const clock = createControlledOwnerClock(0);
    try {
      const safeDocument = createStrictSafeDocument(clock.root, {
        harden: testHarden,
        quotas: { operations: 10 },
        rates: { operations: { limit: 2, windowMs: 1_000 } },
      });

      expect(() => safeDocument.createInput()).toThrowError(expect.objectContaining({
        code: "FORM_CONTROL_POLICY_REQUIRED",
      }));
      expect(() => safeDocument.createTextarea()).toThrowError(expect.objectContaining({
        code: "FORM_CONTROL_POLICY_REQUIRED",
      }));
      expectSafeRateError(
        () => safeDocument.createSelect(),
        "SafeDocument rate exceeded: operations",
      );

      clock.set(999.999);
      expectSafeRateError(
        () => safeDocument.createInput(),
        "SafeDocument rate exceeded: operations",
      );
      clock.set(1_000);
      expect(() => safeDocument.createInput()).toThrowError(expect.objectContaining({
        code: "FORM_CONTROL_POLICY_REQUIRED",
      }));
      expect(() => safeDocument.createTextarea()).toThrowError(expect.objectContaining({
        code: "FORM_CONTROL_POLICY_REQUIRED",
      }));
      expectSafeRateError(
        () => safeDocument.createSelect(),
        "SafeDocument rate exceeded: operations",
      );
      expect(clock.root.childNodes).toHaveLength(0);
    } finally {
      clock.restore();
    }
  });

  it("fails closed when the owner clock rolls back during a strict policy denial", () => {
    const clock = createControlledOwnerClock(10);
    try {
      const safeDocument = createStrictSafeDocument(clock.root, {
        harden: testHarden,
        rates: { operations: { limit: 3, windowMs: 100 } },
      });
      expect(() => safeDocument.createInput()).toThrowError(expect.objectContaining({
        code: "FORM_CONTROL_POLICY_REQUIRED",
      }));

      clock.set(9);
      expectSafeRateError(
        () => safeDocument.createTextarea(),
        "SafeDocument rate clock failed: operations",
      );
      clock.set(11);
      expectSafeRateError(
        () => safeDocument.createSelect(),
        "SafeDocument rate clock failed: operations",
      );
      expect(clock.root.childNodes).toHaveLength(0);
    } finally {
      clock.restore();
    }
  });

  it("allows exact N operations, rejects N+1, and resets at the exact window boundary", () => {
    const clock = createControlledOwnerClock(50);
    try {
      const safeDocument = createSafeDocument(clock.root, {
        rates: {
          operations: { limit: 2, windowMs: 1_000 },
        },
      });
      const element = safeDocument.createDiv();
      expect(element.getText()).toBe("");
      expectSafeRateError(() => element.getText(), "SafeDocument rate exceeded: operations");

      clock.set(1_049.999);
      expectSafeRateError(() => element.getText(), "SafeDocument rate exceeded: operations");
      clock.set(1_050);
      expect(element.getText()).toBe("");
      expect(element.getText()).toBe("");
      expectSafeRateError(() => element.getText(), "SafeDocument rate exceeded: operations");
    } finally {
      clock.restore();
    }
  });

  it("uses the captured owner clock and fails closed on rollback", () => {
    const clock = createControlledOwnerClock(10);
    const prototype = clock.documentValue.defaultView?.Performance.prototype;
    if (prototype === undefined) throw new Error("expected owner-realm Performance prototype");
    try {
      const safeDocument = createSafeDocument(clock.root, {
        rates: { operations: { limit: 3, windowMs: 100 } },
      });
      const element = safeDocument.createDiv();

      Object.defineProperty(prototype, "now", {
        configurable: true,
        get: () => { throw document.body; },
      });
      clock.set(11);
      expect(element.getText()).toBe("");
      clock.set(9);
      expectSafeRateError(() => element.getText(), "SafeDocument rate clock failed: operations");
    } finally {
      clock.restore();
    }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "fails closed on a fresh invalid owner-clock reading %s",
    (reading) => {
      const clock = createControlledOwnerClock(reading);
      try {
        const safeDocument = createSafeDocument(clock.root, {
          rates: { operations: { limit: 3, windowMs: 100 } },
        });
        expectSafeRateError(
          () => safeDocument.createDiv(),
          "SafeDocument rate clock failed: operations",
        );
      } finally {
        clock.restore();
      }
    },
  );
});

describe("fixed-window request-attempt rates", () => {
  it("meters denied attempts independently from lifetime request-attempt quotas", () => {
    const clock = createControlledOwnerClock(0);
    try {
      const safeDocument = createSafeDocument(clock.root, {
        quotas: { requestAttempts: 10 },
        rates: {
          operations: { limit: 10, windowMs: 1_000 },
          requestAttempts: { limit: 2, windowMs: 1_000 },
        },
      });
      const image = safeDocument.createImage();
      expect(image.setSrc("https://denied.example/one.png").allowed).toBe(false);
      expect(image.setSrc("https://denied.example/two.png").allowed).toBe(false);
      expectSafeRateError(
        () => image.setSrc("https://denied.example/three.png"),
        "SafeDocument rate exceeded: requestAttempts",
      );

      clock.set(1_000);
      expect(image.setSrc("https://denied.example/reset.png").allowed).toBe(false);
    } finally {
      clock.restore();
    }
  });

  it("meters the track URL sink at the exact request-attempt boundary", () => {
    const clock = createControlledOwnerClock(0);
    try {
      const safeDocument = createSafeDocument(clock.root, {
        quotas: { requestAttempts: 10 },
        rates: {
          operations: { limit: 10, windowMs: 1_000 },
          requestAttempts: { limit: 1, windowMs: 1_000 },
        },
      });
      const track = safeDocument.createTrack();
      expect(track.setSrc("https://denied.example/one.vtt").allowed).toBe(false);
      expectSafeRateError(
        () => track.setSrc("https://denied.example/two.vtt"),
        "SafeDocument rate exceeded: requestAttempts",
      );

      clock.set(1_000);
      expect(track.setSrc("https://denied.example/reset.vtt").allowed).toBe(false);
    } finally {
      clock.restore();
    }
  });

  it("rejects accessors, non-records, missing fields, and invalid rate primitives without claiming the root", () => {
    const invalidRates: readonly unknown[] = [
      undefined,
      null,
      1,
      { operations: undefined },
      { operations: null },
      { operations: { limit: 1 } },
      { operations: { limit: "1", windowMs: 1_000 } },
      { operations: { limit: 1, windowMs: 0 } },
      Object.defineProperty({}, "operations", { get: () => { throw document.body; } }),
      {
        operations: Object.defineProperty({ windowMs: 1_000 }, "limit", {
          get: () => { throw window; },
        }),
      },
    ];

    for (const rates of invalidRates) {
      const root = createContainedRoot(document);
      expect(() => createSafeDocument(root, { rates } as never)).toThrowError(
        expect.objectContaining({ code: "INVALID_RATE" }),
      );
      expect(() => createSafeDocument(root)).not.toThrow();
    }
  });
});
