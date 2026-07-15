import type {
  SafeElement,
  SafeTextNode,
  SafeInputElement,
  SafeTextareaElement,
  SafeSelectElement,
  SafeOptionElement,
  SafeButtonElement,
  SafeLabelElement,
  SafeFieldsetElement,
  SafeImageElement,
  SafeAnchorElement,
  SafeVideoElement,
  SafeAudioElement,
  SafeSourceElement,
  SafeCanvasElement,
  SafeTableCellElement,
  SafeDetailsElement,
  SafeDialogElement,
  SafeProgressElement,
  SafeMeterElement,
  SafeListElement,
  SafeDescriptionListElement,
  SafeEvent,
  SafeEventKind,
  SafeInputEvent,
  EventHandler,
  EventCleanup,
} from "./types.ts";
import { registerPair, unregisterPair, getRealNode } from "./registry.ts";
import { createEventSnapshotter } from "./event.ts";
import { createSafeStyle } from "./style.ts";
import { createStylePolicy, type StylePolicyEngine } from "./style-policy.ts";
import { isInputTypeAllowed, isButtonTypeAllowed, isAttrKeySafe } from "./validation.ts";
import type { SafeURLDecision, URLPolicyEngine } from "./url-policy.ts";
import { invalidArgument } from "./errors.ts";

const apply = Reflect.apply;

function isStyleElement(realEl: Element): boolean {
  try {
    const realm = realEl.ownerDocument?.defaultView;
    const getter = realm?.Element === undefined
      ? undefined
      : Object.getOwnPropertyDescriptor(realm.Element.prototype, "localName")?.get;
    if (typeof getter !== "function") return false;
    return apply(getter, realEl, []) === "style";
  } catch {
    return false;
  }
}

function addSafeEvent<Kind extends SafeEventKind>(
  realEl: Element,
  eventName: string,
  kind: Kind,
  handler: EventHandler<Extract<SafeEvent, { readonly kind: Kind }>>,
): EventCleanup {
  let realm: unknown;
  try {
    realm = realEl.ownerDocument?.defaultView;
  } catch {
    realm = undefined;
  }
  const snapshotter = createEventSnapshotter(realm);
  const nativeHandler = (nativeEvent: Event): void => {
    const dispatch = snapshotter.open(nativeEvent, kind);
    try {
      handler(dispatch.event);
    } finally {
      dispatch.close();
    }
  };
  realEl.addEventListener(eventName, nativeHandler);
  return () => realEl.removeEventListener(eventName, nativeHandler);
}

