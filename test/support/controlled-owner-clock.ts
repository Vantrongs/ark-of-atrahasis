import { createContainedRoot } from "./contained-root.ts";

export interface ControlledOwnerClock {
  readonly documentValue: Document;
  readonly root: ShadowRoot;
  readonly set: (value: number) => void;
  readonly restore: () => void;
}

/** Replace one isolated iframe realm's clock before the runtime captures it. */
export function createControlledOwnerClock(initial = 0): ControlledOwnerClock {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  const documentValue = iframe.contentDocument;
  const view = iframe.contentWindow;
  if (documentValue === null || view === null) throw new Error("expected iframe owner realm");
  const prototype: object = Object.getPrototypeOf(view.performance);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "now");
  if (descriptor === undefined) throw new Error("expected owner-realm Performance.now");
  let now = initial;
  Object.defineProperty(prototype, "now", {
    ...descriptor,
    value: () => now,
  });
  return {
    documentValue,
    root: createContainedRoot(documentValue),
    set(value) { now = value; },
    restore() {
      Object.defineProperty(prototype, "now", descriptor);
      iframe.remove();
    },
  };
}
