import { SafeDOMError } from "./errors.ts";
import { createEventSnapshotter, type EventSnapshotter } from "./event.ts";
import {
  NodeRegistry,
  type AccountedResource,
  type RealNode,
  type RegistryEntry,
  type SafeNode,
} from "./registry.ts";
import type { SafeDocumentOptions, SafeDocumentQuotas } from "./types.ts";
import { createStylePolicy, type StylePolicyEngine } from "./style-policy.ts";
import { createURLPolicy, type URLPolicyEngine } from "./url-policy.ts";

const claimedRoots = new WeakSet<object>();
const objectIsPrototypeOf = Function.call.bind(Object.prototype.isPrototypeOf) as (
  prototype: object,
  value: unknown,
) => boolean;

export const DEFAULT_SAFE_DOCUMENT_QUOTAS: Readonly<SafeDocumentQuotas> = Object.freeze({
  nodes: 1_000,
  listeners: 1_000,
  operations: 100_000,
  textBytes: 1_000_000,
  attributeBytes: 256_000,
  styleBytes: 256_000,
  requests: 64,
  requestAttempts: 256,
});

type QuotaUsage = { -readonly [Name in keyof SafeDocumentQuotas]: number };
type ResourceQuota = Exclude<
  keyof SafeDocumentQuotas,
  "nodes" | "listeners" | "operations" | "requestAttempts"
>;

const RESOURCE_QUOTA: Record<AccountedResource, ResourceQuota> = {
  text: "textBytes",
  attribute: "attributeBytes",
  style: "styleBytes",
  request: "requests",
};

function utf8ByteLength(value: string): number {
  let length = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) length += 1;
    else if (codePoint <= 0x7ff) length += 2;
    else if (codePoint <= 0xffff) length += 3;
    else length += 4;
  }
  return length;
}

function resolveQuotas(options: SafeDocumentOptions | undefined): SafeDocumentQuotas {
  const supplied = options?.quotas;
  const resolved = { ...DEFAULT_SAFE_DOCUMENT_QUOTAS, ...supplied };
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new SafeDOMError(
        "INVALID_QUOTA",
        `Quota ${name} must be a non-negative safe integer`,
      );
    }
  }
  return resolved;
}

export interface DocumentContext {
  readonly root: ShadowRoot;
  readonly ownerDocument: Document;
  readonly registry: NodeRegistry;
  readonly urlPolicy: URLPolicyEngine;
  readonly stylePolicy: StylePolicyEngine;
  readonly eventSnapshotter: EventSnapshotter;
  createElement<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K];
  createElement(tag: string): HTMLElement;
  createTextNode(value: string): Text;
  register(wrapper: SafeNode, real: RealNode): void;
  documentOperation<T>(action: () => T): T;
  nodeOperation<T>(real: RealNode, action: () => T): T;
  requireRealNode(wrapper: SafeNode): RealNode;
  setText(real: RealNode, slot: string, value: string, action: () => void): void;
  setAttribute(
    real: Element,
    name: string,
    value: string | null | undefined,
    request: boolean,
  ): void;
  setStyle(real: Element, property: string, value: string, action: () => boolean): boolean;
  addEventListener(
    real: Element,
    eventName: string,
    listener: (event: Event) => void,
  ): () => void;
  canDispatch(real: Element): boolean;
  detachNode(real: RealNode): void;
  disposeNode(real: RealNode): void;
  disposeDocument(): void;
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

