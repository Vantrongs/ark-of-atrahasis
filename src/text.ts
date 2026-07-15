import type { SafeTextNode } from "./types.ts";
import type { DocumentContext } from "./context.ts";

export function createSafeTextNode(context: DocumentContext, realText: Text): SafeTextNode {
  const known = context.registry.getWrapper<SafeTextNode>(realText);
  if (known) return known;

  const wrapper: SafeTextNode = {
    setText(value: string): void {
      const text = String(value ?? "");
      context.setText(realText, "data", text, () => {
        context.platform.setTextContent(realText, text);
      });
    },
    getText(): string {
      return context.nodeOperation(
        realText,
        () => context.platform.getTextContent(realText) ?? "",
      );
    },
    detach(): void { context.detachNode(realText); },
    remove(): void { context.detachNode(realText); },
    dispose(): void { context.disposeNode(realText); },
  };

  context.register(wrapper, realText);
  return wrapper;
}
