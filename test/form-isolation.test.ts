// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from "vitest";
import { createTestSafeDocument as createSafeDocument } from "./support/create-safe-document.ts";

function makeRoot(): ShadowRoot {
  const host = document.createElement("div");
  document.body.append(host);
  return host.attachShadow({ mode: "open" });
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("strict non-form controls", () => {
  test.each([
    { factory: "input" as const, bytes: 15 },
    { factory: "textarea" as const, bytes: 15 },
    { factory: "button" as const, bytes: 10 },
  ])("policy-owned $factory defaults consume and release exactly $bytes attribute bytes", ({ factory, bytes }) => {
    const createControl = (safeDocument: ReturnType<typeof createSafeDocument>) => {
      if (factory === "input") return safeDocument.createInput();
      if (factory === "textarea") return safeDocument.createTextarea();
      return safeDocument.createButton();
    };
    const deniedRoot = makeRoot();
    const deniedDocument = createSafeDocument(deniedRoot, { quotas: { attributeBytes: bytes - 1 } });
    expect(() => createControl(deniedDocument)).toThrowError(expect.objectContaining({
      code: "QUOTA_EXCEEDED",
      operation: "SafeDocument quota exceeded: attributeBytes",
    }));
    expect(deniedRoot.innerHTML).toBe("");

    const root = makeRoot();
    const safeDocument = createSafeDocument(root, { quotas: { attributeBytes: bytes } });
    const first = createControl(safeDocument);
    first.dispose();
    expect(() => createControl(safeDocument)).not.toThrow();
  });

  test("created buttons are non-submitting and reject submit/reset states", () => {
    const form = document.createElement("form");
    const host = document.createElement("div");
    form.append(host);
    document.body.append(form);
    const root = host.attachShadow({ mode: "open" });
    const safeDocument = createSafeDocument(root);

    const button = safeDocument.createButton();
    safeDocument.appendChild(button);
    const physical = root.querySelector("button");

    if (!(physical instanceof HTMLButtonElement)) throw new Error("expected a physical button");
    const initialType = physical.type;
    let submitError: unknown;
    try {
      button.setType("submit" as "button");
    } catch (error) {
      submitError = error;
    }

    expect({ initialType, submitError }).toMatchObject({
      initialType: "button",
      submitError: {
      name: "SafeDOMError",
      code: "ERR_INVALID_ARGUMENT",
      operation: "SafeButtonElement.setType.type",
      message: "The operation received an invalid argument",
      },
    });
    expect(physical.form).toBeNull();
    expect(() => button.setType("reset" as "button")).toThrowError(expect.objectContaining({
      code: "ERR_INVALID_ARGUMENT",
      operation: "SafeButtonElement.setType.type",
    }));
    expect(physical.type).toBe("button");
  });
});
