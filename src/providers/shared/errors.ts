import { ProviderError } from "../../utils/errors.js";
import type { FailureInfo, FailureInspector } from "./types.js";

const STATUS_HINTS: Readonly<Record<number, string>> = {
  401: "invalid or revoked API key",
  403: "access denied",
  404: "model not found",
  429: "rate limit or insufficient quota",
};

const DEFAULT_HINT = "request rejected";
const CONNECTION_HINT = "connection error; check network or base URL";

export function describeFailure({ status, connection }: FailureInfo): string {
  if (typeof status === "number")
    return ` (HTTP ${status}: ${STATUS_HINTS[status] ?? DEFAULT_HINT})`;
  return connection === true ? ` (${CONNECTION_HINT})` : "";
}

/**
 * Normalizes any failure into a ProviderError. Errors that already are
 * ProviderError are returned unchanged so their message is preserved.
 */
export function wrapProviderError(
  action: string,
  error: unknown,
  inspect: FailureInspector,
): ProviderError {
  if (error instanceof ProviderError) return error;
  return new ProviderError(
    `${action} failed${describeFailure(inspect(error))}.`,
    { cause: error },
  );
}
