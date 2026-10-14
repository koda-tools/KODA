/**
 * One unit of rendered output:
 * - `text`: plain text appended as-is.
 * - `code`: styled text (with its own newlines) appended as-is.
 * - `live`: streaming preview of the unfinished current line; replaces the
 *   previous preview, and is skipped when the IO cannot replace a line.
 * - `line`: a finished line (no trailing newline); it replaces the live
 *   preview when one is showing, so streamed text is never duplicated.
 */
export type Segment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "code"; readonly plain: string; readonly ansi: string }
  | { readonly kind: "live"; readonly plain: string; readonly ansi: string }
  | { readonly kind: "line"; readonly plain: string; readonly ansi: string };

export interface LineWriter {
  readonly ensureNewLine: () => void;
  readonly write: (text: string) => void;
  readonly writeSegment: (segment: Segment) => void;
}

/** Called with the raw text of a code block once its closing fence lands. */
export type CodeBlockListener = (code: string) => void;

export interface SelectRequest {
  readonly title: string;
  readonly options: readonly string[];
  readonly hint?: string;
}

/**
 * A diff line, independent of any widget library. `lineNo` is the side that
 * matters for the line: old-file number for removals, new-file otherwise.
 */
export interface DiffViewLine {
  readonly kind: "add" | "remove" | "context";
  readonly content: string;
  readonly lineNo?: number;
}

export interface DiffViewRequest {
  readonly title: string;
  readonly lines: readonly DiffViewLine[];
}

export interface ModelPickerItem {
  readonly label: string;
  readonly value: string;
  readonly current: boolean;
}

export interface ModelPickerRequest {
  readonly items: readonly ModelPickerItem[];
}

export interface SessionPickerItem {
  readonly label: string;
  readonly active: boolean;
}

export interface SessionPickerRequest {
  readonly items: readonly SessionPickerItem[];
}

/**
 * What the session picker resolved to: switch to an existing session by
 * index, create a new one, or cancel (`undefined`).
 */
export type SessionPickerResult =
  | { readonly kind: "switch"; readonly index: number }
  | { readonly kind: "new" };

/** Session info the sidebar/summary needs, independent of any widget. */
export interface SessionSummaryView {
  readonly id: string;
  readonly title: string;
  readonly active: boolean;
  readonly model: string;
  readonly provider: string;
  readonly tokens: number;
  readonly cost: number | undefined;
  /** Primary agent of the session (or the subagent of a child session). */
  readonly agent?: string;
}

/**
 * Navigation raised from the UI: a new session, the session switcher, or
 * the next/previous primary agent.
 */
export type SessionIntent = "new" | "picker" | "agent-next" | "agent-prev";

export type ToolCallStatus = "pending" | "running" | "done" | "error";

export interface ToolCallView {
  readonly id: string;
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
}

export interface ToolCallHandle {
  readonly setStatus: (status: ToolCallStatus, result?: unknown) => void;
  readonly dispose: () => void;
}

/**
 * Everything the interactive session needs from a terminal. Optional
 * members are richer widgets; callers fall back to plain text without them.
 */
export interface InteractiveIO {
  readonly question: (prompt: string) => Promise<string | undefined>;
  readonly write: (text: string) => void;
  /**
   * Like `question`, but the typed text is masked and never echoed to the
   * transcript. Use it for API keys.
   */
  readonly askSecret?: (prompt: string) => Promise<string | undefined>;
  readonly close: () => void;
  readonly onCancel?: (handler: () => void) => () => void;
  readonly isTTY?: boolean;
  readonly writeStyled?: (text: string) => void;
  /**
   * Replace the unfinished last line with styled text (streaming preview).
   * Without it, previews are skipped and only finished lines are written.
   */
  readonly setLiveLine?: (text: string) => void;
  /** Remember a rendered code block so the user can copy it (Ctrl+Y). */
  readonly onCodeBlock?: (code: string) => void;
  readonly setHeader?: (text: string) => void;
  readonly setStatus?: (text: string | undefined) => void;
  /** Wipe the visible output area (same effect as Ctrl+L). */
  readonly clearTranscript?: () => void;
  readonly select?: (request: SelectRequest) => Promise<number | undefined>;
  /** Returns false when the caller should render the diff as text. */
  readonly showDiff?: (request: DiffViewRequest) => boolean;
  /** Resolves `undefined` when cancelled. */
  readonly showModelPicker?: (
    request: ModelPickerRequest,
  ) => Promise<string | undefined>;
  readonly showToolCall?: (call: ToolCallView) => ToolCallHandle | undefined;
  /** Slash commands offered while typing `/` in the prompt. */
  readonly setCommandSuggestions?: (
    items: readonly CommandSuggestion[],
  ) => void;
  /** Open the session switcher modal; resolves to the chosen action. */
  readonly showSessionPicker?: (
    request: SessionPickerRequest,
  ) => Promise<SessionPickerResult | undefined>;
  /** Push the current list of sessions for the sidebar to render. */
  readonly setSessions?: (sessions: readonly SessionSummaryView[]) => void;
  /** Toggle or set the sidebar's visibility. */
  readonly setSidebarVisible?: (visible: boolean) => void;
  /**
   * Register a handler for navigation intents raised from the UI (keybinds):
   * `"new"` creates a session, `"picker"` opens the switcher and
   * `"agent-next"`/`"agent-prev"` cycle the primary agent. Returns an
   * unsubscribe function.
   */
  readonly onSessionIntent?: (
    handler: (intent: SessionIntent) => void,
  ) => () => void;
  /** Read the visible transcript so it can be saved before a session switch. */
  readonly getTranscript?: () => readonly string[];
  /** Replace the visible transcript when switching to another session. */
  readonly setTranscript?: (lines: readonly string[]) => void;
}

export interface CommandSuggestion {
  /** Command name without the leading `/`. */
  readonly name: string;
  readonly description?: string;
}
