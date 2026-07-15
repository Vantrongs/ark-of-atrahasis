import type {
  FormattingTag,
  HeadingLevel,
  ListType,
  SafeDocument,
  SafeDocumentOptions,
  SafeElement,
  SafeTextNode,
} from "./types.ts";
import type { DocumentContext } from "./context.ts";
import { createDocumentContext } from "./context.ts";
export { DEFAULT_SAFE_DOCUMENT_QUOTAS } from "./context.ts";
import {
  createSafeAnchorElement,
  createSafeAudioElement,
  createSafeButtonElement,
  createSafeCanvasElement,
  createSafeDescriptionListElement,
  createSafeDetailsElement,
  createSafeDialogElement,
  createSafeElement,
  createSafeFieldsetElement,
  createSafeImageElement,
  createSafeInputElement,
  createSafeLabelElement,
  createSafeListElement,
  createSafeMeterElement,
  createSafeOptionElement,
  createSafeProgressElement,
  createSafeSelectElement,
  createSafeSourceElement,
  createSafeTableCellElement,
  createSafeTextareaElement,
  createSafeVideoElement,
} from "./element.ts";
import { createSafeTextNode } from "./text.ts";
import { createSafeStyleSheet } from "./stylesheet.ts";

export { SafeDOMError } from "./errors.ts";
export type { SafeDOMErrorCode } from "./errors.ts";
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
  SafeDocumentOptions,
  SafeDocumentQuotas,
} from "./types.ts";

const FORMATTING_TAGS = new Set<string>([
  "strong", "em", "small", "b", "i", "u",
  "code", "kbd", "samp", "var",
  "sub", "sup", "mark", "abbr", "cite",
]);

function simple(context: DocumentContext, tag: string): SafeElement {
  return createSafeElement(context, context.createElement(tag));
}

/**
 * Create a DOM capability scoped to one host-created ShadowRoot.
 *
 * The returned object deliberately exposes mount operations rather than a
 * wrapper for the ShadowRoot or its host element.
 */
