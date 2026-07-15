import type {
  FormattingTag,
  HeadingLevel,
  ListType,
  SafeDocument,
  SafeDocumentOptions,
  SafeContainerElement,
  SafeDescriptionListElement,
  SafeElement,
  SafeElementByKind,
  SafeListElement,
  SafeTextNode,
  SafeVoidElement,
  SpecializedElementKind,
} from "./types.ts";
import type { DocumentContext } from "./context.ts";
import { createDocumentContext } from "./context.ts";
export { DEFAULT_SAFE_DOCUMENT_QUOTAS, DEFAULT_SAFE_DOCUMENT_RATES } from "./context.ts";
import {
  createSafeAnchorElement,
  createSafeAudioElement,
  createSafeButtonElement,
  createSafeCanvasElement,
  createSafeContainerElement,
  createSafeDescriptionListElement,
  createSafeDetailsElement,
  createSafeDialogElement,
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
  createSafeVoidElement,
} from "./element.ts";
import { createSafeTextNode } from "./text.ts";
import { requireExactKeyword, requireIntegerInRange, requireString } from "./attribute-contract.ts";
import { FORMATTING_TAGS, LIST_TYPES, SPECIALIZED_ELEMENT_KINDS } from "./vocabularies.ts";

export { isSafeDOMError } from "./errors.ts";
export type { SafeDOMError, SafeDOMErrorCode } from "./errors.ts";
export type {
  SafeDocument,
  SafeElement,
  SafeContainerElement,
  SafeVoidElement,
  SafeElementByKind,
  SafeTextNode,
  SafeEvent,
  SafeEventKind,
  SafeEventTargetSnapshot,
  SafeEventBase,
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
  CreateList,
  GetElement,
  EventHandler,
  EventCleanup,
  SafeDocumentOptions,
  SafeDocumentQuotas,
  SafeDocumentRateLimit,
  SafeDocumentRates,
  Hardener,
} from "./types.ts";
export {
  ARIA_IDREF_LIST_NAMES,
  ARIA_IDREF_NAMES,
  ARIA_ROLES,
  AUTOCOMPLETE_VALUES,
  BUTTON_TYPES,
  DIR_VALUES,
  ENTER_KEY_HINT_VALUES,
  FORMATTING_TAGS,
  HEADING_LEVELS,
  IMAGE_LOADING_VALUES,
  INPUT_MODE_VALUES,
  INPUT_TYPES,
  LIST_TYPES,
  SPECIALIZED_ELEMENT_KINDS,
  TABLE_SCOPE_VALUES,
  TEXTAREA_WRAP_VALUES,
  type AriaIdRefListName,
  type AriaIdRefName,
  type AriaRole,
  type AutocompleteValue,
  type ButtonType,
  type DirValue,
  type EnterKeyHintValue,
  type FormattingTag,
  type HeadingLevel,
  type ImageLoadingValue,
  type InputModeValue,
  type InputType,
  type ListType,
  type SpecializedElementKind,
  type TableScopeValue,
  type TextareaWrapValue,
} from "./vocabularies.ts";

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
export {
  SAFE_STYLE_PROPERTIES,
  canonicalizeStyleProperty,
  createStylePolicy,
  type SafeStylePolicy,
  type SafeStyleProperty,
  type StylePolicyEngine,
} from "./style-policy.ts";
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

function container(context: DocumentContext, tag: string): SafeContainerElement {
  return createSafeContainerElement(context, context.createElement(tag));
}

function voidElement(context: DocumentContext, tag: string): SafeVoidElement {
  return createSafeVoidElement(context, context.createElement(tag));
}

/**
 * Create a DOM capability scoped to one host-created ShadowRoot.
 *
 * The root host must already have effective computed paint containment and a
 * compatible display box. The host must maintain both containment and
 * controlled geometry for the lifetime of the returned capability.
 *
 * The returned object deliberately exposes mount operations rather than a
 * wrapper for the ShadowRoot or its host element.
 */
