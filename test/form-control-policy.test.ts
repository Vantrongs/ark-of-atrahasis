// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from "vitest";
import {
  createSafeDocument,
  isSafeDOMError,
  type SafeFormControlPolicy,
} from "../src/index.ts";
import { createContainedRoot } from "./support/contained-root.ts";
import { testHarden } from "./support/harden.ts";

const NON_CREDENTIAL_FORM_CONTROL_GRANT = Object.freeze({
  allowGuestReadableNonCredentialValues: true,
}) satisfies SafeFormControlPolicy;

beforeEach(() => {
  document.body.replaceChildren();
});

describe("guest-readable non-credential form-control policy", () => {
  test("strict default denies input, textarea, and select before native node creation", () => {
    const root = createContainedRoot();
    const originalCreateElement = Document.prototype.createElement;
    const createdTags: string[] = [];
    Document.prototype.createElement = function createElement(
      tagName: string,
      options?: ElementCreationOptions,
    ): HTMLElement {
      createdTags.push(tagName);
      return originalCreateElement.call(this, tagName, options);
    };

    let safeDocument: ReturnType<typeof createSafeDocument>;
    try {
      safeDocument = createSafeDocument(root, {
        harden: testHarden,
        quotas: { operations: 1 },
      });
    } finally {
      Document.prototype.createElement = originalCreateElement;
    }

    for (const [factory, operation] of [
      [() => safeDocument.createInput(), "SafeDocument.createInput.policy"],
      [() => safeDocument.createTextarea(), "SafeDocument.createTextarea.policy"],
      [() => safeDocument.createSelect(), "SafeDocument.createSelect.policy"],
    ] as const) {
      let caught: unknown;
      try {
        factory();
      } catch (error) {
        caught = error;
      }
      expect(isSafeDOMError(caught)).toBe(true);
      expect(Object.isFrozen(caught)).toBe(true);
      expect(caught).toMatchObject({
        name: "SafeDOMError",
        code: "FORM_CONTROL_POLICY_REQUIRED",
        operation,
        message: "Guest-readable non-credential form controls require an explicit host policy",
      });
    }

    expect(createdTags).toEqual([]);
    expect(root.childNodes).toHaveLength(0);
    expect(() => safeDocument.createDiv()).not.toThrow();
    expect(createdTags).toEqual(["div"]);
  });

  test("explicit host grant enables only the existing non-credential value surface", () => {
    const root = createContainedRoot();
    const safeDocument = createSafeDocument(root, {
      harden: testHarden,
      formControlPolicy: NON_CREDENTIAL_FORM_CONTROL_GRANT,
    });

    const input = safeDocument.createInput();
    const textarea = safeDocument.createTextarea();
    const select = safeDocument.createSelect();
    const option = safeDocument.createOption();
    option.setValue("choice");
    option.setText("choice");
    select.appendChild(option);
    input.setValue("input-value");
    textarea.setValue("textarea-value");
    select.setValue("choice");

    expect([input.getValue(), textarea.getValue(), select.getValue()]).toEqual([
      "input-value",
      "textarea-value",
      "choice",
    ]);
    expect(() => Reflect.apply(input.setType, undefined, ["password"])).toThrowError(
      expect.objectContaining({ code: "ERR_INVALID_ARGUMENT" }),
    );
  });

  test.each([
    {
      label: "explicit undefined policy",
      makeOptions: () => ({ harden: testHarden, formControlPolicy: undefined }),
      operation: "createSafeDocument.options.formControlPolicy",
    },
    {
      label: "non-record policy",
      makeOptions: () => ({ harden: testHarden, formControlPolicy: true }),
      operation: "createSafeDocument.options.formControlPolicy",
    },
    {
      label: "options accessor",
      makeOptions: () => Object.defineProperty({ harden: testHarden }, "formControlPolicy", {
        get() {
          return NON_CREDENTIAL_FORM_CONTROL_GRANT;
        },
      }),
      operation: "createSafeDocument.options.formControlPolicy",
    },
    {
      label: "grant accessor",
      makeOptions: () => ({
        harden: testHarden,
        formControlPolicy: Object.defineProperty(
          {},
          "allowGuestReadableNonCredentialValues",
          { get: () => true },
        ),
      }),
      operation:
        "createSafeDocument.options.formControlPolicy.allowGuestReadableNonCredentialValues",
    },
    {
      label: "boxed stateful value",
      makeOptions: () => ({
        harden: testHarden,
        formControlPolicy: {
          allowGuestReadableNonCredentialValues: {
            valueOf() {
              throw new Error("must not coerce");
            },
          },
        },
      }),
      operation:
        "createSafeDocument.options.formControlPolicy.allowGuestReadableNonCredentialValues",
    },
    {
      label: "extra policy state",
      makeOptions: () => ({
        harden: testHarden,
        formControlPolicy: {
          allowGuestReadableNonCredentialValues: true,
          mutableMode: "later",
        },
      }),
      operation: "createSafeDocument.options.formControlPolicy",
    },
  ])("rejects $label without consuming the root", ({ makeOptions, operation }) => {
    const root = createContainedRoot();
    expect(() => createSafeDocument(root, makeOptions() as never)).toThrowError(
      expect.objectContaining({ code: "ERR_INVALID_POLICY", operation }),
    );

    const safeDocument = createSafeDocument(root, {
      harden: testHarden,
      formControlPolicy: NON_CREDENTIAL_FORM_CONTROL_GRANT,
    });
    expect(() => safeDocument.createInput()).not.toThrow();
  });
});
