import type { SafeTextNode } from "./types.ts";
import type { DocumentContext } from "./context.ts";

export function createSafeTextNode(context: DocumentContext, realText: Text): SafeTextNode {
  const known = context.registry.getWrapper<SafeTextNode>(realText);
  if (known) return known;

  const wrapper: SafeTextNode = {
    setText(value: string): void {
      realText.textContent = String(value ?? "");
    },
    getText(): string {
      return realText.textContent ?? "";
    },
    remove(): void {
      realText.remove();
    },
  };

  context.registry.register(wrapper, realText);
  return wrapper;
}
