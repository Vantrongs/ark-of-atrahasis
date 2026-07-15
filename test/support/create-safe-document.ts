import { createSafeDocument } from "../../src/index.ts";
import type { SafeDocument, SafeDocumentOptions } from "../../src/types.ts";
import { testHarden } from "./harden.ts";

type TestOptions = Omit<SafeDocumentOptions, "harden">;

/** Inject the deterministic test hardener without eagerly reading hostile fields. */
export function createTestSafeDocument(root: ShadowRoot, options: TestOptions = {}): SafeDocument {
  const withHarden = new Proxy(options, {
    getOwnPropertyDescriptor(target, property) {
      if (property === "harden") {
        return {
          configurable: true,
          enumerable: true,
          value: testHarden,
          writable: false,
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  }) as SafeDocumentOptions;

  return createSafeDocument(root, withHarden);
}