export function createSafeElement(
  realEl: Element,
  stylePolicy: StylePolicyEngine = createStylePolicy(),
): SafeElement {
  if (isStyleElement(realEl)) throw invalidArgument("createSafeElement.element");
  const htmlEl = realEl as HTMLElement;

  const wrapper: SafeElement = {
    appendChild(child: SafeElement | SafeTextNode): void {
      const realChild = getRealNode(child);
      if (!realChild) return;
      realEl.appendChild(realChild);
    },
    insertBefore(newChild: SafeElement | SafeTextNode, reference: SafeElement | SafeTextNode): void {
      const realNew = getRealNode(newChild);
      const realRef = getRealNode(reference);
      if (!realNew || !realRef) return;
      realEl.insertBefore(realNew, realRef);
    },
    removeChild(child: SafeElement | SafeTextNode): void {
      const realChild = getRealNode(child);
      if (!realChild) return;
      realEl.removeChild(realChild);
    },
    replaceChild(newChild: SafeElement | SafeTextNode, oldChild: SafeElement | SafeTextNode): void {
      const realNew = getRealNode(newChild);
      const realOld = getRealNode(oldChild);
      if (!realNew || !realOld) return;
      realEl.replaceChild(realNew, realOld);
    },
    remove(): void {
      realEl.remove();
      unregisterPair(wrapper, realEl);
    },

    setText(value: string): void { htmlEl.textContent = String(value ?? ""); },
    getText(): string { return htmlEl.textContent ?? ""; },

    setClass(value: string): void { realEl.setAttribute("class", String(value)); },
    getClass(): string { return realEl.getAttribute("class") ?? ""; },
    setId(value: string): void { realEl.setAttribute("id", String(value)); },
    getId(): string { return realEl.getAttribute("id") ?? ""; },
    setTitle(value: string): void { realEl.setAttribute("title", String(value)); },
    setRole(value: string): void { realEl.setAttribute("role", String(value)); },
    setTabIndex(value: number): void { realEl.setAttribute("tabindex", String(Number(value) | 0)); },
    setHidden(value: boolean): void {
      if (value) realEl.setAttribute("hidden", "");
      else realEl.removeAttribute("hidden");
    },
    setLang(value: string): void { realEl.setAttribute("lang", String(value)); },
    setDir(value: string): void { realEl.setAttribute("dir", String(value)); },
    setSpellcheck(value: boolean): void { realEl.setAttribute("spellcheck", String(!!value)); },

    setData(key: string, value: string): void {
      if (typeof key !== "string" || !isAttrKeySafe(key)) return;
      realEl.setAttribute(`data-${key}`, String(value));
    },
    getData(key: string): string | undefined {
      if (typeof key !== "string" || !isAttrKeySafe(key)) return undefined;
      return realEl.getAttribute(`data-${key}`) ?? undefined;
    },
    setAria(key: string, value: string): void {
      if (typeof key !== "string" || !isAttrKeySafe(key)) return;
      realEl.setAttribute(`aria-${key}`, String(value));
    },
    getAria(key: string): string | undefined {
      if (typeof key !== "string" || !isAttrKeySafe(key)) return undefined;
      return realEl.getAttribute(`aria-${key}`) ?? undefined;
    },

    onClick(handler): EventCleanup { return addSafeEvent(realEl, "click", "mouse", handler); },
    onDblClick(handler): EventCleanup { return addSafeEvent(realEl, "dblclick", "mouse", handler); },
    onMouseDown(handler): EventCleanup { return addSafeEvent(realEl, "mousedown", "mouse", handler); },
    onMouseUp(handler): EventCleanup { return addSafeEvent(realEl, "mouseup", "mouse", handler); },
    onMouseEnter(handler): EventCleanup { return addSafeEvent(realEl, "mouseenter", "mouse", handler); },
    onMouseLeave(handler): EventCleanup { return addSafeEvent(realEl, "mouseleave", "mouse", handler); },
    onMouseMove(handler): EventCleanup { return addSafeEvent(realEl, "mousemove", "mouse", handler); },
    onPointerDown(handler): EventCleanup { return addSafeEvent(realEl, "pointerdown", "pointer", handler); },
    onPointerUp(handler): EventCleanup { return addSafeEvent(realEl, "pointerup", "pointer", handler); },
    onPointerMove(handler): EventCleanup { return addSafeEvent(realEl, "pointermove", "pointer", handler); },
    onContextMenu(handler): EventCleanup { return addSafeEvent(realEl, "contextmenu", "mouse", handler); },

    onKeyDown(handler): EventCleanup { return addSafeEvent(realEl, "keydown", "keyboard", handler); },
    onKeyUp(handler): EventCleanup { return addSafeEvent(realEl, "keyup", "keyboard", handler); },

    onFocus(handler): EventCleanup { return addSafeEvent(realEl, "focus", "focus", handler); },
    onBlur(handler): EventCleanup { return addSafeEvent(realEl, "blur", "focus", handler); },

    onTouchStart(handler): EventCleanup { return addSafeEvent(realEl, "touchstart", "touch", handler); },
    onTouchEnd(handler): EventCleanup { return addSafeEvent(realEl, "touchend", "touch", handler); },
    onTouchMove(handler): EventCleanup { return addSafeEvent(realEl, "touchmove", "touch", handler); },

    onScroll(handler): EventCleanup { return addSafeEvent(realEl, "scroll", "generic", handler); },

    style: createSafeStyle(htmlEl, stylePolicy),
  };

  registerPair(wrapper, realEl);
  return wrapper;
}

