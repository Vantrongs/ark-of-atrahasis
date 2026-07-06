import type { SafeElement, SafeTextNode } from "./types.ts";

type SafeNode = SafeElement | SafeTextNode;
type RealNode = Element | Text;

const wrapperByReal = new WeakMap<RealNode, SafeNode>();
const realByWrapper = new WeakMap<SafeNode, RealNode>();

export function registerPair(wrapper: SafeNode, real: RealNode): void {
  wrapperByReal.set(real, wrapper);
  realByWrapper.set(wrapper, real);
}

export function unregisterPair(wrapper: SafeNode, real: RealNode): void {
  wrapperByReal.delete(real);
  realByWrapper.delete(wrapper);
}

export function getRealNode(wrapper: SafeNode): RealNode | undefined {
  return realByWrapper.get(wrapper);
}

export function getRealElement(wrapper: SafeNode): Element | undefined {
  const real = realByWrapper.get(wrapper);
  if (real instanceof Element) return real;
  return undefined;
}

export function getRealText(wrapper: SafeNode): Text | undefined {
  const real = realByWrapper.get(wrapper);
  if (real instanceof Text) return real;
  return undefined;
}

export function getWrapper(real: RealNode): SafeNode | undefined {
  return wrapperByReal.get(real);
}

export function isKnownWrapper(wrapper: SafeNode): boolean {
  return realByWrapper.has(wrapper);
}
