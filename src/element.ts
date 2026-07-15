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
import type { DocumentContext } from "./context.ts";
import { createSafeEvent } from "./event.ts";
import { createSafeStyle } from "./style.ts";
import { isUrlSafe, isInputTypeAllowed, isButtonTypeAllowed, isAttrKeySafe } from "./validation.ts";

function addSafeEvent(
  context: DocumentContext,
  realEl: Element,
  wrapper: SafeElement,
  eventName: string,
  handler: EventHandler,
): EventCleanup {
  const nativeHandler = (nativeEvent: Event): void => {
    if (!context.canDispatch(realEl)) return;
    handler(createSafeEvent(nativeEvent, wrapper));
  };
  return context.addEventListener(realEl, eventName, nativeHandler);
}

function attribute(
  context: DocumentContext,
  realEl: Element,
  name: string,
  value: string | null | undefined,
): void {
  context.setAttribute(realEl, name, value, false);
}

function booleanAttribute(
  context: DocumentContext,
  realEl: Element,
  name: string,
  value: boolean,
): void {
  attribute(context, realEl, name, value ? "" : null);
}

function requestAttribute(
  context: DocumentContext,
  realEl: Element,
  name: string,
  value: string,
): void {
  context.setAttribute(realEl, name, isUrlSafe(value) ? value : undefined, true);
}

export function createSafeElement(context: DocumentContext, realEl: Element): SafeElement {
  const known = context.registry.getWrapper<SafeElement>(realEl);
  if (known) return known;
  const htmlEl = realEl as HTMLElement;

  const wrapper: SafeElement = {
    appendChild(child: SafeElement | SafeTextNode): void {
      context.nodeOperation(realEl, () => realEl.appendChild(context.requireRealNode(child)));
    },
    insertBefore(newChild: SafeElement | SafeTextNode, reference: SafeElement | SafeTextNode): void {
      context.nodeOperation(realEl, () => {
        realEl.insertBefore(context.requireRealNode(newChild), context.requireRealNode(reference));
      });
    },
    removeChild(child: SafeElement | SafeTextNode): void {
      context.nodeOperation(realEl, () => realEl.removeChild(context.requireRealNode(child)));
    },
    replaceChild(newChild: SafeElement | SafeTextNode, oldChild: SafeElement | SafeTextNode): void {
      context.nodeOperation(realEl, () => {
        realEl.replaceChild(context.requireRealNode(newChild), context.requireRealNode(oldChild));
      });
    },
    detach(): void { context.detachNode(realEl); },
    remove(): void { context.detachNode(realEl); },
    dispose(): void { context.disposeNode(realEl); },

    setText(value: string): void {
      const text = String(value ?? "");
      context.setText(realEl, "textContent", text, () => { htmlEl.textContent = text; });
    },
    getText(): string { return context.nodeOperation(realEl, () => htmlEl.textContent ?? ""); },

    setClass(value: string): void { attribute(context, realEl, "class", String(value)); },
    getClass(): string { return context.nodeOperation(realEl, () => realEl.getAttribute("class") ?? ""); },
    setId(value: string): void { attribute(context, realEl, "id", String(value)); },
    getId(): string { return context.nodeOperation(realEl, () => realEl.getAttribute("id") ?? ""); },
    setTitle(value: string): void { attribute(context, realEl, "title", String(value)); },
    setRole(value: string): void { attribute(context, realEl, "role", String(value)); },
    setTabIndex(value: number): void {
      attribute(context, realEl, "tabindex", String(Number(value) | 0));
    },
    setHidden(value: boolean): void { booleanAttribute(context, realEl, "hidden", value); },
    setLang(value: string): void { attribute(context, realEl, "lang", String(value)); },
    setDir(value: string): void { attribute(context, realEl, "dir", String(value)); },
    setSpellcheck(value: boolean): void {
      attribute(context, realEl, "spellcheck", String(!!value));
    },

    setData(key: string, value: string): void {
      const valid = typeof key === "string" && isAttrKeySafe(key);
      attribute(context, realEl, valid ? `data-${key}` : "data-invalid", valid ? String(value) : undefined);
    },
    getData(key: string): string | undefined {
      return context.nodeOperation(realEl, () => {
        if (typeof key !== "string" || !isAttrKeySafe(key)) return undefined;
        return realEl.getAttribute(`data-${key}`) ?? undefined;
      });
    },
    setAria(key: string, value: string): void {
      const valid = typeof key === "string" && isAttrKeySafe(key);
      attribute(context, realEl, valid ? `aria-${key}` : "aria-invalid", valid ? String(value) : undefined);
    },
    getAria(key: string): string | undefined {
      return context.nodeOperation(realEl, () => {
        if (typeof key !== "string" || !isAttrKeySafe(key)) return undefined;
        return realEl.getAttribute(`aria-${key}`) ?? undefined;
      });
    },

    onClick(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "click", handler); },
    onDblClick(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "dblclick", handler); },
    onMouseDown(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "mousedown", handler); },
    onMouseUp(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "mouseup", handler); },
    onMouseEnter(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "mouseenter", handler); },
    onMouseLeave(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "mouseleave", handler); },
    onMouseMove(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "mousemove", handler); },
    onPointerDown(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "pointerdown", handler); },
    onPointerUp(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "pointerup", handler); },
    onPointerMove(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "pointermove", handler); },
    onContextMenu(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "contextmenu", handler); },

    onKeyDown(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "keydown", handler); },
    onKeyUp(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "keyup", handler); },

    onFocus(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "focus", handler); },
    onBlur(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "blur", handler); },

    onTouchStart(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "touchstart", handler); },
    onTouchEnd(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "touchend", handler); },
    onTouchMove(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "touchmove", handler); },

    onScroll(handler: EventHandler): EventCleanup { return addSafeEvent(context, realEl, wrapper, "scroll", handler); },

    style: createSafeStyle(context, htmlEl),
  };

  context.register(wrapper, realEl);
  return wrapper;
}