export function createSafeInputElement(
  realEl: HTMLInputElement,
  stylePolicy?: StylePolicyEngine,
): SafeInputElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setType(type: string): void {
      if (isInputTypeAllowed(type)) realEl.setAttribute("type", type.toLowerCase());
    },
    setValue(value: string): void { realEl.value = String(value); },
    getValue(): string { return realEl.value; },
    setPlaceholder(value: string): void { realEl.setAttribute("placeholder", String(value)); },
    setDisabled(value: boolean): void {
      if (value) realEl.setAttribute("disabled", "");
      else realEl.removeAttribute("disabled");
    },
    setReadonly(value: boolean): void {
      if (value) realEl.setAttribute("readonly", "");
      else realEl.removeAttribute("readonly");
    },
    setRequired(value: boolean): void {
      if (value) realEl.setAttribute("required", "");
      else realEl.removeAttribute("required");
    },
    setChecked(value: boolean): void { realEl.checked = !!value; },
    getChecked(): boolean { return realEl.checked; },
    setMin(value: string): void { realEl.setAttribute("min", String(value)); },
    setMax(value: string): void { realEl.setAttribute("max", String(value)); },
    setStep(value: string): void { realEl.setAttribute("step", String(value)); },
    setMinLength(value: number): void { realEl.setAttribute("minlength", String(Number(value) | 0)); },
    setMaxLength(value: number): void { realEl.setAttribute("maxlength", String(Number(value) | 0)); },
    setPattern(value: string): void { realEl.setAttribute("pattern", String(value)); },
    setAutocomplete(value: string): void { realEl.setAttribute("autocomplete", String(value)); },
    setAutofocus(value: boolean): void {
      if (value) realEl.setAttribute("autofocus", "");
      else realEl.removeAttribute("autofocus");
    },
    setName(value: string): void { realEl.setAttribute("name", String(value)); },
    setInputMode(value: string): void { realEl.setAttribute("inputmode", String(value)); },
    setEnterKeyHint(value: string): void { realEl.setAttribute("enterkeyhint", String(value)); },
    onChange(handler: EventHandler<SafeInputEvent>): EventCleanup { return addSafeEvent(realEl, "change", "input", handler); },
    onInput(handler: EventHandler<SafeInputEvent>): EventCleanup { return addSafeEvent(realEl, "input", "input", handler); },
  }) as SafeInputElement;
}

export function createSafeTextareaElement(
  realEl: HTMLTextAreaElement,
  stylePolicy?: StylePolicyEngine,
): SafeTextareaElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setValue(value: string): void { realEl.value = String(value); },
    getValue(): string { return realEl.value; },
    setPlaceholder(value: string): void { realEl.setAttribute("placeholder", String(value)); },
    setDisabled(value: boolean): void {
      if (value) realEl.setAttribute("disabled", "");
      else realEl.removeAttribute("disabled");
    },
    setReadonly(value: boolean): void {
      if (value) realEl.setAttribute("readonly", "");
      else realEl.removeAttribute("readonly");
    },
    setRequired(value: boolean): void {
      if (value) realEl.setAttribute("required", "");
      else realEl.removeAttribute("required");
    },
    setMinLength(value: number): void { realEl.setAttribute("minlength", String(Number(value) | 0)); },
    setMaxLength(value: number): void { realEl.setAttribute("maxlength", String(Number(value) | 0)); },
    setRows(value: number): void { realEl.setAttribute("rows", String(Number(value) | 0)); },
    setCols(value: number): void { realEl.setAttribute("cols", String(Number(value) | 0)); },
    setWrap(value: string): void { realEl.setAttribute("wrap", String(value)); },
    setName(value: string): void { realEl.setAttribute("name", String(value)); },
    setAutocomplete(value: string): void { realEl.setAttribute("autocomplete", String(value)); },
    onChange(handler: EventHandler<SafeInputEvent>): EventCleanup { return addSafeEvent(realEl, "change", "input", handler); },
    onInput(handler: EventHandler<SafeInputEvent>): EventCleanup { return addSafeEvent(realEl, "input", "input", handler); },
  }) as SafeTextareaElement;
}

export function createSafeSelectElement(
  realEl: HTMLSelectElement,
  stylePolicy?: StylePolicyEngine,
): SafeSelectElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setValue(value: string): void { realEl.value = String(value); },
    getValue(): string { return realEl.value; },
    setDisabled(value: boolean): void {
      if (value) realEl.setAttribute("disabled", "");
      else realEl.removeAttribute("disabled");
    },
    setRequired(value: boolean): void {
      if (value) realEl.setAttribute("required", "");
      else realEl.removeAttribute("required");
    },
    setMultiple(value: boolean): void {
      if (value) realEl.setAttribute("multiple", "");
      else realEl.removeAttribute("multiple");
    },
    setName(value: string): void { realEl.setAttribute("name", String(value)); },
    onChange(handler: EventHandler<SafeInputEvent>): EventCleanup { return addSafeEvent(realEl, "change", "input", handler); },
  }) as SafeSelectElement;
}

export function createSafeOptionElement(
  realEl: HTMLOptionElement,
  stylePolicy?: StylePolicyEngine,
): SafeOptionElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setValue(value: string): void { realEl.setAttribute("value", String(value)); },
    setSelected(value: boolean): void { realEl.selected = !!value; },
    setDisabled(value: boolean): void {
      if (value) realEl.setAttribute("disabled", "");
      else realEl.removeAttribute("disabled");
    },
    setLabel(value: string): void { realEl.setAttribute("label", String(value)); },
  }) as SafeOptionElement;
}

