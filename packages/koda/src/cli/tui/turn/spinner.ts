import type { InteractiveIO } from "../shared/types.js";
import type { Spinner } from "./types.js";

const NO_SPINNER: Spinner = { start: () => undefined, stop: () => undefined };

/**
 * Forwards the status label to `io.setStatus`; the runtime's TermUI Spinner
 * widget does the animation. IO without a status region gets a no-op.
 */
export function createSpinner(io: InteractiveIO): Spinner {
  const setStatus = io.setStatus;
  if (setStatus === undefined) return NO_SPINNER;
  return {
    start: (label) => setStatus(label),
    stop: () => setStatus(undefined),
  };
}
