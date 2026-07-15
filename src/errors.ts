export type SafeDOMErrorCode =
  | "INVALID_ROOT"
  | "ROOT_ALREADY_CLAIMED"
  | "INVALID_QUOTA"
  | "CROSS_OWNER"
  | "DUPLICATE_REGISTRATION"
  | "OWNER_DOCUMENT_MISMATCH"
  | "ERR_INVALID_ARGUMENT"
  | "ERR_INVALID_POLICY"
  | "ERR_URL_DENIED"
  | "DOCUMENT_DISPOSED"
  | "NODE_DISPOSED"
  | "NODE_REVOKED"
  | "PLACEMENT_VIOLATION"
  | "QUOTA_EXCEEDED"
  | "DOM_OPERATION_FAILED";

const ERROR_MESSAGES: Readonly<Record<SafeDOMErrorCode, string>> = Object.freeze({
  INVALID_ROOT: "The root capability is invalid",
  ROOT_ALREADY_CLAIMED: "The root capability is already claimed",
  INVALID_QUOTA: "The quota configuration is invalid",
  CROSS_OWNER: "The wrapper belongs to a different safe document",
  DUPLICATE_REGISTRATION: "The DOM node already has a different wrapper",
  OWNER_DOCUMENT_MISMATCH: "The DOM node belongs to a different document",
  ERR_INVALID_ARGUMENT: "The operation received an invalid argument",
  ERR_INVALID_POLICY: "The host security policy is invalid",
  ERR_URL_DENIED: "The URL was denied by host policy",
  DOCUMENT_DISPOSED: "The safe document has been disposed",
  NODE_DISPOSED: "The node wrapper has been disposed",
  NODE_REVOKED: "The node wrapper has been revoked",
  PLACEMENT_VIOLATION: "The node left its assigned mount and was revoked",
  QUOTA_EXCEEDED: "A safe document quota was exceeded",
  DOM_OPERATION_FAILED: "The platform DOM operation failed",
});

/**
 * Stable errors produced by the capability boundary itself.
 *
 * Native DOM exceptions are never used to signal ownership failures.
 */
export class SafeDOMError extends Error {
  readonly code: SafeDOMErrorCode;
  readonly operation: string;

  constructor(code: SafeDOMErrorCode, operation: string) {
    super(ERROR_MESSAGES[code]);
    this.name = "SafeDOMError";
    this.code = code;
    this.operation = operation;

    Object.defineProperty(this, "stack", {
      value: undefined,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    Object.freeze(this);
  }
}

export function invalidArgument(operation: string): SafeDOMError {
  return new SafeDOMError("ERR_INVALID_ARGUMENT", operation);
}

export function invalidPolicy(operation: string): SafeDOMError {
  return new SafeDOMError("ERR_INVALID_POLICY", operation);
}