export function createSafeButtonElement(
  realEl: HTMLButtonElement,
  stylePolicy?: StylePolicyEngine,
): SafeButtonElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setType(type: string): void {
      if (isButtonTypeAllowed(type)) realEl.setAttribute("type", type.toLowerCase());
    },
    setDisabled(value: boolean): void {
      if (value) realEl.setAttribute("disabled", "");
      else realEl.removeAttribute("disabled");
    },
    setName(value: string): void { realEl.setAttribute("name", String(value)); },
    setValue(value: string): void { realEl.setAttribute("value", String(value)); },
  }) as SafeButtonElement;
}

export function createSafeLabelElement(
  realEl: HTMLLabelElement,
  stylePolicy?: StylePolicyEngine,
): SafeLabelElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setFor(value: string): void { realEl.setAttribute("for", String(value)); },
  }) as SafeLabelElement;
}

export function createSafeFieldsetElement(
  realEl: HTMLFieldSetElement,
  stylePolicy?: StylePolicyEngine,
): SafeFieldsetElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setDisabled(value: boolean): void {
      if (value) realEl.setAttribute("disabled", "");
      else realEl.removeAttribute("disabled");
    },
  }) as SafeFieldsetElement;
}

export function createSafeImageElement(
  realEl: HTMLImageElement,
  urlPolicy: URLPolicyEngine,
  stylePolicy?: StylePolicyEngine,
): SafeImageElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setSrc(url: string): SafeURLDecision {
      const decision = urlPolicy.decide("image.src", url);
      if (decision.allowed) realEl.setAttribute("src", decision.url);
      return decision;
    },
    setAlt(value: string): void { realEl.setAttribute("alt", String(value)); },
    setWidth(value: number): void { realEl.setAttribute("width", String(Number(value) | 0)); },
    setHeight(value: number): void { realEl.setAttribute("height", String(Number(value) | 0)); },
    setLoading(value: string): void { realEl.setAttribute("loading", String(value)); },
  }) as SafeImageElement;
}

export function createSafeAnchorElement(
  realEl: HTMLAnchorElement,
  urlPolicy: URLPolicyEngine,
  stylePolicy?: StylePolicyEngine,
): SafeAnchorElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setHref(url: string): SafeURLDecision {
      const decision = urlPolicy.decide("anchor.href", url);
      if (decision.allowed) realEl.setAttribute("href", decision.url);
      return decision;
    },
  }) as SafeAnchorElement;
}

export function createSafeVideoElement(
  realEl: HTMLVideoElement,
  urlPolicy: URLPolicyEngine,
  stylePolicy?: StylePolicyEngine,
): SafeVideoElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setSrc(url: string): SafeURLDecision {
      const decision = urlPolicy.decide("video.src", url);
      if (decision.allowed) realEl.setAttribute("src", decision.url);
      return decision;
    },
    setWidth(value: number): void { realEl.setAttribute("width", String(Number(value) | 0)); },
    setHeight(value: number): void { realEl.setAttribute("height", String(Number(value) | 0)); },
    setControls(value: boolean): void {
      if (value) realEl.setAttribute("controls", "");
      else realEl.removeAttribute("controls");
    },
    setAutoplay(value: boolean): void {
      if (value) realEl.setAttribute("autoplay", "");
      else realEl.removeAttribute("autoplay");
    },
    setLoop(value: boolean): void {
      if (value) realEl.setAttribute("loop", "");
      else realEl.removeAttribute("loop");
    },
    setMuted(value: boolean): void {
      if (value) realEl.setAttribute("muted", "");
      else realEl.removeAttribute("muted");
    },
    setPoster(url: string): SafeURLDecision {
      const decision = urlPolicy.decide("video.poster", url);
      if (decision.allowed) realEl.setAttribute("poster", decision.url);
      return decision;
    },
  }) as SafeVideoElement;
}