export function createSafeInputElement(context: DocumentContext, realEl: HTMLInputElement): SafeInputElement {
  const known = context.registry.getWrapper<SafeInputElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setType(type: string): void {
      attribute(context, realEl, "type", isInputTypeAllowed(type) ? type.toLowerCase() : undefined);
    },
    setValue(value: string): void {
      const text = String(value);
      context.setText(realEl, "value", text, () => { realEl.value = text; });
    },
    getValue(): string { return context.nodeOperation(realEl, () => realEl.value); },
    setPlaceholder(value: string): void { attribute(context, realEl, "placeholder", String(value)); },
    setDisabled(value: boolean): void { booleanAttribute(context, realEl, "disabled", value); },
    setReadonly(value: boolean): void { booleanAttribute(context, realEl, "readonly", value); },
    setRequired(value: boolean): void { booleanAttribute(context, realEl, "required", value); },
    setChecked(value: boolean): void {
      context.nodeOperation(realEl, () => { realEl.checked = !!value; });
    },
    getChecked(): boolean { return context.nodeOperation(realEl, () => realEl.checked); },
    setMin(value: string): void { attribute(context, realEl, "min", String(value)); },
    setMax(value: string): void { attribute(context, realEl, "max", String(value)); },
    setStep(value: string): void { attribute(context, realEl, "step", String(value)); },
    setMinLength(value: number): void {
      attribute(context, realEl, "minlength", String(Number(value) | 0));
    },
    setMaxLength(value: number): void {
      attribute(context, realEl, "maxlength", String(Number(value) | 0));
    },
    setPattern(value: string): void { attribute(context, realEl, "pattern", String(value)); },
    setAutocomplete(value: string): void {
      attribute(context, realEl, "autocomplete", String(value));
    },
    setAutofocus(value: boolean): void { booleanAttribute(context, realEl, "autofocus", value); },
    setName(value: string): void { attribute(context, realEl, "name", String(value)); },
    setInputMode(value: string): void { attribute(context, realEl, "inputmode", String(value)); },
    setEnterKeyHint(value: string): void {
      attribute(context, realEl, "enterkeyhint", String(value));
    },
    onChange(handler: EventHandler): EventCleanup {
      return addSafeEvent(context, realEl, base, "change", handler);
    },
    onInput(handler: EventHandler): EventCleanup {
      return addSafeEvent(context, realEl, base, "input", handler);
    },
  }) as SafeInputElement;
}

