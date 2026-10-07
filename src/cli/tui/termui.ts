import { app, logView, text, type AppBuilder } from "@termuijs/quick";
import {
  Box,
  DiffView,
  List,
  Scrollbar,
  Spinner,
  ToolApproval,
  ToolCall,
  type ToolCallStatus as WidgetToolCallStatus,
} from "@termuijs/widgets";
import { AnsiLogView } from "./ansi-log-view.js";
import { sanitize, sanitizeStyled } from "./sanitize.js";
import { TextArea } from "@termuijs/ui";
import type { KeyEvent } from "@termuijs/core";
import { createConversationStore } from "./conversation-store.js";
import type {
  DiffViewRequest,
  InteractiveIO,
  ModelPickerRequest,
  SelectRequest,
  ToolApprovalRequest,
  ToolCallStatus,
  ToolCallView,
} from "./io.js";

type LayoutWidget = ReturnType<typeof logView>;

// The prompt TextArea grows one row per line of content, up to this cap;
// beyond it, TextArea scrolls internally to keep the cursor visible.
const PROMPT_MIN_ROWS = 1;
const PROMPT_MAX_ROWS = 8;
// TextArea border: top + bottom.
const PROMPT_BORDER_ROWS = 2;
const PROMPT_HINT =
  "Enter envia · Alt+Enter nova linha · PgUp/PgDn rola o output · Esc cancela";

// Collapsed slots take no rows so the transcript can use the full screen.
const DIFF_VIEW_COLLAPSED_HEIGHT = 0;
const DIFF_VIEW_EXPANDED_HEIGHT = 16;
const CHOICE_LIST_COLLAPSED_HEIGHT = 0;
const TOOL_SLOT_COLLAPSED_HEIGHT = 0;
// renderHeader() emits 8 lines; logView adds a border (2) and padding (2).
const HEADER_HEIGHT = 12;
// List border (2) + at most this many visible options.
const CHOICE_LIST_MAX_ROWS = 8;
const CHOICE_LIST_BORDER_ROWS = 2;
const TOOL_SLOT_EXPANDED_HEIGHT = 6;
// Used until the first layout pass reports the real output height.
const FALLBACK_VIEWPORT_LINES = 20;
// Output box chrome: top/bottom border (2) + top/bottom padding (2).
const TRANSCRIPT_CHROME_ROWS = 4;
// How often to re-check the viewport height (terminal resize).
const SCROLL_SYNC_INTERVAL_MS = 200;

interface PendingAnswer {
  readonly resolve: (value: string | undefined) => void;
  readonly prompt: string;
}

/** An open choice in the List widget; resolves with the chosen index. */
interface PendingChoice {
  readonly resolve: (index: number | undefined) => void;
}

interface PendingApproval {
  readonly resolve: (value: boolean) => void;
}

/** The parts of `@termuijs/core`'s `App` used after `AppBuilder.run()`. */
interface MountedApp {
  readonly exit: (code?: number) => void;
  readonly requestRender: () => void;
  readonly events: {
    readonly on: (event: "key", handler: (event: KeyEvent) => void) => unknown;
  };
}

interface AppInternals {
  readonly _app?: MountedApp | null;
}

function appendLines(lines: string[], value: string): void {
  const normalized = value.replace(/\r/g, "");
  const parts = normalized.split("\n");
  const last = lines.length - 1;
  lines[last] = `${lines[last] ?? ""}${parts[0] ?? ""}`;
  for (let index = 1; index < parts.length; index += 1)
    lines.push(parts[index] ?? "");
}

function toWidgetStatus(status: ToolCallStatus): WidgetToolCallStatus {
  return status;
}

/**
 * `@termuijs/quick`'s `logView()` always applies `flexGrow: 1`. The header
 * must not compete with the transcript for space, so it is pinned to a
 * fixed height instead.
 */
function withFixedHeight<T extends LayoutWidget>(widget: T, height: number): T {
  widget.setStyle({ flexGrow: 0, flexShrink: 0, height });
  return widget;
}

