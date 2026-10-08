import type { BundledLanguage, GrammarState } from "shiki";
import type { CodeHighlighter } from "../highlight/types.js";
import { DIM, RESET } from "../shared/ansi.js";
import { sanitize } from "../shared/sanitize.js";
import type { Segment } from "../shared/types.js";

interface Fence {
  readonly language: BundledLanguage | undefined;
  readonly label: string;
  line: number;
  state: GrammarState | undefined;
  /** Raw code lines (no gutter), accumulated for clipboard copy. */
  readonly raw: string[];
}

const FENCE_OPEN = /^ {0,3}```(.*)$/;
const FENCE_CLOSE = /^ {0,3}```\s*$/;
const MAYBE_FENCE = /^ {0,3}`/;
const GUTTER_WIDTH = 3;

/** Width of the Card-style frame drawn around code blocks. */
const FRAME_WIDTH = 72;
const COPY_HINT = "Ctrl+Y copiar";

/** Called with the raw text of a code block once its closing fence lands. */
export type CodeBlockListener = (code: string) => void;

function gutter(lineNumber: number): string {
  return `${String(lineNumber).padStart(GUTTER_WIDTH)} | `;
}

/** Top border of the frame: `┌─ <label> ─────── ⎘ Ctrl+Y copiar ─┐`. */
export function frameTop(label: string): string {
  const title = label === "" ? "code" : label;
  const left = `┌─ ${title} `;
  const right = ` ⎘ ${COPY_HINT} ─┐`;
  const fill = Math.max(1, FRAME_WIDTH - left.length - right.length);
  return `${left}${"─".repeat(fill)}${right}`;
}

export function frameBottom(): string {
  return `└${"─".repeat(Math.max(1, FRAME_WIDTH - 2))}┘`;
}

function borderSegment(line: string): Segment {
  return { kind: "code", plain: `${line}\n`, ansi: `${DIM}${line}${RESET}\n` };
}

/**
 * Turns streamed markdown into segments as deltas arrive: prose is released
 * immediately, fenced code is wrapped in a Card-style frame and highlighted
 * line by line. Closing a fence reports the block's raw text so the caller
 * can offer "copy" (Ctrl+Y).
 */
export class MarkdownStream {
  private partial = "";
  private midLine = false;
  private fence: Fence | undefined;

  public constructor(
    private readonly highlighter?: CodeHighlighter,
    private readonly onCodeBlock?: CodeBlockListener,
  ) {}

  public async push(delta: string): Promise<Segment[]> {
    const segments: Segment[] = [];
    let rest = delta;
    while (rest.length > 0) {
      const newline = rest.indexOf("\n");
      if (newline === -1) {
        this.partial += rest;
        segments.push(...this.releaseProse());
        break;
      }
      const line = this.partial + rest.slice(0, newline);
      this.partial = "";
      rest = rest.slice(newline + 1);
      segments.push(...(await this.completeLine(line)));
    }
    return segments;
  }

  public async flush(): Promise<Segment[]> {
    const line = this.partial;
    const fence = this.fence;
    this.partial = "";
    this.fence = undefined;
    if (this.midLine) {
      this.midLine = false;
      return line === "" ? [] : [{ kind: "text", text: line }];
    }
    if (fence === undefined) {
      return line === "" ? [] : [{ kind: "text", text: line }];
    }
    // An unterminated fence: emit the trailing line (if any), then close it.
    const segments: Segment[] = [];
    if (line !== "" && !FENCE_CLOSE.test(line)) {
      segments.push(this.codeLine(fence, line));
    }
    segments.push(...this.closeFence(fence));
    return segments;
  }

  /** Emit partial prose now, unless it might be the start of a fence. */
  private releaseProse(): Segment[] {
    if (this.fence !== undefined || this.partial === "") return [];
    if (!this.midLine && MAYBE_FENCE.test(this.partial)) return [];
    const text = this.partial;
    this.partial = "";
    this.midLine = true;
    return [{ kind: "text", text }];
  }

  private async completeLine(line: string): Promise<Segment[]> {
    if (this.midLine) {
      this.midLine = false;
      return [{ kind: "text", text: `${line}\n` }];
    }
    if (this.fence === undefined) return this.proseLine(line);
    if (FENCE_CLOSE.test(line)) {
      const fence = this.fence;
      this.fence = undefined;
      return this.closeFence(fence);
    }
    return [this.codeLine(this.fence, line)];
  }

  private async proseLine(line: string): Promise<Segment[]> {
    const open = FENCE_OPEN.exec(line);
    if (open === null) return [{ kind: "text", text: `${line}\n` }];
    const name = (open[1] ?? "").trim().split(/\s+/)[0] ?? "";
    const language =
      name === "" ? undefined : await this.highlighter?.resolveLanguage(name);
    this.fence = {
      language,
      label: name,
      line: 0,
      state: undefined,
      raw: [],
    };
    return [borderSegment(frameTop(name))];
  }

  /** Close the fence: emit the bottom border and report the raw block. */
  private closeFence(fence: Fence): Segment[] {
    this.onCodeBlock?.(fence.raw.join("\n"));
    return [borderSegment(frameBottom())];
  }

  private codeLine(fence: Fence, raw: string): Segment {
    const code = sanitize(raw);
    fence.raw.push(code);
    fence.line += 1;
    const prefix = gutter(fence.line);
    return {
      kind: "code",
      plain: `${prefix}${code}\n`,
      ansi: `${DIM}${prefix}${RESET}${this.highlight(fence, code)}${RESET}\n`,
    };
  }

  private highlight(fence: Fence, code: string): string {
    if (this.highlighter === undefined || fence.language === undefined)
      return code;
    try {
      const highlighted = this.highlighter.highlightLine(
        code,
        fence.language,
        fence.state,
      );
      fence.state = highlighted.state;
      return highlighted.ansi;
    } catch {
      return code;
    }
  }
}