export function createSafeTextareaElement(context: DocumentContext, realEl: HTMLTextAreaElement): SafeTextareaElement {
  const known = context.registry.getWrapper<SafeTextareaElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setValue(value: string): void {
      const text = String(value);
      context.setText(realEl, "value", text, () => { realEl.value = text; });
    },
    getValue(): string { return context.nodeOperation(realEl, () => realEl.value); },
    setPlaceholder(value: string): void { attribute(context, realEl, "placeholder", String(value)); },
    setDisabled(value: boolean): void { booleanAttribute(context, realEl, "disabled", value); },
    setReadonly(value: boolean): void { booleanAttribute(context, realEl, "readonly", value); },
    setRequired(value: boolean): void { booleanAttribute(context, realEl, "required", value); },
    setMinLength(value: number): void {
      attribute(context, realEl, "minlength", String(Number(value) | 0));
    },
    setMaxLength(value: number): void {
      attribute(context, realEl, "maxlength", String(Number(value) | 0));
    },
    setRows(value: number): void { attribute(context, realEl, "rows", String(Number(value) | 0)); },
    setCols(value: number): void { attribute(context, realEl, "cols", String(Number(value) | 0)); },
    setWrap(value: string): void { attribute(context, realEl, "wrap", String(value)); },
    setName(value: string): void { attribute(context, realEl, "name", String(value)); },
    setAutocomplete(value: string): void {
      attribute(context, realEl, "autocomplete", String(value));
    },
    onChange(handler: EventHandler): EventCleanup {
      return addSafeEvent(context, realEl, base, "change", handler);
    },
    onInput(handler: EventHandler): EventCleanup {
      return addSafeEvent(context, realEl, base, "input", handler);
    },
  }) as SafeTextareaElement;
}

export function createSafeSelectElement(context: DocumentContext, realEl: HTMLSelectElement): SafeSelectElement {
  const known = context.registry.getWrapper<SafeSelectElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setValue(value: string): void {
      const text = String(value);
      context.setText(realEl, "value", text, () => { realEl.value = text; });
    },
    getValue(): string { return context.nodeOperation(realEl, () => realEl.value); },
    setDisabled(value: boolean): void { booleanAttribute(context, realEl, "disabled", value); },
    setRequired(value: boolean): void { booleanAttribute(context, realEl, "required", value); },
    setMultiple(value: boolean): void { booleanAttribute(context, realEl, "multiple", value); },
    setName(value: string): void { attribute(context, realEl, "name", String(value)); },
    onChange(handler: EventHandler): EventCleanup {
      return addSafeEvent(context, realEl, base, "change", handler);
    },
  }) as SafeSelectElement;
}

export function createSafeOptionElement(context: DocumentContext, realEl: HTMLOptionElement): SafeOptionElement {
  const known = context.registry.getWrapper<SafeOptionElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setValue(value: string): void { attribute(context, realEl, "value", String(value)); },
    setSelected(value: boolean): void {
      context.nodeOperation(realEl, () => { realEl.selected = !!value; });
    },
    setDisabled(value: boolean): void { booleanAttribute(context, realEl, "disabled", value); },
    setLabel(value: string): void { attribute(context, realEl, "label", String(value)); },
  }) as SafeOptionElement;
}