class DocumentContextImplementation implements DocumentContext {
  readonly root: ShadowRoot;
  readonly ownerDocument: Document;
  readonly registry: NodeRegistry;
  readonly urlPolicy: URLPolicyEngine;
  readonly stylePolicy: StylePolicyEngine;
  readonly eventSnapshotter: EventSnapshotter;
  readonly #quotas: SafeDocumentQuotas;
  readonly #usage: QuotaUsage = {
    nodes: 0,
    listeners: 0,
    operations: 0,
    textBytes: 0,
    attributeBytes: 0,
    styleBytes: 0,
    requests: 0,
    requestAttempts: 0,
  };
  readonly #createElement: Document["createElement"];
  readonly #createTextNode: Document["createTextNode"];
  readonly #AbortController: typeof AbortController;
  readonly #Element: typeof Element;
  #disposed = false;

  constructor(root: ShadowRoot, ownerDocument: Document, options?: SafeDocumentOptions) {
    this.root = root;
    this.ownerDocument = ownerDocument;
    this.registry = new NodeRegistry(ownerDocument);
    this.#quotas = resolveQuotas(options);
    const view = ownerDocument.defaultView;
    if (!view) throw new SafeDOMError("INVALID_ROOT", "createSafeDocument.rootRealm");
    this.urlPolicy = createURLPolicy(options?.urlPolicy, view.URL);
    this.stylePolicy = createStylePolicy(options?.stylePolicy);
    this.eventSnapshotter = createEventSnapshotter(view);
    this.#createElement = ownerDocument.createElement.bind(ownerDocument);
    this.#createTextNode = ownerDocument.createTextNode.bind(ownerDocument);
    this.#AbortController = view.AbortController;
    this.#Element = view.Element;
  }

  createElement<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K];
  createElement(tag: string): HTMLElement;
  createElement(tag: string): HTMLElement {
    return this.documentOperation(() => this.#createElement(tag));
  }

  createTextNode(value: string): Text {
    return this.documentOperation(() => this.#createTextNode(value));
  }

  register(wrapper: SafeNode, real: RealNode): void {
    this.#assertDocumentActive();
    this.#reserve("nodes", 1);
    try {
      this.registry.register(wrapper, real);
    } catch (error) {
      this.#usage.nodes -= 1;
      throw error;
    }
  }

  documentOperation<T>(action: () => T): T {
    this.#assertDocumentActive();
    this.#auditPlacements();
    this.#reserve("operations", 1);
    return action();
  }

  nodeOperation<T>(real: RealNode, action: () => T): T {
    this.#assertDocumentActive();
    const entry = this.#requireEntryByReal(real);
    const compromised = this.#auditPlacements();
    if (compromised.has(entry)) {
      throw new SafeDOMError(
        "PLACEMENT_VIOLATION",
        "The owned node was placed outside its SafeDocument mount and has been revoked",
      );
    }
    this.#assertEntryActive(entry);
    this.#reserve("operations", 1);
    return action();
  }

  requireRealNode(wrapper: SafeNode): RealNode {
    const entry = this.registry.requireEntry(wrapper);
    this.#assertEntryActive(entry);
    return entry.real;
  }

  setText(real: RealNode, slot: string, value: string, action: () => void): void {
    this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);
      this.#updateResources(entry, [{ resource: "text", slot, amount: utf8ByteLength(value) }], action);
    });
  }

  setAttribute(
    real: Element,
    name: string,
    value: string | null | undefined,
    request: boolean,
  ): void {
    this.nodeOperation(real, () => {
      if (value === undefined) return;
      const entry = this.#requireEntryByReal(real);
      if (request && value !== null) this.#reserve("requestAttempts", 1);
      const changes: ResourceChange[] = [{
        resource: "attribute",
        slot: name,
        amount: value === null ? 0 : utf8ByteLength(name) + utf8ByteLength(value),
      }];
      if (request) {
        changes.push({
          resource: "request",
          slot: name,
          amount: value === null ? 0 : 1,
        });
      }
      this.#updateResources(entry, changes, () => {
        if (value === null) real.removeAttribute(name);
        else real.setAttribute(name, value);
      });
    });
  }

  setStyle(
    real: Element,
    property: string,
    value: string,
    action: () => boolean,
  ): boolean {
    return this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);
      const amount = utf8ByteLength(value);
      const previous = entry.resources.style.get(property) ?? 0;
      const delta = amount - previous;
      if (delta > 0 && this.#usage.styleBytes + delta > this.#quotas.styleBytes) {
        throw new SafeDOMError("QUOTA_EXCEEDED", "SafeDocument quota exceeded: styleBytes");
      }
      this.#usage.styleBytes += delta;

      let committed: boolean;
      try {
        committed = action();
      } catch {
        this.#usage.styleBytes -= delta;
        throw new SafeDOMError(
          "DOM_OPERATION_FAILED",
          "The DOM mutation could not be completed",
        );
      }
      if (!committed) {
        this.#usage.styleBytes -= delta;
        return false;
      }

      if (amount === 0) entry.resources.style.delete(property);
      else entry.resources.style.set(property, amount);
      return true;
    });
  }

  addEventListener(
    real: Element,
    eventName: string,
    listener: (event: Event) => void,
  ): () => void {
    return this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);
      this.#reserve("listeners", 1);
      const controller = new this.#AbortController();
      let active = true;
      const cleanup = (): void => {
        if (!active) return;
        active = false;
        entry.listeners.delete(cleanup);
        this.#usage.listeners -= 1;
        try {
          controller.abort();
        } catch {
          // Cleanup/revocation must remain available and must not disclose a
          // native exception even if the host platform is faulty.
        }
      };
      entry.listeners.add(cleanup);
      try {
        real.addEventListener(eventName, listener, { signal: controller.signal });
      } catch {
        cleanup();
        throw new SafeDOMError(
          "DOM_OPERATION_FAILED",
          "The event listener could not be installed",
        );
      }
      return cleanup;
    });
  }

  canDispatch(real: Element): boolean {
    if (this.#disposed) return false;
    const entry = this.registry.getEntryByReal(real);
    if (entry?.state !== "active") return false;
    const compromised = this.#auditPlacements();
    return !compromised.has(entry) && entry.state === "active";
  }

  detachNode(real: RealNode): void {
    this.nodeOperation(real, () => real.remove());
  }

  disposeNode(real: RealNode): void {
    const entry = this.#requireEntryByReal(real);
    if (this.#disposed || entry.state !== "active") return;
    const compromised = this.#auditPlacements();
    if (compromised.has(entry) || entry.state !== "active") return;

    const subtree = this.registry.entries().filter((candidate) => (
      candidate.state === "active" && this.#isWithin(candidate.real, real)
    ));
    for (const candidate of subtree) this.#clearOwnedResources(candidate);
    for (const candidate of subtree) this.#finalizeEntry(candidate, "disposed");
    real.remove();
  }

  disposeDocument(): void {
    if (this.#disposed) return;
    this.#auditPlacements();
    const activeEntries = this.registry.entries().filter((entry) => entry.state === "active");
    this.#disposed = true;

    for (const entry of activeEntries) this.#clearOwnedResources(entry);
    for (const entry of activeEntries) this.#finalizeEntry(entry, "disposed");

    // Only remove nodes that are still directly mounted in the claimed root.
    // Raw host nodes in the same ShadowRoot are never part of this set.
    for (const entry of activeEntries) {
      if (entry.real.parentNode === this.root) entry.real.remove();
    }
  }

  #assertDocumentActive(): void {
    if (this.#disposed) {
      throw new SafeDOMError("DOCUMENT_DISPOSED", "The SafeDocument has been disposed");
    }
  }

  #requireEntryByReal(real: RealNode): RegistryEntry {
    const entry = this.registry.getEntryByReal(real);
    if (!entry) {
      throw new SafeDOMError("CROSS_OWNER", "The node is not owned by this SafeDocument");
    }
    return entry;
  }

  #assertEntryActive(entry: RegistryEntry): void {
    if (entry.state === "disposed") {
      throw new SafeDOMError("NODE_DISPOSED", "The node wrapper has been disposed");
    }
    if (entry.state === "revoked") {
      throw new SafeDOMError("NODE_REVOKED", "The node wrapper has been revoked");
    }
  }

  #reserve(name: keyof SafeDocumentQuotas, amount: number): void {
    const next = this.#usage[name] + amount;
    if (next > this.#quotas[name]) {
      throw new SafeDOMError("QUOTA_EXCEEDED", `SafeDocument quota exceeded: ${name}`);
    }
    this.#usage[name] = next;
  }

  #auditPlacements(): Set<RegistryEntry> {
    const compromised = new Set<RegistryEntry>();
    for (const entry of this.registry.entries()) {
      if (entry.state === "active" && !this.#hasSafePlacement(entry)) compromised.add(entry);
    }
    for (const entry of compromised) this.#finalizeEntry(entry, "revoked");
    return compromised;
  }

  #hasSafePlacement(entry: RegistryEntry): boolean {
    if (entry.real.ownerDocument !== this.ownerDocument) return false;
    let current: Node = entry.real;
    for (;;) {
      const parent = current.parentNode;
      if (parent === null || parent === this.root) return true;
      const parentEntry = this.registry.getEntryByReal(parent as RealNode);
      if (parentEntry?.state !== "active") return false;
      current = parent;
    }
  }

  #isWithin(candidate: RealNode, ancestor: RealNode): boolean {
    let current: Node | null = candidate;
    while (current !== null) {
      if (current === ancestor) return true;
      current = current.parentNode;
    }
    return false;
  }

  #clearOwnedResources(entry: RegistryEntry): void {
    if (!(entry.real instanceof this.#Element)) return;
    for (const name of entry.resources.request.keys()) entry.real.removeAttribute(name);
    if (entry.resources.style.size > 0) {
      entry.real.removeAttribute("style");
    }
  }

  #finalizeEntry(entry: RegistryEntry, state: "disposed" | "revoked"): void {
    if (entry.state !== "active") return;
    entry.state = state;
    for (const cleanup of [...entry.listeners]) cleanup();
    for (const resource of Object.keys(entry.resources) as AccountedResource[]) {
      const quota = RESOURCE_QUOTA[resource];
      for (const amount of entry.resources[resource].values()) this.#usage[quota] -= amount;
      entry.resources[resource].clear();
    }
    this.#usage.nodes -= 1;
    this.registry.stopTracking(entry);
  }

  #updateResources(
    entry: RegistryEntry,
    changes: readonly ResourceChange[],
    action: () => void,
  ): void {
    const deltas = new Map<ResourceQuota, number>();
    for (const change of changes) {
      const previous = entry.resources[change.resource].get(change.slot) ?? 0;
      const quota = RESOURCE_QUOTA[change.resource];
      deltas.set(quota, (deltas.get(quota) ?? 0) + change.amount - previous);
    }

    for (const [quota, delta] of deltas) {
      if (delta > 0 && this.#usage[quota] + delta > this.#quotas[quota]) {
        throw new SafeDOMError("QUOTA_EXCEEDED", `SafeDocument quota exceeded: ${quota}`);
      }
    }
    for (const [quota, delta] of deltas) this.#usage[quota] += delta;

    try {
      action();
    } catch {
      for (const [quota, delta] of deltas) this.#usage[quota] -= delta;
      throw new SafeDOMError(
        "DOM_OPERATION_FAILED",
        "The DOM mutation could not be completed",
      );
    }

    for (const change of changes) {
      if (change.amount === 0) entry.resources[change.resource].delete(change.slot);
      else entry.resources[change.resource].set(change.slot, change.amount);
    }
  }
}

interface ResourceChange {
  readonly resource: AccountedResource;
  readonly slot: string;
  readonly amount: number;
}

export function createDocumentContext(
  rootCapability: unknown,
  options?: SafeDocumentOptions,
): DocumentContext {
  const { root, ownerDocument } = getNativeRoot(rootCapability);
  if (claimedRoots.has(root)) {
    throw new SafeDOMError(
      "ROOT_ALREADY_CLAIMED",
      "A ShadowRoot can be claimed by only one SafeDocument",
    );
  }

  // Invalid options do not consume the root capability.
  const context = new DocumentContextImplementation(root, ownerDocument, options);
  claimedRoots.add(root);
  return context;
}