export function createSafeDocument(root: ShadowRoot, options?: SafeDocumentOptions): SafeDocument {
  const context = createDocumentContext(root, options);
  const { registry } = context;

  return {
    appendChild(child): void {
      context.documentOperation(() => context.root.appendChild(context.requireRealNode(child)));
    },
    insertBefore(newChild, reference): void {
      context.documentOperation(() => {
        context.root.insertBefore(
          context.requireRealNode(newChild),
          context.requireRealNode(reference),
        );
      });
    },
    removeChild(child): void {
      context.documentOperation(() => context.root.removeChild(context.requireRealNode(child)));
    },
    replaceChild(newChild, oldChild): void {
      context.documentOperation(() => {
        context.root.replaceChild(
          context.requireRealNode(newChild),
          context.requireRealNode(oldChild),
        );
      });
    },
    dispose(): void { context.disposeDocument(); },

    createDiv(): SafeElement { return simple(context, "div"); },
    createSpan(): SafeElement { return simple(context, "span"); },
    createSection(): SafeElement { return simple(context, "section"); },
    createArticle(): SafeElement { return simple(context, "article"); },
    createNav(): SafeElement { return simple(context, "nav"); },
    createHeader(): SafeElement { return simple(context, "header"); },
    createFooter(): SafeElement { return simple(context, "footer"); },
    createMain(): SafeElement { return simple(context, "main"); },
    createAside(): SafeElement { return simple(context, "aside"); },
    createFigure(): SafeElement { return simple(context, "figure"); },
    createFigcaption(): SafeElement { return simple(context, "figcaption"); },

    createText(): SafeElement { return simple(context, "p"); },
    createHeading(level: HeadingLevel): SafeElement {
      if (level < 1 || level > 6) throw new Error("Heading level must be 1-6");
      return simple(context, `h${level}`);
    },
    createFormatting(format: FormattingTag): SafeElement {
      if (!FORMATTING_TAGS.has(format)) throw new Error(`Unknown formatting tag: ${format}`);
      return simple(context, format);
    },

    createBlockquote(): SafeElement { return simple(context, "blockquote"); },
    createPre(): SafeElement { return simple(context, "pre"); },

    createList(type: ListType) {
      if (type === "unordered") return createSafeListElement(context, context.createElement("ul"));
      if (type === "ordered") return createSafeListElement(context, context.createElement("ol"));
      if (type === "description") {
        return createSafeDescriptionListElement(context, context.createElement("dl"));
      }
      throw new Error(`Unknown list type: ${type}`);
    },
    createListItem(): SafeElement { return simple(context, "li"); },
    createTerm(): SafeElement { return simple(context, "dt"); },
    createDescription(): SafeElement { return simple(context, "dd"); },

    createTable(): SafeElement { return simple(context, "table"); },
    createThead(): SafeElement { return simple(context, "thead"); },
    createTbody(): SafeElement { return simple(context, "tbody"); },
    createTfoot(): SafeElement { return simple(context, "tfoot"); },
    createTr(): SafeElement { return simple(context, "tr"); },
    createTh() { return createSafeTableCellElement(context, context.createElement("th")); },
    createTd() { return createSafeTableCellElement(context, context.createElement("td")); },
    createCaption(): SafeElement { return simple(context, "caption"); },
    createColgroup(): SafeElement { return simple(context, "colgroup"); },
    createCol(): SafeElement { return simple(context, "col"); },

    createButton() { return createSafeButtonElement(context, context.createElement("button")); },
    createInput() { return createSafeInputElement(context, context.createElement("input")); },
    createSelect() { return createSafeSelectElement(context, context.createElement("select")); },
    createOption() { return createSafeOptionElement(context, context.createElement("option")); },
    createOptgroup(): SafeElement { return simple(context, "optgroup"); },
    createTextarea() { return createSafeTextareaElement(context, context.createElement("textarea")); },
    createLabel() { return createSafeLabelElement(context, context.createElement("label")); },
    createFieldset() { return createSafeFieldsetElement(context, context.createElement("fieldset")); },
    createLegend(): SafeElement { return simple(context, "legend"); },

    createImage() { return createSafeImageElement(context, context.createElement("img")); },
    createVideo() { return createSafeVideoElement(context, context.createElement("video")); },
    createAudio() { return createSafeAudioElement(context, context.createElement("audio")); },
    createSource() { return createSafeSourceElement(context, context.createElement("source")); },
    createTrack(): SafeElement { return simple(context, "track"); },
    createPicture(): SafeElement { return simple(context, "picture"); },
    createCanvas() { return createSafeCanvasElement(context, context.createElement("canvas")); },

    createAnchor() { return createSafeAnchorElement(context, context.createElement("a")); },
    createDetails() { return createSafeDetailsElement(context, context.createElement("details")); },
    createSummary(): SafeElement { return simple(context, "summary"); },
    createDialog() { return createSafeDialogElement(context, context.createElement("dialog")); },
    createHr(): SafeElement { return simple(context, "hr"); },
    createBr(): SafeElement { return simple(context, "br"); },
    createWbr(): SafeElement { return simple(context, "wbr"); },
    createProgress() { return createSafeProgressElement(context, context.createElement("progress")); },
    createMeter() { return createSafeMeterElement(context, context.createElement("meter")); },
    createOutput(): SafeElement { return simple(context, "output"); },
    createTime(): SafeElement { return simple(context, "time"); },
    createData(): SafeElement { return simple(context, "data"); },
    createRuby(): SafeElement { return simple(context, "ruby"); },
    createRt(): SafeElement { return simple(context, "rt"); },
    createRp(): SafeElement { return simple(context, "rp"); },

    createRawText(): SafeTextNode {
      return createSafeTextNode(context, context.createTextNode(""));
    },

    createStyle() {
      return createSafeStyleSheet(context, context.createElement("style"));
    },

    getElement(id: string): SafeElement | null {
      return context.documentOperation(() => {
        const real = context.root.getElementById(id);
        if (!real) return null;
        return registry.getWrapper<SafeElement>(real) ?? null;
      });
    },
  };
}