export function createSafeDocument(
  root: ShadowRoot,
  options: SafeDocumentOptions,
): SafeDocument {
  const context = createDocumentContext(root, options);

  function createList(type: "unordered" | "ordered"): SafeListElement;
  function createList(type: "description"): SafeDescriptionListElement;
  function createList(type: ListType): SafeListElement | SafeDescriptionListElement;
  function createList(type: ListType): SafeListElement | SafeDescriptionListElement {
    const primitiveType = requireExactKeyword(type, LIST_TYPES, "SafeDocument.createList.type");
    if (primitiveType === "unordered") {
      return createSafeListElement(context, context.createElement("ul"));
    }
    if (primitiveType === "ordered") {
      return createSafeListElement(context, context.createElement("ol"));
    }
    return createSafeDescriptionListElement(context, context.createElement("dl"));
  }

  function getElement(id: string): SafeElement | null;
  function getElement<Kind extends SpecializedElementKind>(
    id: string,
    kind: Kind,
  ): SafeElementByKind[Kind] | null;
  function getElement(id: string, ...kindArgument: [] | [kind: unknown]): SafeElement | null {
    const primitiveId = requireString(id, "SafeDocument.getElement.id");
    if (kindArgument.length === 0) return context.lookupLocalId(primitiveId);
    const primitiveKind = requireExactKeyword(
      kindArgument[0],
      SPECIALIZED_ELEMENT_KINDS,
      "SafeDocument.getElement.kind",
    );
    return context.lookupLocalId(primitiveId, primitiveKind);
  }

  const document: SafeDocument = {
    appendChild(child): void {
      context.documentOperation(() => {
        context.platform.appendChild(
          context.root,
          context.requireRealNode(child),
          "ShadowRoot.appendChild",
        );
      });
    },
    insertBefore(newChild, reference): void {
      context.documentOperation(() => {
        context.platform.insertBefore(
          context.root,
          context.requireRealNode(newChild),
          context.requireRealNode(reference),
          "ShadowRoot.insertBefore",
        );
      });
    },
    removeChild(child): void {
      context.documentOperation(() => {
        context.platform.removeChild(
          context.root,
          context.requireRealNode(child),
          "ShadowRoot.removeChild",
        );
      });
    },
    replaceChild(newChild, oldChild): void {
      context.documentOperation(() => {
        context.platform.replaceChild(
          context.root,
          context.requireRealNode(newChild),
          context.requireRealNode(oldChild),
          "ShadowRoot.replaceChild",
        );
      });
    },
    dispose(): void { context.disposeDocument(); },

    createDiv(): SafeContainerElement { return container(context, "div"); },
    createSpan(): SafeContainerElement { return container(context, "span"); },
    createSection(): SafeContainerElement { return container(context, "section"); },
    createArticle(): SafeContainerElement { return container(context, "article"); },
    createNav(): SafeContainerElement { return container(context, "nav"); },
    createHeader(): SafeContainerElement { return container(context, "header"); },
    createFooter(): SafeContainerElement { return container(context, "footer"); },
    createMain(): SafeContainerElement { return container(context, "main"); },
    createAside(): SafeContainerElement { return container(context, "aside"); },
    createFigure(): SafeContainerElement { return container(context, "figure"); },
    createFigcaption(): SafeContainerElement { return container(context, "figcaption"); },

    createParagraph(): SafeContainerElement { return container(context, "p"); },
    createHeading(level: HeadingLevel): SafeContainerElement {
      const numericLevel = requireIntegerInRange(level, 1, 6, "SafeDocument.createHeading.level");
      return container(context, `h${numericLevel}`);
    },
    createFormatting(format: FormattingTag): SafeContainerElement {
      const primitiveFormat = requireExactKeyword(format, FORMATTING_TAGS, "SafeDocument.createFormatting.format");
      return container(context, primitiveFormat);
    },

    createBlockquote(): SafeContainerElement { return container(context, "blockquote"); },
    createPre(): SafeContainerElement { return container(context, "pre"); },

    createList,
    createListItem(): SafeContainerElement { return container(context, "li"); },
    createTerm(): SafeContainerElement { return container(context, "dt"); },
    createDescription(): SafeContainerElement { return container(context, "dd"); },

    createTable(): SafeContainerElement { return container(context, "table"); },
    createThead(): SafeContainerElement { return container(context, "thead"); },
    createTbody(): SafeContainerElement { return container(context, "tbody"); },
    createTfoot(): SafeContainerElement { return container(context, "tfoot"); },
    createTr(): SafeContainerElement { return container(context, "tr"); },
    createTh() { return createSafeTableCellElement(context, context.createElement("th"), "th"); },
    createTd() { return createSafeTableCellElement(context, context.createElement("td"), "td"); },
    createCaption(): SafeContainerElement { return container(context, "caption"); },
    createColgroup(): SafeContainerElement { return container(context, "colgroup"); },
    createCol(): SafeVoidElement { return voidElement(context, "col"); },

    createButton() {
      const element = context.createElement("button");
      return createSafeButtonElement(context, element, true);
    },
    createInput() {
      const element = context.createElement("input");
      return createSafeInputElement(context, element, true);
    },
    createSelect() {
      return createSafeSelectElement(context, context.createElement("select"), true);
    },
    createOption() { return createSafeOptionElement(context, context.createElement("option")); },
    createOptgroup(): SafeContainerElement { return container(context, "optgroup"); },
    createTextarea() {
      const element = context.createElement("textarea");
      return createSafeTextareaElement(context, element, true);
    },
    createLabel() { return createSafeLabelElement(context, context.createElement("label")); },
    createFieldset() { return createSafeFieldsetElement(context, context.createElement("fieldset")); },
    createLegend(): SafeContainerElement { return container(context, "legend"); },

    createImage() {
      return createSafeImageElement(context, context.createElement("img"));
    },
    createVideo() {
      return createSafeVideoElement(context, context.createElement("video"));
    },
    createAudio() {
      return createSafeAudioElement(context, context.createElement("audio"));
    },
    createSource() {
      return createSafeSourceElement(context, context.createElement("source"));
    },
    createTrack(): SafeVoidElement { return voidElement(context, "track"); },
    createPicture(): SafeContainerElement { return container(context, "picture"); },
    createCanvas() { return createSafeCanvasElement(context, context.createElement("canvas")); },

    createAnchor() {
      return createSafeAnchorElement(context, context.createElement("a"));
    },
    createDetails() { return createSafeDetailsElement(context, context.createElement("details")); },
    createSummary(): SafeContainerElement { return container(context, "summary"); },
    createDialog() { return createSafeDialogElement(context, context.createElement("dialog")); },
    createHr(): SafeVoidElement { return voidElement(context, "hr"); },
    createBr(): SafeVoidElement { return voidElement(context, "br"); },
    createWbr(): SafeVoidElement { return voidElement(context, "wbr"); },
    createProgress() { return createSafeProgressElement(context, context.createElement("progress")); },
    createMeter() { return createSafeMeterElement(context, context.createElement("meter")); },
    createOutput(): SafeContainerElement { return container(context, "output"); },
    createTime(): SafeContainerElement { return container(context, "time"); },
    createData(): SafeContainerElement { return container(context, "data"); },
    createRuby(): SafeContainerElement { return container(context, "ruby"); },
    createRt(): SafeContainerElement { return container(context, "rt"); },
    createRp(): SafeContainerElement { return container(context, "rp"); },

    createTextNode(): SafeTextNode {
      return createSafeTextNode(context, context.createTextNode(""));
    },

    getElement,
  };

  try {
    return context.complete(document);
  } catch (error) {
    context.abandonInitialization();
    throw error;
  }
}
