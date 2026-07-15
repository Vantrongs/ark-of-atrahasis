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
  SafeFocusEvent,
  SafeGenericEvent,
  SafeInputEvent,
  SafeKeyboardEvent,
  SafeMouseEvent,
  SafePointerEvent,
  SafeTouchEvent,
  EventHandler,
  EventCleanup,
} from "./types.ts";
import type { DocumentContext } from "./context.ts";
import { createSafeStyle } from "./style.ts";
import { isInputTypeAllowed, isButtonTypeAllowed, isAttrKeySafe } from "./validation.ts";
import type { SafeURLDecision } from "./url-policy.ts";

function addSafeEvent<Kind extends SafeEventKind>(
  context: DocumentContext,
  realEl: Element,
  eventName: string,
  kind: Kind,
  handler: EventHandler<Extract<SafeEvent, { readonly kind: Kind }>>,
): EventCleanup {
  const nativeHandler = (nativeEvent: Event): void => {
    if (!context.canDispatch(realEl)) return;
    const dispatch = context.eventSnapshotter.open(nativeEvent, kind);
    try {
      handler(dispatch.event);
    } finally {
      dispatch.close();
    }
  };
  return context.addEventListener(realEl, eventName, nativeHandler);
}

function attribute(
  context: DocumentContext,
  realEl: Element,
  name: string,
  value: string | null | undefined,
): void {
  context.setAttribute(realEl, name, value);
}

function booleanAttribute(
  context: DocumentContext,
  realEl: Element,
  name: string,
  value: boolean,
): void {
  attribute(context, realEl, name, value ? "" : null);
}

function applyURLDecision(
  context: DocumentContext,
  realEl: Element,
  name: string,
  decide: () => SafeURLDecision,
): SafeURLDecision {
  return context.setURLAttribute(realEl, name, decide);
}

export function createSafeElement(context: DocumentContext, realEl: Element): SafeElement {
  const known = context.registry.getWrapper<SafeElement>(realEl);
  if (known) return known;
  return context.complete(buildSafeElement(context, realEl), realEl);
}

