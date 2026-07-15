import { createSafeDOMError, isSafeDOMError, type SafeDOMError } from "./errors.ts";
import {
  createEventSnapshotter,
  ROOT_BUBBLE_FENCE_EVENT_TYPES,
  TARGET_FENCE_EVENT_TYPES,
  type EventSnapshotter,
} from "./event.ts";
import {
  createIdentifierNamespace,
  type IdentifierNamespace,
  type IdentifierReferenceKind,
  type NamespaceQuotaDelta,
  type PreparedNamespaceMutation,
} from "./identifier-namespace.ts";
import {
  NodeRegistry,
  type AccountedResource,
  type PendingPhysicalEffect,
  type RealNode,
  type RegistryEntry,
  type SafeNode,
} from "./registry.ts";
import type {
  Hardener,
  SafeDocumentOptions,
  SafeDocumentQuotas,
  SafeDocumentRateLimit,
  SafeDocumentRates,
  SafeElement,
} from "./types.ts";
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
import type { SpecializedElementKind } from "./vocabularies.ts";
import { utf8ByteLength } from "./utf8.ts";

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
  identifierMappings: 4_096,
  identifierReferences: 8_192,
  identifierBytes: 256_000,
});

export const DEFAULT_SAFE_DOCUMENT_RATES: Readonly<SafeDocumentRates> = Object.freeze({
  operations: Object.freeze({ limit: 10_000, windowMs: 1_000 }),
  requestAttempts: Object.freeze({ limit: 32, windowMs: 1_000 }),
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
  "identifierMappings",
  "identifierReferences",
  "identifierBytes",
] as const;

const RATE_NAMES = ["operations", "requestAttempts"] as const;
type RateName = (typeof RATE_NAMES)[number];

interface RateWindowState {
  count: number;
  failed: boolean;
  lastObservedAt?: number;
  startedAt?: number;
}

interface NormalizedOptions {
  readonly harden: Hardener;
  readonly quotas?: Partial<SafeDocumentQuotas>;
  readonly rates?: Partial<SafeDocumentRates>;
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

type OwnDataProperty<Value> =
  | { readonly present: false }
  | { readonly present: true; readonly value: Value };

function readOwnDataPropertyEntry<Value>(
  record: object,
  property: PropertyKey,
  error: () => SafeDOMError,
): OwnDataProperty<Value> {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, property);
    if (descriptor === undefined) return { present: false };
    if (!("value" in descriptor)) throw error();
    return { present: true, value: descriptor.value };
  } catch {
    throw error();
  }
}

function normalizeOptions(options: SafeDocumentOptions | undefined): NormalizedOptions {
  if (options === null || typeof options !== "object") throw invalidHardener();

  const harden = readOwnDataProperty<Hardener>(options, "harden", invalidHardener);
  if (typeof harden !== "function") throw invalidHardener();

  const rates = readOwnDataPropertyEntry<Partial<SafeDocumentRates> | undefined>(
    options,
    "rates",
    () => createSafeDOMError("INVALID_RATE", "createSafeDocument.options.rates"),
  );
  if (rates.present && rates.value === undefined) {
    throw createSafeDOMError("INVALID_RATE", "createSafeDocument.options.rates");
  }

  completeWithHardener(harden, { nested: { method: (): boolean => true } });

  return {
    harden,
    quotas: readOwnDataProperty(
      options,
      "quotas",
      () => createSafeDOMError("INVALID_QUOTA", "createSafeDocument.options.quotas"),
    ),
    rates: rates.present ? rates.value : undefined,
    urlPolicy: readOwnDataProperty(
      options,
      "urlPolicy",
      () => createSafeDOMError("ERR_INVALID_POLICY", "createSafeDocument.options.urlPolicy"),
    ),
    stylePolicy: readOwnDataProperty(
      options,
      "stylePolicy",
      () => createSafeDOMError("ERR_INVALID_POLICY", "createSafeDocument.options.stylePolicy"),
    ),
  };
}

function invalidHardener(): SafeDOMError {
  return createSafeDOMError("ERR_INVALID_HARDENER", "createSafeDocument.options.harden");
}

function isDeeplyFrozen(root: unknown): boolean {
  const pending: unknown[] = [root];
  const visited = new WeakSet<object>();

  try {
    while (pending.length > 0) {
      const value = pending.pop();
      if ((typeof value !== "object" && typeof value !== "function") || value === null) {
        continue;
      }
      if (visited.has(value)) continue;
      if (!Object.isFrozen(value)) return false;

      visited.add(value);
      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
        if ("value" in descriptor) pending.push(descriptor.value);
        else pending.push(descriptor.get, descriptor.set);
      }
    }
    return true;
  } catch {
    return false;
  }
}

function completeWithHardener<Value>(harden: Hardener, value: Value): Value {
  try {
    const completed = harden(value);
    if (!Object.is(completed, value) || !isDeeplyFrozen(value)) throw invalidHardener();
    return completed;
  } catch {
    // A bad/stateful hardener never gets to choose the thrown boundary value.
    throw invalidHardener();
  }
}

