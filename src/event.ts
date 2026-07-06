import type { SafeEvent, SafeElement } from "./types.ts";

function getTargetProp(target: EventTarget | null, prop: string): unknown {
  if (target === null || !(prop in target)) return undefined;
  return (target as unknown as Record<string, unknown>)[prop];
}

function assertPrimitiveInput(input: unknown): asserts input is string | number | boolean {
  if (typeof input !== "string" && typeof input !== "number" && typeof input !== "boolean") {
    throw new Error("Invalid input: expected string, number, or boolean");
  }
}

export function createSafeEvent(nativeEvent: Event, _wrapper: SafeElement): SafeEvent {
  return Object.freeze({
    type: nativeEvent.type,
    ctrlKey: (nativeEvent as KeyboardEvent).ctrlKey ?? false,
    altKey: (nativeEvent as KeyboardEvent).altKey ?? false,
    shiftKey: (nativeEvent as KeyboardEvent).shiftKey ?? false,
    metaKey: (nativeEvent as KeyboardEvent).metaKey ?? false,
    target: {
      id: String(getTargetProp(nativeEvent.target, "id") ?? ""),
      get value() {
        return getTargetProp(nativeEvent.target, "value");
      },
      set value(input: unknown) {
        assertPrimitiveInput(input);
        if (nativeEvent.target !== null && "value" in nativeEvent.target) {
          (nativeEvent.target as HTMLInputElement).value = String(input);
        }
      },
    },
    currentTarget: {
      id: String(getTargetProp(nativeEvent.currentTarget, "id") ?? ""),
      get value() {
        return getTargetProp(nativeEvent.currentTarget, "value");
      },
      set value(input: unknown) {
        assertPrimitiveInput(input);
        if (nativeEvent.currentTarget !== null && "value" in nativeEvent.currentTarget) {
          (nativeEvent.currentTarget as HTMLInputElement).value = String(input);
        }
      },
    },
    preventDefault: () => nativeEvent.preventDefault(),
    stopPropagation: () => nativeEvent.stopPropagation(),
    stopImmediatePropagation: () => nativeEvent.stopImmediatePropagation(),
  });
}
