import type { SafeURLDecision, SafeURLPolicy } from "./url-policy.ts";
import type { SafeStylePolicy } from "./style-policy.ts";

export type SafeEventKind =
  | "generic"
  | "keyboard"
  | "mouse"
  | "pointer"
  | "touch"
  | "focus"
  | "input";

export interface SafeEventTargetSnapshot {
  readonly id: string;
  /** Present only for a branded standard form control. */
  readonly value?: string;
  /** Present only for a branded HTMLInputElement. */
  readonly checked?: boolean;
}

export interface SafeEventBase<Kind extends SafeEventKind> {
  readonly kind: Kind;
  readonly type: string;
  readonly bubbles: boolean;
  readonly cancelable: boolean;
  readonly composed: boolean;
  readonly defaultPrevented: boolean;
  readonly eventPhase: number;
  readonly timeStamp: number;
  readonly target: SafeEventTargetSnapshot;
  readonly currentTarget: SafeEventTargetSnapshot;

  /** Returns false once the synchronous handler invocation has ended. */
  readonly preventDefault: () => boolean;
  /** Returns false once the synchronous handler invocation has ended. */
  readonly stopPropagation: () => boolean;
  /** Returns false once the synchronous handler invocation has ended. */
  readonly stopImmediatePropagation: () => boolean;
}

export interface SafeModifierSnapshot {
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
}

export interface SafeGenericEvent extends SafeEventBase<"generic"> {}

export interface SafeKeyboardEvent extends SafeEventBase<"keyboard">, SafeModifierSnapshot {
  readonly key: string;
  readonly code: string;
  readonly location: number;
  readonly repeat: boolean;
  readonly isComposing: boolean;
}

export interface SafeMouseEvent extends SafeEventBase<"mouse">, SafeModifierSnapshot {
  readonly screenX: number;
  readonly screenY: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly pageX: number;
  readonly pageY: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly movementX: number;
  readonly movementY: number;
  readonly button: number;
  readonly buttons: number;
  readonly relatedTarget: SafeEventTargetSnapshot | null;
}

export interface SafePointerEvent extends SafeEventBase<"pointer">, SafeModifierSnapshot {
  readonly screenX: number;
  readonly screenY: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly pageX: number;
  readonly pageY: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly movementX: number;
  readonly movementY: number;
  readonly button: number;
  readonly buttons: number;
  readonly relatedTarget: SafeEventTargetSnapshot | null;
  readonly pointerId: number;
  readonly width: number;
  readonly height: number;
  readonly pressure: number;
  readonly tangentialPressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly twist: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;
}

export interface SafeTouchSnapshot {
  readonly identifier: number;
  readonly screenX: number;
  readonly screenY: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly pageX: number;
  readonly pageY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly rotationAngle: number;
  readonly force: number;
  readonly target: SafeEventTargetSnapshot;
}

export interface SafeTouchEvent extends SafeEventBase<"touch">, SafeModifierSnapshot {
  readonly touches: readonly SafeTouchSnapshot[];
  readonly targetTouches: readonly SafeTouchSnapshot[];
  readonly changedTouches: readonly SafeTouchSnapshot[];
}

export interface SafeFocusEvent extends SafeEventBase<"focus"> {
  readonly relatedTarget: SafeEventTargetSnapshot | null;
}

export interface SafeInputEvent extends SafeEventBase<"input"> {
  readonly data: string | null;
  readonly inputType: string;
  readonly isComposing: boolean;
}

export type SafeEvent =
  | SafeGenericEvent
  | SafeKeyboardEvent
  | SafeMouseEvent
  | SafePointerEvent
  | SafeTouchEvent
  | SafeFocusEvent
  | SafeInputEvent;

export interface SafeStyle {
  /** Reads the canonical serialized value, or undefined when denied/invalid. */
  readonly get: (property: string) => string | undefined;
  /** Sets one policy-approved property. No coercion or URL-bearing CSS occurs. */
  readonly set: (property: string, value: string) => boolean;
  /** Removes one policy-approved property. */
  readonly remove: (property: string) => boolean;
}

export type EventHandler<Event extends SafeEvent = SafeEvent> = (event: Event) => void;
export type EventCleanup = () => void;

export interface SafeTextNode {
  setText(value: string): void;
  getText(): string;
  remove(): void;
}

export interface SafeElement {
  appendChild(child: SafeElement | SafeTextNode): void;
  insertBefore(newChild: SafeElement | SafeTextNode, reference: SafeElement | SafeTextNode): void;
  removeChild(child: SafeElement | SafeTextNode): void;
  replaceChild(newChild: SafeElement | SafeTextNode, oldChild: SafeElement | SafeTextNode): void;
  remove(): void;

  setText(value: string): void;
  getText(): string;

