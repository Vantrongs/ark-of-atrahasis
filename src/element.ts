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
  EventHandler,
  EventCleanup,
} from "./types.ts";
import { registerPair, unregisterPair, getRealNode } from "./registry.ts";
import { createSafeEvent } from "./event.ts";
import { createSafeStyle } from "./style.ts";
import { isInputTypeAllowed, isButtonTypeAllowed, isAttrKeySafe } from "./validation.ts";
import type { SafeURLDecision, URLPolicyEngine } from "./url-policy.ts";

function addSafeEvent(realEl: Element, wrapper: SafeElement, eventName: string, handler: EventHandler): EventCleanup {
  const nativeHandler = (nativeEvent: Event): void => {
    handler(createSafeEvent(nativeEvent, wrapper));
  };
  realEl.addEventListener(eventName, nativeHandler);
  return () => realEl.removeEventListener(eventName, nativeHandler);
}

export function createSafeElement(realEl: Element): SafeElement {
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

    onClick(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "click", handler); },
    onDblClick(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "dblclick", handler); },
    onMouseDown(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "mousedown", handler); },
    onMouseUp(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "mouseup", handler); },
    onMouseEnter(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "mouseenter", handler); },
    onMouseLeave(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "mouseleave", handler); },
    onMouseMove(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "mousemove", handler); },
    onPointerDown(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "pointerdown", handler); },
    onPointerUp(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "pointerup", handler); },
    onPointerMove(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "pointermove", handler); },
    onContextMenu(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "contextmenu", handler); },

    onKeyDown(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "keydown", handler); },
    onKeyUp(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "keyup", handler); },

    onFocus(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "focus", handler); },
    onBlur(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "blur", handler); },

    onTouchStart(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "touchstart", handler); },
    onTouchEnd(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "touchend", handler); },
    onTouchMove(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "touchmove", handler); },

    onScroll(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, wrapper, "scroll", handler); },

    style: createSafeStyle(htmlEl),
  };

  registerPair(wrapper, realEl);
  return wrapper;
}

export function createSafeInputElement(realEl: HTMLInputElement): SafeInputElement {
  const base = createSafeElement(realEl);

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
    onChange(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, base, "change", handler); },
    onInput(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, base, "input", handler); },
  }) as SafeInputElement;
}

export function createSafeTextareaElement(realEl: HTMLTextAreaElement): SafeTextareaElement {
  const base = createSafeElement(realEl);

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
    onChange(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, base, "change", handler); },
    onInput(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, base, "input", handler); },
  }) as SafeTextareaElement;
}

export function createSafeSelectElement(realEl: HTMLSelectElement): SafeSelectElement {
  const base = createSafeElement(realEl);

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
    onChange(handler: EventHandler): EventCleanup { return addSafeEvent(realEl, base, "change", handler); },
  }) as SafeSelectElement;
}

