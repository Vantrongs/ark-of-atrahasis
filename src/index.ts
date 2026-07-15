import type {
  SafeDocument,
  SafeElement,
  SafeTextNode,
  FormattingTag,
  HeadingLevel,
  ListType,
  SafeDocumentOptions,
} from "./types.ts";
import {
  createSafeElement,
  createSafeInputElement,
  createSafeTextareaElement,
  createSafeSelectElement,
  createSafeOptionElement,
  createSafeButtonElement,
  createSafeLabelElement,
  createSafeFieldsetElement,
  createSafeImageElement,
  createSafeAnchorElement,
  createSafeVideoElement,
  createSafeAudioElement,
  createSafeSourceElement,
  createSafeCanvasElement,
  createSafeTableCellElement,
  createSafeDetailsElement,
  createSafeDialogElement,
  createSafeProgressElement,
  createSafeMeterElement,
  createSafeListElement,
  createSafeDescriptionListElement,
} from "./element.ts";
import { createSafeTextNode } from "./text.ts";
import { createURLPolicy } from "./url-policy.ts";
import { createStylePolicy } from "./style-policy.ts";
import { requireFiniteNumber, requirePrimitiveString } from "./primitives.ts";
import { invalidArgument } from "./errors.ts";

export type {
  SafeDocument,
  SafeElement,
  SafeTextNode,
  SafeEvent,
  SafeEventBase,
  SafeEventKind,
  SafeEventTargetSnapshot,
  SafeModifierSnapshot,
  SafeGenericEvent,
  SafeKeyboardEvent,
  SafeMouseEvent,
  SafePointerEvent,
  SafeTouchSnapshot,
  SafeTouchEvent,
  SafeFocusEvent,
  SafeInputEvent,
  SafeStyle,
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
  ListType,
  FormattingTag,
  HeadingLevel,
  EventHandler,
  EventCleanup,
  SafeDocumentOptions,
} from "./types.ts";

export {
  SAFE_STYLE_PROPERTIES,
  canonicalizeStyleProperty,
  createStylePolicy,
  type SafeStylePolicy,
  type SafeStyleProperty,
  type StylePolicyEngine,
} from "./style-policy.ts";

export {
  URL_SINKS,
  createURLPolicy,
  type SafeURLDecision,
  type SafeURLPolicy,
  type URLPolicyEngine,
  type URLProtocol,
  type URLSink,
  type URLSinkPolicy,
} from "./url-policy.ts";
export { SafeDOMError, type SafeDOMErrorCode } from "./errors.ts";
export {
  requireFiniteNumber,
  requireInteger,
  requirePrimitiveBoolean,
  requirePrimitiveString,
} from "./primitives.ts";
export {
  scanCSSNetworkRisk,
  type CSSNetworkRisk,
  type CSSNetworkRiskDecision,
} from "./validation.ts";

const FORMATTING_TAGS = new Set<string>([
  "strong", "em", "small", "b", "i", "u",
  "code", "kbd", "samp", "var",
  "sub", "sup", "mark", "abbr", "cite",
]);