export class TermUIRuntime {
  private readonly store = createConversationStore("", "");

  private readonly spinner = new Spinner(
    { height: 1 },
    // TermUI's `dots` preset uses the same braille frames as KODA's old
    // hand-rolled spinner, so it looked unchanged. `arc` is a distinct
    // official preset (◜◠◝◞◡◟). See https://www.termui.io/components/spinner
    { preset: "arc", color: { type: "named", name: "cyan" }, active: false },
  );

  private readonly diffView = new DiffView(
    { lines: [], showLineNumbers: true },
    { height: DIFF_VIEW_COLLAPSED_HEIGHT, border: "single" },
  );
  private diffTitle = "";

  // The output box. `LogView` can't be used here: TermUI's
  // `Screen.writeString()` strips ANSI codes, so Shiki's syntax colors were
  // lost. `AnsiLogView` turns the codes into TermUI cell styles. Scrolling
  // is driven by `syncTranscript()`.
  private readonly transcriptView = new AnsiLogView({
    flexGrow: 1,
    border: "single",
    borderColor: { type: "named", name: "brightBlack" },
    padding: 1,
  });
  /** First visible transcript line. */
  private scrollTop = 0;
  /** True while the view tracks new output at the bottom. */
  private followOutput = true;
  private lastViewport = 0;
  private scrollTimer: ReturnType<typeof setInterval> | undefined;
  private unsubscribeStore: (() => void) | undefined;

  // `row()` gives `flexGrow: 1` to every child that doesn't set one, which
  // split the output 50/50 with the scrollbar. Pin it to one column.
  private readonly transcriptScrollbar = new Scrollbar(
    { width: 1, flexGrow: 0, flexShrink: 0 },
    {
      contentLength: 1,
      viewportLength: FALLBACK_VIEWPORT_LINES,
      position: 0,
      orientation: "verticalRight",
    },
  );

  // https://www.termui.io/components/list — every choice in the TUI goes
  // through this one List: `/model` and the Autorizar/Rejeitar approval for
  // writes and shell commands. It is the only List in the tree, so the
  // `AppBuilder` keeps it focused and routes ↑/↓/Enter to it.
  private readonly choiceList = new List(
    { items: [], emptyMessage: "" },
    {
      height: CHOICE_LIST_COLLAPSED_HEIGHT,
      border: "single",
      borderColor: { type: "named", name: "yellow" },
    },
    (_item, index) => this.resolveChoice(index),
  );
  private pendingChoice: PendingChoice | undefined;
  // Set when Enter closes the list, so the same keypress isn't also
  // treated as "submit the prompt" by `onKey`, which runs right after.
  private swallowNextKey = false;

  // https://www.termui.io/components/tool-call — a fixed container that
  // hosts the active ToolCall/ToolApproval widget. `ToolCall` has no
  // public setters for name/args, so each new call swaps in a fresh
  // widget instance rather than mutating one in place. `AppBuilder`
  // doesn't natively dispatch keys to ToolCall/ToolApproval, so approval
  // key handling is done directly in `handleToolSlotKey`.
  private readonly toolSlotContainer = new Box({
    height: TOOL_SLOT_COLLAPSED_HEIGHT,
  });
  private pendingApproval: PendingApproval | undefined;

  // https://www.termui.io/components/text-area — multi-line prompt that
  // grows with its content (see `resizePrompt`). `AppBuilder` only routes
  // keys to List/TextInput, so keys reach the TextArea through `onKey`.
  // Enter submits here (TextArea's own default is Ctrl+Enter, which most
  // terminals cannot tell apart from Enter); Alt+Enter inserts a newline.
  private readonly promptArea = new TextArea(
    {
      flexGrow: 0,
      flexShrink: 0,
      border: "single",
      borderColor: { type: "named", name: "cyan" },
    },
    {
      rows: PROMPT_MIN_ROWS,
      placeholder: "Digite sua mensagem",
      onChange: () => this.resizePrompt(),
    },
  );