export function createSafeButtonElement(context: DocumentContext, realEl: HTMLButtonElement): SafeButtonElement {
  const known = context.registry.getWrapper<SafeButtonElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setType(type: string): void {
      attribute(context, realEl, "type", isButtonTypeAllowed(type) ? type.toLowerCase() : undefined);
    },
    setDisabled(value: boolean): void { booleanAttribute(context, realEl, "disabled", value); },
    setName(value: string): void { attribute(context, realEl, "name", String(value)); },
    setValue(value: string): void { attribute(context, realEl, "value", String(value)); },
  }) as SafeButtonElement;
}

export function createSafeLabelElement(context: DocumentContext, realEl: HTMLLabelElement): SafeLabelElement {
  const known = context.registry.getWrapper<SafeLabelElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setFor(value: string): void { attribute(context, realEl, "for", String(value)); },
  }) as SafeLabelElement;
}

export function createSafeFieldsetElement(context: DocumentContext, realEl: HTMLFieldSetElement): SafeFieldsetElement {
  const known = context.registry.getWrapper<SafeFieldsetElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setDisabled(value: boolean): void { booleanAttribute(context, realEl, "disabled", value); },
  }) as SafeFieldsetElement;
}

export function createSafeImageElement(context: DocumentContext, realEl: HTMLImageElement): SafeImageElement {
  const known = context.registry.getWrapper<SafeImageElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setSrc(url: string): void { requestAttribute(context, realEl, "src", url); },
    setAlt(value: string): void { attribute(context, realEl, "alt", String(value)); },
    setWidth(value: number): void { attribute(context, realEl, "width", String(Number(value) | 0)); },
    setHeight(value: number): void {
      attribute(context, realEl, "height", String(Number(value) | 0));
    },
    setLoading(value: string): void { attribute(context, realEl, "loading", String(value)); },
  }) as SafeImageElement;
}

export function createSafeAnchorElement(context: DocumentContext, realEl: HTMLAnchorElement): SafeAnchorElement {
  const known = context.registry.getWrapper<SafeAnchorElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setHref(url: string): void { requestAttribute(context, realEl, "href", url); },
  }) as SafeAnchorElement;
}

export function createSafeVideoElement(context: DocumentContext, realEl: HTMLVideoElement): SafeVideoElement {
  const known = context.registry.getWrapper<SafeVideoElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setSrc(url: string): void { requestAttribute(context, realEl, "src", url); },
    setWidth(value: number): void { attribute(context, realEl, "width", String(Number(value) | 0)); },
    setHeight(value: number): void {
      attribute(context, realEl, "height", String(Number(value) | 0));
    },
    setControls(value: boolean): void { booleanAttribute(context, realEl, "controls", value); },
    setAutoplay(value: boolean): void { booleanAttribute(context, realEl, "autoplay", value); },
    setLoop(value: boolean): void { booleanAttribute(context, realEl, "loop", value); },
    setMuted(value: boolean): void { booleanAttribute(context, realEl, "muted", value); },
    setPoster(url: string): void { requestAttribute(context, realEl, "poster", url); },
  }) as SafeVideoElement;
}

export function createSafeAudioElement(context: DocumentContext, realEl: HTMLAudioElement): SafeAudioElement {
  const known = context.registry.getWrapper<SafeAudioElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setSrc(url: string): void { requestAttribute(context, realEl, "src", url); },
    setControls(value: boolean): void { booleanAttribute(context, realEl, "controls", value); },
    setAutoplay(value: boolean): void { booleanAttribute(context, realEl, "autoplay", value); },
    setLoop(value: boolean): void { booleanAttribute(context, realEl, "loop", value); },
    setMuted(value: boolean): void { booleanAttribute(context, realEl, "muted", value); },
  }) as SafeAudioElement;
}

export function createSafeSourceElement(context: DocumentContext, realEl: HTMLSourceElement): SafeSourceElement {
  const known = context.registry.getWrapper<SafeSourceElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setSrc(url: string): void { requestAttribute(context, realEl, "src", url); },
    setType(value: string): void { attribute(context, realEl, "type", String(value)); },
  }) as SafeSourceElement;
}

