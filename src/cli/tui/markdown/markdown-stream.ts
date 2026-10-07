import type { BundledLanguage, GrammarState } from "shiki";
import type { CodeHighlighter } from "../highlight/types.js";
import { DIM, RESET } from "../shared/ansi.js";
import { sanitize } from "../shared/sanitize.js";
import type { Segment } from "../shared/types.js";

interface Fence {
  readonly language: BundledLanguage | undefined;
  line: number;
  state: GrammarState | undefined;
}

const FENCE_OPEN = /^ {0,3}```(.*)$/;
const FENCE_CLOSE = /^ {0,3}```\s*$/;
const MAYBE_FENCE = /^ {0,3}`/;
const GUTTER_WIDTH = 3;

function gutter(lineNumber: number): string {
  return `${String(lineNumber).padStart(GUTTER_WIDTH)} | `;
}

/**
 * Turns streamed markdown into segments as deltas arrive: prose is released
 * immediately, fenced code is numbered and highlighted line by line.
 */
export class MarkdownStream {
  private partial = "";
  private midLine = false;
  private fence: Fence | undefined;

  public constructor(private readonly highlighter?: CodeHighlighter) {}

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
    if (line === "") return [];
    if (fence === undefined) return [{ kind: "text", text: line }];
    return FENCE_CLOSE.test(line) ? [] : [this.codeLine(fence, line)];
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
      this.fence = undefined;
      return [];
    }
    return [this.codeLine(this.fence, line)];
  }

  private async proseLine(line: string): Promise<Segment[]> {
    const open = FENCE_OPEN.exec(line);
    if (open === null) return [{ kind: "text", text: `${line}\n` }];
    const name = (open[1] ?? "").trim().split(/\s+/)[0] ?? "";
    const language =
      name === "" ? undefined : await this.highlighter?.resolveLanguage(name);
    this.fence = { language, line: 0, state: undefined };
    return [];
  }

  private codeLine(fence: Fence, raw: string): Segment {
    const code = sanitize(raw);
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