  private mounted: MountedApp | undefined;
  private heldStatus: string | undefined;
  private pendingAnswer: PendingAnswer | undefined;
  private cancelHandlers = new Set<() => void>();
  private terminate: (() => void) | undefined;
  private closed = false;

  public readonly io: InteractiveIO = {
    question: (prompt) => this.question(prompt),
    // Plain text (model output, tool results) has every escape removed;
    // only trusted styled output (Shiki code, diffs) keeps SGR colors.
    write: (value) => this.write(sanitize(value)),
    writeStyled: (value) => this.write(sanitizeStyled(value)),
    close: () => this.close(),
    onCancel: (handler) => this.onCancel(handler),
    isTTY: true,
    setHeader: (value) => this.store.setState({ header: value }),
    setStatus: (value) => this.setStatus(value),
    holdStatus: (value) => this.holdStatus(value),
    releaseStatus: () => this.releaseStatus(),
    select: (request) => this.select(request),
    showDiff: (request) => this.showDiff(request),
    showModelPicker: (request) => this.showModelPicker(request),
    showToolCall: (call) => this.showToolCall(call),
    showApproval: (request) => this.showApproval(request),
  };

  public async run(task: () => Promise<void>): Promise<void> {
    const builder = this.createBuilder();
    const application = builder.run();
    await Promise.resolve();
    const appInstance = (builder as unknown as AppInternals)._app ?? undefined;
    if (appInstance !== undefined) {
      this.mounted = appInstance;
      this.terminate = appInstance.exit.bind(appInstance);
      // Registered after the builder's own key listener, so it runs once
      // the builder has dispatched the key to the focused widget.
      appInstance.events.on("key", (event) => this.onKey(event));
    }
    // TextArea only draws its cursor when focused; it is not registered with
    // the builder's focus manager, so its focus flag is managed here.
    this.promptArea.isFocused = true;
    this.unsubscribeStore = this.store.subscribe((state, previous) => {
      if (state.transcript !== previous.transcript) this.syncTranscript();
    });
    this.syncTranscript();
    // Catches terminal resizes, which change the viewport height.
    this.scrollTimer = setInterval(() => {
      if (this.viewportLines() !== this.lastViewport) this.syncTranscript();
    }, SCROLL_SYNC_INTERVAL_MS);
    const work = task();
    try {
      await Promise.race([application, work]);
    } finally {
      this.close();
      await application.catch(() => undefined);
    }
  }

  private createBuilder(): AppBuilder {
    return app("KODA")
      .rows(
        withFixedHeight(
          logView((): string[] => {
            const header = this.store.getState().header;
            return header === "" ? [] : header.split("\n");
          }),
          HEADER_HEIGHT,
        ),
        this.createOutputRow(),
        this.toolSlotContainer,
        this.diffView,
        this.choiceList,
        this.spinner,
        this.promptArea,
        text(PROMPT_HINT, { dim: true }),
      )
      .refresh("80ms");
  }

  /**
   * Output box + scrollbar side by side, filling all leftover space.
   *
   * Not built with quick's `row()`: it runs
   * `if (!widget.style.flexGrow) setStyle({ flexGrow: 1 })`, and since
   * `0` is falsy it overrode the scrollbar's `flexGrow: 0`, splitting the
   * width 50/50. It also doesn't stretch children vertically, so the
   * output box stayed one line tall.
   */
  private createOutputRow(): Box {
    const outputRow = new Box({
      flexDirection: "row",
      alignItems: "stretch",
      flexGrow: 1,
      flexShrink: 1,
      width: "100%",
    });
    this.transcriptView.setStyle({
      flexGrow: 1,
      flexShrink: 1,
      height: "100%",
    });
    this.transcriptScrollbar.setStyle({
      width: 1,
      flexGrow: 0,
      flexShrink: 0,
      height: "100%",
    });
    outputRow.addChild(this.transcriptView);
    outputRow.addChild(this.transcriptScrollbar);
    return outputRow;
  }

