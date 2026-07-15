import { createSafeDOMError } from "./errors.ts";

type PlatformMethod = (...arguments_: never[]) => unknown;

function captureMethod<Method extends PlatformMethod>(
  prototype: object,
  property: PropertyKey,
  operation: string,
): Method {
  try {
    let current: object | null = prototype;
    while (current !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(current, property);
      if (descriptor !== undefined) {
        if (typeof descriptor.value === "function") return descriptor.value;
        break;
      }
      current = Object.getPrototypeOf(current);
    }
  } catch {
    // The thrown platform value is deliberately discarded below.
  }
  throw createSafeDOMError("DOM_OPERATION_FAILED", operation);
}

function captureAccessor<Accessor extends PlatformMethod>(
  prototype: object,
  property: PropertyKey,
  kind: "get" | "set",
  operation: string,
): Accessor {
  try {
    let current: object | null = prototype;
    while (current !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(current, property);
      if (descriptor !== undefined) {
        const accessor = descriptor[kind];
        // This is the single typed boundary from a validated WebIDL descriptor
        // into its exact captured accessor signature.
        if (typeof accessor === "function") return accessor as Accessor;
        break;
      }
      current = Object.getPrototypeOf(current);
    }
  } catch {
    // The thrown platform value is deliberately discarded below.
  }
  throw createSafeDOMError("DOM_OPERATION_FAILED", operation);
}

type OwnerDocumentGetter = (this: Node) => Document | null;
type ParentNodeGetter = (this: Node) => ParentNode | null;
type TextContentGetter = (this: Node) => string | null;
type TextContentSetter = (this: Node, value: string | null) => void;
type AbortSignalGetter = (this: AbortController) => AbortSignal;
type StringGetter<ElementType extends Element> = (this: ElementType) => string;
type StringSetter<ElementType extends Element> = (this: ElementType, value: string) => void;
type BooleanGetter<ElementType extends Element> = (this: ElementType) => boolean;
type BooleanSetter<ElementType extends Element> = (this: ElementType, value: boolean) => void;

function prototypeOwns(prototype: object, value: object): boolean {
  try {
    return Reflect.apply(Object.prototype.isPrototypeOf, prototype, [value]);
  } catch {
    throw createSafeDOMError("DOM_OPERATION_FAILED", "Element.brand");
  }
}

export interface PlatformOps {
  readonly URL: typeof URL;
  createElement(tag: string): HTMLElement;
  createTextNode(value: string): Text;
  appendChild(parent: Node, child: Node, operation?: string): void;
  insertBefore(parent: Node, child: Node, reference: Node, operation?: string): void;
  removeChild(parent: Node, child: Node, operation?: string): void;
  replaceChild(parent: Node, child: Node, replaced: Node, operation?: string): void;
  detach(node: Node): void;
  ownerDocument(node: Node): Document | null;
  parentNode(node: Node): ParentNode | null;
  getTextContent(node: Node): string | null;
  setTextContent(node: Node, value: string): void;
  getAttribute(element: Element, name: string): string | null;
  setAttribute(element: Element, name: string, value: string): void;
  removeAttribute(element: Element, name: string): void;
  getElementById(root: ShadowRoot, id: string): Element | null;
  isElement(node: Node): node is Element;
  createAbortController(): AbortController;
  getAbortSignal(controller: AbortController): AbortSignal;
  addEventListener(
    target: EventTarget,
    eventName: string,
    listener: EventListener,
    signal: AbortSignal,
  ): void;
  abort(controller: AbortController): void;
  getInputValue(element: HTMLInputElement): string;
  setInputValue(element: HTMLInputElement, value: string): void;
  getInputChecked(element: HTMLInputElement): boolean;
  setInputChecked(element: HTMLInputElement, value: boolean): void;
  getTextareaValue(element: HTMLTextAreaElement): string;
  setTextareaValue(element: HTMLTextAreaElement, value: string): void;
  getSelectValue(element: HTMLSelectElement): string;
  setSelectValue(element: HTMLSelectElement, value: string): void;
  setOptionSelected(element: HTMLOptionElement, value: boolean): void;
}