  setClass(value: string): void;
  getClass(): string;
  setId(value: string): void;
  getId(): string;
  setTitle(value: string): void;
  setRole(value: string): void;
  setTabIndex(value: number): void;
  setHidden(value: boolean): void;
  setLang(value: string): void;
  setDir(value: string): void;
  setSpellcheck(value: boolean): void;

  setData(key: string, value: string): void;
  getData(key: string): string | undefined;
  setAria(key: string, value: string): void;
  getAria(key: string): string | undefined;

  onClick(handler: EventHandler<SafeMouseEvent>): EventCleanup;
  onDblClick(handler: EventHandler<SafeMouseEvent>): EventCleanup;
  onMouseDown(handler: EventHandler<SafeMouseEvent>): EventCleanup;
  onMouseUp(handler: EventHandler<SafeMouseEvent>): EventCleanup;
  onMouseEnter(handler: EventHandler<SafeMouseEvent>): EventCleanup;
  onMouseLeave(handler: EventHandler<SafeMouseEvent>): EventCleanup;
  onMouseMove(handler: EventHandler<SafeMouseEvent>): EventCleanup;
  onPointerDown(handler: EventHandler<SafePointerEvent>): EventCleanup;
  onPointerUp(handler: EventHandler<SafePointerEvent>): EventCleanup;
  onPointerMove(handler: EventHandler<SafePointerEvent>): EventCleanup;
  onContextMenu(handler: EventHandler<SafeMouseEvent>): EventCleanup;

  onKeyDown(handler: EventHandler<SafeKeyboardEvent>): EventCleanup;
  onKeyUp(handler: EventHandler<SafeKeyboardEvent>): EventCleanup;

  onFocus(handler: EventHandler<SafeFocusEvent>): EventCleanup;
  onBlur(handler: EventHandler<SafeFocusEvent>): EventCleanup;

  onTouchStart(handler: EventHandler<SafeTouchEvent>): EventCleanup;
  onTouchEnd(handler: EventHandler<SafeTouchEvent>): EventCleanup;
  onTouchMove(handler: EventHandler<SafeTouchEvent>): EventCleanup;

  onScroll(handler: EventHandler<SafeGenericEvent>): EventCleanup;

  style: SafeStyle;
}

export interface SafeInputElement extends SafeElement {
  setType(type: string): void;
  setValue(value: string): void;
  getValue(): string;
  setPlaceholder(value: string): void;
  setDisabled(value: boolean): void;
  setReadonly(value: boolean): void;
  setRequired(value: boolean): void;
  setChecked(value: boolean): void;
  getChecked(): boolean;
  setMin(value: string): void;
  setMax(value: string): void;
  setStep(value: string): void;
  setMinLength(value: number): void;
  setMaxLength(value: number): void;
  setPattern(value: string): void;
  setAutocomplete(value: string): void;
  setAutofocus(value: boolean): void;
  setName(value: string): void;
  setInputMode(value: string): void;
  setEnterKeyHint(value: string): void;
  onChange(handler: EventHandler<SafeInputEvent>): EventCleanup;
  onInput(handler: EventHandler<SafeInputEvent>): EventCleanup;
}

export interface SafeTextareaElement extends SafeElement {
  setValue(value: string): void;
  getValue(): string;
  setPlaceholder(value: string): void;
  setDisabled(value: boolean): void;
  setReadonly(value: boolean): void;
  setRequired(value: boolean): void;
  setMinLength(value: number): void;
  setMaxLength(value: number): void;
  setRows(value: number): void;
  setCols(value: number): void;
  setWrap(value: string): void;
  setName(value: string): void;
  setAutocomplete(value: string): void;
  onChange(handler: EventHandler<SafeInputEvent>): EventCleanup;
  onInput(handler: EventHandler<SafeInputEvent>): EventCleanup;
}

export interface SafeSelectElement extends SafeElement {
  setValue(value: string): void;
  getValue(): string;
  setDisabled(value: boolean): void;
  setRequired(value: boolean): void;
  setMultiple(value: boolean): void;
  setName(value: string): void;
  onChange(handler: EventHandler<SafeInputEvent>): EventCleanup;
}

export interface SafeOptionElement extends SafeElement {
  setValue(value: string): void;
  setSelected(value: boolean): void;
  setDisabled(value: boolean): void;
  setLabel(value: string): void;
}

export interface SafeButtonElement extends SafeElement {
  setType(type: string): void;
  setDisabled(value: boolean): void;
  setName(value: string): void;
  setValue(value: string): void;
}

export interface SafeLabelElement extends SafeElement {
  setFor(value: string): void;
}

export interface SafeFieldsetElement extends SafeElement {
  setDisabled(value: boolean): void;
}

export interface SafeImageElement extends SafeElement {
  setSrc(url: string): SafeURLDecision;
  setAlt(value: string): void;
  setWidth(value: number): void;
  setHeight(value: number): void;
  setLoading(value: string): void;
}

