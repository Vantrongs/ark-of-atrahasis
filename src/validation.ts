const DANGEROUS_PROTOCOLS = /^\s*(javascript|data|vbscript|blob|file)\s*:/i;

export function isUrlSafe(url: string): boolean {
  return !DANGEROUS_PROTOCOLS.test(url);
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
