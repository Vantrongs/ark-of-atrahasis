import { createSafeDOMError, isSafeDOMError } from "./errors.ts";
import type { PlatformOps } from "./platform.ts";
import type { NodeRegistry, RegistryEntry } from "./registry.ts";
import type { SafeElement } from "./types.ts";

export type IdentifierReferenceKind = "single" | "list";

export type NamespaceQuotaName =
  | "identifierMappings"
  | "identifierReferences"
  | "identifierBytes";

export interface NamespaceQuotaDelta {
  readonly name: NamespaceQuotaName;
  readonly amount: number;
}

export interface PreparedNamespaceMutation {
  readonly attributeName: string;
  readonly physicalValue: string | null;
  readonly reserveTokens: readonly string[];
  readonly failureQuotaReservations: readonly NamespaceQuotaDelta[];
  readonly quotaDeltas: readonly NamespaceQuotaDelta[];
  commit(): void;
}

export interface NamespaceRelease {
  readonly quotaDeltas: readonly NamespaceQuotaDelta[];
}

export interface EventTargetResolution {
  readonly owned: boolean;
  readonly localId: string;
}

export interface IdentifierNamespace {
  prepareId(entry: RegistryEntry, local: string): PreparedNamespaceMutation;
  readId(entry: RegistryEntry): string;
  prepareName(entry: RegistryEntry, local: string): PreparedNamespaceMutation;
  prepareReference(
    entry: RegistryEntry,
    attributeName: string,
    local: string,
    kind: IdentifierReferenceKind,
  ): PreparedNamespaceMutation;
  readReference(entry: RegistryEntry, attributeName: string): string | undefined;
  lookup(localId: string): SafeElement | null;
  resolveEventTarget(value: unknown): EventTargetResolution;
  recordFailedMutation(entry: RegistryEntry, prepared: PreparedNamespaceMutation): void;
  clearPhysicalEffects(entry: RegistryEntry): void;
  releaseEntry(entry: RegistryEntry): NamespaceRelease;
  assertEmpty(): void;
}

interface IdRecord {
  readonly local: string;
  readonly physical: string;
  target: RegistryEntry | null;
  references: number;
  readonly localBytes: number;
}

interface NameRecord {
  readonly local: string;
  readonly physical: string;
  users: number;
  readonly localBytes: number;
}

interface ReferenceSlot {
  readonly localValue: string;
  readonly physicalValue: string;
  readonly records: readonly IdRecord[];
}

const TOKEN_BYTES = 24;
const TOKEN_ATTEMPTS = 8;
export const MAX_IDREF_TOKENS_PER_ATTRIBUTE = 256;
const ASCII_WHITESPACE = /[\t\n\f\r ]/;
const ASCII_WHITESPACE_RUN = /[\t\n\f\r ]+/;

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

function quotaDeltas(
  mappings: number,
  references: number,
  bytes: number,
): readonly NamespaceQuotaDelta[] {
  return [
    { name: "identifierMappings", amount: mappings },
    { name: "identifierReferences", amount: references },
    { name: "identifierBytes", amount: bytes },
  ];
}

function increment<RecordType>(map: Map<RecordType, number>, record: RecordType): void {
  map.set(record, (map.get(record) ?? 0) + 1);
}

