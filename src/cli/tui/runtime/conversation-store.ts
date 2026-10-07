import { createStore } from "@termuijs/store";
import type { ConversationState, ConversationStore } from "./types.js";

/**
 * Observable TUI state on `@termuijs/store`, used through its imperative
 * API (`getState`/`setState`/`subscribe`). The `useStore()` hook form needs
 * the `@termuijs/jsx` runtime, which this `AppBuilder`-based TUI doesn't use.
 */
export function createConversationStore(): ConversationStore {
  return createStore<ConversationState>({
    header: "",
    status: undefined,
    transcript: [""],
  });
}

/** Append `text` to the transcript, continuing the last partial line. */
export function appendToTranscript(
  transcript: readonly string[],
  text: string,
): string[] {
  const [first = "", ...rest] = text.replace(/\r/g, "").split("\n");
  const lines = [...transcript];
  const last = lines.length - 1;
  lines[last] = `${lines[last] ?? ""}${first}`;
  return [...lines, ...rest];
}
