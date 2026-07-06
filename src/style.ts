import type { SafeStyle } from "./types.ts";
import { hasCssUrl } from "./validation.ts";

const ALLOWED_STYLE_PROPERTIES = new Set([
  "color", "opacity",
  "background-color", "backgroundColor",
  "font-size", "fontSize", "font-weight", "fontWeight",
  "font-style", "fontStyle", "font-family", "fontFamily",
  "font-variant", "fontVariant",
  "text-align", "textAlign", "text-decoration", "textDecoration",
  "text-transform", "textTransform", "text-indent", "textIndent",
  "text-overflow", "textOverflow",
  "letter-spacing", "letterSpacing", "word-spacing", "wordSpacing",
  "line-height", "lineHeight", "white-space", "whiteSpace",
  "vertical-align", "verticalAlign",
  "margin-top", "marginTop", "margin-right", "marginRight",
  "margin-bottom", "marginBottom", "margin-left", "marginLeft",
  "padding-top", "paddingTop", "padding-right", "paddingRight",
  "padding-bottom", "paddingBottom", "padding-left", "paddingLeft",
  "border-width", "borderWidth",
  "border-top-width", "borderTopWidth", "border-right-width", "borderRightWidth",
  "border-bottom-width", "borderBottomWidth", "border-left-width", "borderLeftWidth",
  "border-color", "borderColor",
  "border-top-color", "borderTopColor", "border-right-color", "borderRightColor",
  "border-bottom-color", "borderBottomColor", "border-left-color", "borderLeftColor",
  "border-style", "borderStyle",
  "border-top-style", "borderTopStyle", "border-right-style", "borderRightStyle",
  "border-bottom-style", "borderBottomStyle", "border-left-style", "borderLeftStyle",
  "border-radius", "borderRadius",
  "border-top-left-radius", "borderTopLeftRadius",
  "border-top-right-radius", "borderTopRightRadius",
  "border-bottom-left-radius", "borderBottomLeftRadius",
  "border-bottom-right-radius", "borderBottomRightRadius",
  "width", "min-width", "minWidth", "max-width", "maxWidth",
  "height", "min-height", "minHeight", "max-height", "maxHeight",
  "display", "visibility",
  "overflow", "overflow-x", "overflowX", "overflow-y", "overflowY",
  "position", "top", "right", "bottom", "left",
  "z-index", "zIndex",
  "flex-direction", "flexDirection", "flex-wrap", "flexWrap",
  "flex-grow", "flexGrow", "flex-shrink", "flexShrink", "flex-basis", "flexBasis",
  "align-items", "alignItems", "align-self", "alignSelf",
  "justify-content", "justifyContent", "justify-self", "justifySelf",
  "gap", "row-gap", "rowGap", "column-gap", "columnGap",
  "grid-template-columns", "gridTemplateColumns",
  "grid-template-rows", "gridTemplateRows",
  "grid-column", "gridColumn", "grid-row", "gridRow",
  "order",
  "box-shadow", "boxShadow",
  "outline-color", "outlineColor", "outline-style", "outlineStyle",
  "outline-width", "outlineWidth", "outline-offset", "outlineOffset",
  "transform", "transition",
  "animation-name", "animationName", "animation-duration", "animationDuration",
  "animation-timing-function", "animationTimingFunction",
  "animation-delay", "animationDelay", "animation-iteration-count", "animationIterationCount",
  "animation-direction", "animationDirection", "animation-fill-mode", "animationFillMode",
  "user-select", "userSelect", "pointer-events", "pointerEvents",
  "resize", "appearance",
  "object-fit", "objectFit", "object-position", "objectPosition",
  "aspect-ratio", "aspectRatio",
  "word-break", "wordBreak", "overflow-wrap", "overflowWrap", "hyphens",
  "accent-color", "accentColor", "caret-color", "caretColor",
  "column-count", "columnCount",
  "scroll-behavior", "scrollBehavior",
  "scroll-margin-top", "scrollMarginTop", "scroll-margin-bottom", "scrollMarginBottom",
  "scroll-padding-top", "scrollPaddingTop", "scroll-padding-bottom", "scrollPaddingBottom",
  "touch-action", "touchAction",
  "will-change", "willChange",
  "isolation",
  "mix-blend-mode", "mixBlendMode",
  "clip-path", "clipPath",
  "contain", "container-type", "containerType",
  "cursor",
]);

export function createSafeStyle(realEl: HTMLElement): SafeStyle {
  return new Proxy(Object.create(null) as SafeStyle, {
    get(_, prop) {
      if (typeof prop !== "string") return undefined;
      if (!ALLOWED_STYLE_PROPERTIES.has(prop)) return undefined;
      return realEl.style[prop as keyof CSSStyleDeclaration];
    },
    set(_, prop, value) {
      if (typeof prop !== "string") return false;
      if (!ALLOWED_STYLE_PROPERTIES.has(prop)) return false;

      const stringValue = String(value ?? "");
      if (hasCssUrl(stringValue)) return false;

      (realEl.style as unknown as Record<string, string>)[prop] = stringValue;
      return true;
    },
  });
}
