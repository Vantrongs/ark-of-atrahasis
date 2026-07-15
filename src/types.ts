export interface SafeEvent {
  type: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  target: {
    id: string;
    value: unknown;
  };
  currentTarget: {
    id: string;
    value: unknown;
  };
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
}

export type SafeStyle = Record<string, string>;

export type EventHandler = (event: SafeEvent) => void;
export type EventCleanup = () => void;

export interface SafeTextNode {
  setText(value: string): void;
  getText(): string;
  remove(): void;
}

export interface SafeStyleSheet {
  setCSS(value: string): void;
  getCSS(): string;
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

  onClick(handler: EventHandler): EventCleanup;
  onDblClick(handler: EventHandler): EventCleanup;
  onMouseDown(handler: EventHandler): EventCleanup;
  onMouseUp(handler: EventHandler): EventCleanup;
  onMouseEnter(handler: EventHandler): EventCleanup;
  onMouseLeave(handler: EventHandler): EventCleanup;
  onMouseMove(handler: EventHandler): EventCleanup;
  onPointerDown(handler: EventHandler): EventCleanup;
  onPointerUp(handler: EventHandler): EventCleanup;
  onPointerMove(handler: EventHandler): EventCleanup;
  onContextMenu(handler: EventHandler): EventCleanup;

  onKeyDown(handler: EventHandler): EventCleanup;
  onKeyUp(handler: EventHandler): EventCleanup;

  onFocus(handler: EventHandler): EventCleanup;
  onBlur(handler: EventHandler): EventCleanup;

  onTouchStart(handler: EventHandler): EventCleanup;
  onTouchEnd(handler: EventHandler): EventCleanup;
  onTouchMove(handler: EventHandler): EventCleanup;

  onScroll(handler: EventHandler): EventCleanup;

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
  onChange(handler: EventHandler): EventCleanup;
  onInput(handler: EventHandler): EventCleanup;
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
  onChange(handler: EventHandler): EventCleanup;
  onInput(handler: EventHandler): EventCleanup;
}

export interface SafeSelectElement extends SafeElement {
  setValue(value: string): void;
  getValue(): string;
  setDisabled(value: boolean): void;
  setRequired(value: boolean): void;
  setMultiple(value: boolean): void;
  setName(value: string): void;
  onChange(handler: EventHandler): EventCleanup;
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
  setSrc(url: string): void;
  setAlt(value: string): void;
  setWidth(value: number): void;
  setHeight(value: number): void;
  setLoading(value: string): void;
}

export interface SafeAnchorElement extends SafeElement {
  setHref(url: string): void;
}

export interface SafeVideoElement extends SafeElement {
  setSrc(url: string): void;
  setWidth(value: number): void;
  setHeight(value: number): void;
  setControls(value: boolean): void;
  setAutoplay(value: boolean): void;
  setLoop(value: boolean): void;
  setMuted(value: boolean): void;
  setPoster(url: string): void;
}

export interface SafeAudioElement extends SafeElement {
  setSrc(url: string): void;
  setControls(value: boolean): void;
  setAutoplay(value: boolean): void;
  setLoop(value: boolean): void;
  setMuted(value: boolean): void;
}

export interface SafeSourceElement extends SafeElement {
  setSrc(url: string): void;
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

export interface SafeDocument {
  /** Mount operations target the claimed ShadowRoot without exposing a root wrapper. */
  appendChild(child: SafeElement | SafeTextNode): void;
  insertBefore(
    newChild: SafeElement | SafeTextNode,
    reference: SafeElement | SafeTextNode,
  ): void;
  removeChild(child: SafeElement | SafeTextNode): void;
  replaceChild(
    newChild: SafeElement | SafeTextNode,
    oldChild: SafeElement | SafeTextNode,
  ): void;

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

  createStyle(): SafeStyleSheet;

  getElement(id: string): SafeElement | null;
}
