import { APICallError, RetryError } from "ai";
import { ProviderError } from "../../../utils/errors.js";
import { wrapProviderError } from "../../shared/errors.js";
import type { FailureInfo } from "../../shared/types.js";

const FETCH_FAILED = /fetch failed|failed to fetch/i;

/** Retries wrap the real cause; report the attempt that actually failed. */
function root(error: unknown): unknown {
  return RetryError.isInstance(error) ? error.lastError : error;
}

export function isAbort(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

/** Maps AI SDK failures onto the transport details shared by every provider. */
export function inspect(error: unknown): FailureInfo {
  const cause = root(error);
  if (APICallError.isInstance(cause))
    return cause.statusCode === undefined
      ? { connection: true }
      : { status: cause.statusCode };
  return cause instanceof TypeError && FETCH_FAILED.test(cause.message)
    ? { connection: true }
    : {};
}

/**
 * Normalizes a failure, reporting cancellation as such instead of as a
 * transport error.
 */
export function toProviderError(action: string, error: unknown): ProviderError {
  const cause = root(error);
  if (isAbort(cause) || isAbort(error))
    return new ProviderError(`${action} was cancelled.`, { cause: error });
  return wrapProviderError(action, error, inspect);
}
