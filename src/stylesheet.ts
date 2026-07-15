import type { SafeStyleSheet } from "./types.ts";
import type { DocumentContext } from "./context.ts";
import { hasCssUrl } from "./validation.ts";

export function createSafeStyleSheet(
  context: DocumentContext,
  realStyle: HTMLStyleElement,
): SafeStyleSheet {
  const known = context.registry.getWrapper<SafeStyleSheet>(realStyle);
  if (known) return known;

  const wrapper: SafeStyleSheet = {
    setCSS(value: string): void {
      const css = String(value ?? "");
      if (hasCssUrl(css)) {
        context.nodeOperation(realStyle, () => undefined);
        return;
      }
      context.setStyle(realStyle, "$stylesheet", css, () => { realStyle.textContent = css; });
    },
    getCSS(): string {
      return context.nodeOperation(realStyle, () => realStyle.textContent ?? "");
    },
    detach(): void { context.detachNode(realStyle); },
    remove(): void { context.detachNode(realStyle); },
    dispose(): void { context.disposeNode(realStyle); },
  };

  context.register(wrapper, realStyle);
  try {
    context.root.appendChild(realStyle);
  } catch (error) {
    context.disposeNode(realStyle);
    throw error;
  }
  return wrapper;
}