class OwnerRealmPlatformOps implements PlatformOps {
  readonly URL: typeof URL;
  readonly #ownerDocument: Document;
  readonly #elementPrototype: object;
  readonly #createElement: (qualifiedName: string) => HTMLElement;
  readonly #createTextNode: Document["createTextNode"];
  readonly #appendChild: Node["appendChild"];
  readonly #insertBefore: Node["insertBefore"];
  readonly #removeChild: Node["removeChild"];
  readonly #replaceChild: Node["replaceChild"];
  readonly #ownerDocumentGetter: OwnerDocumentGetter;
  readonly #parentNodeGetter: ParentNodeGetter;
  readonly #textContentGetter: TextContentGetter;
  readonly #textContentSetter: TextContentSetter;
  readonly #getAttribute: Element["getAttribute"];
  readonly #setAttribute: Element["setAttribute"];
  readonly #removeAttribute: Element["removeAttribute"];
  readonly #getElementById: ShadowRoot["getElementById"];
  readonly #AbortController: typeof AbortController;
  readonly #abortSignalGetter: AbortSignalGetter;
  readonly #addEventListener: EventTarget["addEventListener"];
  readonly #abort: AbortController["abort"];
  readonly #inputValueGetter: StringGetter<HTMLInputElement>;
  readonly #inputValueSetter: StringSetter<HTMLInputElement>;
  readonly #inputCheckedGetter: BooleanGetter<HTMLInputElement>;
  readonly #inputCheckedSetter: BooleanSetter<HTMLInputElement>;
  readonly #textareaValueGetter: StringGetter<HTMLTextAreaElement>;
  readonly #textareaValueSetter: StringSetter<HTMLTextAreaElement>;
  readonly #selectValueGetter: StringGetter<HTMLSelectElement>;
  readonly #selectValueSetter: StringSetter<HTMLSelectElement>;
  readonly #optionSelectedSetter: BooleanSetter<HTMLOptionElement>;