function resolveQuotas(supplied: Partial<SafeDocumentQuotas> | undefined): SafeDocumentQuotas {
  if (supplied !== undefined && (supplied === null || typeof supplied !== "object")) {
    throw createSafeDOMError("INVALID_QUOTA", "createSafeDocument.options.quotas");
  }

  const resolved: QuotaUsage = { ...DEFAULT_SAFE_DOCUMENT_QUOTAS };
  if (supplied !== undefined) {
    for (const name of QUOTA_NAMES) {
      const value = readOwnDataProperty<number>(
        supplied,
        name,
        () => createSafeDOMError("INVALID_QUOTA", `createSafeDocument.options.quotas.${name}`),
      );
      if (value !== undefined) resolved[name] = value;
    }
  }
  for (const name of QUOTA_NAMES) {
    const value = resolved[name];
    if (!Number.isSafeInteger(value) || value < 0) {
      throw createSafeDOMError(
        "INVALID_QUOTA",
        `Quota ${name} must be a non-negative safe integer`,
      );
    }
  }
  return resolved;
}

function invalidRate(operation: string): SafeDOMError {
  return createSafeDOMError("INVALID_RATE", operation);
}

function resolveRateLimit(value: unknown, name: RateName): SafeDocumentRateLimit {
  const operation = `createSafeDocument.options.rates.${name}`;
  if (value === null || typeof value !== "object") throw invalidRate(operation);
  const limit = readOwnDataProperty<number>(value, "limit", () => invalidRate(`${operation}.limit`));
  const windowMs = readOwnDataProperty<number>(
    value,
    "windowMs",
    () => invalidRate(`${operation}.windowMs`),
  );
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 0) {
    throw invalidRate(`${operation}.limit`);
  }
  if (typeof windowMs !== "number" || !Number.isSafeInteger(windowMs) || windowMs <= 0) {
    throw invalidRate(`${operation}.windowMs`);
  }
  return Object.freeze({ limit, windowMs });
}

function resolveRates(supplied: Partial<SafeDocumentRates> | undefined): SafeDocumentRates {
  if (supplied !== undefined && (supplied === null || typeof supplied !== "object")) {
    throw invalidRate("createSafeDocument.options.rates");
  }
  const resolved = { ...DEFAULT_SAFE_DOCUMENT_RATES };
  if (supplied !== undefined) {
    for (const name of RATE_NAMES) {
      const entry = readOwnDataPropertyEntry<unknown>(
        supplied,
        name,
        () => invalidRate(`createSafeDocument.options.rates.${name}`),
      );
      if (entry.present) resolved[name] = resolveRateLimit(entry.value, name);
    }
  }
  return Object.freeze(resolved);
}

export type StyleMutationResult =
  | { readonly status: "committed" }
  | {
      readonly status: "rejected";
      readonly rollbackProven: true;
    }
  | {
      readonly status: "rejected";
      readonly rollbackProven: false;
      readonly observedValue?: string;
      readonly retryRollback: () => boolean;
    };

export interface DocumentContext {
  readonly root: ShadowRoot;
  readonly ownerDocument: Document;
  readonly ownerRealm: Window & typeof globalThis;
  readonly registry: NodeRegistry;
  readonly urlPolicy: URLPolicyEngine;
  readonly stylePolicy: StylePolicyEngine;
  readonly eventSnapshotter: EventSnapshotter;
  readonly platform: PlatformOps;
  complete<Value>(value: Value): Value;
  complete<Node extends SafeNode>(
    value: Node,
    real: RealNode,
    specializedKind?: SpecializedElementKind,
  ): Node;
  completeInitialized<Node extends SafeElement>(
    value: Node,
    real: Element,
    specializedKind: SpecializedElementKind,
    attributes: readonly InitialAttribute[],
    initialize: () => void,
  ): Node;
  createElement<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K];
  createElement(tag: string): HTMLElement;
  createTextNode(value: string): Text;
  documentOperation<T>(action: () => T): T;
  nodeOperation<T>(real: RealNode, action: () => T): T;
  requireRealNode(wrapper: SafeNode): RealNode;
  setText(real: RealNode, slot: string, value: string, action: () => void): void;
  updateContentResources(
    real: Element,
    prepare: () => ContentResourceTransaction,
  ): void;
  setAttribute(
    real: Element,
    name: string,
    value: string | null | undefined,
    validate?: () => void,
  ): void;
  setLocalId(real: Element, local: string): void;
  getLocalId(real: Element): string;
  setLocalName(real: Element, local: string): void;
  setLocalIdReference(
    real: Element,
    attributeName: string,
    local: string,
    kind: IdentifierReferenceKind,
  ): void;
  getLocalIdReference(real: Element, attributeName: string): string | undefined;
  lookupLocalId(local: string, specializedKind?: SpecializedElementKind): SafeElement | null;
  setReflectedIDL(real: Element, name: string, value: string | null, action: () => void): void;
  setIDL<Value extends string | number | boolean>(
    real: Element,
    value: Value,
    read: () => Value,
    write: (next: Value) => void,
    validate?: () => void,
  ): void;
  setURLAttribute(
    real: Element,
    name: string,
    decide: () => SafeURLDecision,
  ): SafeURLDecision;
  setStyle(
    real: Element,
    property: string,
    value: string,
    action: () => StyleMutationResult,
  ): boolean;
  addEventListener(
    real: Element,
    eventName: string,
    listener: (event: Event) => void,
  ): () => void;
  canDispatch(real: Element): boolean;
  detachNode(real: RealNode): void;
  disposeNode(real: RealNode): void;
  disposeDocument(): void;
  abandonInitialization(): void;
}

export interface InitialAttribute {
  readonly name: string;
  readonly value: string;
}

