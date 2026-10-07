import type { InteractiveIO, SelectRequest } from "./io.js";
import {
  DEFAULT_COLUMNS,
  DEFAULT_ROWS,
  ENTER_SCREEN,
  LEAVE_SCREEN,
  MIN_COLUMNS,
  MIN_ROWS,
  RENDER_DELAY_MS,
  WHEEL_LINES,
} from "./screen/constants.js";
import { parseKeys, type Key, type KeyName } from "./screen/key-parser.js";
import { LineEditor } from "./screen/line-editor.js";
import { composeFrame } from "./screen/renderer.js";
import { TextBuffer, sanitize } from "./screen/text-buffer.js";

export interface ScreenInput {
  readonly isTTY?: boolean;
  readonly setRawMode?: (mode: boolean) => unknown;
  readonly setEncoding: (encoding: BufferEncoding) => unknown;
  readonly resume: () => unknown;
  readonly pause: () => unknown;
  readonly on: (event: "data", listener: (chunk: string) => void) => unknown;
  readonly off: (event: "data", listener: (chunk: string) => void) => unknown;
}

export interface ScreenOutput {
  readonly columns?: number;
  readonly rows?: number;
  readonly write: (text: string) => unknown;
  readonly on: (event: "resize", listener: () => void) => unknown;
  readonly off: (event: "resize", listener: () => void) => unknown;
}

type Answer = (value: string | undefined) => void;
type SelectAnswer = (value: number | undefined) => void;

interface SelectState {
  readonly options: readonly string[];
  readonly hint: string | undefined;
  readonly resolve: SelectAnswer;
  index: number;
}

const SCROLL_STEPS: Readonly<Partial<Record<KeyName, number>>> = {
  up: -1,
  down: 1,
  wheelup: -WHEEL_LINES,
  wheeldown: WHEEL_LINES,
};

export class Screen {
  private readonly text = new TextBuffer();
  private readonly editor = new LineEditor();
  private readonly cancelHandlers = new Set<() => void>();
  private headerLines: string[] = [];
  private status: string | undefined;
  private statusHold: string | undefined;
  private prompt = "";
  private pending: Answer | undefined;
  private selection: SelectState | undefined;
  private following = true;
  private scrollTop = 0;
  private lastTop = 0;
  private lastMax = 0;
  private lastViewport = 1;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active = false;
  private readonly dataListener = (chunk: string): void => this.onData(chunk);
  private readonly resizeListener = (): void => this.render();
  private readonly exitListener = (): void => {
    if (this.active) this.output.write(LEAVE_SCREEN);
  };

  public constructor(
    private readonly input: ScreenInput,
    private readonly output: ScreenOutput,
  ) {}

  public start(): void {
    if (this.active) return;
    this.active = true;
    this.input.setRawMode?.(true);
    this.input.setEncoding("utf8");
    this.input.resume();
    this.input.on("data", this.dataListener);
    this.output.on("resize", this.resizeListener);
    process.once("exit", this.exitListener);
    this.output.write(ENTER_SCREEN);
    this.render();
  }

  public stop(): void {
    if (!this.active) return;
    this.active = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.input.off("data", this.dataListener);
    this.output.off("resize", this.resizeListener);
    process.off("exit", this.exitListener);
    this.output.write(LEAVE_SCREEN);
    this.input.setRawMode?.(false);
    this.input.pause();
    this.statusHold = undefined;
    this.resolvePending(undefined);
    this.resolveSelection(undefined);
  }

  public setHeader(text: string): void {
    this.headerLines = text.split("\n");
    this.schedule();
  }

  public setStatus(text: string | undefined): void {
    if (this.statusHold !== undefined) return;
    this.status = text;
    this.schedule();
  }

  public holdStatus(text: string): void {
    this.statusHold = text;
    this.status = text;
    this.schedule();
  }

  public releaseStatus(): void {
    this.statusHold = undefined;
    this.schedule();
  }

  public append(text: string, styled = false): void {
    this.text.append(text, styled);
    this.schedule();
  }

  public question(prompt: string): Promise<string | undefined> {
    if (!this.active) return Promise.resolve(undefined);
    const parts = prompt.split("\n");
    const last = parts.pop() ?? "";
    if (parts.length > 0) {
      this.startNewLine();
      this.append(`${parts.join("\n")}\n`);
    }
    this.prompt = sanitize(last);
    this.editor.reset();
    this.following = true;
    this.render();
    return new Promise((resolve) => {
      this.pending = resolve;
    });
  }

  public select(request: SelectRequest): Promise<number | undefined> {
    if (!this.active || request.options.length === 0)
      return Promise.resolve(undefined);
    this.startNewLine();
    this.append(`${request.title}\n`);
    this.following = true;
    return new Promise((resolve) => {
      this.selection = {
        options: request.options,
        hint: request.hint,
        resolve,
        index: 0,
      };
      this.render();
    });
  }