function buildSafeElement(context: DocumentContext, realEl: Element): SafeElement {
  const htmlEl = realEl as HTMLElement;

  const wrapper: SafeElement = {
    appendChild(child: SafeElement | SafeTextNode): void {
      context.nodeOperation(realEl, () => {
        context.platform.appendChild(realEl, context.requireRealNode(child));
      });
    },
    insertBefore(newChild: SafeElement | SafeTextNode, reference: SafeElement | SafeTextNode): void {
      context.nodeOperation(realEl, () => {
        context.platform.insertBefore(
          realEl,
          context.requireRealNode(newChild),
          context.requireRealNode(reference),
        );
      });
    },
    removeChild(child: SafeElement | SafeTextNode): void {
      context.nodeOperation(realEl, () => {
        context.platform.removeChild(realEl, context.requireRealNode(child));
      });
    },
    replaceChild(newChild: SafeElement | SafeTextNode, oldChild: SafeElement | SafeTextNode): void {
      context.nodeOperation(realEl, () => {
        context.platform.replaceChild(
          realEl,
          context.requireRealNode(newChild),
          context.requireRealNode(oldChild),
        );
      });
    },
    detach(): void { context.detachNode(realEl); },
    remove(): void { context.detachNode(realEl); },
    dispose(): void { context.disposeNode(realEl); },

    setText(value: string): void {
      const text = String(value ?? "");
      context.setText(realEl, "textContent", text, () => {
        context.platform.setTextContent(htmlEl, text);
      });
    },
    getText(): string {
      return context.nodeOperation(realEl, () => context.platform.getTextContent(htmlEl) ?? "");
    },

    setClass(value: string): void { attribute(context, realEl, "class", String(value)); },
    getClass(): string {
      return context.nodeOperation(
        realEl,
        () => context.platform.getAttribute(realEl, "class") ?? "",
      );
    },
    setId(value: string): void { attribute(context, realEl, "id", String(value)); },
    getId(): string {
      return context.nodeOperation(
        realEl,
        () => context.platform.getAttribute(realEl, "id") ?? "",
      );
    },
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
        return context.platform.getAttribute(realEl, `data-${key}`) ?? undefined;
      });
    },
    setAria(key: string, value: string): void {
      const valid = typeof key === "string" && isAttrKeySafe(key);
      attribute(context, realEl, valid ? `aria-${key}` : "aria-invalid", valid ? String(value) : undefined);
    },
    getAria(key: string): string | undefined {
      return context.nodeOperation(realEl, () => {
        if (typeof key !== "string" || !isAttrKeySafe(key)) return undefined;
        return context.platform.getAttribute(realEl, `aria-${key}`) ?? undefined;
      });
    },

    onClick(handler: EventHandler<SafeMouseEvent>): EventCleanup { return addSafeEvent(context, realEl, "click", "mouse", handler); },
    onDblClick(handler: EventHandler<SafeMouseEvent>): EventCleanup { return addSafeEvent(context, realEl, "dblclick", "mouse", handler); },
    onMouseDown(handler: EventHandler<SafeMouseEvent>): EventCleanup { return addSafeEvent(context, realEl, "mousedown", "mouse", handler); },
    onMouseUp(handler: EventHandler<SafeMouseEvent>): EventCleanup { return addSafeEvent(context, realEl, "mouseup", "mouse", handler); },
    onMouseEnter(handler: EventHandler<SafeMouseEvent>): EventCleanup { return addSafeEvent(context, realEl, "mouseenter", "mouse", handler); },
    onMouseLeave(handler: EventHandler<SafeMouseEvent>): EventCleanup { return addSafeEvent(context, realEl, "mouseleave", "mouse", handler); },
    onMouseMove(handler: EventHandler<SafeMouseEvent>): EventCleanup { return addSafeEvent(context, realEl, "mousemove", "mouse", handler); },
    onPointerDown(handler: EventHandler<SafePointerEvent>): EventCleanup { return addSafeEvent(context, realEl, "pointerdown", "pointer", handler); },
    onPointerUp(handler: EventHandler<SafePointerEvent>): EventCleanup { return addSafeEvent(context, realEl, "pointerup", "pointer", handler); },
    onPointerMove(handler: EventHandler<SafePointerEvent>): EventCleanup { return addSafeEvent(context, realEl, "pointermove", "pointer", handler); },
    onContextMenu(handler: EventHandler<SafeMouseEvent>): EventCleanup { return addSafeEvent(context, realEl, "contextmenu", "mouse", handler); },

    onKeyDown(handler: EventHandler<SafeKeyboardEvent>): EventCleanup { return addSafeEvent(context, realEl, "keydown", "keyboard", handler); },
    onKeyUp(handler: EventHandler<SafeKeyboardEvent>): EventCleanup { return addSafeEvent(context, realEl, "keyup", "keyboard", handler); },

    onFocus(handler: EventHandler<SafeFocusEvent>): EventCleanup { return addSafeEvent(context, realEl, "focus", "focus", handler); },
    onBlur(handler: EventHandler<SafeFocusEvent>): EventCleanup { return addSafeEvent(context, realEl, "blur", "focus", handler); },

    onTouchStart(handler: EventHandler<SafeTouchEvent>): EventCleanup { return addSafeEvent(context, realEl, "touchstart", "touch", handler); },
    onTouchEnd(handler: EventHandler<SafeTouchEvent>): EventCleanup { return addSafeEvent(context, realEl, "touchend", "touch", handler); },
    onTouchMove(handler: EventHandler<SafeTouchEvent>): EventCleanup { return addSafeEvent(context, realEl, "touchmove", "touch", handler); },

    onScroll(handler: EventHandler<SafeGenericEvent>): EventCleanup { return addSafeEvent(context, realEl, "scroll", "generic", handler); },

    style: createSafeStyle(context, htmlEl),
  };

  return wrapper;
}

