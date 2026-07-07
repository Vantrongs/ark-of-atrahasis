const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function isUrlSafe(url: string): boolean {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

const CSS_URL_PATTERN = /url\s*\(|(-webkit-)?image-set\s*\(/i;

export function hasCssUrl(value: string): boolean {
  return CSS_URL_PATTERN.test(value);
}

const ALLOWED_INPUT_TYPES = new Set([
  "text", "password", "number", "email", "tel", "url", "search",
  "date", "time", "datetime-local", "month", "week",
  "range", "color", "checkbox", "radio",
  "hidden", "submit", "reset", "button",
]);

export function isInputTypeAllowed(type: string): boolean {
  return ALLOWED_INPUT_TYPES.has(type.toLowerCase());
}

const ALLOWED_BUTTON_TYPES = new Set(["submit", "reset", "button"]);

export function isButtonTypeAllowed(type: string): boolean {
  return ALLOWED_BUTTON_TYPES.has(type.toLowerCase());
}

const SAFE_ATTR_KEY = /^[a-z][a-z0-9-]*$/;

export function isAttrKeySafe(key: string): boolean {
  return SAFE_ATTR_KEY.test(key);
}