  /** Grow/shrink the prompt to fit its lines, between the min and max. */
  private resizePrompt(): void {
    const lines = this.promptArea.value.split("\n").length;
    const rows = Math.min(PROMPT_MAX_ROWS, Math.max(PROMPT_MIN_ROWS, lines));
    this.promptArea.setStyle({ height: rows + PROMPT_BORDER_ROWS });
  }

  private submitPrompt(): void {
    const value = this.promptArea.value;
    this.promptArea.value = "";
    this.resizePrompt();
    this.submit(value);
  }

  private isEnter(event: KeyEvent): boolean {
    return event.key === "enter" || event.key === "return";
  }

  /**
   * Keys the `AppBuilder` dispatcher does not handle. Kept out of
   * `.keys()` because every entry there is also rendered in the footer and
   * swallows the key before it reaches the input (e.g. typing "y"/"n").
   */
  private onKey(event: KeyEvent): void {
    if (this.swallowNextKey) {
      this.swallowNextKey = false;
      return;
    }
    if (event.key === "escape") {
      // Esc closes an open choice (counts as Rejeitar for approvals), or
      // aborts a running request. Ctrl+C still exits via the AppBuilder.
      if (this.pendingChoice !== undefined) {
        this.closeChoice(undefined);
      } else if (this.store.getState().status !== undefined) {
        this.cancel();
      }
      this.mounted?.requestRender();
      return;
    }
    if (event.ctrl && event.key === "l") {
      this.clearTranscript();
      this.mounted?.requestRender();
      return;
    }
    // While a choice is open, the builder routes keys to the List.
    if (this.pendingChoice !== undefined) return;
    const step = this.scrollStep(event.key);
    if (step !== undefined) {
      this.scrollBy(step);
    } else if (this.isEnter(event)) {
      if (event.alt || event.shift) this.promptArea.insertNewline();
      else this.submitPrompt();
    } else if (event.ctrl && event.key === "s") {
      this.submitPrompt();
    } else {
      this.promptArea.handleKey(event);
    }
    this.mounted?.requestRender();
  }

  /**
   * PgUp/PgDn always scroll the output. ↑/↓ scroll it too while the prompt
   * is a single line; with several lines they move the prompt cursor.
   */
  private scrollStep(key: string): number | undefined {
    const page = Math.max(1, this.viewportLines() - 1);
    const singleLine = !this.promptArea.value.includes("\n");
    switch (key) {
      case "up":
        return singleLine ? -1 : undefined;
      case "down":
        return singleLine ? 1 : undefined;
      case "pageup":
        return -page;
      case "pagedown":
        return page;
      default:
        return undefined;
    }
  }

  private viewportLines(): number {
    const height = this.transcriptView.rect.height - TRANSCRIPT_CHROME_ROWS;
    return height > 0 ? height : FALLBACK_VIEWPORT_LINES;
  }

  private maxScrollTop(): number {
    const lines = this.store.getState().transcript.length;
    return Math.max(0, lines - this.viewportLines());
  }

  private scrollBy(delta: number): void {
    const max = this.maxScrollTop();
    this.scrollTop = Math.min(max, Math.max(0, this.scrollTop + delta));
    // Scrolling back to the bottom resumes following new output.
    this.followOutput = this.scrollTop >= max;
    this.syncTranscript();
  }

  /**
   * Push the transcript into the LogView and keep the LogView offset and
   * the Scrollbar thumb in step. LogView has no setter for its offset, only
   * relative scrollUp/scrollDown, so it is reset to the top and moved down.
   */
  private syncTranscript(): void {
    const lines = [...this.store.getState().transcript];
    const viewport = this.viewportLines();
    const max = Math.max(0, lines.length - viewport);
    if (this.followOutput) this.scrollTop = max;
    else this.scrollTop = Math.min(this.scrollTop, max);
    this.transcriptView.setLines(lines);
    this.transcriptView.setScrollTop(this.scrollTop);
    this.transcriptScrollbar.setContentLength(Math.max(1, lines.length));
    this.transcriptScrollbar.setViewportLength(viewport);
    this.transcriptScrollbar.setPosition(this.scrollTop);
    this.lastViewport = viewport;
  }