export function createSafeInputElement(context: DocumentContext, realEl: HTMLInputElement): SafeInputElement {
  const known = context.registry.getWrapper<SafeInputElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setType(type: string): void {
      attribute(context, realEl, "type", isInputTypeAllowed(type) ? type.toLowerCase() : undefined);
    },
    setValue(value: string): void {
      const text = String(value);
      context.setText(realEl, "value", text, () => {
        context.platform.setInputValue(realEl, text);
      });
    },
    getValue(): string {
      return context.nodeOperation(realEl, () => context.platform.getInputValue(realEl));
    },
    setPlaceholder(value: string): void { attribute(context, realEl, "placeholder", String(value)); },
    setDisabled(value: boolean): void { booleanAttribute(context, realEl, "disabled", value); },
    setReadonly(value: boolean): void { booleanAttribute(context, realEl, "readonly", value); },
    setRequired(value: boolean): void { booleanAttribute(context, realEl, "required", value); },
    setChecked(value: boolean): void {
      context.nodeOperation(realEl, () => {
        context.platform.setInputChecked(realEl, !!value);
      });
    },
    getChecked(): boolean {
      return context.nodeOperation(realEl, () => context.platform.getInputChecked(realEl));
    },
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
    onChange(handler: EventHandler<SafeInputEvent>): EventCleanup {
      return addSafeEvent(context, realEl, "change", "input", handler);
    },
    onInput(handler: EventHandler<SafeInputEvent>): EventCleanup {
      return addSafeEvent(context, realEl, "input", "input", handler);
    },
  }) as SafeInputElement, realEl);
}

export function createSafeTextareaElement(context: DocumentContext, realEl: HTMLTextAreaElement): SafeTextareaElement {
  const known = context.registry.getWrapper<SafeTextareaElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setValue(value: string): void {
      const text = String(value);
      context.setText(realEl, "value", text, () => {
        context.platform.setTextareaValue(realEl, text);
      });
    },
    getValue(): string {
      return context.nodeOperation(realEl, () => context.platform.getTextareaValue(realEl));
    },
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
    onChange(handler: EventHandler<SafeInputEvent>): EventCleanup {
      return addSafeEvent(context, realEl, "change", "input", handler);
    },
    onInput(handler: EventHandler<SafeInputEvent>): EventCleanup {
      return addSafeEvent(context, realEl, "input", "input", handler);
    },
  }) as SafeTextareaElement, realEl);
}

export function createSafeSelectElement(context: DocumentContext, realEl: HTMLSelectElement): SafeSelectElement {
  const known = context.registry.getWrapper<SafeSelectElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setValue(value: string): void {
      const text = String(value);
      context.setText(realEl, "value", text, () => {
        context.platform.setSelectValue(realEl, text);
      });
    },
    getValue(): string {
      return context.nodeOperation(realEl, () => context.platform.getSelectValue(realEl));
    },
    setDisabled(value: boolean): void { booleanAttribute(context, realEl, "disabled", value); },
    setRequired(value: boolean): void { booleanAttribute(context, realEl, "required", value); },
    setMultiple(value: boolean): void { booleanAttribute(context, realEl, "multiple", value); },
    setName(value: string): void { attribute(context, realEl, "name", String(value)); },
    onChange(handler: EventHandler<SafeInputEvent>): EventCleanup {
      return addSafeEvent(context, realEl, "change", "input", handler);
    },
  }) as SafeSelectElement, realEl);
}

export function createSafeOptionElement(context: DocumentContext, realEl: HTMLOptionElement): SafeOptionElement {
  const known = context.registry.getWrapper<SafeOptionElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setValue(value: string): void { attribute(context, realEl, "value", String(value)); },
    setSelected(value: boolean): void {
      context.nodeOperation(realEl, () => {
        context.platform.setOptionSelected(realEl, !!value);
      });
    },
    setDisabled(value: boolean): void { booleanAttribute(context, realEl, "disabled", value); },
    setLabel(value: string): void { attribute(context, realEl, "label", String(value)); },
  }) as SafeOptionElement, realEl);
}

