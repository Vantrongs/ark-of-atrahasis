import { SafeDOMError } from "./errors.ts";
import { NodeRegistry } from "./registry.ts";

const claimedRoots = new WeakSet<object>();
const objectIsPrototypeOf = Function.call.bind(Object.prototype.isPrototypeOf) as (
  prototype: object,
  value: unknown,
) => boolean;

export interface DocumentContext {
  readonly root: ShadowRoot;
  readonly ownerDocument: Document;
  readonly registry: NodeRegistry;
  createElement<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K];
  createElement(tag: string): HTMLElement;
  createTextNode(value: string): Text;
}

function getNativeRoot(value: unknown): {
  root: ShadowRoot;
  ownerDocument: Document;
} {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    throw new SafeDOMError("INVALID_ROOT", "createSafeDocument requires a ShadowRoot capability");
  }

  // Initialisation is a host operation. Resolve the constructor from the
  // supplied root's realm instead of using ambient globals.
  const candidate = value as Partial<ShadowRoot>;
  const ownerDocument = candidate.ownerDocument;
  const view = ownerDocument?.defaultView;
  const ShadowRootConstructor = view?.ShadowRoot;
  if (
    !ownerDocument
    || !ShadowRootConstructor
    || !objectIsPrototypeOf(ShadowRootConstructor.prototype, value)
  ) {
    throw new SafeDOMError("INVALID_ROOT", "createSafeDocument requires a native ShadowRoot");
  }

  return { root: value as ShadowRoot, ownerDocument };
}

export function createDocumentContext(rootCapability: unknown): DocumentContext {
  const { root, ownerDocument } = getNativeRoot(rootCapability);
  if (claimedRoots.has(root)) {
    throw new SafeDOMError(
      "ROOT_ALREADY_CLAIMED",
      "A ShadowRoot can be claimed by only one SafeDocument",
    );
  }
  claimedRoots.add(root);

  const createElement = ownerDocument.createElement.bind(ownerDocument);
  const createTextNode = ownerDocument.createTextNode.bind(ownerDocument);

  return {
    root,
    ownerDocument,
    registry: new NodeRegistry(ownerDocument),
    createElement: createElement as DocumentContext["createElement"],
    createTextNode,
  };
}
