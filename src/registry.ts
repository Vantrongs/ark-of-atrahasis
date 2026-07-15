import type { SafeElement, SafeStyleSheet, SafeTextNode } from "./types.ts";
import { SafeDOMError } from "./errors.ts";

export type SafeNode = SafeElement | SafeTextNode | SafeStyleSheet;
export type SafeChildNode = SafeElement | SafeTextNode;
export type RealNode = Element | Text;

interface RegistryEntry {
  readonly owner: object;
  readonly wrapper: SafeNode;
  readonly real: RealNode;
}

/** A registry belongs to exactly one SafeDocument capability. */
export class NodeRegistry {
  readonly #owner = Object.freeze({});
  readonly #ownerDocument: Document;
  readonly #entryByReal = new WeakMap<RealNode, RegistryEntry>();
  readonly #entryByWrapper = new WeakMap<SafeNode, RegistryEntry>();

  constructor(ownerDocument: Document) {
    this.#ownerDocument = ownerDocument;
  }

  register(wrapper: SafeNode, real: RealNode): void {
    if (real.ownerDocument !== this.#ownerDocument) {
      throw new SafeDOMError(
        "OWNER_DOCUMENT_MISMATCH",
        "A wrapper can only own nodes from its ShadowRoot document",
      );
    }

    const byReal = this.#entryByReal.get(real);
    const byWrapper = this.#entryByWrapper.get(wrapper);
    if (byReal?.wrapper === wrapper && byWrapper?.real === real) return;
    if (byReal || byWrapper) {
      throw new SafeDOMError(
        "DUPLICATE_REGISTRATION",
        "A DOM node has exactly one canonical wrapper per SafeDocument",
      );
    }

    const entry: RegistryEntry = { owner: this.#owner, wrapper, real };
    this.#entryByReal.set(real, entry);
    this.#entryByWrapper.set(wrapper, entry);
  }

  getWrapper<T extends SafeNode = SafeNode>(real: RealNode): T | undefined {
    const entry = this.#entryByReal.get(real);
    if (!entry || entry.owner !== this.#owner) return undefined;
    return entry.wrapper as T;
  }

  getRealNode(wrapper: SafeNode): RealNode | undefined {
    const entry = this.#entryByWrapper.get(wrapper);
    if (!entry || entry.owner !== this.#owner) return undefined;
    return entry.real;
  }

  requireRealNode(wrapper: SafeNode): RealNode {
    const real = this.getRealNode(wrapper);
    if (!real) {
      throw new SafeDOMError(
        "CROSS_OWNER",
        "The supplied wrapper is not owned by this SafeDocument",
      );
    }
    return real;
  }
}
