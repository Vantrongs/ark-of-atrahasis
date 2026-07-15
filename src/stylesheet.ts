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
      if (hasCssUrl(css)) return;
      realStyle.textContent = css;
    },
    getCSS(): string {
      return realStyle.textContent ?? "";
    },
    remove(): void {
      realStyle.remove();
    },
  };

  context.root.appendChild(realStyle);
  context.registry.register(wrapper, realStyle);
  return wrapper;
}