export function createSafeAudioElement(
  realEl: HTMLAudioElement,
  urlPolicy: URLPolicyEngine,
  stylePolicy?: StylePolicyEngine,
): SafeAudioElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setSrc(url: string): SafeURLDecision {
      const decision = urlPolicy.decide("audio.src", url);
      if (decision.allowed) realEl.setAttribute("src", decision.url);
      return decision;
    },
    setControls(value: boolean): void {
      if (value) realEl.setAttribute("controls", "");
      else realEl.removeAttribute("controls");
    },
    setAutoplay(value: boolean): void {
      if (value) realEl.setAttribute("autoplay", "");
      else realEl.removeAttribute("autoplay");
    },
    setLoop(value: boolean): void {
      if (value) realEl.setAttribute("loop", "");
      else realEl.removeAttribute("loop");
    },
    setMuted(value: boolean): void {
      if (value) realEl.setAttribute("muted", "");
      else realEl.removeAttribute("muted");
    },
  }) as SafeAudioElement;
}

export function createSafeSourceElement(
  realEl: HTMLSourceElement,
  urlPolicy: URLPolicyEngine,
  stylePolicy?: StylePolicyEngine,
): SafeSourceElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setSrc(url: string): SafeURLDecision {
      const decision = urlPolicy.decide("source.src", url);
      if (decision.allowed) realEl.setAttribute("src", decision.url);
      return decision;
    },
    setType(value: string): void { realEl.setAttribute("type", String(value)); },
  }) as SafeSourceElement;
}

export function createSafeCanvasElement(
  realEl: HTMLCanvasElement,
  stylePolicy?: StylePolicyEngine,
): SafeCanvasElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setWidth(value: number): void { realEl.setAttribute("width", String(Number(value) | 0)); },
    setHeight(value: number): void { realEl.setAttribute("height", String(Number(value) | 0)); },
  }) as SafeCanvasElement;
}

export function createSafeTableCellElement(
  realEl: HTMLTableCellElement,
  stylePolicy?: StylePolicyEngine,
): SafeTableCellElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setColspan(value: number): void { realEl.setAttribute("colspan", String(Number(value) | 0)); },
    setRowspan(value: number): void { realEl.setAttribute("rowspan", String(Number(value) | 0)); },
    setScope(value: string): void { realEl.setAttribute("scope", String(value)); },
    setHeaders(value: string): void { realEl.setAttribute("headers", String(value)); },
  }) as SafeTableCellElement;
}

export function createSafeDetailsElement(
  realEl: HTMLDetailsElement,
  stylePolicy?: StylePolicyEngine,
): SafeDetailsElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setOpen(value: boolean): void {
      if (value) realEl.setAttribute("open", "");
      else realEl.removeAttribute("open");
    },
  }) as SafeDetailsElement;
}

export function createSafeDialogElement(
  realEl: HTMLDialogElement,
  stylePolicy?: StylePolicyEngine,
): SafeDialogElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setOpen(value: boolean): void {
      if (value) realEl.setAttribute("open", "");
      else realEl.removeAttribute("open");
    },
  }) as SafeDialogElement;
}

export function createSafeProgressElement(
  realEl: HTMLProgressElement,
  stylePolicy?: StylePolicyEngine,
): SafeProgressElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setValue(value: number): void { realEl.setAttribute("value", String(Number(value))); },
    setMax(value: number): void { realEl.setAttribute("max", String(Number(value))); },
  }) as SafeProgressElement;
}

export function createSafeMeterElement(
  realEl: HTMLMeterElement,
  stylePolicy?: StylePolicyEngine,
): SafeMeterElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    setValue(value: number): void { realEl.setAttribute("value", String(Number(value))); },
    setMin(value: number): void { realEl.setAttribute("min", String(Number(value))); },
    setMax(value: number): void { realEl.setAttribute("max", String(Number(value))); },
  }) as SafeMeterElement;
}

export function createSafeListElement(
  realEl: HTMLUListElement | HTMLOListElement,
  stylePolicy?: StylePolicyEngine,
): SafeListElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    createItem(): SafeElement {
      const li = createSafeElement(realEl.ownerDocument.createElement("li"), stylePolicy);
      base.appendChild(li);
      return li;
    },
  }) as SafeListElement;
}

export function createSafeDescriptionListElement(
  realEl: HTMLDListElement,
  stylePolicy?: StylePolicyEngine,
): SafeDescriptionListElement {
  const base = createSafeElement(realEl, stylePolicy);

  return Object.assign(base, {
    createTerm(): SafeElement {
      const dt = createSafeElement(realEl.ownerDocument.createElement("dt"), stylePolicy);
      base.appendChild(dt);
      return dt;
    },
    createDescription(): SafeElement {
      const dd = createSafeElement(realEl.ownerDocument.createElement("dd"), stylePolicy);
      base.appendChild(dd);
      return dd;
    },
  }) as SafeDescriptionListElement;
}
