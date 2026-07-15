export type SafeDOMErrorCode =
  | "INVALID_ROOT"
  | "ROOT_ALREADY_CLAIMED"
  | "CROSS_OWNER"
  | "DUPLICATE_REGISTRATION"
  | "OWNER_DOCUMENT_MISMATCH";

/**
 * Stable errors produced by the capability boundary itself.
 *
 * Native DOM exceptions are never used to signal ownership failures.
 */
export class SafeDOMError extends Error {
  readonly code: SafeDOMErrorCode;

  constructor(code: SafeDOMErrorCode, message: string) {
    super(message);
    this.name = "SafeDOMError";
    this.code = code;
  }
}
