import type {
  SafeDocument,
  SafeElement,
  SafeTextNode,
  SafeStyleSheet,
  FormattingTag,
  HeadingLevel,
  ListType,
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
import { createSafeStyleSheet } from "./stylesheet.ts";

export type {
  SafeDocument,
  SafeElement,
  SafeTextNode,
  SafeStyleSheet,
  SafeEvent,
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
} from "./types.ts";

const FORMATTING_TAGS = new Set<string>([
  "strong", "em", "small", "b", "i", "u",
  "code", "kbd", "samp", "var",
  "sub", "sup", "mark", "abbr", "cite",
]);

function simple(tag: string): SafeElement {
  return createSafeElement(document.createElement(tag));
}

export function createSafeDocument(pluginRootID: string): SafeDocument {
  const pluginRoot: HTMLElement | null = document.getElementById(pluginRootID);

  if (!pluginRoot) {
    throw new Error(`No HTML element with the '${pluginRootID}' id was found`);
  }

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
      if (level < 1 || level > 6) throw new Error("Heading level must be 1-6");
      return simple(`h${level}`);
    },
    createFormatting(format: FormattingTag): SafeElement {
      if (!FORMATTING_TAGS.has(format)) throw new Error(`Unknown formatting tag: ${format}`);
      return simple(format);
    },

    createBlockquote(): SafeElement { return simple("blockquote"); },
    createPre(): SafeElement { return simple("pre"); },

    createList(type: ListType) {
      if (type === "unordered") return createSafeListElement(document.createElement("ul") as HTMLUListElement);
      if (type === "ordered") return createSafeListElement(document.createElement("ol") as HTMLOListElement);
      if (type === "description") return createSafeDescriptionListElement(document.createElement("dl") as HTMLDListElement);
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
    createTh() { return createSafeTableCellElement(document.createElement("th") as HTMLTableCellElement); },
    createTd() { return createSafeTableCellElement(document.createElement("td") as HTMLTableCellElement); },
    createCaption(): SafeElement { return simple("caption"); },
    createColgroup(): SafeElement { return simple("colgroup"); },
    createCol(): SafeElement { return simple("col"); },

    createButton() { return createSafeButtonElement(document.createElement("button") as HTMLButtonElement); },
    createInput() { return createSafeInputElement(document.createElement("input") as HTMLInputElement); },
    createSelect() { return createSafeSelectElement(document.createElement("select") as HTMLSelectElement); },
    createOption() { return createSafeOptionElement(document.createElement("option") as HTMLOptionElement); },
    createOptgroup(): SafeElement { return simple("optgroup"); },
    createTextarea() { return createSafeTextareaElement(document.createElement("textarea") as HTMLTextAreaElement); },
    createLabel() { return createSafeLabelElement(document.createElement("label") as HTMLLabelElement); },
    createFieldset() { return createSafeFieldsetElement(document.createElement("fieldset") as HTMLFieldSetElement); },
    createLegend(): SafeElement { return simple("legend"); },

    createImage() { return createSafeImageElement(document.createElement("img") as HTMLImageElement); },
    createVideo() { return createSafeVideoElement(document.createElement("video") as HTMLVideoElement); },
    createAudio() { return createSafeAudioElement(document.createElement("audio") as HTMLAudioElement); },
    createSource() { return createSafeSourceElement(document.createElement("source") as HTMLSourceElement); },
    createTrack(): SafeElement { return simple("track"); },
    createPicture(): SafeElement { return simple("picture"); },
    createCanvas() { return createSafeCanvasElement(document.createElement("canvas") as HTMLCanvasElement); },

    createAnchor() { return createSafeAnchorElement(document.createElement("a") as HTMLAnchorElement); },
    createDetails() { return createSafeDetailsElement(document.createElement("details") as HTMLDetailsElement); },
    createSummary(): SafeElement { return simple("summary"); },
    createDialog() { return createSafeDialogElement(document.createElement("dialog") as HTMLDialogElement); },
    createHr(): SafeElement { return simple("hr"); },
    createBr(): SafeElement { return simple("br"); },
    createWbr(): SafeElement { return simple("wbr"); },
    createProgress() { return createSafeProgressElement(document.createElement("progress") as HTMLProgressElement); },
    createMeter() { return createSafeMeterElement(document.createElement("meter") as HTMLMeterElement); },
    createOutput(): SafeElement { return simple("output"); },
    createTime(): SafeElement { return simple("time"); },
    createData(): SafeElement { return simple("data"); },
    createRuby(): SafeElement { return simple("ruby"); },
    createRt(): SafeElement { return simple("rt"); },
    createRp(): SafeElement { return simple("rp"); },

    createRawText(): SafeTextNode {
      return createSafeTextNode(document.createTextNode(""));
    },

    createStyle(): SafeStyleSheet {
      return createSafeStyleSheet(document.createElement("style"));
    },

    getElement(id: string): SafeElement | null {
      if (pluginRoot.id === id) return createSafeElement(pluginRoot);

      const realEl = pluginRoot.querySelector(`#${CSS.escape(id)}`);
      if (!realEl || !(realEl instanceof HTMLElement)) return null;
      return createSafeElement(realEl);
    },
  };
}
