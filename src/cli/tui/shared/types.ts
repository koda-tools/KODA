/** One unit of rendered output: plain prose, or code with a styled form. */
export type Segment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "code"; readonly plain: string; readonly ansi: string };

export interface LineWriter {
  readonly ensureNewLine: () => void;
  readonly write: (text: string) => void;
  readonly writeSegment: (segment: Segment) => void;
}

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
  readonly close: () => void;
  readonly onCancel?: (handler: () => void) => () => void;
  readonly isTTY?: boolean;
  readonly writeStyled?: (text: string) => void;
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
}

export interface CommandSuggestion {
  /** Command name without the leading `/`. */
  readonly name: string;
  readonly description?: string;
}
