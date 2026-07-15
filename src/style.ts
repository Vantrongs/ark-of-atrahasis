import type { SafeStyle } from "./types.ts";
import type { DocumentContext, StyleMutationResult } from "./context.ts";
import { canonicalizeStyleProperty } from "./style-policy.ts";
import { scanCSSNetworkRisk } from "./validation.ts";
import { requireString } from "./attribute-contract.ts";

type PlatformFunction = (...arguments_: unknown[]) => unknown;

interface StyleState {
  readonly value: string;
  readonly priority: string;
  readonly attributeValue: string | null;
}

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
  const realm: unknown = context.ownerRealm;

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

  const readCanonicalState = (property: string): StyleState | undefined => {
    if (declaration === undefined || getPropertyValue === undefined) return undefined;
    try {
      const value = apply(getPropertyValue, declaration, [property]);
      if (typeof value !== "string") return undefined;
      let priority = "";
      if (getPropertyPriority !== undefined) {
        const result = apply(getPropertyPriority, declaration, [property]);
        if (typeof result !== "string") return undefined;
        priority = result;
      }
      return { value, priority, attributeValue: context.platform.getAttribute(realEl, "style") };
    } catch {
      return undefined;
    }
  };

  const readCanonical = (property: string): string | undefined => {
    return readCanonicalState(property)?.value;
  };

  const mutate = (
    property: string,
    action: () => void,
    committed: (state: StyleState) => boolean,
  ): StyleMutationResult => {
    if (declaration === undefined || setProperty === undefined || removeProperty === undefined) {
      return { status: "rejected", rollbackProven: true };
    }
    const previous = readCanonicalState(property);
    if (previous === undefined) return { status: "rejected", rollbackProven: true };

    const restorePrevious = (): boolean => {
      const current = readCanonicalState(property);
      if (
        current === undefined
        || current.value !== previous.value
        || current.priority !== previous.priority
      ) {
        try {
          if (previous.value.length > 0) {
            apply(setProperty, declaration, [property, previous.value, previous.priority]);
          } else {
            apply(removeProperty, declaration, [property]);
          }
        } catch {
          // Readback below decides whether a throwing restoration took effect.
        }
      }
      if (previous.attributeValue === null) {
        try {
          if (context.platform.getAttribute(realEl, "style") === "") {
            context.platform.removeAttribute(realEl, "style");
          }
        } catch {
          // Readback below keeps an empty wrapper-created attribute unproven.
        }
      }
      const observed = readCanonicalState(property);
      if (
        observed === undefined
        || observed.value !== previous.value
        || observed.priority !== previous.priority
      ) {
        return false;
      }
      return previous.attributeValue !== null || observed.attributeValue !== "";
    };

    let mutationThrew = false;
    try {
      action();
    } catch {
      mutationThrew = true;
    }
    const next = readCanonicalState(property);
    if (!mutationThrew && next !== undefined && committed(next)) return { status: "committed" };

    const rollbackProven = restorePrevious();
    const observed = readCanonicalState(property);
    if (rollbackProven) return { status: "rejected", rollbackProven: true };
    return {
      status: "rejected",
      rollbackProven: false,
      ...(observed === undefined ? {} : { observedValue: observed.value }),
      retryRollback: restorePrevious,
    };
  };

  const get = (property: string): string | undefined => {
    const primitiveProperty = requireString(property, "SafeStyle.get.property");
    return context.nodeOperation(realEl, () => {
      const canonical = canonicalizeStyleProperty(primitiveProperty);
      if (canonical === undefined || !policy.allows(canonical)) return undefined;
      return readCanonical(canonical);
    });
  };

  const set = (property: string, value: string): boolean => {
    const primitiveProperty = requireString(property, "SafeStyle.set.property");
    const primitiveValue = requireString(value, "SafeStyle.set.value");
    const canonical = canonicalizeStyleProperty(primitiveProperty);
    if (
      canonical === undefined ||
      !policy.allows(canonical) ||
      primitiveValue.length === 0 ||
      scanCSSNetworkRisk(primitiveValue).risky ||
      declaration === undefined ||
      getPropertyValue === undefined ||
      setProperty === undefined ||
      removeProperty === undefined
    ) {
      return context.nodeOperation(realEl, () => false);
    }

    return context.setStyle(realEl, canonical, primitiveValue, () => {
      return mutate(canonical, () => {
        apply(setProperty, declaration, [canonical, primitiveValue, ""]);
      }, (state) => state.value.length > 0);
    });
  };

  const remove = (property: string): boolean => {
    const primitiveProperty = requireString(property, "SafeStyle.remove.property");
    const canonical = canonicalizeStyleProperty(primitiveProperty);
    if (
      canonical === undefined ||
      !policy.allows(canonical) ||
      declaration === undefined ||
      setProperty === undefined ||
      removeProperty === undefined
    ) {
      return context.nodeOperation(realEl, () => false);
    }
    return context.setStyle(realEl, canonical, "", () => {
      return mutate(canonical, () => {
        apply(removeProperty, declaration, [canonical]);
      }, (state) => state.value.length === 0);
    });
  };

  return { get, set, remove };
}
