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
import {
  createStylePolicy,
  type SafeStylePolicy,
  type StylePolicyEngine,
} from "./style-policy.ts";
import {
  createURLPolicy,
  type SafeURLPolicy,
  type SafeURLDecision,
  type URLPolicyEngine,
} from "./url-policy.ts";
import { createPlatformOps, type PlatformOps } from "./platform.ts";

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

const QUOTA_NAMES = [
  "nodes",
  "listeners",
  "operations",
  "textBytes",
  "attributeBytes",
  "styleBytes",
  "requests",
  "requestAttempts",
] as const;

interface NormalizedOptions {
  readonly quotas?: Partial<SafeDocumentQuotas>;
  readonly urlPolicy?: SafeURLPolicy;
  readonly stylePolicy?: SafeStylePolicy;
}

function readOwnDataProperty<Value>(
  record: object,
  property: PropertyKey,
  error: () => SafeDOMError,
): Value | undefined {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, property);
    if (descriptor === undefined) return undefined;
    if (!("value" in descriptor)) throw error();
    return descriptor.value;
  } catch {
    throw error();
  }
}

function normalizeOptions(options: SafeDocumentOptions | undefined): NormalizedOptions {
  if (options === undefined) return {};
  if (options === null || typeof options !== "object") {
    throw new SafeDOMError("ERR_INVALID_ARGUMENT", "createSafeDocument.options");
  }

  return {
    quotas: readOwnDataProperty(
      options,
      "quotas",
      () => new SafeDOMError("INVALID_QUOTA", "createSafeDocument.options.quotas"),
    ),
    urlPolicy: readOwnDataProperty(
      options,
      "urlPolicy",
      () => new SafeDOMError("ERR_INVALID_POLICY", "createSafeDocument.options.urlPolicy"),
    ),
    stylePolicy: readOwnDataProperty(
      options,
      "stylePolicy",
      () => new SafeDOMError("ERR_INVALID_POLICY", "createSafeDocument.options.stylePolicy"),
    ),
  };
}

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

function resolveQuotas(supplied: Partial<SafeDocumentQuotas> | undefined): SafeDocumentQuotas {
  if (supplied !== undefined && (supplied === null || typeof supplied !== "object")) {
    throw new SafeDOMError("INVALID_QUOTA", "createSafeDocument.options.quotas");
  }

  const resolved: QuotaUsage = { ...DEFAULT_SAFE_DOCUMENT_QUOTAS };
  if (supplied !== undefined) {
    for (const name of QUOTA_NAMES) {
      const value = readOwnDataProperty<number>(
        supplied,
        name,
        () => new SafeDOMError("INVALID_QUOTA", `createSafeDocument.options.quotas.${name}`),
      );
      if (value !== undefined) resolved[name] = value;
    }
  }
  for (const name of QUOTA_NAMES) {
    const value = resolved[name];
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
  readonly ownerRealm: Window & typeof globalThis;
  readonly registry: NodeRegistry;
  readonly urlPolicy: URLPolicyEngine;
  readonly stylePolicy: StylePolicyEngine;
  readonly eventSnapshotter: EventSnapshotter;
  readonly platform: PlatformOps;
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
  ): void;
  setURLAttribute(
    real: Element,
    name: string,
    decide: () => SafeURLDecision,
  ): SafeURLDecision;
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
  view: Window & typeof globalThis;
} {
  try {
    if ((typeof value !== "object" && typeof value !== "function") || value === null) {
      throw new SafeDOMError("INVALID_ROOT", "createSafeDocument.root");
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
      throw new SafeDOMError("INVALID_ROOT", "createSafeDocument.root");
    }

    return { root: value as ShadowRoot, ownerDocument, view };
  } catch {
    throw new SafeDOMError("INVALID_ROOT", "createSafeDocument requires a native ShadowRoot");
  }
}

class DocumentContextImplementation implements DocumentContext {
  readonly root: ShadowRoot;
  readonly ownerDocument: Document;
  readonly ownerRealm: Window & typeof globalThis;
  readonly registry: NodeRegistry;
  readonly platform: PlatformOps;
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
  #disposed = false;
  #disposalComplete = false;

