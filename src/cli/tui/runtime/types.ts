import type { Color, KeyEvent } from "@termuijs/core";
import type { UseStore } from "@termuijs/store";
import type { Spinner } from "@termuijs/widgets";
import type { ChoiceList } from "./choice-list.js";
import type { CommandSuggestions } from "./command-suggestions.js";
import type { DiffPanel } from "./diff-panel.js";
import type { Prompt } from "./prompt.js";
import type { ToolSlot } from "./tool-slot.js";
import type { Transcript } from "./transcript.js";

export interface ChoiceListHooks {
  /** Called with `true` when the list takes focus, `false` when it closes. */
  readonly onFocusChange: (listFocused: boolean) => void;
  readonly requestRender: () => void;
}

/** The prompt operations command completion needs. */
export interface PromptEditor {
  replace(text: string): void;
}

export interface KeyboardTargets {
  readonly choices: ChoiceList;
  readonly suggestions: CommandSuggestions;
  readonly prompt: Prompt;
  readonly transcript: Transcript;
  readonly isBusy: () => boolean;
  readonly cancel: () => void;
  readonly clearTranscript: () => void;
  readonly submit: (value: string) => void;
  readonly requestRender: () => void;
}

export interface LayoutParts {
  readonly store: ConversationStore;
  readonly transcript: Transcript;
  readonly toolSlot: ToolSlot;
  readonly diffPanel: DiffPanel;
  readonly choices: ChoiceList;
  readonly suggestions: CommandSuggestions;
  readonly spinner: Spinner;
  readonly prompt: Prompt;
}

/** The parts of `@termuijs/core`'s `App` used after `AppBuilder.run()`. */
export interface MountedApp {
  readonly exit: (code?: number) => void;
  readonly requestRender: () => void;
  readonly events: {
    readonly on: (event: "key", handler: (event: KeyEvent) => void) => unknown;
  };
}

/** `AppBuilder` keeps its `App` in a private field; read it after `run()`. */
export interface AppInternals {
  readonly _app?: MountedApp | null;
}

export interface PendingAnswer {
  readonly resolve: (value: string | undefined) => void;
}

/** Observable TUI state (see conversation-store.ts). */
export interface ConversationState {
  readonly header: string;
  readonly status: string | undefined;
  readonly transcript: readonly string[];
}

export type ConversationStore = UseStore<ConversationState>;

/** Cell attributes accepted by TermUI's `Screen.writeString()`. */
export interface SpanStyle {
  fg?: Color;
  bg?: Color;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface StyledSpan {
  readonly text: string;
  readonly style: Readonly<SpanStyle>;
}