  private question(prompt: string): Promise<string | undefined> {
    if (this.closed) return Promise.resolve(undefined);
    if (prompt.trim() !== "❯") this.write(prompt);
    return new Promise((resolve) => {
      this.pendingAnswer = { resolve, prompt };
    });
  }

  private showDiff(request: DiffViewRequest): boolean {
    if (this.closed) return false;
    this.diffTitle = request.title;
    this.diffView.setLines(
      request.lines.map((line) => ({
        type: line.kind,
        content: line.content,
        ...(line.lineNo === undefined ? {} : { lineNo: line.lineNo }),
      })),
    );
    this.diffView.setStyle({ height: DIFF_VIEW_EXPANDED_HEIGHT });
    if (this.diffTitle !== "") this.write(`${this.diffTitle}\n`);
    return true;
  }

  private hideDiff(): void {
    this.diffTitle = "";
    this.diffView.setLines([]);
    this.diffView.setStyle({ height: DIFF_VIEW_COLLAPSED_HEIGHT });
  }

  /**
   * Show `labels` in the List and wait for ↑/↓ + Enter. Resolves with the
   * chosen index, or `undefined` on Esc/cancel.
   */
  private openChoice(
    title: string,
    labels: readonly string[],
  ): Promise<number | undefined> {
    if (this.closed || labels.length === 0) return Promise.resolve(undefined);
    this.closeChoice(undefined);
    this.write(`${title}\n`);
    this.choiceList.setItems(
      labels.map((label, index) => ({ label, value: String(index) })),
    );
    const rows = Math.min(CHOICE_LIST_MAX_ROWS, labels.length);
    this.choiceList.setStyle({ height: rows + CHOICE_LIST_BORDER_ROWS });
    this.promptArea.isFocused = false;
    this.mounted?.requestRender();
    return new Promise((resolve) => {
      this.pendingChoice = { resolve };
    });
  }

  /** List `onSelect` (Enter): resolve with the highlighted option. */
  private resolveChoice(index: number): void {
    if (this.pendingChoice === undefined) return;
    this.swallowNextKey = true;
    this.closeChoice(index);
  }

  private closeChoice(index: number | undefined): void {
    const pending = this.pendingChoice;
    if (pending === undefined) return;
    this.pendingChoice = undefined;
    this.choiceList.setItems([]);
    this.choiceList.setStyle({ height: CHOICE_LIST_COLLAPSED_HEIGHT });
    this.promptArea.isFocused = true;
    pending.resolve(index);
  }

  private async showModelPicker(
    request: ModelPickerRequest,
  ): Promise<string | undefined> {
    const index = await this.openChoice(
      "Escolha o modelo (↑/↓, Enter confirma, Esc cancela):",
      request.items.map((item) =>
        item.current ? `● ${item.label}` : `  ${item.label}`,
      ),
    );
    return index === undefined ? undefined : request.items[index]?.value;
  }

  private mountToolSlot(widget: ToolCall): void {
    this.toolSlotContainer.clearChildren();
    this.toolSlotContainer.addChild(widget);
    this.toolSlotContainer.setStyle({ height: TOOL_SLOT_EXPANDED_HEIGHT });
  }

  private showToolCall(
    call: ToolCallView,
  ):
    | {
        setStatus: (status: ToolCallStatus, result?: unknown) => void;
        dispose: () => void;
      }
    | undefined {
    if (this.closed) return undefined;
    const widget = new ToolCall(
      { name: call.name, args: call.args, status: toWidgetStatus("pending") },
      { height: TOOL_SLOT_EXPANDED_HEIGHT, border: "single" },
    );
    this.mountToolSlot(widget);
    return {
      setStatus: (status, result) => {
        widget.setStatus(toWidgetStatus(status));
        if (result !== undefined) widget.setResult(result);
      },
      dispose: () => {
        if (this.toolSlotContainer.children.includes(widget))
          this.hideToolSlot();
      },
    };
  }