export function createSafeButtonElement(context: DocumentContext, realEl: HTMLButtonElement): SafeButtonElement {
  const known = context.registry.getWrapper<SafeButtonElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setType(type: string): void {
      attribute(context, realEl, "type", isButtonTypeAllowed(type) ? type.toLowerCase() : undefined);
    },
    setDisabled(value: boolean): void { booleanAttribute(context, realEl, "disabled", value); },
    setName(value: string): void { attribute(context, realEl, "name", String(value)); },
    setValue(value: string): void { attribute(context, realEl, "value", String(value)); },
  }) as SafeButtonElement, realEl);
}

export function createSafeLabelElement(context: DocumentContext, realEl: HTMLLabelElement): SafeLabelElement {
  const known = context.registry.getWrapper<SafeLabelElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setFor(value: string): void { attribute(context, realEl, "for", String(value)); },
  }) as SafeLabelElement, realEl);
}

export function createSafeFieldsetElement(context: DocumentContext, realEl: HTMLFieldSetElement): SafeFieldsetElement {
  const known = context.registry.getWrapper<SafeFieldsetElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setDisabled(value: boolean): void { booleanAttribute(context, realEl, "disabled", value); },
  }) as SafeFieldsetElement, realEl);
}

export function createSafeImageElement(
  context: DocumentContext,
  realEl: HTMLImageElement,
): SafeImageElement {
  const known = context.registry.getWrapper<SafeImageElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setSrc(url: string): SafeURLDecision {
      return applyURLDecision(
        context,
        realEl,
        "src",
        () => context.urlPolicy.decide("image.src", url),
      );
    },
    setAlt(value: string): void { attribute(context, realEl, "alt", String(value)); },
    setWidth(value: number): void { attribute(context, realEl, "width", String(Number(value) | 0)); },
    setHeight(value: number): void {
      attribute(context, realEl, "height", String(Number(value) | 0));
    },
    setLoading(value: string): void { attribute(context, realEl, "loading", String(value)); },
  }) as SafeImageElement, realEl);
}

export function createSafeAnchorElement(
  context: DocumentContext,
  realEl: HTMLAnchorElement,
): SafeAnchorElement {
  const known = context.registry.getWrapper<SafeAnchorElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setHref(url: string): SafeURLDecision {
      return applyURLDecision(
        context,
        realEl,
        "href",
        () => context.urlPolicy.decide("anchor.href", url),
      );
    },
  }) as SafeAnchorElement, realEl);
}

export function createSafeVideoElement(
  context: DocumentContext,
  realEl: HTMLVideoElement,
): SafeVideoElement {
  const known = context.registry.getWrapper<SafeVideoElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setSrc(url: string): SafeURLDecision {
      return applyURLDecision(
        context,
        realEl,
        "src",
        () => context.urlPolicy.decide("video.src", url),
      );
    },
    setWidth(value: number): void { attribute(context, realEl, "width", String(Number(value) | 0)); },
    setHeight(value: number): void {
      attribute(context, realEl, "height", String(Number(value) | 0));
    },
    setControls(value: boolean): void { booleanAttribute(context, realEl, "controls", value); },
    setAutoplay(value: boolean): void { booleanAttribute(context, realEl, "autoplay", value); },
    setLoop(value: boolean): void { booleanAttribute(context, realEl, "loop", value); },
    setMuted(value: boolean): void { booleanAttribute(context, realEl, "muted", value); },
    setPoster(url: string): SafeURLDecision {
      return applyURLDecision(
        context,
        realEl,
        "poster",
        () => context.urlPolicy.decide("video.poster", url),
      );
    },
  }) as SafeVideoElement, realEl);
}

export function createSafeAudioElement(
  context: DocumentContext,
  realEl: HTMLAudioElement,
): SafeAudioElement {
  const known = context.registry.getWrapper<SafeAudioElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setSrc(url: string): SafeURLDecision {
      return applyURLDecision(
        context,
        realEl,
        "src",
        () => context.urlPolicy.decide("audio.src", url),
      );
    },
    setControls(value: boolean): void { booleanAttribute(context, realEl, "controls", value); },
    setAutoplay(value: boolean): void { booleanAttribute(context, realEl, "autoplay", value); },
    setLoop(value: boolean): void { booleanAttribute(context, realEl, "loop", value); },
    setMuted(value: boolean): void { booleanAttribute(context, realEl, "muted", value); },
  }) as SafeAudioElement, realEl);
}