  constructor(
    root: ShadowRoot,
    ownerDocument: Document,
    view: Window & typeof globalThis,
    options?: SafeDocumentOptions,
  ) {
    const normalizedOptions = normalizeOptions(options);
    this.root = root;
    this.ownerDocument = ownerDocument;
    this.ownerRealm = view;
    this.#quotas = resolveQuotas(normalizedOptions.quotas);
    this.platform = createPlatformOps(ownerDocument, view);
    this.registry = new NodeRegistry(ownerDocument, (node) => this.platform.ownerDocument(node));
    this.urlPolicy = createURLPolicy(normalizedOptions.urlPolicy, this.platform.URL);
    this.stylePolicy = createStylePolicy(normalizedOptions.stylePolicy);
    this.eventSnapshotter = createEventSnapshotter(view);
  }

  createElement<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K];
  createElement(tag: string): HTMLElement;
  createElement(tag: string): HTMLElement {
    return this.documentOperation(() => this.platform.createElement(tag));
  }

  createTextNode(value: string): Text {
    return this.documentOperation(() => this.platform.createTextNode(value));
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
  ): void {
    this.nodeOperation(real, () => {
      if (value === undefined) return;
      const entry = this.#requireEntryByReal(real);
      const changes: ResourceChange[] = [{
        resource: "attribute",
        slot: name,
        amount: value === null ? 0 : utf8ByteLength(name) + utf8ByteLength(value),
      }];
      this.#updateResources(entry, changes, () => {
        if (value === null) this.platform.removeAttribute(real, name);
        else this.platform.setAttribute(real, name, value);
      });
    });
  }

  setURLAttribute(
    real: Element,
    name: string,
    decide: () => SafeURLDecision,
  ): SafeURLDecision {
    return this.nodeOperation(real, () => {
      this.#reserve("requestAttempts", 1);
      const decision = decide();
      if (!decision.allowed) return decision;

      const entry = this.#requireEntryByReal(real);
      const value = decision.url;
      this.#updateResources(entry, [
        {
          resource: "attribute",
          slot: name,
          amount: utf8ByteLength(name) + utf8ByteLength(value),
        },
        { resource: "request", slot: name, amount: 1 },
      ], () => this.platform.setAttribute(real, name, value));
      return decision;
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
      } catch (error) {
        this.#usage.styleBytes -= delta;
        if (error instanceof SafeDOMError) throw error;
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
      const controller = this.platform.createAbortController();
      this.#reserve("listeners", 1);
      let active = true;
      const cleanup = (): void => {
        if (!active) return;
        this.platform.abort(controller);
        active = false;
        entry.listeners.delete(cleanup);
        this.#usage.listeners -= 1;
      };
      entry.listeners.add(cleanup);
      try {
        this.platform.addEventListener(
          real,
          eventName,
          listener,
          this.platform.getAbortSignal(controller),
        );
      } catch (error) {
        cleanup();
        if (error instanceof SafeDOMError) throw error;
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
    this.nodeOperation(real, () => this.platform.detach(real));
  }

  disposeNode(real: RealNode): void {
    const entry = this.#requireEntryByReal(real);
    if (this.#disposed) return;
    if (entry.state === "disposed") {
      this.#finalizeTerminalSubtree(entry, "disposed", "always");
      return;
    }
    if (entry.state === "revoked") {
      this.#finalizeTerminalSubtree(entry, "revoked", "none");
      return;
    }
    const compromised = this.#auditPlacements();
    if (compromised.has(entry) || entry.state !== "active") return;

    const subtree = this.registry.entries().filter((candidate) => (
      candidate.state === "active" && this.#isWithin(candidate.real, real)
    ));
    for (const candidate of subtree) candidate.state = "disposed";
    this.#finalizeTerminalSubtree(entry, "disposed", "always");
  }

  disposeDocument(): void {
    if (this.#disposalComplete) return;
    if (!this.#disposed) this.#auditPlacements();
    const trackedEntries = this.registry.entries();
    this.#disposed = true;
    for (const entry of trackedEntries) {
      if (entry.state === "active") entry.state = "disposed";
    }

    let firstFailure: SafeDOMError | undefined;
    for (const entry of trackedEntries) {
      try {
        const state = entry.state === "revoked" ? "revoked" : "disposed";
        this.#finalizeEntry(entry, state, "from-root");
      } catch (error) {
        firstFailure ??= error instanceof SafeDOMError
          ? error
          : new SafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.dispose");
      }
    }

    this.#disposalComplete = this.registry.entries().length === 0;
    if (firstFailure !== undefined) throw firstFailure;
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
    for (const entry of compromised) entry.state = "revoked";
    let firstFailure: SafeDOMError | undefined;
    for (const entry of compromised) {
      try {
        this.#finalizeEntry(entry, "revoked");
      } catch (error) {
        firstFailure ??= error instanceof SafeDOMError
          ? error
          : new SafeDOMError("DOM_OPERATION_FAILED", "SafeElement.revoke");
      }
    }
    if (firstFailure !== undefined) throw firstFailure;
    return compromised;
  }

  #hasSafePlacement(entry: RegistryEntry): boolean {
    if (this.platform.ownerDocument(entry.real) !== this.ownerDocument) return false;
    let current: Node = entry.real;
    for (;;) {
      const parent = this.platform.parentNode(current);
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
      current = this.platform.parentNode(current);
    }
    return false;
  }

  #clearOwnedResources(entry: RegistryEntry): void {
    if (!this.platform.isElement(entry.real)) return;
    for (const name of entry.resources.request.keys()) {
      this.platform.removeAttribute(entry.real, name);
    }
    if (entry.resources.style.size > 0) {
      this.platform.removeAttribute(entry.real, "style");
    }
  }

  #finalizeTerminalSubtree(
    rootEntry: RegistryEntry,
    state: "disposed" | "revoked",
    rootDetach: "none" | "always",
  ): void {
    const pendingDescendants = this.registry.entries().filter((candidate) => (
      candidate !== rootEntry
      && candidate.state === state
      && this.#isWithin(candidate.real, rootEntry.real)
    ));
    let firstFailure: SafeDOMError | undefined;
    for (const candidate of pendingDescendants) {
      try {
        this.#finalizeEntry(candidate, state);
      } catch (error) {
        firstFailure ??= error instanceof SafeDOMError
          ? error
          : new SafeDOMError("DOM_OPERATION_FAILED", `SafeElement.${state}.descendant`);
      }
    }
    try {
      this.#finalizeEntry(rootEntry, state, rootDetach);
    } catch (error) {
      firstFailure ??= error instanceof SafeDOMError
        ? error
        : new SafeDOMError("DOM_OPERATION_FAILED", `SafeElement.${state}`);
    }
    if (firstFailure !== undefined) throw firstFailure;
  }

  #finalizeEntry(
    entry: RegistryEntry,
    state: "disposed" | "revoked",
    detach: "none" | "always" | "from-root" = "none",
  ): void {
    if (entry.accountingReleased) return;
    if (entry.state === "active") entry.state = state;
    else if (entry.state !== state) return;

    // Capability revocation happens before cleanup, but live accounting is
    // retained until every request/style/listener effect is physically gone.
    this.#clearOwnedResources(entry);
    for (const cleanup of [...entry.listeners]) cleanup();
    if (detach !== "none") {
      const parent = this.platform.parentNode(entry.real);
      if (parent !== null && (detach === "always" || parent === this.root)) {
        this.platform.removeChild(parent, entry.real, "Node.remove");
      }
    }
    for (const resource of Object.keys(entry.resources) as AccountedResource[]) {
      const quota = RESOURCE_QUOTA[resource];
      for (const amount of entry.resources[resource].values()) this.#usage[quota] -= amount;
      entry.resources[resource].clear();
    }
    this.#usage.nodes -= 1;
    entry.accountingReleased = true;
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
    } catch (error) {
      for (const [quota, delta] of deltas) this.#usage[quota] -= delta;
      if (error instanceof SafeDOMError) throw error;
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
  const { root, ownerDocument, view } = getNativeRoot(rootCapability);
  if (claimedRoots.has(root)) {
    throw new SafeDOMError(
      "ROOT_ALREADY_CLAIMED",
      "A ShadowRoot can be claimed by only one SafeDocument",
    );
  }

  // Invalid options do not consume the root capability.
  const context = new DocumentContextImplementation(root, ownerDocument, view, options);
  claimedRoots.add(root);
  return context;
}
