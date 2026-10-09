import type { Color, KeyEvent } from "@termuijs/core";
import type { UseStore } from "@termuijs/store";
import type { Spinner } from "@termuijs/widgets";
import type { ChoiceList } from "./choice-list.js";
import type { CommandSuggestions } from "./command-suggestions.js";
import type { DiffPanel } from "./diff-panel.js";
import type { Prompt } from "./prompt.js";
import type { SessionSidebar } from "./session-sidebar.js";
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
  readonly copyLastCodeBlock: () => void;
  readonly newSession: () => void;
  readonly openSessionPicker: () => void;
  /** Next (`1`) or previous (`-1`) primary agent. */
  readonly cycleAgent: (step: 1 | -1) => void;
  readonly toggleSidebar: () => void;
  readonly submit: (value: string) => void;
  readonly requestRender: () => void;
}

export interface LayoutParts {
  readonly store: ConversationStore;
  readonly sidebar: SessionSidebar;
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

/** A lightweight per-session summary the sidebar renders from. */
export interface SessionSummary {
  readonly id: string;
  readonly title: string;
  readonly active: boolean;
  readonly model: string;
  readonly provider: string;
  readonly tokens: number;
  readonly cost: number | undefined;
  readonly agent?: string;
}

/** Observable TUI state (see conversation-store.ts). */
export interface ConversationState {
  readonly header: string;
  readonly status: string | undefined;
  readonly transcript: readonly string[];
  /** Summary of every live session; drives the sidebar list. */
  readonly sessions: readonly SessionSummary[];
  readonly sidebarVisible: boolean;
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

/** How a transcript line wraps and fills, decided from its visible text. */
export interface LineLayout {
  /** Columns of the leading prefix that wrapped rows should repeat. */
  readonly indent: (visible: string) => number;
  /** Whether the line's background extends to the end of every row. */
  readonly fill: (visible: string) => boolean;
}

/** One visual row of a wrapped line, plus its row-wide background. */
export interface VisualRow {
  readonly spans: readonly StyledSpan[];
  readonly fill: Color | undefined;
}

/** One grapheme with its terminal width and style (input to wrapping). */
export interface StyledCell {
  readonly text: string;
  readonly width: number;
  readonly style: Readonly<SpanStyle>;
}
