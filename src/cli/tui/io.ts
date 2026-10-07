export interface SelectRequest {
  readonly title: string;
  readonly options: readonly string[];
  readonly hint?: string;
}

/**
 * A single rendered diff line, independent of any diff-rendering widget
 * library. `lineNo` is whichever side of the change is meaningful for the
 * line (the new-file line number for context/added lines, the old-file
 * line number for removed lines).
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

export type ToolCallKind = "readFile" | "writeFile" | "other";
export type ToolCallStatus = "pending" | "running" | "done" | "error";

export interface ToolCallView {
  readonly id: string;
  readonly kind: ToolCallKind;
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
}

export interface ToolApprovalRequest extends ToolCallView {
  readonly summary: string;
}

export interface InteractiveIO {
  readonly question: (prompt: string) => Promise<string | undefined>;
  readonly write: (text: string) => void;
  readonly close: () => void;
  readonly onCancel?: (handler: () => void) => () => void;
  readonly isTTY?: boolean;
  readonly writeStyled?: (text: string) => void;
  readonly setHeader?: (text: string) => void;
  readonly setStatus?: (text: string | undefined) => void;
  readonly holdStatus?: (text: string) => void;
  readonly releaseStatus?: () => void;
  readonly select?: (request: SelectRequest) => Promise<number | undefined>;
  /**
   * Render a diff using a dedicated diff-view widget when the runtime
   * supports one. Returns false (or is undefined) when the caller should
   * fall back to writing the diff as plain/styled text instead.
   */
  readonly showDiff?: (request: DiffViewRequest) => boolean;
  /**
   * Let the user pick a model from a real selectable list widget. Resolves
   * with the chosen value, or `undefined` if the runtime has no list-based
   * picker (caller should fall back to text-based `/model` output) or the
   * selection was cancelled.
   */
  readonly showModelPicker?: (
    request: ModelPickerRequest,
  ) => Promise<string | undefined>;
  /**
   * Reflect a tool invocation using a dedicated tool-call widget. Returns
   * an updater used to transition status (and attach a result) as the call
   * progresses, or `undefined` when the runtime has no such widget.
   */
  readonly showToolCall?: (
    call: ToolCallView,
  ) =>
    | {
        readonly setStatus: (status: ToolCallStatus, result?: unknown) => void;
        readonly dispose: () => void;
      }
    | undefined;
  /**
   * Ask the user to approve or deny a tool call (e.g. a file read/write)
   * using the tool-call approval widget. Returns `undefined` when the
   * runtime has no such widget, so the caller should fall back to its
   * existing `select`-based approval flow.
   */
  readonly showApproval?: (
    request: ToolApprovalRequest,
  ) => Promise<boolean> | undefined;
}