  private showApproval(
    request: ToolApprovalRequest,
  ): Promise<boolean> | undefined {
    if (this.closed) return undefined;
    return new Promise<boolean>((resolve) => {
      const widget = new ToolApproval(
        {
          name: request.name,
          args: request.args,
          status: toWidgetStatus("pending"),
          collapsed: false,
          onApprove: () => this.resolveApproval(true),
          onDeny: () => this.resolveApproval(false),
        },
        { height: TOOL_SLOT_EXPANDED_HEIGHT, border: "single" },
      );
      this.mountToolSlot(widget);
      this.pendingApproval = { resolve };
      if (request.summary !== "") this.write(`${request.summary}\n`);
      this.write("Type y to approve or n to deny, then press Enter.\n");
    });
  }

  private resolveApproval(approved: boolean): void {
    const pending = this.pendingApproval;
    if (pending === undefined) return;
    this.pendingApproval = undefined;
    this.hideToolSlot();
    pending.resolve(approved);
  }

  private hideToolSlot(): void {
    this.toolSlotContainer.clearChildren();
    this.toolSlotContainer.setStyle({ height: TOOL_SLOT_COLLAPSED_HEIGHT });
  }

  /** Approval prompts (write file, run shell) use the TermUI List. */
  private async select(request: SelectRequest): Promise<number | undefined> {
    const title =
      request.hint === undefined
        ? request.title
        : `${request.title}  (${request.hint})`;
    const choice = await this.openChoice(title, request.options);
    this.hideDiff();
    if (choice !== undefined) this.write(`→ ${request.options[choice] ?? ""}\n`);
    return choice;
  }

  private submit(value: string): void {
    if (this.pendingApproval !== undefined) {
      this.write(`${value}\n`);
      this.resolveApproval(/^(y|yes|s|sim)$/i.test(value.trim()));
      return;
    }
    const answer = this.pendingAnswer;
    if (answer === undefined) return;
    this.write(`${value}\n`);
    this.pendingAnswer = undefined;
    answer.resolve(value);
  }

  private write(value: string): void {
    const transcript = [...this.store.getState().transcript];
    appendLines(transcript, value);
    // Sync happens below, via the store subscription.
    this.store.setState({ transcript });
  }

  private applyStatus(value: string | undefined): void {
    this.store.setState({ status: value });
    if (value === undefined) {
      this.spinner.setActive(false);
      this.spinner.setLabel("");
      return;
    }
    this.spinner.setLabel(value);
    this.spinner.setActive(true);
  }

  private setStatus(value: string | undefined): void {
    if (this.heldStatus !== undefined) return;
    this.applyStatus(value);
  }

  private holdStatus(value: string): void {
    this.heldStatus = value;
    this.applyStatus(value);
  }

  private releaseStatus(): void {
    this.heldStatus = undefined;
    this.applyStatus(undefined);
  }

  private clearTranscript(): void {
    this.store.setState({ transcript: [""] });
  }

  private cancel(): void {
    this.resolvePending(undefined);
    for (const handler of [...this.cancelHandlers]) handler();
  }

  private resolvePending(value: string | undefined): void {
    const answer = this.pendingAnswer;
    this.pendingAnswer = undefined;
    answer?.resolve(value);
    this.closeChoice(undefined);
    this.resolveApproval(false);
  }

  private onCancel(handler: () => void): () => void {
    this.cancelHandlers.add(handler);
    return () => this.cancelHandlers.delete(handler);
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.scrollTimer !== undefined) clearInterval(this.scrollTimer);
    this.scrollTimer = undefined;
    this.unsubscribeStore?.();
    this.unsubscribeStore = undefined;
    this.resolvePending(undefined);
    this.terminate?.();
    this.cancelHandlers.clear();
  }
}