export function createSafeDocument(
  pluginRootID: string,
  options: SafeDocumentOptions = {},
): SafeDocument {
  const rootID = requirePrimitiveString(pluginRootID, "createSafeDocument.rootID");
  const pluginRoot: HTMLElement | null = document.getElementById(rootID);
  const localNameGetter = document.defaultView?.Element === undefined
    ? undefined
    : Object.getOwnPropertyDescriptor(document.defaultView.Element.prototype, "localName")?.get;
  const getLocalName = (element: Element): string | undefined => {
    if (typeof localNameGetter !== "function") return undefined;
    try {
      const localName = Reflect.apply(localNameGetter, element, []);
      return typeof localName === "string" ? localName : undefined;
    } catch {
      return undefined;
    }
  };

  const pluginRootLocalName = pluginRoot === null ? undefined : getLocalName(pluginRoot);
  if (!pluginRoot || pluginRootLocalName === undefined || pluginRootLocalName === "style") {
    throw invalidArgument("createSafeDocument.rootID");
  }

  const URLImpl = document.defaultView?.URL ?? URL;
  const urlPolicy = createURLPolicy(options.urlPolicy, URLImpl);
  const stylePolicy = createStylePolicy(options.stylePolicy);
  const simple = (tag: string): SafeElement => createSafeElement(document.createElement(tag), stylePolicy);

  return {
    createDiv(): SafeElement { return simple("div"); },
    createSpan(): SafeElement { return simple("span"); },
    createSection(): SafeElement { return simple("section"); },
    createArticle(): SafeElement { return simple("article"); },
    createNav(): SafeElement { return simple("nav"); },
    createHeader(): SafeElement { return simple("header"); },
    createFooter(): SafeElement { return simple("footer"); },
    createMain(): SafeElement { return simple("main"); },
    createAside(): SafeElement { return simple("aside"); },
    createFigure(): SafeElement { return simple("figure"); },
    createFigcaption(): SafeElement { return simple("figcaption"); },

    createText(): SafeElement { return simple("p"); },
    createHeading(level: HeadingLevel): SafeElement {
      const numericLevel = requireFiniteNumber(level, "createHeading.level");
      if (!Number.isInteger(numericLevel) || numericLevel < 1 || numericLevel > 6) {
        throw invalidArgument("createHeading.level");
      }
      return simple(`h${numericLevel}`);
    },
    createFormatting(format: FormattingTag): SafeElement {
      if (!FORMATTING_TAGS.has(format)) throw new Error(`Unknown formatting tag: ${format}`);
      return simple(format);
    },

    createBlockquote(): SafeElement { return simple("blockquote"); },
    createPre(): SafeElement { return simple("pre"); },

    createList(type: ListType) {
      if (type === "unordered") return createSafeListElement(document.createElement("ul") as HTMLUListElement, stylePolicy);
      if (type === "ordered") return createSafeListElement(document.createElement("ol") as HTMLOListElement, stylePolicy);
      if (type === "description") return createSafeDescriptionListElement(document.createElement("dl") as HTMLDListElement, stylePolicy);
      throw new Error(`Unknown list type: ${type}`);
    },
    createListItem(): SafeElement { return simple("li"); },
    createTerm(): SafeElement { return simple("dt"); },
    createDescription(): SafeElement { return simple("dd"); },

    createTable(): SafeElement { return simple("table"); },
    createThead(): SafeElement { return simple("thead"); },
    createTbody(): SafeElement { return simple("tbody"); },
    createTfoot(): SafeElement { return simple("tfoot"); },
    createTr(): SafeElement { return simple("tr"); },
    createTh() { return createSafeTableCellElement(document.createElement("th") as HTMLTableCellElement, stylePolicy); },
    createTd() { return createSafeTableCellElement(document.createElement("td") as HTMLTableCellElement, stylePolicy); },
    createCaption(): SafeElement { return simple("caption"); },
    createColgroup(): SafeElement { return simple("colgroup"); },
    createCol(): SafeElement { return simple("col"); },

    createButton() { return createSafeButtonElement(document.createElement("button") as HTMLButtonElement, stylePolicy); },
    createInput() { return createSafeInputElement(document.createElement("input") as HTMLInputElement, stylePolicy); },
    createSelect() { return createSafeSelectElement(document.createElement("select") as HTMLSelectElement, stylePolicy); },
    createOption() { return createSafeOptionElement(document.createElement("option") as HTMLOptionElement, stylePolicy); },
    createOptgroup(): SafeElement { return simple("optgroup"); },
    createTextarea() { return createSafeTextareaElement(document.createElement("textarea") as HTMLTextAreaElement, stylePolicy); },
    createLabel() { return createSafeLabelElement(document.createElement("label") as HTMLLabelElement, stylePolicy); },
    createFieldset() { return createSafeFieldsetElement(document.createElement("fieldset") as HTMLFieldSetElement, stylePolicy); },
    createLegend(): SafeElement { return simple("legend"); },

    createImage() { return createSafeImageElement(document.createElement("img") as HTMLImageElement, urlPolicy, stylePolicy); },
    createVideo() { return createSafeVideoElement(document.createElement("video") as HTMLVideoElement, urlPolicy, stylePolicy); },
    createAudio() { return createSafeAudioElement(document.createElement("audio") as HTMLAudioElement, urlPolicy, stylePolicy); },
    createSource() { return createSafeSourceElement(document.createElement("source") as HTMLSourceElement, urlPolicy, stylePolicy); },
    createTrack(): SafeElement { return simple("track"); },
    createPicture(): SafeElement { return simple("picture"); },
    createCanvas() { return createSafeCanvasElement(document.createElement("canvas") as HTMLCanvasElement, stylePolicy); },

    createAnchor() { return createSafeAnchorElement(document.createElement("a") as HTMLAnchorElement, urlPolicy, stylePolicy); },
    createDetails() { return createSafeDetailsElement(document.createElement("details") as HTMLDetailsElement, stylePolicy); },
    createSummary(): SafeElement { return simple("summary"); },
    createDialog() { return createSafeDialogElement(document.createElement("dialog") as HTMLDialogElement, stylePolicy); },
    createHr(): SafeElement { return simple("hr"); },
    createBr(): SafeElement { return simple("br"); },
    createWbr(): SafeElement { return simple("wbr"); },
    createProgress() { return createSafeProgressElement(document.createElement("progress") as HTMLProgressElement, stylePolicy); },
    createMeter() { return createSafeMeterElement(document.createElement("meter") as HTMLMeterElement, stylePolicy); },
    createOutput(): SafeElement { return simple("output"); },
    createTime(): SafeElement { return simple("time"); },
    createData(): SafeElement { return simple("data"); },
    createRuby(): SafeElement { return simple("ruby"); },
    createRt(): SafeElement { return simple("rt"); },
    createRp(): SafeElement { return simple("rp"); },

    createRawText(): SafeTextNode {
      return createSafeTextNode(document.createTextNode(""));
    },

    getElement(id: string): SafeElement | null {
      if (pluginRoot.id === id) return createSafeElement(pluginRoot, stylePolicy);

      const realEl = pluginRoot.querySelector(`#${CSS.escape(id)}`);
      if (!realEl || !(realEl instanceof HTMLElement)) return null;
      // A generic wrapper's setText() would otherwise become raw global CSS
      // authority over a pre-existing <style> element.
      const localName = getLocalName(realEl);
      if (localName === undefined || localName === "style") return null;
      return createSafeElement(realEl, stylePolicy);
    },
  };
}