  public onCancel(handler: () => void): () => void {
    this.cancelHandlers.add(handler);
    return () => {
      this.cancelHandlers.delete(handler);
    };
  }

  public asIO(): InteractiveIO {
    return {
      question: (prompt) => this.question(prompt),
      write: (text) => this.append(text),
      writeStyled: (text) => this.append(text, true),
      close: () => this.stop(),
      onCancel: (handler) => this.onCancel(handler),
      isTTY: true,
      setHeader: (text) => this.setHeader(text),
      setStatus: (text) => this.setStatus(text),
      holdStatus: (text) => this.holdStatus(text),
      releaseStatus: () => this.releaseStatus(),
      select: (request) => this.select(request),
    };
  }

  private schedule(): void {
    if (!this.active || this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.render();
    }, RENDER_DELAY_MS);
  }

  private render(): void {
    if (!this.active) return;
    const columns = Math.max(
      MIN_COLUMNS,
      this.output.columns ?? DEFAULT_COLUMNS,
    );
    const rows = Math.max(MIN_ROWS, this.output.rows ?? DEFAULT_ROWS);
    const frame = composeFrame({
      columns,
      rows,
      headerLines: this.headerLines,
      wrapped: this.text.wrap(columns - 1),
      following: this.following,
      scrollTop: this.scrollTop,
      status: this.status,
      prompt: this.prompt,
      editor: this.editor,
      inputActive: this.pending !== undefined,
      ...(this.selection === undefined
        ? {}
        : {
            selection: {
              options: this.selection.options,
              index: this.selection.index,
              ...(this.selection.hint === undefined
                ? {}
                : { hint: this.selection.hint }),
            },
          }),
    });
    this.lastTop = frame.top;
    this.lastMax = frame.maxTop;
    this.lastViewport = frame.viewport;
    this.output.write(frame.output);
  }

  private scrollBy(delta: number): void {
    const next = Math.min(this.lastMax, Math.max(0, this.lastTop + delta));
    this.scrollTop = next;
    this.following = next >= this.lastMax;
    this.render();
  }

  private clear(): void {
    this.text.clear();
    this.following = true;
    this.scrollTop = 0;
    this.render();
  }

  private startNewLine(): void {
    if (this.text.endsWithPartialLine) this.append("\n");
  }

  private resolvePending(value: string | undefined): void {
    const pending = this.pending;
    this.pending = undefined;
    pending?.(value);
  }

  private resolveSelection(value: number | undefined): void {
    const selection = this.selection;
    this.selection = undefined;
    selection?.resolve(value);
  }

  private submit(): void {
    if (this.pending === undefined) return;
    const answer = this.editor.text;
    this.editor.reset();
    this.following = true;
    this.startNewLine();
    this.append(`${this.prompt}${answer}\n`);
    this.prompt = "";
    this.render();
    this.resolvePending(answer);
  }

  private cancel(): void {
    this.resolvePending(undefined);
    if (this.cancelHandlers.size === 0) this.stop();
    for (const handler of [...this.cancelHandlers]) handler();
  }

  private endOfInput(): void {
    if (this.editor.isEmpty) this.resolvePending(undefined);
  }

  private handleSelectKey(key: Key): void {
    const selection = this.selection;
    if (selection === undefined) return;
    if ("text" in key) return;
    const count = selection.options.length;
    switch (key.name) {
      case "up":
      case "left":
        selection.index = (selection.index - 1 + count) % count;
        return this.render();
      case "down":
      case "right":
        selection.index = (selection.index + 1) % count;
        return this.render();
      case "enter": {
        const chosen = selection.index;
        this.append(`${selection.options[chosen] ?? ""}\n`);
        this.resolveSelection(chosen);
        return this.render();
      }
      case "cancel":
        this.resolveSelection(undefined);
        return this.render();
    }
  }

  private handleKey(key: Key): void {
    if (this.selection !== undefined) return this.handleSelectKey(key);
    if ("text" in key) {
      this.editor.insert(key.text);
      return this.render();
    }
    const step = SCROLL_STEPS[key.name];
    if (step !== undefined) return this.scrollBy(step);
    const page = Math.max(1, this.lastViewport - 1);
    switch (key.name) {
      case "pageup":
        return this.scrollBy(-page);
      case "pagedown":
        return this.scrollBy(page);
      case "enter":
        return this.submit();
      case "cancel":
        return this.cancel();
      case "eof":
        return this.endOfInput();
      case "clear":
        return this.clear();
      default:
        this.editor.apply(key.name);
        this.render();
    }
  }

  private onData(chunk: string): void {
    for (const key of parseKeys(chunk)) this.handleKey(key);
  }
}