export function createSafeOptionElement(realEl: HTMLOptionElement): SafeOptionElement {
  const base = createSafeElement(realEl);

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

export function createSafeButtonElement(realEl: HTMLButtonElement): SafeButtonElement {
  const base = createSafeElement(realEl);

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

export function createSafeLabelElement(realEl: HTMLLabelElement): SafeLabelElement {
  const base = createSafeElement(realEl);

  return Object.assign(base, {
    setFor(value: string): void { realEl.setAttribute("for", String(value)); },
  }) as SafeLabelElement;
}

export function createSafeFieldsetElement(realEl: HTMLFieldSetElement): SafeFieldsetElement {
  const base = createSafeElement(realEl);

  return Object.assign(base, {
    setDisabled(value: boolean): void {
      if (value) realEl.setAttribute("disabled", "");
      else realEl.removeAttribute("disabled");
    },
  }) as SafeFieldsetElement;
}

export function createSafeImageElement(realEl: HTMLImageElement, urlPolicy: URLPolicyEngine): SafeImageElement {
  const base = createSafeElement(realEl);

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

export function createSafeAnchorElement(realEl: HTMLAnchorElement, urlPolicy: URLPolicyEngine): SafeAnchorElement {
  const base = createSafeElement(realEl);

  return Object.assign(base, {
    setHref(url: string): SafeURLDecision {
      const decision = urlPolicy.decide("anchor.href", url);
      if (decision.allowed) realEl.setAttribute("href", decision.url);
      return decision;
    },
  }) as SafeAnchorElement;
}

export function createSafeVideoElement(realEl: HTMLVideoElement, urlPolicy: URLPolicyEngine): SafeVideoElement {
  const base = createSafeElement(realEl);

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

export function createSafeAudioElement(realEl: HTMLAudioElement, urlPolicy: URLPolicyEngine): SafeAudioElement {
  const base = createSafeElement(realEl);

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

export function createSafeSourceElement(realEl: HTMLSourceElement, urlPolicy: URLPolicyEngine): SafeSourceElement {
  const base = createSafeElement(realEl);

  return Object.assign(base, {
    setSrc(url: string): SafeURLDecision {
      const decision = urlPolicy.decide("source.src", url);
      if (decision.allowed) realEl.setAttribute("src", decision.url);
      return decision;
    },
    setType(value: string): void { realEl.setAttribute("type", String(value)); },
  }) as SafeSourceElement;
}

export function createSafeCanvasElement(realEl: HTMLCanvasElement): SafeCanvasElement {
  const base = createSafeElement(realEl);

  return Object.assign(base, {
    setWidth(value: number): void { realEl.setAttribute("width", String(Number(value) | 0)); },
    setHeight(value: number): void { realEl.setAttribute("height", String(Number(value) | 0)); },
  }) as SafeCanvasElement;
}

export function createSafeTableCellElement(realEl: HTMLTableCellElement): SafeTableCellElement {
  const base = createSafeElement(realEl);

  return Object.assign(base, {
    setColspan(value: number): void { realEl.setAttribute("colspan", String(Number(value) | 0)); },
    setRowspan(value: number): void { realEl.setAttribute("rowspan", String(Number(value) | 0)); },
    setScope(value: string): void { realEl.setAttribute("scope", String(value)); },
    setHeaders(value: string): void { realEl.setAttribute("headers", String(value)); },
  }) as SafeTableCellElement;
}

export function createSafeDetailsElement(realEl: HTMLDetailsElement): SafeDetailsElement {
  const base = createSafeElement(realEl);

  return Object.assign(base, {
    setOpen(value: boolean): void {
      if (value) realEl.setAttribute("open", "");
      else realEl.removeAttribute("open");
    },
  }) as SafeDetailsElement;
}

export function createSafeDialogElement(realEl: HTMLDialogElement): SafeDialogElement {
  const base = createSafeElement(realEl);

  return Object.assign(base, {
    setOpen(value: boolean): void {
      if (value) realEl.setAttribute("open", "");
      else realEl.removeAttribute("open");
    },
  }) as SafeDialogElement;
}

export function createSafeProgressElement(realEl: HTMLProgressElement): SafeProgressElement {
  const base = createSafeElement(realEl);

  return Object.assign(base, {
    setValue(value: number): void { realEl.setAttribute("value", String(Number(value))); },
    setMax(value: number): void { realEl.setAttribute("max", String(Number(value))); },
  }) as SafeProgressElement;
}

export function createSafeMeterElement(realEl: HTMLMeterElement): SafeMeterElement {
  const base = createSafeElement(realEl);

  return Object.assign(base, {
    setValue(value: number): void { realEl.setAttribute("value", String(Number(value))); },
    setMin(value: number): void { realEl.setAttribute("min", String(Number(value))); },
    setMax(value: number): void { realEl.setAttribute("max", String(Number(value))); },
  }) as SafeMeterElement;
}

export function createSafeListElement(realEl: HTMLUListElement | HTMLOListElement): SafeListElement {
  const base = createSafeElement(realEl);

  return Object.assign(base, {
    createItem(): SafeElement {
      const li = createSafeElement(document.createElement("li"));
      base.appendChild(li);
      return li;
    },
  }) as SafeListElement;
}

export function createSafeDescriptionListElement(realEl: HTMLDListElement): SafeDescriptionListElement {
  const base = createSafeElement(realEl);

  return Object.assign(base, {
    createTerm(): SafeElement {
      const dt = createSafeElement(document.createElement("dt"));
      base.appendChild(dt);
      return dt;
    },
    createDescription(): SafeElement {
      const dd = createSafeElement(document.createElement("dd"));
      base.appendChild(dd);
      return dd;
    },
  }) as SafeDescriptionListElement;
}
