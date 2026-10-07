import { createStore, type UseStore } from "@termuijs/store";
import type { Usage } from "../../providers/base.provider.js";

/**
 * Centralized, observable TUI state built on `@termuijs/store`
 * (https://www.termui.io/docs/store/overview).
 *
 * This uses the store purely through its imperative API —
 * `getState`/`setState`/`subscribe`/`mutate` — documented under "Reading
 * and writing outside components". The `useStore()`/`useInput()` hook form
 * shown in the docs requires the `@termuijs/jsx` component runtime, which
 * KODA's TUI does not use: the interactive shell is built with
 * `@termuijs/quick`'s imperative `AppBuilder` (`app().rows(...).run()`),
 * not JSX components. Subscribing imperatively still gives KODA a single
 * source of truth for session state instead of scattered private fields.
 */
export interface ConversationState {
  readonly provider: string;
  readonly model: string;
  readonly usage: Usage;
  readonly header: string;
  readonly status: string | undefined;
  readonly transcript: readonly string[];
}

export type ConversationStore = UseStore<ConversationState>;

export function createConversationStore(
  provider: string,
  model: string,
): ConversationStore {
  return createStore<ConversationState>({
    provider,
    model,
    usage: {},
    header: "",
    status: undefined,
    transcript: [""],
  });
}