export function createSafeSourceElement(
  context: DocumentContext,
  realEl: HTMLSourceElement,
): SafeSourceElement {
  const known = context.registry.getWrapper<SafeSourceElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setSrc(url: string): SafeURLDecision {
      return applyURLDecision(
        context,
        realEl,
        "src",
        () => context.urlPolicy.decide("source.src", url),
      );
    },
    setType(value: string): void { attribute(context, realEl, "type", String(value)); },
  }) as SafeSourceElement, realEl);
}

export function createSafeCanvasElement(context: DocumentContext, realEl: HTMLCanvasElement): SafeCanvasElement {
  const known = context.registry.getWrapper<SafeCanvasElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setWidth(value: number): void { attribute(context, realEl, "width", String(Number(value) | 0)); },
    setHeight(value: number): void {
      attribute(context, realEl, "height", String(Number(value) | 0));
    },
  }) as SafeCanvasElement, realEl);
}

export function createSafeTableCellElement(context: DocumentContext, realEl: HTMLTableCellElement): SafeTableCellElement {
  const known = context.registry.getWrapper<SafeTableCellElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setColspan(value: number): void {
      attribute(context, realEl, "colspan", String(Number(value) | 0));
    },
    setRowspan(value: number): void {
      attribute(context, realEl, "rowspan", String(Number(value) | 0));
    },
    setScope(value: string): void { attribute(context, realEl, "scope", String(value)); },
    setHeaders(value: string): void { attribute(context, realEl, "headers", String(value)); },
  }) as SafeTableCellElement, realEl);
}

export function createSafeDetailsElement(context: DocumentContext, realEl: HTMLDetailsElement): SafeDetailsElement {
  const known = context.registry.getWrapper<SafeDetailsElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setOpen(value: boolean): void { booleanAttribute(context, realEl, "open", value); },
  }) as SafeDetailsElement, realEl);
}

export function createSafeDialogElement(context: DocumentContext, realEl: HTMLDialogElement): SafeDialogElement {
  const known = context.registry.getWrapper<SafeDialogElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setOpen(value: boolean): void { booleanAttribute(context, realEl, "open", value); },
  }) as SafeDialogElement, realEl);
}

export function createSafeProgressElement(context: DocumentContext, realEl: HTMLProgressElement): SafeProgressElement {
  const known = context.registry.getWrapper<SafeProgressElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setValue(value: number): void { attribute(context, realEl, "value", String(Number(value))); },
    setMax(value: number): void { attribute(context, realEl, "max", String(Number(value))); },
  }) as SafeProgressElement, realEl);
}

export function createSafeMeterElement(context: DocumentContext, realEl: HTMLMeterElement): SafeMeterElement {
  const known = context.registry.getWrapper<SafeMeterElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
    setValue(value: number): void { attribute(context, realEl, "value", String(Number(value))); },
    setMin(value: number): void { attribute(context, realEl, "min", String(Number(value))); },
    setMax(value: number): void { attribute(context, realEl, "max", String(Number(value))); },
  }) as SafeMeterElement, realEl);
}

export function createSafeListElement(context: DocumentContext, realEl: HTMLUListElement | HTMLOListElement): SafeListElement {
  const known = context.registry.getWrapper<SafeListElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
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
  }) as SafeListElement, realEl);
}

export function createSafeDescriptionListElement(context: DocumentContext, realEl: HTMLDListElement): SafeDescriptionListElement {
  const known = context.registry.getWrapper<SafeDescriptionListElement>(realEl);
  if (known) return known;
  const base = buildSafeElement(context, realEl);

  return context.complete(Object.assign(base, {
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
  }) as SafeDescriptionListElement, realEl);
}