function getNativeRoot(value: unknown): {
  root: ShadowRoot;
  ownerDocument: Document;
  view: Window & typeof globalThis;
} {
  try {
    if ((typeof value !== "object" && typeof value !== "function") || value === null) {
      throw createSafeDOMError("INVALID_ROOT", "createSafeDocument.root");
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
      throw createSafeDOMError("INVALID_ROOT", "createSafeDocument.root");
    }

    return { root: value as ShadowRoot, ownerDocument, view };
  } catch {
    throw createSafeDOMError("INVALID_ROOT", "createSafeDocument requires a native ShadowRoot");
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
  readonly #identifierNamespace: IdentifierNamespace;
  readonly #harden: Hardener;
  readonly #quotas: SafeDocumentQuotas;
  readonly #rates: SafeDocumentRates;
  readonly #rateWindows: Record<RateName, RateWindowState> = {
    operations: { count: 0, failed: false },
    requestAttempts: { count: 0, failed: false },
  };
  readonly #rootBoundaryController: AbortController;
  #rootBoundaryDisposed = false;
  readonly #usage: QuotaUsage = {
    nodes: 0,
    listeners: 0,
    operations: 0,
    textBytes: 0,
    attributeBytes: 0,
    styleBytes: 0,
    requests: 0,
    requestAttempts: 0,
    identifierMappings: 0,
    identifierReferences: 0,
    identifierBytes: 0,
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
    this.#harden = normalizedOptions.harden;
    this.root = root;
    this.ownerDocument = ownerDocument;
    this.ownerRealm = view;
    this.#quotas = resolveQuotas(normalizedOptions.quotas);
    this.#rates = resolveRates(normalizedOptions.rates);
    this.platform = createPlatformOps(ownerDocument, view);
    this.platform.assertPaintContainedRoot(root);
    this.registry = new NodeRegistry(ownerDocument, (node) => this.platform.ownerDocument(node));
    this.#identifierNamespace = createIdentifierNamespace(root, this.registry, this.platform);
    this.urlPolicy = createURLPolicy(normalizedOptions.urlPolicy, this.platform.URL);
    this.stylePolicy = createStylePolicy(normalizedOptions.stylePolicy);
    this.eventSnapshotter = createEventSnapshotter(
      view,
      <Value>(value: Value): Value => this.complete(value),
      (target) => this.#identifierNamespace.resolveEventTarget(target),
    );
    this.#rootBoundaryController = this.#installRootBoundary();
  }

  complete<Value>(value: Value): Value;
  complete<Node extends SafeNode>(
    value: Node,
    real: RealNode,
    specializedKind?: SpecializedElementKind,
  ): Node;
  complete<Value>(value: Value, real?: RealNode, specializedKind?: SpecializedElementKind): Value {
    const completed = completeWithHardener(this.#harden, value);
    if (real !== undefined) this.#register(completed as SafeNode, real, specializedKind);
    return completed;
  }

  completeInitialized<Node extends SafeElement>(
    value: Node,
    real: Element,
    specializedKind: SpecializedElementKind,
    attributes: readonly InitialAttribute[],
    initialize: () => void,
  ): Node {
    const completed = completeWithHardener(this.#harden, value);
    this.#registerInitialized(completed, real, specializedKind, attributes, initialize);
    return completed;
  }

  createElement<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K];
  createElement(tag: string): HTMLElement;
  createElement(tag: string): HTMLElement {
    return this.documentOperation(() => this.platform.createElement(tag));
  }

  createTextNode(value: string): Text {
    return this.documentOperation(() => this.platform.createTextNode(value));
  }

  #register(wrapper: SafeNode, real: RealNode, specializedKind?: SpecializedElementKind): void {
    this.#assertDocumentActive();
    this.#reserve("nodes", 1);
    let boundaryCleanup: (() => void) | undefined;
    try {
      if (this.platform.isElement(real)) {
        boundaryCleanup = this.#installTargetBoundary(real);
      }
      const entry = this.registry.register(wrapper, real, specializedKind);
      if (boundaryCleanup !== undefined) entry.listeners.add(boundaryCleanup);
    } catch (error) {
      try {
        boundaryCleanup?.();
      } catch {
        // Preserve the authoritative registration failure for the discarded node.
      }
      this.#usage.nodes -= 1;
      throw error;
    }
  }

  #registerInitialized(
    wrapper: SafeNode,
    real: Element,
    specializedKind: SpecializedElementKind,
    attributes: readonly InitialAttribute[],
    initialize: () => void,
  ): void {
    this.#assertDocumentActive();
    const resources = new Map<string, number>();
    for (const { name, value } of attributes) {
      resources.set(name, utf8ByteLength(name) + utf8ByteLength(value));
    }
    let attributeBytes = 0;
    for (const amount of resources.values()) attributeBytes += amount;

    let nodesReserved = false;
    let attributesReserved = false;
    let boundaryCleanup: (() => void) | undefined;
    try {
      this.#reserve("nodes", 1);
      nodesReserved = true;
      this.#reserve("attributeBytes", attributeBytes);
      attributesReserved = true;
      initialize();
      boundaryCleanup = this.#installTargetBoundary(real);
      const entry = this.registry.register(wrapper, real, specializedKind);
      entry.listeners.add(boundaryCleanup);
      for (const [name, amount] of resources) entry.resources.attribute.set(name, amount);
    } catch (error) {
      try {
        boundaryCleanup?.();
      } catch {
        // Preserve the authoritative initialization failure for the discarded node.
      }
      if (attributesReserved) this.#usage.attributeBytes -= attributeBytes;
      if (nodesReserved) this.#usage.nodes -= 1;
      for (const name of resources.keys()) {
        try {
          this.platform.removeAttribute(real, name);
        } catch {
          // The unregistered node is discarded even if best-effort cleanup fails.
        }
      }
      if (isSafeDOMError(error)) throw error;
      throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.initializeElement");
    }
  }

  documentOperation<T>(action: () => T): T {
    this.#assertDocumentActive();
    this.#auditPlacements();
    this.#reserveCall("operations");
    return action();
  }

  nodeOperation<T>(real: RealNode, action: () => T): T {
    this.#assertDocumentActive();
    const entry = this.#requireEntryByReal(real);
    const compromised = this.#auditPlacements();
    if (compromised.has(entry)) {
      throw createSafeDOMError(
        "PLACEMENT_VIOLATION",
        "The owned node was placed outside its SafeDocument mount and has been revoked",
      );
    }
    this.#assertEntryActive(entry);
    this.#reserveCall("operations");
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
      this.#updateResources(entry, [{
        resource: "text",
        slot,
        value,
        amount: utf8ByteLength(value),
      }], action);
    });
  }

  updateContentResources(
    real: Element,
    prepare: () => ContentResourceTransaction,
  ): void {
    this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);
      const { changes, action } = prepare();
      this.#updateResources(entry, changes.map((change): ResourceChange => ({
        resource: change.resource,
        slot: change.slot,
        value: change.value,
        amount: change.value === null
          ? 0
          : utf8ByteLength(change.value)
            + (change.resource === "attribute" ? utf8ByteLength(change.slot) : 0),
      })), action);
    });
  }

  setAttribute(
    real: Element,
    name: string,
    value: string | null | undefined,
    validate?: () => void,
  ): void {
    this.nodeOperation(real, () => {
      if (value === undefined) return;
      const entry = this.#requireEntryByReal(real);
      const changes: ResourceChange[] = [{
        resource: "attribute",
        slot: name,
        value: value ?? null,
        amount: value === null ? 0 : utf8ByteLength(name) + utf8ByteLength(value),
      }];
      this.#updateResources(entry, changes, () => {
        validate?.();
        if (value === null) this.platform.removeAttribute(real, name);
        else this.platform.setAttribute(real, name, value);
      });
    });
  }

  setLocalId(real: Element, local: string): void {
    this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);
      this.#commitNamespaceMutation(entry, this.#identifierNamespace.prepareId(entry, local));
    });
  }

  getLocalId(real: Element): string {
    return this.nodeOperation(real, () => {
      return this.#identifierNamespace.readId(this.#requireEntryByReal(real));
    });
  }

  setLocalName(real: Element, local: string): void {
    this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);
      this.#commitNamespaceMutation(entry, this.#identifierNamespace.prepareName(entry, local));
    });
  }

  setLocalIdReference(
    real: Element,
    attributeName: string,
    local: string,
    kind: IdentifierReferenceKind,
  ): void {
    this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);
      this.#commitNamespaceMutation(
        entry,
        this.#identifierNamespace.prepareReference(entry, attributeName, local, kind),
      );
    });
  }

  getLocalIdReference(real: Element, attributeName: string): string | undefined {
    return this.nodeOperation(real, () => {
      return this.#identifierNamespace.readReference(
        this.#requireEntryByReal(real),
        attributeName,
      );
    });
  }

  lookupLocalId(local: string, specializedKind?: SpecializedElementKind): SafeElement | null {
    return this.documentOperation(() => this.#identifierNamespace.lookup(local, specializedKind));
  }

  setReflectedIDL(real: Element, name: string, value: string | null, action: () => void): void {
    this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);
      this.#updateResources(entry, [{
        resource: "attribute",
        slot: name,
        value,
        amount: value === null ? 0 : utf8ByteLength(name) + utf8ByteLength(value),
      }], action);
    });
  }

  setIDL<Value extends string | number | boolean>(
    real: Element,
    value: Value,
    read: () => Value,
    write: (next: Value) => void,
    validate?: () => void,
  ): void {
    this.nodeOperation(real, () => {
      validate?.();
      const entry = this.#requireEntryByReal(real);
      const previous = read();
      const restorePrevious = (): boolean => {
        try {
          if (Object.is(read(), previous)) return true;
        } catch {
          // A failed read cannot prove that no restoration write is needed.
        }
        try {
          write(previous);
        } catch {
          // Readback below decides whether the throwing restoration took effect.
        }
        try {
          return Object.is(read(), previous);
        } catch {
          return false;
        }
      };
      try {
        write(value);
      } catch (mutationError) {
        if (!restorePrevious()) {
          const pending: PendingPhysicalEffect = {
            cleanup: (): void => {
              if (!restorePrevious()) {
                throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.idlRollback");
              }
            },
          };
          entry.pendingEffects.add(pending);
          entry.state = "revoked";
          throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.idlRollback");
        }
        if (isSafeDOMError(mutationError)) throw mutationError;
        throw createSafeDOMError("DOM_OPERATION_FAILED", "The DOM mutation could not be completed");
      }
    });
  }

  setURLAttribute(
    real: Element,
    name: string,
    decide: () => SafeURLDecision,
  ): SafeURLDecision {
    return this.nodeOperation(real, () => {
      this.#reserveCall("requestAttempts");
      const decision = this.complete(decide());
      if (!decision.allowed) return decision;

      const entry = this.#requireEntryByReal(real);
      const value = decision.url;
      this.#updateResources(entry, [
        {
          resource: "attribute",
          slot: name,
          value,
          amount: utf8ByteLength(name) + utf8ByteLength(value),
        },
        { resource: "request", slot: name, value, amount: 1 },
      ], () => this.platform.setAttribute(real, name, value));
      return decision;
    });
  }

  setStyle(
    real: Element,
    property: string,
    value: string,
    action: () => StyleMutationResult,
  ): boolean {
    return this.nodeOperation(real, () => {
      const entry = this.#requireEntryByReal(real);
      const amount = utf8ByteLength(value);
      const previous = entry.resources.style.get(property) ?? 0;
      const delta = amount - previous;
      if (delta > 0 && this.#usage.styleBytes + delta > this.#quotas.styleBytes) {
        throw createSafeDOMError("QUOTA_EXCEEDED", "SafeDocument quota exceeded: styleBytes");
      }
      this.#usage.styleBytes += delta;

      let result: StyleMutationResult;
      try {
        result = action();
      } catch {
        this.#usage.styleBytes -= delta;
        throw createSafeDOMError(
          "DOM_OPERATION_FAILED",
          "The style transaction could not be completed",
        );
      }
      if (result.status === "rejected" && result.rollbackProven) {
        this.#usage.styleBytes -= delta;
        return false;
      }

      if (result.status === "rejected") {
        this.#usage.styleBytes -= delta;
        const observedAmount = result.observedValue === undefined
          ? 0
          : utf8ByteLength(result.observedValue);
        const retainedAmount = Math.max(previous, amount, observedAmount);
        this.#usage.styleBytes += retainedAmount - previous;
        if (retainedAmount === 0) entry.resources.style.delete(property);
        else entry.resources.style.set(property, retainedAmount);
        const pending: PendingPhysicalEffect = {
          cleanup: (): void => {
            if (!result.retryRollback()) {
              throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.styleRollback");
            }
            const retainedAmount = entry.resources.style.get(property) ?? 0;
            this.#usage.styleBytes += previous - retainedAmount;
            if (previous === 0) entry.resources.style.delete(property);
            else entry.resources.style.set(property, previous);
          },
        };
        entry.pendingEffects.add(pending);
        entry.state = "revoked";
        return false;
      }

      if (amount === 0) entry.resources.style.delete(property);
      else entry.resources.style.set(property, amount);
      entry.styleCleanupRequired = entry.resources.style.size > 0;
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
        if (isSafeDOMError(error)) throw error;
        throw createSafeDOMError(
          "DOM_OPERATION_FAILED",
          "The event listener could not be installed",
        );
      }
      try {
        return this.complete(cleanup);
      } catch (error) {
        cleanup();
        throw error;
      }
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
      const detach = this.#isWithin(entry.real, this.root) ? "always" : "none";
      this.#finalizeTerminalSubtree(entry, "revoked", detach);
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
    try {
      this.#disposeRootBoundary();
    } catch (error) {
      firstFailure = isSafeDOMError(error)
        ? error
        : createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.dispose.eventBoundary");
    }
    for (const entry of trackedEntries) {
      try {
        const state = entry.state === "revoked" ? "revoked" : "disposed";
        this.#finalizeEntry(entry, state, "from-root");
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.dispose");
      }
    }

    if (this.registry.entries().length === 0 && this.#rootBoundaryDisposed) {
      try {
        this.#identifierNamespace.assertEmpty();
        this.#disposalComplete = true;
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.dispose.namespace");
      }
    }
    if (firstFailure !== undefined) throw firstFailure;
  }

  abandonInitialization(): void {
    try {
      this.disposeDocument();
    } catch {
      // Preserve the original initialization error after best-effort cleanup.
    } finally {
      claimedRoots.delete(this.root);
    }
  }

  #assertDocumentActive(): void {
    if (this.#disposed) {
      throw createSafeDOMError("DOCUMENT_DISPOSED", "The SafeDocument has been disposed");
    }
  }

  #requireEntryByReal(real: RealNode): RegistryEntry {
    const entry = this.registry.getEntryByReal(real);
    if (!entry) {
      throw createSafeDOMError("CROSS_OWNER", "The node is not owned by this SafeDocument");
    }
    return entry;
  }

  #assertEntryActive(entry: RegistryEntry): void {
    if (entry.state === "disposed") {
      throw createSafeDOMError("NODE_DISPOSED", "The node wrapper has been disposed");
    }
    if (entry.state === "revoked") {
      throw createSafeDOMError("NODE_REVOKED", "The node wrapper has been revoked");
    }
  }

  #reserve(name: keyof SafeDocumentQuotas, amount: number): void {
    const next = this.#usage[name] + amount;
    if (next > this.#quotas[name]) {
      throw createSafeDOMError("QUOTA_EXCEEDED", `SafeDocument quota exceeded: ${name}`);
    }
    this.#usage[name] = next;
  }

  #reserveCall(name: RateName): void {
    this.#reserveRate(name);
    this.#reserve(name, 1);
  }

  #reserveRate(name: RateName): void {
    const state = this.#rateWindows[name];
    if (state.failed) {
      throw createSafeDOMError(
        "RATE_LIMIT_EXCEEDED",
        `SafeDocument rate clock failed: ${name}`,
      );
    }

    let now: number;
    try {
      now = this.platform.monotonicNow();
    } catch {
      state.failed = true;
      throw createSafeDOMError(
        "RATE_LIMIT_EXCEEDED",
        `SafeDocument rate clock failed: ${name}`,
      );
    }
    if (state.lastObservedAt !== undefined && now < state.lastObservedAt) {
      state.failed = true;
      throw createSafeDOMError(
        "RATE_LIMIT_EXCEEDED",
        `SafeDocument rate clock failed: ${name}`,
      );
    }
    state.lastObservedAt = now;

    const rate = this.#rates[name];
    if (state.startedAt === undefined || now - state.startedAt >= rate.windowMs) {
      state.startedAt = now;
      state.count = 0;
    }
    if (state.count >= rate.limit) {
      throw createSafeDOMError(
        "RATE_LIMIT_EXCEEDED",
        `SafeDocument rate exceeded: ${name}`,
      );
    }
    state.count += 1;
  }

  #installRootBoundary(): AbortController {
    const controller = this.platform.createAbortController();
    const signal = this.platform.getAbortSignal(controller);
    const stopAtRoot = (event: Event): void => {
      this.platform.stopEventPropagation(event);
    };
    try {
      for (const eventName of ROOT_BUBBLE_FENCE_EVENT_TYPES) {
        this.platform.addEventListener(this.root, eventName, stopAtRoot, signal);
      }
      return controller;
    } catch (error) {
      try {
        this.platform.abort(controller);
      } catch {
        // The original normalized installation error remains authoritative.
      }
      if (isSafeDOMError(error)) throw error;
      throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.eventBoundary");
    }
  }

  #installTargetBoundary(real: Element): () => void {
    const controller = this.platform.createAbortController();
    const signal = this.platform.getAbortSignal(controller);
    const stopAtTarget = (event: Event): void => {
      this.platform.stopEventPropagation(event);
    };
    try {
      for (const eventName of TARGET_FENCE_EVENT_TYPES) {
        this.platform.addEventListener(real, eventName, stopAtTarget, signal);
      }
    } catch (error) {
      try {
        this.platform.abort(controller);
      } catch {
        // The original normalized installation error remains authoritative.
      }
      if (isSafeDOMError(error)) throw error;
      throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeElement.eventBoundary");
    }

    let active = true;
    return (): void => {
      if (!active) return;
      this.platform.abort(controller);
      active = false;
    };
  }

  #disposeRootBoundary(): void {
    if (this.#rootBoundaryDisposed) return;
    this.platform.abort(this.#rootBoundaryController);
    this.#rootBoundaryDisposed = true;
  }

  #commitNamespaceMutation(
    entry: RegistryEntry,
    prepared: PreparedNamespaceMutation,
  ): void {
    if (!this.platform.isElement(entry.real)) {
      throw createSafeDOMError("DOM_OPERATION_FAILED", "IdentifierNamespace.element");
    }
    const real = entry.real;
    const attributeAmount = prepared.physicalValue === null
      ? 0
      : utf8ByteLength(prepared.attributeName) + utf8ByteLength(prepared.physicalValue);
    const previousAmount = entry.resources.attribute.get(prepared.attributeName) ?? 0;
    const aggregate = new Map<keyof SafeDocumentQuotas, number>();
    aggregate.set("attributeBytes", attributeAmount - previousAmount);
    for (const delta of prepared.quotaDeltas) {
      aggregate.set(delta.name, (aggregate.get(delta.name) ?? 0) + delta.amount);
    }
    for (const [name, delta] of aggregate) {
      if (delta > 0 && this.#usage[name] + delta > this.#quotas[name]) {
        throw createSafeDOMError("QUOTA_EXCEEDED", `SafeDocument quota exceeded: ${name}`);
      }
    }

    const previousPhysical = this.platform.getAttribute(real, prepared.attributeName);
    for (const [name, delta] of aggregate) this.#usage[name] += delta;
    try {
      if (prepared.physicalValue === null) {
        this.platform.removeAttribute(real, prepared.attributeName);
      } else {
        this.platform.setAttribute(real, prepared.attributeName, prepared.physicalValue);
      }
    } catch (mutationError) {
      let restoreFailed = false;
      try {
        if (previousPhysical === null) this.platform.removeAttribute(real, prepared.attributeName);
        else this.platform.setAttribute(real, prepared.attributeName, previousPhysical);
      } catch {
        restoreFailed = true;
      }
      for (const [name, delta] of aggregate) this.#usage[name] -= delta;
      if (restoreFailed) {
        let retainedAttributeAmount = Math.max(previousAmount, attributeAmount);
        try {
          const observed = this.platform.getAttribute(real, prepared.attributeName);
          retainedAttributeAmount = observed === null
            ? 0
            : utf8ByteLength(prepared.attributeName) + utf8ByteLength(observed);
        } catch {
          // The exact physical state is unavailable. Retain the larger known
          // amount until terminal cleanup confirms the attribute is absent.
        }
        this.#usage.attributeBytes += retainedAttributeAmount - previousAmount;
        if (retainedAttributeAmount === 0) {
          entry.resources.attribute.delete(prepared.attributeName);
        } else {
          entry.resources.attribute.set(prepared.attributeName, retainedAttributeAmount);
        }
        this.#identifierNamespace.recordFailedMutation(entry, prepared);
        for (const reservation of prepared.failureQuotaReservations) {
          this.#usage[reservation.name] += reservation.amount;
        }
        entry.state = "revoked";
        throw createSafeDOMError("DOM_OPERATION_FAILED", "IdentifierNamespace.rollback");
      }
      if (isSafeDOMError(mutationError)) throw mutationError;
      throw createSafeDOMError("DOM_OPERATION_FAILED", "IdentifierNamespace.mutation");
    }

    prepared.commit();
    if (attributeAmount === 0) entry.resources.attribute.delete(prepared.attributeName);
    else entry.resources.attribute.set(prepared.attributeName, attributeAmount);
  }

  #applyNamespaceDeltas(deltas: readonly NamespaceQuotaDelta[]): void {
    for (const delta of deltas) {
      if (this.#usage[delta.name] + delta.amount < 0) {
        throw createSafeDOMError("DOM_OPERATION_FAILED", "IdentifierNamespace.accounting");
      }
    }
    for (const delta of deltas) this.#usage[delta.name] += delta.amount;
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
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", "SafeElement.revoke");
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

  #isWithin(candidate: RealNode, ancestor: Node): boolean {
    let current: Node | null = candidate;
    while (current !== null) {
      if (current === ancestor) return true;
      current = this.platform.parentNode(current);
    }
    return false;
  }

  #clearOwnedResources(entry: RegistryEntry): void {
    let firstFailure: SafeDOMError | undefined;
    for (const pending of [...entry.pendingEffects]) {
      try {
        pending.cleanup();
        entry.pendingEffects.delete(pending);
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", "SafeElement.clearPendingEffect");
      }
    }
    if (!this.platform.isElement(entry.real)) {
      if (firstFailure !== undefined) throw firstFailure;
      return;
    }
    try {
      this.#identifierNamespace.clearPhysicalEffects(entry);
    } catch (error) {
      firstFailure ??= isSafeDOMError(error)
        ? error
        : createSafeDOMError("DOM_OPERATION_FAILED", "IdentifierNamespace.clear");
    }
    for (const name of entry.resources.request.keys()) {
      try {
        this.platform.removeAttribute(entry.real, name);
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", "SafeElement.clearRequest");
      }
    }
    if (entry.styleCleanupRequired) {
      try {
        this.platform.removeAttribute(entry.real, "style");
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", "SafeElement.clearStyle");
      }
    }
    if (firstFailure !== undefined) throw firstFailure;
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
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", `SafeElement.${state}.descendant`);
      }
    }
    try {
      this.#finalizeEntry(rootEntry, state, rootDetach);
    } catch (error) {
      firstFailure ??= isSafeDOMError(error)
        ? error
        : createSafeDOMError("DOM_OPERATION_FAILED", `SafeElement.${state}`);
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
    let firstFailure: SafeDOMError | undefined;
    try {
      this.#clearOwnedResources(entry);
    } catch (error) {
      firstFailure ??= isSafeDOMError(error)
        ? error
        : createSafeDOMError("DOM_OPERATION_FAILED", `SafeElement.${state}.resources`);
    }
    for (const cleanup of [...entry.listeners]) {
      try {
        cleanup();
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", `SafeElement.${state}.listener`);
      }
    }
    if (detach !== "none") {
      try {
        const parent = this.platform.parentNode(entry.real);
        if (parent !== null && (detach === "always" || parent === this.root)) {
          this.platform.removeChild(parent, entry.real, "Node.remove");
        }
      } catch (error) {
        firstFailure ??= isSafeDOMError(error)
          ? error
          : createSafeDOMError("DOM_OPERATION_FAILED", `SafeElement.${state}.detach`);
      }
    }
    if (firstFailure !== undefined) throw firstFailure;
    this.#applyNamespaceDeltas(this.#identifierNamespace.releaseEntry(entry).quotaDeltas);
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
    const slots = this.#snapshotMutationSlots(entry, changes);
    const previousChanges = changes.map((change): ResourceChange => ({
      ...change,
      amount: entry.resources[change.resource].get(change.slot) ?? 0,
    }));
    const deltas = this.#resourceDeltas(entry, changes);

    for (const [quota, delta] of deltas) {
      if (delta > 0 && this.#usage[quota] + delta > this.#quotas[quota]) {
        throw createSafeDOMError("QUOTA_EXCEEDED", `SafeDocument quota exceeded: ${quota}`);
      }
    }
    for (const [quota, delta] of deltas) this.#usage[quota] += delta;

    try {
      action();
    } catch (error) {
      const restored = this.#restoreMutationSlots(slots);
      for (const [quota, delta] of deltas) this.#usage[quota] -= delta;
      if (!restored) {
        const retained = this.#observeRetainedChanges(entry, changes, slots);
        for (const [quota, delta] of this.#resourceDeltas(entry, retained)) {
          this.#usage[quota] += delta;
        }
        this.#recordResourceChanges(entry, retained);
        const pending: PendingPhysicalEffect = {
          cleanup: (): void => {
            if (!this.#restoreMutationSlots(slots)) {
              throw createSafeDOMError(
                "DOM_OPERATION_FAILED",
                "SafeDocument.resourceRollback",
              );
            }
            for (const [quota, delta] of this.#resourceDeltas(entry, previousChanges)) {
              this.#usage[quota] += delta;
            }
            this.#recordResourceChanges(entry, previousChanges);
          },
        };
        entry.pendingEffects.add(pending);
        entry.state = "revoked";
        throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.resourceRollback");
      }
      if (isSafeDOMError(error)) throw error;
      throw createSafeDOMError(
        "DOM_OPERATION_FAILED",
        "The DOM mutation could not be completed",
      );
    }

    this.#recordResourceChanges(entry, changes);
  }

  #resourceDeltas(
    entry: RegistryEntry,
    changes: readonly ResourceChange[],
  ): Map<ResourceQuota, number> {
    const deltas = new Map<ResourceQuota, number>();
    for (const change of changes) {
      const previous = entry.resources[change.resource].get(change.slot) ?? 0;
      const quota = RESOURCE_QUOTA[change.resource];
      deltas.set(quota, (deltas.get(quota) ?? 0) + change.amount - previous);
    }
    return deltas;
  }

  #recordResourceChanges(entry: RegistryEntry, changes: readonly ResourceChange[]): void {
    for (const change of changes) {
      if (change.amount === 0) entry.resources[change.resource].delete(change.slot);
      else entry.resources[change.resource].set(change.slot, change.amount);
    }
  }

  #snapshotMutationSlots(
    entry: RegistryEntry,
    changes: readonly ResourceChange[],
  ): readonly MutationSlot[] {
    const slots = new Map<string, MutationSlot>();
    for (const change of changes) {
      const kind = change.resource === "text" ? "text" : "attribute";
      const key = `${kind}:${change.slot}`;
      if (slots.has(key)) continue;
      const access = this.#physicalSlotAccess(entry, kind, change.slot);
      slots.set(key, {
        key,
        kind,
        slot: change.slot,
        attempted: change.value,
        previous: access.read(),
        read: access.read,
        write: access.write,
      });
    }
    return [...slots.values()];
  }

  #physicalSlotAccess(
    entry: RegistryEntry,
    kind: "attribute" | "text",
    slot: string,
  ): Pick<MutationSlot, "read" | "write"> {
    if (kind === "attribute") {
      if (!this.platform.isElement(entry.real)) {
        throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.attributeSlot");
      }
      const element = entry.real;
      return {
        read: () => this.platform.getAttribute(element, slot),
        write: (value) => {
          if (value === null) this.platform.removeAttribute(element, slot);
          else this.platform.setAttribute(element, slot, value);
        },
      };
    }

    if (slot === "textContent" || slot === "data") {
      return {
        read: () => this.platform.getTextContent(entry.real),
        write: (value) => this.platform.setTextContent(entry.real, value ?? ""),
      };
    }
    if (slot === "value" && entry.specializedKind === "input") {
      const element = entry.real as HTMLInputElement;
      return {
        read: () => this.platform.getInputValue(element),
        write: (value) => this.platform.setInputValue(element, value ?? ""),
      };
    }
    if (slot === "value" && entry.specializedKind === "textarea") {
      const element = entry.real as HTMLTextAreaElement;
      return {
        read: () => this.platform.getTextareaValue(element),
        write: (value) => this.platform.setTextareaValue(element, value ?? ""),
      };
    }
    if (slot === "value" && entry.specializedKind === "select") {
      const element = entry.real as HTMLSelectElement;
      return {
        read: () => this.platform.getSelectValue(element),
        write: (value) => this.platform.setSelectValue(element, value ?? ""),
      };
    }
    throw createSafeDOMError("DOM_OPERATION_FAILED", "SafeDocument.textSlot");
  }

  #restoreMutationSlots(slots: readonly MutationSlot[]): boolean {
    for (const slot of slots) {
      try {
        if (slot.read() === slot.previous) continue;
      } catch {
        // A failed read cannot prove that no restoration write is needed.
      }
      try {
        slot.write(slot.previous);
      } catch {
        // Readback below decides whether a throwing restoration took effect.
      }
    }
    let restored = true;
    for (const slot of slots) {
      try {
        if (slot.read() !== slot.previous) restored = false;
      } catch {
        restored = false;
      }
    }
    return restored;
  }

  #observeRetainedChanges(
    entry: RegistryEntry,
    changes: readonly ResourceChange[],
    slots: readonly MutationSlot[],
  ): readonly ResourceChange[] {
    const byKey = new Map(slots.map((slot) => [slot.key, slot]));
    return changes.map((change): ResourceChange => {
      const kind = change.resource === "text" ? "text" : "attribute";
      const physical = byKey.get(`${kind}:${change.slot}`);
      const previousAmount = entry.resources[change.resource].get(change.slot) ?? 0;
      if (physical === undefined) {
        return { ...change, amount: Math.max(previousAmount, change.amount) };
      }
      try {
        const observed = physical.read();
        const amount = change.resource === "request"
          ? observed === null ? 0 : 1
          : observed === null
            ? 0
            : utf8ByteLength(observed)
              + (change.resource === "attribute" ? utf8ByteLength(change.slot) : 0);
        return { ...change, value: observed, amount };
      } catch {
        return { ...change, amount: Math.max(previousAmount, change.amount) };
      }
    });
  }
}

interface ResourceChange {
  readonly resource: AccountedResource;
  readonly slot: string;
  readonly value: string | null;
  readonly amount: number;
}

interface MutationSlot {
  readonly key: string;
  readonly kind: "attribute" | "text";
  readonly slot: string;
  readonly attempted: string | null;
  readonly previous: string | null;
  readonly read: () => string | null;
  readonly write: (value: string | null) => void;
}

export interface ContentResourceChange {
  readonly resource: "attribute" | "text";
  readonly slot: string;
  readonly value: string | null;
}

export interface ContentResourceTransaction {
  readonly changes: readonly ContentResourceChange[];
  readonly action: () => void;
}

export function createDocumentContext(
  rootCapability: unknown,
  options?: SafeDocumentOptions,
): DocumentContext {
  const { root, ownerDocument, view } = getNativeRoot(rootCapability);
  if (claimedRoots.has(root)) {
    throw createSafeDOMError(
      "ROOT_ALREADY_CLAIMED",
      "A ShadowRoot can be claimed by only one SafeDocument",
    );
  }

  // Invalid options do not consume the root capability.
  const context = new DocumentContextImplementation(root, ownerDocument, view, options);
  claimedRoots.add(root);
  return context;
}
