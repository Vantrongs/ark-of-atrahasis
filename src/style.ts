import type { SafeStyle } from "./types.ts";
import type { DocumentContext } from "./context.ts";
import { canonicalizeStyleProperty } from "./style-policy.ts";
import { scanCSSNetworkRisk } from "./validation.ts";

type PlatformFunction = (...arguments_: unknown[]) => unknown;

const apply = Reflect.apply;

function getOwnGetter(prototype: unknown, property: string): PlatformFunction | undefined {
  if ((typeof prototype !== "object" && typeof prototype !== "function") || prototype === null) {
    return undefined;
  }
  try {
    const getter = Object.getOwnPropertyDescriptor(prototype, property)?.get;
    return typeof getter === "function" ? getter as PlatformFunction : undefined;
  } catch {
    return undefined;
  }
}

function getOwnMethod(prototype: unknown, property: string): PlatformFunction | undefined {
  if ((typeof prototype !== "object" && typeof prototype !== "function") || prototype === null) {
    return undefined;
  }
  try {
    const method = Object.getOwnPropertyDescriptor(prototype, property)?.value;
    return typeof method === "function" ? method as PlatformFunction : undefined;
  } catch {
    return undefined;
  }
}

function getRealmConstructorPrototype(realm: unknown, name: string): unknown {
  if ((typeof realm !== "object" && typeof realm !== "function") || realm === null) return undefined;
  try {
    const realmConstructor = (realm as Record<string, unknown>)[name];
    if (typeof realmConstructor !== "function") return undefined;
    return (realmConstructor as { prototype?: unknown }).prototype;
  } catch {
    return undefined;
  }
}

/**
 * An explicit, reflection-coherent style facade. It never exposes cssText,
 * indexed CSSOM members, arbitrary property assignment, or a Proxy surface.
 */
export function createSafeStyle(
  context: DocumentContext,
  realEl: HTMLElement,
): SafeStyle {
  const { stylePolicy: policy } = context;
  let realm: unknown;
  try {
    realm = realEl.ownerDocument?.defaultView;
  } catch {
    realm = undefined;
  }

  const htmlElementPrototype = getRealmConstructorPrototype(realm, "HTMLElement");
  const declarationPrototype = getRealmConstructorPrototype(realm, "CSSStyleDeclaration");
  const styleGetter = getOwnGetter(htmlElementPrototype, "style");
  const getPropertyValue = getOwnMethod(declarationPrototype, "getPropertyValue");
  const getPropertyPriority = getOwnMethod(declarationPrototype, "getPropertyPriority");
  const setProperty = getOwnMethod(declarationPrototype, "setProperty");
  const removeProperty = getOwnMethod(declarationPrototype, "removeProperty");

  let declaration: unknown;
  if (styleGetter !== undefined) {
    try {
      declaration = apply(styleGetter, realEl, []);
    } catch {
      declaration = undefined;
    }
  }

  const readCanonical = (property: string): string | undefined => {
    if (declaration === undefined || getPropertyValue === undefined) return undefined;
    try {
      const value = apply(getPropertyValue, declaration, [property]);
      return typeof value === "string" ? value : undefined;
    } catch {
      return undefined;
    }
  };

  const get = Object.freeze((property: string): string | undefined => {
    return context.nodeOperation(realEl, () => {
      const canonical = canonicalizeStyleProperty(property);
      if (canonical === undefined || !policy.allows(canonical)) return undefined;
      return readCanonical(canonical);
    });
  });

  const set = Object.freeze((property: string, value: string): boolean => {
    const canonical = canonicalizeStyleProperty(property);
    if (
      canonical === undefined ||
      !policy.allows(canonical) ||
      typeof value !== "string" ||
      value.length === 0 ||
      scanCSSNetworkRisk(value).risky ||
      declaration === undefined ||
      getPropertyValue === undefined ||
      setProperty === undefined ||
      removeProperty === undefined
    ) {
      return context.nodeOperation(realEl, () => false);
    }

    return context.setStyle(realEl, canonical, value, () => {
      const previous = readCanonical(canonical);
      let previousPriority = "";
      if (getPropertyPriority !== undefined) {
        try {
          const result = apply(getPropertyPriority, declaration, [canonical]);
          if (typeof result === "string") previousPriority = result;
        } catch {
          return false;
        }
      }

      try {
        apply(setProperty, declaration, [canonical, value, ""]);
        const serialized = readCanonical(canonical);
        if (serialized !== undefined && serialized.length > 0) return true;
      } catch {
        // The original declaration is restored below.
      }

      // CSSOM silently ignores malformed values. Restore the prior declaration
      // so a rejected operation cannot accidentally clear trusted state.
      try {
        if (previous !== undefined && previous.length > 0) {
          apply(setProperty, declaration, [canonical, previous, previousPriority]);
        } else {
          apply(removeProperty, declaration, [canonical]);
        }
      } catch {
        // A platform/custom exception is intentionally discarded.
      }
      return false;
    });
  });

  const remove = Object.freeze((property: string): boolean => {
    const canonical = canonicalizeStyleProperty(property);
    if (
      canonical === undefined ||
      !policy.allows(canonical) ||
      declaration === undefined ||
      removeProperty === undefined
    ) {
      return context.nodeOperation(realEl, () => false);
    }
    return context.setStyle(realEl, canonical, "", () => {
      try {
        apply(removeProperty, declaration, [canonical]);
        return true;
      } catch {
        return false;
      }
    });
  });

  return Object.freeze({ get, set, remove });
}