export function createSafeCanvasElement(context: DocumentContext, realEl: HTMLCanvasElement): SafeCanvasElement {
  const known = context.registry.getWrapper<SafeCanvasElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setWidth(value: number): void { attribute(context, realEl, "width", String(Number(value) | 0)); },
    setHeight(value: number): void {
      attribute(context, realEl, "height", String(Number(value) | 0));
    },
  }) as SafeCanvasElement;
}

export function createSafeTableCellElement(context: DocumentContext, realEl: HTMLTableCellElement): SafeTableCellElement {
  const known = context.registry.getWrapper<SafeTableCellElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setColspan(value: number): void {
      attribute(context, realEl, "colspan", String(Number(value) | 0));
    },
    setRowspan(value: number): void {
      attribute(context, realEl, "rowspan", String(Number(value) | 0));
    },
    setScope(value: string): void { attribute(context, realEl, "scope", String(value)); },
    setHeaders(value: string): void { attribute(context, realEl, "headers", String(value)); },
  }) as SafeTableCellElement;
}

export function createSafeDetailsElement(context: DocumentContext, realEl: HTMLDetailsElement): SafeDetailsElement {
  const known = context.registry.getWrapper<SafeDetailsElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setOpen(value: boolean): void { booleanAttribute(context, realEl, "open", value); },
  }) as SafeDetailsElement;
}

export function createSafeDialogElement(context: DocumentContext, realEl: HTMLDialogElement): SafeDialogElement {
  const known = context.registry.getWrapper<SafeDialogElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setOpen(value: boolean): void { booleanAttribute(context, realEl, "open", value); },
  }) as SafeDialogElement;
}

export function createSafeProgressElement(context: DocumentContext, realEl: HTMLProgressElement): SafeProgressElement {
  const known = context.registry.getWrapper<SafeProgressElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setValue(value: number): void { attribute(context, realEl, "value", String(Number(value))); },
    setMax(value: number): void { attribute(context, realEl, "max", String(Number(value))); },
  }) as SafeProgressElement;
}

export function createSafeMeterElement(context: DocumentContext, realEl: HTMLMeterElement): SafeMeterElement {
  const known = context.registry.getWrapper<SafeMeterElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    setValue(value: number): void { attribute(context, realEl, "value", String(Number(value))); },
    setMin(value: number): void { attribute(context, realEl, "min", String(Number(value))); },
    setMax(value: number): void { attribute(context, realEl, "max", String(Number(value))); },
  }) as SafeMeterElement;
}

export function createSafeListElement(context: DocumentContext, realEl: HTMLUListElement | HTMLOListElement): SafeListElement {
  const known = context.registry.getWrapper<SafeListElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    createItem(): SafeElement {
      const li = createSafeElement(context, context.createElement("li"));
      try {
        base.appendChild(li);
        return li;
      } catch (error) {
        li.dispose();
        throw error;
      }
    },
  }) as SafeListElement;
}

export function createSafeDescriptionListElement(context: DocumentContext, realEl: HTMLDListElement): SafeDescriptionListElement {
  const known = context.registry.getWrapper<SafeDescriptionListElement>(realEl);
  if (known) return known;
  const base = createSafeElement(context, realEl);

  return Object.assign(base, {
    createTerm(): SafeElement {
      const dt = createSafeElement(context, context.createElement("dt"));
      try {
        base.appendChild(dt);
        return dt;
      } catch (error) {
        dt.dispose();
        throw error;
      }
    },
    createDescription(): SafeElement {
      const dd = createSafeElement(context, context.createElement("dd"));
      try {
        base.appendChild(dd);
        return dd;
      } catch (error) {
        dd.dispose();
        throw error;
      }
    },
  }) as SafeDescriptionListElement;
}
