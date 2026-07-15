export class FakeText {
  constructor(textContent = "") {
    this.parentNode = null;
    this.textContent = textContent;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }
}

export class FakeElement {
  #attributes = new Map();
  #listeners = new Map();

  constructor(tagName) {
    this.children = [];
    this.parentNode = null;
    this.style = Object.create(null);
    this.tagName = tagName.toUpperCase();
    this.textContent = "";
  }

  get id() {
    return this.getAttribute("id") ?? "";
  }

  set id(value) {
    this.setAttribute("id", value);
  }

  addEventListener(type, handler) {
    const handlers = this.#listeners.get(type) ?? new Set();
    handlers.add(handler);
    this.#listeners.set(type, handlers);
  }

  appendChild(child) {
    child.remove?.();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  dispatch(type) {
    const event = {
      altKey: false,
      ctrlKey: false,
      currentTarget: this,
      metaKey: false,
      preventDefault() {},
      shiftKey: false,
      stopImmediatePropagation() {},
      stopPropagation() {},
      target: this,
      type,
    };

    for (const handler of this.#listeners.get(type) ?? []) {
      handler(event);
    }
  }

  getAttribute(name) {
    return this.#attributes.get(name) ?? null;
  }

  insertBefore(newChild, reference) {
    const index = this.children.indexOf(reference);
    if (index === -1) throw new Error("reference is not a child");
    newChild.remove?.();
    newChild.parentNode = this;
    this.children.splice(index, 0, newChild);
    return newChild;
  }

  querySelector() {
    return null;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  removeAttribute(name) {
    this.#attributes.delete(name);
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index === -1) throw new Error("node is not a child");
    this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  removeEventListener(type, handler) {
    this.#listeners.get(type)?.delete(handler);
  }

  replaceChild(newChild, oldChild) {
    const index = this.children.indexOf(oldChild);
    if (index === -1) throw new Error("node is not a child");
    newChild.remove?.();
    newChild.parentNode = this;
    oldChild.parentNode = null;
    this.children[index] = newChild;
    return oldChild;
  }

  setAttribute(name, value) {
    this.#attributes.set(name, String(value));
  }
}

export function installFakeDom(rootId = "plugin-root") {
  const createdElements = [];
  const root = new FakeElement("div");
  root.id = rootId;

  const fakeDocument = {
    createElement(tagName) {
      const element = new FakeElement(tagName);
      createdElements.push(element);
      return element;
    },
    createTextNode(textContent) {
      return new FakeText(textContent);
    },
    getElementById(id) {
      return id === rootId ? root : null;
    },
    head: new FakeElement("head"),
  };

  globalThis.CSS = { escape: String };
  globalThis.Element = FakeElement;
  globalThis.HTMLElement = FakeElement;
  globalThis.Text = FakeText;
  globalThis.document = fakeDocument;

  return { createdElements, fakeDocument, root };
}
