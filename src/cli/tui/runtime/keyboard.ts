import type { KeyEvent } from "@termuijs/core";
import type { KeyboardTargets } from "./types.js";

const isEnter = (event: KeyEvent): boolean =>
  event.key === "enter" || event.key === "return";

/** PgUp/PgDn always scroll; ↑/↓ only while the prompt is one line. */
function scrollStep(key: string, targets: KeyboardTargets): number | undefined {
  const singleLine = targets.prompt.isSingleLine;
  switch (key) {
    case "up":
      return singleLine ? -1 : undefined;
    case "down":
      return singleLine ? 1 : undefined;
    case "pageup":
      return -targets.transcript.pageSize();
    case "pagedown":
      return targets.transcript.pageSize();
    default:
      return undefined;
  }
}

/**
 * Session shortcuts: Ctrl+N new, Ctrl+B sidebar, Alt+S opens the switcher,
 * Tab / Shift+Tab cycle the primary agent (as in OpenCode). Only reached
 * when no choice list or completion is open, so a modal never gets reopened
 * or bypassed. Returns true when the key was handled.
 */
function handleSessionKey(event: KeyEvent, targets: KeyboardTargets): boolean {
  if (event.ctrl && event.key === "n") targets.newSession();
  else if (event.ctrl && event.key === "b") targets.toggleSidebar();
  else if (event.alt && !event.ctrl && event.key === "s")
    targets.openSessionPicker();
  else if (event.key === "tab" && !event.ctrl && !event.alt)
    targets.cycleAgent(event.shift ? -1 : 1);
  else return false;
  return true;
}

/**
 * App-level key handler, registered after the `AppBuilder`'s own (which
 * drives the List). Not done via `.keys()`: those bindings show up in the
 * footer and swallow the key before it reaches the prompt.
 */
export function createKeyHandler(
  targets: KeyboardTargets,
): (event: KeyEvent) => void {
  const { choices, suggestions, prompt } = targets;
  return (event) => {
    if (choices.consumeConfirmKey()) return;
    // Choice lists win; then the slash-command dropdown, if open.
    if (!choices.isOpen && suggestions.handleKey(event, prompt)) {
      targets.requestRender();
      return;
    }
    if (event.key === "escape") {
      // Closes an open choice (counts as Reject) or aborts a request.
      if (choices.isOpen) choices.close(undefined);
      else if (targets.isBusy()) targets.cancel();
    } else if (event.ctrl && event.key === "l") {
      targets.clearTranscript();
    } else if (event.ctrl && event.key === "y") {
      targets.copyLastCodeBlock();
    } else if (choices.isOpen) {
      return; // The builder routes keys to the List.
    } else if (handleSessionKey(event, targets)) {
      // Handled: session or agent navigation.
    } else {
      const step = scrollStep(event.key, targets);
      if (step !== undefined) targets.transcript.scrollBy(step);
      else if (isEnter(event) && (event.alt || event.shift))
        prompt.insertNewline();
      else if (isEnter(event) || (event.ctrl && event.key === "s"))
        targets.submit(prompt.take());
      else prompt.handleKey(event);
    }
    targets.requestRender();
  };
}