export interface SafeAnchorElement extends SafeElement {
  setHref(url: string): SafeURLDecision;
}

export interface SafeVideoElement extends SafeElement {
  setSrc(url: string): SafeURLDecision;
  setWidth(value: number): void;
  setHeight(value: number): void;
  setControls(value: boolean): void;
  setAutoplay(value: boolean): void;
  setLoop(value: boolean): void;
  setMuted(value: boolean): void;
  setPoster(url: string): SafeURLDecision;
}

export interface SafeAudioElement extends SafeElement {
  setSrc(url: string): SafeURLDecision;
  setControls(value: boolean): void;
  setAutoplay(value: boolean): void;
  setLoop(value: boolean): void;
  setMuted(value: boolean): void;
}

export interface SafeSourceElement extends SafeElement {
  setSrc(url: string): SafeURLDecision;
  setType(value: string): void;
}

export interface SafeCanvasElement extends SafeElement {
  setWidth(value: number): void;
  setHeight(value: number): void;
}

export interface SafeTableCellElement extends SafeElement {
  setColspan(value: number): void;
  setRowspan(value: number): void;
  setScope(value: string): void;
  setHeaders(value: string): void;
}

export interface SafeDetailsElement extends SafeElement {
  setOpen(value: boolean): void;
}

export interface SafeDialogElement extends SafeElement {
  setOpen(value: boolean): void;
}

export interface SafeProgressElement extends SafeElement {
  setValue(value: number): void;
  setMax(value: number): void;
}

export interface SafeMeterElement extends SafeElement {
  setValue(value: number): void;
  setMin(value: number): void;
  setMax(value: number): void;
}

export type ListType = "unordered" | "ordered" | "description";

export interface SafeListElement extends SafeElement {
  createItem(): SafeElement;
}

export interface SafeDescriptionListElement extends SafeElement {
  createTerm(): SafeElement;
  createDescription(): SafeElement;
}

export type FormattingTag =
  | "strong" | "em" | "small" | "b" | "i" | "u"
  | "code" | "kbd" | "samp" | "var"
  | "sub" | "sup" | "mark" | "abbr" | "cite";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface SafeDocumentOptions {
  /** Missing policy means every URL-bearing sink is denied. */
  readonly urlPolicy?: SafeURLPolicy;
  /** Missing policy means every inline style property is denied. */
  readonly stylePolicy?: SafeStylePolicy;
}

export interface SafeDocument {
  createDiv(): SafeElement;
  createSpan(): SafeElement;
  createSection(): SafeElement;
  createArticle(): SafeElement;
  createNav(): SafeElement;
  createHeader(): SafeElement;
  createFooter(): SafeElement;
  createMain(): SafeElement;
  createAside(): SafeElement;
  createFigure(): SafeElement;
  createFigcaption(): SafeElement;

  createText(): SafeElement;
  createHeading(level: HeadingLevel): SafeElement;
  createFormatting(format: FormattingTag): SafeElement;

  createBlockquote(): SafeElement;
  createPre(): SafeElement;

  createList(type: ListType): SafeListElement | SafeDescriptionListElement;
  createListItem(): SafeElement;
  createTerm(): SafeElement;
  createDescription(): SafeElement;

  createTable(): SafeElement;
  createThead(): SafeElement;
  createTbody(): SafeElement;
  createTfoot(): SafeElement;
  createTr(): SafeElement;
  createTh(): SafeTableCellElement;
  createTd(): SafeTableCellElement;
  createCaption(): SafeElement;
  createColgroup(): SafeElement;
  createCol(): SafeElement;

  createButton(): SafeButtonElement;
  createInput(): SafeInputElement;
  createSelect(): SafeSelectElement;
  createOption(): SafeOptionElement;
  createOptgroup(): SafeElement;
  createTextarea(): SafeTextareaElement;
  createLabel(): SafeLabelElement;
  createFieldset(): SafeFieldsetElement;
  createLegend(): SafeElement;

  createImage(): SafeImageElement;
  createVideo(): SafeVideoElement;
  createAudio(): SafeAudioElement;
  createSource(): SafeSourceElement;
  createTrack(): SafeElement;
  createPicture(): SafeElement;
  createCanvas(): SafeCanvasElement;

  createAnchor(): SafeAnchorElement;
  createDetails(): SafeDetailsElement;
  createSummary(): SafeElement;
  createDialog(): SafeDialogElement;
  createHr(): SafeElement;
  createBr(): SafeElement;
  createWbr(): SafeElement;
  createProgress(): SafeProgressElement;
  createMeter(): SafeMeterElement;
  createOutput(): SafeElement;
  createTime(): SafeElement;
  createData(): SafeElement;
  createRuby(): SafeElement;
  createRt(): SafeElement;
  createRp(): SafeElement;

  createRawText(): SafeTextNode;

  getElement(id: string): SafeElement | null;
}
