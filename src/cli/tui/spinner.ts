import type { InteractiveIO } from "./io.js";
import type { LineWriter } from "./output.js";

export interface Spinner {
  readonly start: (label: string) => void;
  readonly stop: () => void;
}

/**
 * Domain-level status controller used by the agent turn.
 *
 * All animation is owned by the official TermUI `Spinner` widget
 * (https://www.termui.io/components/spinner), rendered by the TermUI
 * runtime behind `io.setStatus`. This module only forwards the status
 * label; it no longer draws its own frames.
 *
 * IO implementations without a status region (plain test doubles) get a
 * no-op spinner, since there is no TermUI widget to animate.
 */
export function createSpinner(_writer: LineWriter, io: InteractiveIO): Spinner {
  const setStatus = io.setStatus;
  if (setStatus === undefined) return { start: () => undefined, stop: () => undefined };
  return {
    start: (label) => setStatus(label),
    stop: () => setStatus(undefined),
  };
}