class IdentifierNamespaceImplementation implements IdentifierNamespace {
  readonly #root: ShadowRoot;
  readonly #registry: NodeRegistry;
  readonly #platform: PlatformOps;
  readonly #idByLocal = new Map<string, IdRecord>();
  readonly #idByEntry = new WeakMap<RegistryEntry, IdRecord>();
  readonly #referenceSlotsByEntry = new Map<RegistryEntry, Map<string, ReferenceSlot>>();
  readonly #nameByLocal = new Map<string, NameRecord>();
  readonly #nameByEntry = new WeakMap<RegistryEntry, NameRecord>();
  readonly #entriesWithNamespaceState = new Set<RegistryEntry>();
  readonly #usedPhysicalTokens = new Set<string>();
  readonly #pendingPhysicalByEntry = new Map<RegistryEntry, {
    readonly attributes: Set<string>;
    readonly reservedTokens: Set<string>;
    mappings: number;
    references: number;
    bytes: number;
  }>();

  constructor(root: ShadowRoot, registry: NodeRegistry, platform: PlatformOps) {
    this.#root = root;
    this.#registry = registry;
    this.#platform = platform;
  }

  prepareId(entry: RegistryEntry, local: string): PreparedNamespaceMutation {
    const previous = this.#idByEntry.get(entry);
    if (previous?.local === local) {
      return {
        attributeName: "id",
        physicalValue: previous.physical,
        reserveTokens: [],
        failureQuotaReservations: quotaDeltas(0, 0, 0),
        quotaDeltas: quotaDeltas(0, 0, 0),
        commit: () => undefined,
      };
    }

    let next = local === "" ? undefined : this.#idByLocal.get(local);
    let created = false;
    if (next !== undefined && next.target !== null && next.target !== entry) {
      throw createSafeDOMError("DUPLICATE_IDENTIFIER", "SafeElement.setId.value");
    }
    if (local !== "" && next === undefined) {
      next = {
        local,
        physical: this.#createToken("aoa-i-", new Set()),
        target: null,
        references: 0,
        localBytes: utf8ByteLength(local),
      };
      created = true;
    }

    const removesPrevious = previous !== undefined && previous.references === 0;
    const mappingDelta = (created ? 1 : 0) - (removesPrevious ? 1 : 0);
    const byteDelta = (created ? next?.localBytes ?? 0 : 0)
      - (removesPrevious ? previous?.localBytes ?? 0 : 0);
    const preparedNext = next;
    return {
      attributeName: "id",
      physicalValue: preparedNext?.physical ?? null,
      reserveTokens: created && preparedNext !== undefined ? [preparedNext.physical] : [],
      failureQuotaReservations: quotaDeltas(
        created ? 1 : 0,
        0,
        created ? preparedNext?.localBytes ?? 0 : 0,
      ),
      quotaDeltas: quotaDeltas(mappingDelta, 0, byteDelta),
      commit: () => {
        if (created && preparedNext !== undefined) this.#installIdRecord(preparedNext);
        if (previous !== undefined) {
          this.#idByEntry.delete(entry);
          previous.target = null;
          this.#collectIdRecord(previous);
        }
        if (preparedNext !== undefined) {
          preparedNext.target = entry;
          this.#idByEntry.set(entry, preparedNext);
          this.#entriesWithNamespaceState.add(entry);
        } else {
          this.#refreshEntryTracking(entry);
        }
      },
    };
  }

  readId(entry: RegistryEntry): string {
    return this.#idByEntry.get(entry)?.local ?? "";
  }

  prepareName(entry: RegistryEntry, local: string): PreparedNamespaceMutation {
    const previous = this.#nameByEntry.get(entry);
    if (previous?.local === local) {
      return {
        attributeName: "name",
        physicalValue: previous.physical,
        reserveTokens: [],
        failureQuotaReservations: quotaDeltas(0, 0, 0),
        quotaDeltas: quotaDeltas(0, 0, 0),
        commit: () => undefined,
      };
    }

    let next = local === "" ? undefined : this.#nameByLocal.get(local);
    let created = false;
    if (local !== "" && next === undefined) {
      next = {
        local,
        physical: this.#createToken("aoa-n-", new Set()),
        users: 0,
        localBytes: utf8ByteLength(local),
      };
      created = true;
    }

    const removesPrevious = previous?.users === 1;
    const mappingDelta = (created ? 1 : 0) - (removesPrevious ? 1 : 0);
    const byteDelta = (created ? next?.localBytes ?? 0 : 0)
      - (removesPrevious ? previous?.localBytes ?? 0 : 0);
    const preparedNext = next;
    return {
      attributeName: "name",
      physicalValue: preparedNext?.physical ?? null,
      reserveTokens: created && preparedNext !== undefined ? [preparedNext.physical] : [],
      failureQuotaReservations: quotaDeltas(
        created ? 1 : 0,
        0,
        created ? preparedNext?.localBytes ?? 0 : 0,
      ),
      quotaDeltas: quotaDeltas(mappingDelta, 0, byteDelta),
      commit: () => {
        if (created && preparedNext !== undefined) this.#installNameRecord(preparedNext);
        if (previous !== undefined) {
          this.#nameByEntry.delete(entry);
          previous.users -= 1;
          this.#collectNameRecord(previous);
        }
        if (preparedNext !== undefined) {
          preparedNext.users += 1;
          this.#nameByEntry.set(entry, preparedNext);
          this.#entriesWithNamespaceState.add(entry);
        } else {
          this.#refreshEntryTracking(entry);
        }
      },
    };
  }

  prepareReference(
    entry: RegistryEntry,
    attributeName: string,
    local: string,
    kind: IdentifierReferenceKind,
  ): PreparedNamespaceMutation {
    const localTokens = kind === "single"
      ? (local === "" ? [] : [local])
      : local.split(ASCII_WHITESPACE_RUN).filter((token) => token !== "");
    if (localTokens.length > MAX_IDREF_TOKENS_PER_ATTRIBUTE) {
      throw createSafeDOMError("QUOTA_EXCEEDED", "IdentifierNamespace.referenceTokens");
    }

    const previousSlots = this.#referenceSlotsByEntry.get(entry);
    const previous = previousSlots?.get(attributeName);
    const previousCounts = new Map<IdRecord, number>();
    for (const record of previous?.records ?? []) increment(previousCounts, record);

    const pendingByLocal = new Map<string, IdRecord>();
    const pendingTokens = new Set<string>();
    const createdRecords: IdRecord[] = [];
    const nextRecords: IdRecord[] = [];
    for (const token of localTokens) {
      let record = this.#idByLocal.get(token) ?? pendingByLocal.get(token);
      if (record === undefined) {
        record = {
          local: token,
          physical: this.#createToken("aoa-i-", pendingTokens),
          target: null,
          references: 0,
          localBytes: utf8ByteLength(token),
        };
        pendingByLocal.set(token, record);
        pendingTokens.add(record.physical);
        createdRecords.push(record);
      }
      nextRecords.push(record);
    }

    const nextCounts = new Map<IdRecord, number>();
    for (const record of nextRecords) increment(nextCounts, record);
    const collectedRecords: IdRecord[] = [];
    for (const [record, removed] of previousCounts) {
      const projected = record.references - removed + (nextCounts.get(record) ?? 0);
      if (projected === 0 && record.target === null) collectedRecords.push(record);
    }

    let createdBytes = 0;
    for (const record of createdRecords) createdBytes += record.localBytes;
    let collectedBytes = 0;
    for (const record of collectedRecords) collectedBytes += record.localBytes;
    const canonicalLocal = localTokens.join(" ");
    const physicalValue = nextRecords.map((record) => record.physical).join(" ");
    const nextSlot: ReferenceSlot = {
      localValue: canonicalLocal,
      physicalValue,
      records: nextRecords,
    };
    const preparedSlots = previousSlots ?? new Map<string, ReferenceSlot>();

    return {
      attributeName,
      physicalValue,
      reserveTokens: createdRecords.map((record) => record.physical),
      failureQuotaReservations: quotaDeltas(
        createdRecords.length,
        nextRecords.length,
        createdBytes,
      ),
      quotaDeltas: quotaDeltas(
        createdRecords.length - collectedRecords.length,
        nextRecords.length - (previous?.records.length ?? 0),
        createdBytes - collectedBytes,
      ),
      commit: () => {
        for (const record of createdRecords) this.#installIdRecord(record);
        for (const record of previous?.records ?? []) record.references -= 1;
        for (const record of nextRecords) record.references += 1;
        preparedSlots.set(attributeName, nextSlot);
        if (previousSlots === undefined) this.#referenceSlotsByEntry.set(entry, preparedSlots);
        for (const record of collectedRecords) this.#collectIdRecord(record);
        this.#entriesWithNamespaceState.add(entry);
      },
    };
  }

  readReference(entry: RegistryEntry, attributeName: string): string | undefined {
    return this.#referenceSlotsByEntry.get(entry)?.get(attributeName)?.localValue;
  }

  lookup(localId: string): SafeElement | null {
    if (localId === "" || ASCII_WHITESPACE.test(localId)) return null;
    const record = this.#idByLocal.get(localId);
    if (record === undefined) return null;
    const target = record.target;
    if (target === null || target.state !== "active") return null;
    const found = this.#platform.getElementById(this.#root, record.physical);
    if (found !== target.real) return null;
    const wrapper = this.#registry.getWrapper<SafeElement>(found);
    return wrapper === target.wrapper ? wrapper : null;
  }

  resolveEventTarget(value: unknown): EventTargetResolution {
    if ((typeof value !== "object" && typeof value !== "function") || value === null) {
      return { owned: false, localId: "" };
    }
    const entry = this.#registry.getEntryByReal(value as Element);
    if (entry?.state !== "active" || !this.#platform.isElement(entry.real)) {
      return { owned: false, localId: "" };
    }
    return { owned: true, localId: this.#idByEntry.get(entry)?.local ?? "" };
  }

  recordFailedMutation(entry: RegistryEntry, prepared: PreparedNamespaceMutation): void {
    let pending = this.#pendingPhysicalByEntry.get(entry);
    if (pending === undefined) {
      pending = {
        attributes: new Set(),
        reservedTokens: new Set(),
        mappings: 0,
        references: 0,
        bytes: 0,
      };
      this.#pendingPhysicalByEntry.set(entry, pending);
    }
    pending.attributes.add(prepared.attributeName);
    for (const token of prepared.reserveTokens) {
      pending.reservedTokens.add(token);
      this.#usedPhysicalTokens.add(token);
    }
    for (const reservation of prepared.failureQuotaReservations) {
      if (reservation.name === "identifierMappings") pending.mappings += reservation.amount;
      else if (reservation.name === "identifierReferences") pending.references += reservation.amount;
      else pending.bytes += reservation.amount;
    }
    this.#entriesWithNamespaceState.add(entry);
  }

  clearPhysicalEffects(entry: RegistryEntry): void {
    if (!this.#platform.isElement(entry.real)) return;
    const names: string[] = [];
    if (this.#idByEntry.has(entry)) names.push("id");
    if (this.#nameByEntry.has(entry)) names.push("name");
    for (const name of this.#referenceSlotsByEntry.get(entry)?.keys() ?? []) names.push(name);
    for (const name of this.#pendingPhysicalByEntry.get(entry)?.attributes ?? []) names.push(name);

    let firstFailure: unknown;
    for (const name of names) {
      try {
        this.#platform.removeAttribute(entry.real, name);
      } catch (error) {
        firstFailure ??= error;
      }
    }
    if (firstFailure !== undefined) {
      throw isSafeDOMError(firstFailure)
        ? firstFailure
        : createSafeDOMError("DOM_OPERATION_FAILED", "IdentifierNamespace.clearPhysicalEffects");
    }
  }

  releaseEntry(entry: RegistryEntry): NamespaceRelease {
    if (!this.#entriesWithNamespaceState.delete(entry)) {
      return { quotaDeltas: quotaDeltas(0, 0, 0) };
    }

    const pending = this.#pendingPhysicalByEntry.get(entry);
    let mappings = -(pending?.mappings ?? 0);
    let references = -(pending?.references ?? 0);
    let bytes = -(pending?.bytes ?? 0);
    if (pending !== undefined) {
      for (const token of pending.reservedTokens) this.#usedPhysicalTokens.delete(token);
      this.#pendingPhysicalByEntry.delete(entry);
    }
    const id = this.#idByEntry.get(entry);
    if (id !== undefined) {
      this.#idByEntry.delete(entry);
      id.target = null;
    }
    const name = this.#nameByEntry.get(entry);
    if (name !== undefined) {
      this.#nameByEntry.delete(entry);
      name.users -= 1;
      if (this.#collectNameRecord(name)) {
        mappings -= 1;
        bytes -= name.localBytes;
      }
    }
    const slots = this.#referenceSlotsByEntry.get(entry);
    const affected = new Set<IdRecord>();
    if (slots !== undefined) {
      for (const slot of slots.values()) {
        references -= slot.records.length;
        for (const record of slot.records) {
          record.references -= 1;
          affected.add(record);
        }
      }
      this.#referenceSlotsByEntry.delete(entry);
    }
    if (id !== undefined) affected.add(id);
    for (const record of affected) {
      if (this.#collectIdRecord(record)) {
        mappings -= 1;
        bytes -= record.localBytes;
      }
    }
    return { quotaDeltas: quotaDeltas(mappings, references, bytes) };
  }

  assertEmpty(): void {
    if (
      this.#idByLocal.size !== 0
      || this.#nameByLocal.size !== 0
      || this.#referenceSlotsByEntry.size !== 0
      || this.#pendingPhysicalByEntry.size !== 0
      || this.#entriesWithNamespaceState.size !== 0
      || this.#usedPhysicalTokens.size !== 0
    ) {
      throw createSafeDOMError("DOM_OPERATION_FAILED", "IdentifierNamespace.assertEmpty");
    }
  }

  #createToken(prefix: "aoa-i-" | "aoa-n-", pending: ReadonlySet<string>): string {
    for (let attempt = 0; attempt < TOKEN_ATTEMPTS; attempt += 1) {
      const token = `${prefix}${this.#platform.randomHex(TOKEN_BYTES)}`;
      if (!this.#usedPhysicalTokens.has(token) && !pending.has(token)) return token;
    }
    throw createSafeDOMError("DOM_OPERATION_FAILED", "IdentifierNamespace.token");
  }

  #installIdRecord(record: IdRecord): void {
    this.#idByLocal.set(record.local, record);
    this.#usedPhysicalTokens.add(record.physical);
  }

  #installNameRecord(record: NameRecord): void {
    this.#nameByLocal.set(record.local, record);
    this.#usedPhysicalTokens.add(record.physical);
  }

  #collectIdRecord(record: IdRecord): boolean {
    if (record.target !== null || record.references !== 0) return false;
    this.#idByLocal.delete(record.local);
    this.#usedPhysicalTokens.delete(record.physical);
    return true;
  }

  #collectNameRecord(record: NameRecord): boolean {
    if (record.users !== 0) return false;
    this.#nameByLocal.delete(record.local);
    this.#usedPhysicalTokens.delete(record.physical);
    return true;
  }

  #refreshEntryTracking(entry: RegistryEntry): void {
    if (
      this.#idByEntry.has(entry)
      || this.#nameByEntry.has(entry)
      || this.#referenceSlotsByEntry.has(entry)
    ) {
      this.#entriesWithNamespaceState.add(entry);
    } else {
      this.#entriesWithNamespaceState.delete(entry);
    }
  }
}

export function createIdentifierNamespace(
  root: ShadowRoot,
  registry: NodeRegistry,
  platform: PlatformOps,
): IdentifierNamespace {
  return new IdentifierNamespaceImplementation(root, registry, platform);
}