  constructor(ownerDocument: Document, view: Window & typeof globalThis) {
    this.#ownerDocument = ownerDocument;
    this.URL = view.URL;
    const nodePrototype = view.Node.prototype;
    const elementPrototype = view.Element.prototype;
    this.#elementPrototype = elementPrototype;
    this.#createElement = captureMethod(
      view.Document.prototype,
      "createElement",
      "Document.createElement.capture",
    );
    this.#createTextNode = captureMethod(
      view.Document.prototype,
      "createTextNode",
      "Document.createTextNode.capture",
    );
    this.#appendChild = captureMethod(nodePrototype, "appendChild", "Node.appendChild.capture");
    this.#insertBefore = captureMethod(nodePrototype, "insertBefore", "Node.insertBefore.capture");
    this.#removeChild = captureMethod(nodePrototype, "removeChild", "Node.removeChild.capture");
    this.#replaceChild = captureMethod(nodePrototype, "replaceChild", "Node.replaceChild.capture");
    this.#ownerDocumentGetter = captureAccessor(
      nodePrototype,
      "ownerDocument",
      "get",
      "Node.ownerDocument.capture",
    );
    this.#parentNodeGetter = captureAccessor(
      nodePrototype,
      "parentNode",
      "get",
      "Node.parentNode.capture",
    );
    this.#textContentGetter = captureAccessor(
      nodePrototype,
      "textContent",
      "get",
      "Node.textContent.get.capture",
    );
    this.#textContentSetter = captureAccessor(
      nodePrototype,
      "textContent",
      "set",
      "Node.textContent.set.capture",
    );
    this.#getAttribute = captureMethod(elementPrototype, "getAttribute", "Element.getAttribute.capture");
    this.#setAttribute = captureMethod(elementPrototype, "setAttribute", "Element.setAttribute.capture");
    this.#removeAttribute = captureMethod(
      elementPrototype,
      "removeAttribute",
      "Element.removeAttribute.capture",
    );
    this.#getElementById = captureMethod(
      view.ShadowRoot.prototype,
      "getElementById",
      "ShadowRoot.getElementById.capture",
    );
    this.#AbortController = view.AbortController;
    this.#abortSignalGetter = captureAccessor(
      view.AbortController.prototype,
      "signal",
      "get",
      "AbortController.signal.capture",
    );
    this.#addEventListener = captureMethod(
      view.EventTarget.prototype,
      "addEventListener",
      "EventTarget.addEventListener.capture",
    );
    this.#abort = captureMethod(
      view.AbortController.prototype,
      "abort",
      "AbortController.abort.capture",
    );

    const inputPrototype = view.HTMLInputElement.prototype;
    this.#inputValueGetter = captureAccessor(inputPrototype, "value", "get", "HTMLInputElement.value.get.capture");
    this.#inputValueSetter = captureAccessor(inputPrototype, "value", "set", "HTMLInputElement.value.set.capture");
    this.#inputCheckedGetter = captureAccessor(inputPrototype, "checked", "get", "HTMLInputElement.checked.get.capture");
    this.#inputCheckedSetter = captureAccessor(inputPrototype, "checked", "set", "HTMLInputElement.checked.set.capture");

    const textareaPrototype = view.HTMLTextAreaElement.prototype;
    this.#textareaValueGetter = captureAccessor(textareaPrototype, "value", "get", "HTMLTextAreaElement.value.get.capture");
    this.#textareaValueSetter = captureAccessor(textareaPrototype, "value", "set", "HTMLTextAreaElement.value.set.capture");

    const selectPrototype = view.HTMLSelectElement.prototype;
    this.#selectValueGetter = captureAccessor(selectPrototype, "value", "get", "HTMLSelectElement.value.get.capture");
    this.#selectValueSetter = captureAccessor(selectPrototype, "value", "set", "HTMLSelectElement.value.set.capture");
    this.#optionSelectedSetter = captureAccessor(
      view.HTMLOptionElement.prototype,
      "selected",
      "set",
      "HTMLOptionElement.selected.set.capture",
    );
  }

  createElement(tag: string): HTMLElement {
    return this.#invoke("Document.createElement", this.#createElement, this.#ownerDocument, [tag]);
  }

  createTextNode(value: string): Text {
    return this.#invoke(
      "Document.createTextNode",
      this.#createTextNode,
      this.#ownerDocument,
      [value],
    );
  }

  appendChild(parent: Node, child: Node, operation = "Node.appendChild"): void {
    this.#invoke(operation, this.#appendChild, parent, [child]);
  }

  insertBefore(
    parent: Node,
    child: Node,
    reference: Node,
    operation = "Node.insertBefore",
  ): void {
    this.#invoke(operation, this.#insertBefore, parent, [child, reference]);
  }

  removeChild(parent: Node, child: Node, operation = "Node.removeChild"): void {
    this.#invoke(operation, this.#removeChild, parent, [child]);
  }

  replaceChild(
    parent: Node,
    child: Node,
    replaced: Node,
    operation = "Node.replaceChild",
  ): void {
    this.#invoke(operation, this.#replaceChild, parent, [child, replaced]);
  }

  detach(node: Node): void {
    const parent = this.parentNode(node);
    if (parent !== null) this.removeChild(parent, node, "Node.remove");
  }

  ownerDocument(node: Node): Document | null {
    return this.#invoke("Node.ownerDocument", this.#ownerDocumentGetter, node, []);
  }

  parentNode(node: Node): ParentNode | null {
    return this.#invoke("Node.parentNode", this.#parentNodeGetter, node, []);
  }

  getTextContent(node: Node): string | null {
    return this.#invoke("Node.textContent.get", this.#textContentGetter, node, []);
  }

  setTextContent(node: Node, value: string): void {
    this.#invoke("Node.textContent.set", this.#textContentSetter, node, [value]);
  }

  getAttribute(element: Element, name: string): string | null {
    return this.#invoke("Element.getAttribute", this.#getAttribute, element, [name]);
  }

  setAttribute(element: Element, name: string, value: string): void {
    this.#invoke("Element.setAttribute", this.#setAttribute, element, [name, value]);
  }

  removeAttribute(element: Element, name: string): void {
    this.#invoke("Element.removeAttribute", this.#removeAttribute, element, [name]);
  }

  getElementById(root: ShadowRoot, id: string): Element | null {
    return this.#invoke("ShadowRoot.getElementById", this.#getElementById, root, [id]);
  }

  isElement(node: Node): node is Element {
    return prototypeOwns(this.#elementPrototype, node);
  }

  createAbortController(): AbortController {
    try {
      return new this.#AbortController();
    } catch {
      throw createSafeDOMError("DOM_OPERATION_FAILED", "AbortController.constructor");
    }
  }

  getAbortSignal(controller: AbortController): AbortSignal {
    return this.#invoke("AbortController.signal", this.#abortSignalGetter, controller, []);
  }

  addEventListener(
    target: EventTarget,
    eventName: string,
    listener: EventListener,
    signal: AbortSignal,
  ): void {
    this.#invoke(
      "EventTarget.addEventListener",
      this.#addEventListener,
      target,
      [eventName, listener, { signal }],
    );
  }

  abort(controller: AbortController): void {
    this.#invoke("AbortController.abort", this.#abort, controller, []);
  }

  getInputValue(element: HTMLInputElement): string {
    return this.#invoke("HTMLInputElement.value.get", this.#inputValueGetter, element, []);
  }

  setInputValue(element: HTMLInputElement, value: string): void {
    this.#invoke("HTMLInputElement.value.set", this.#inputValueSetter, element, [value]);
  }

  getInputChecked(element: HTMLInputElement): boolean {
    return this.#invoke("HTMLInputElement.checked.get", this.#inputCheckedGetter, element, []);
  }

  setInputChecked(element: HTMLInputElement, value: boolean): void {
    this.#invoke("HTMLInputElement.checked.set", this.#inputCheckedSetter, element, [value]);
  }

  getTextareaValue(element: HTMLTextAreaElement): string {
    return this.#invoke("HTMLTextAreaElement.value.get", this.#textareaValueGetter, element, []);
  }

  setTextareaValue(element: HTMLTextAreaElement, value: string): void {
    this.#invoke("HTMLTextAreaElement.value.set", this.#textareaValueSetter, element, [value]);
  }

  getSelectValue(element: HTMLSelectElement): string {
    return this.#invoke("HTMLSelectElement.value.get", this.#selectValueGetter, element, []);
  }

  setSelectValue(element: HTMLSelectElement, value: string): void {
    this.#invoke("HTMLSelectElement.value.set", this.#selectValueSetter, element, [value]);
  }

  setOptionSelected(element: HTMLOptionElement, value: boolean): void {
    this.#invoke("HTMLOptionElement.selected.set", this.#optionSelectedSetter, element, [value]);
  }

  #invoke<Arguments extends unknown[], Result>(
    operation: string,
    method: (...arguments_: Arguments) => Result,
    receiver: object,
    arguments_: Arguments,
  ): Result {
    try {
      return Reflect.apply(method, receiver, arguments_);
    } catch {
      throw createSafeDOMError("DOM_OPERATION_FAILED", operation);
    }
  }
}

export function createPlatformOps(
  ownerDocument: Document,
  view: Window & typeof globalThis,
): PlatformOps {
  try {
    return new OwnerRealmPlatformOps(ownerDocument, view);
  } catch {
    throw createSafeDOMError("DOM_OPERATION_FAILED", "PlatformOps.capture");
  }
}
