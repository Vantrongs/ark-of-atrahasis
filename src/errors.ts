export type SafeDOMErrorCode =
  | "ERR_INVALID_ARGUMENT"
  | "ERR_INVALID_POLICY"
  | "ERR_URL_DENIED";

const ERROR_MESSAGES: Readonly<Record<SafeDOMErrorCode, string>> = Object.freeze({
  ERR_INVALID_ARGUMENT: "The operation received an invalid argument",
  ERR_INVALID_POLICY: "The host security policy is invalid",
  ERR_URL_DENIED: "The URL was denied by host policy",
});

/**
 * A deliberately small error value that is safe to return across a compartment
 * boundary. It never includes a caught native/custom exception, attacker input,
 * a cause, or a host stack trace.
 */
export class SafeDOMError extends Error {
  readonly code: SafeDOMErrorCode;
  readonly operation: string;

  constructor(code: SafeDOMErrorCode, operation: string) {
    super(ERROR_MESSAGES[code]);
    this.name = "SafeDOMError";
    this.code = code;
    this.operation = operation;

    // Error stacks can disclose host paths and implementation details. The
    // stable code/operation pair is the complete public diagnostic contract.
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
