import type { SafeTextNode } from "./types.ts";
import { registerPair, unregisterPair } from "./registry.ts";

export function createSafeTextNode(realText: Text): SafeTextNode {
  const wrapper: SafeTextNode = {
    setText(value: string): void {
      realText.textContent = String(value ?? "");
    },
    getText(): string {
      return realText.textContent ?? "";
    },
    remove(): void {
      realText.remove();
      unregisterPair(wrapper, realText);
    },
  };

  registerPair(wrapper, realText);
  return wrapper;
}
