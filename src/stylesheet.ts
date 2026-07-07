import type { SafeStyleSheet } from "./types.ts";
import { registerPair, unregisterPair } from "./registry.ts";
import { hasCssUrl } from "./validation.ts";

export function createSafeStyleSheet(realStyle: HTMLStyleElement): SafeStyleSheet {
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
      unregisterPair(wrapper, realStyle);
    },
  };

  document.head.appendChild(realStyle);
  registerPair(wrapper, realStyle as unknown as Element);
  return wrapper;
}
