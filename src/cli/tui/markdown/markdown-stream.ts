import type { BundledLanguage, GrammarState } from "shiki";
import { CodeBlock } from "../blocks/code-block.js";
import { BLOCK_SEPARATOR } from "../blocks/style.js";
import { TextBlock } from "../blocks/text-block.js";
import type { BlockLine } from "../blocks/types.js";
import type { CodeHighlighter } from "../highlight/types.js";
import { sanitize } from "../shared/sanitize.js";
import type { CodeBlockListener, Segment } from "../shared/types.js";
import {
  FENCE_CLOSE,
  FENCE_OPEN,
  MAYBE_FENCE,
  parseFenceInfo,
} from "./fence.js";

interface OpenText {
  readonly kind: "text";
  /** Blank lines seen since the last content line, emitted only if more follows. */
  pendingBlanks: number;
}

interface OpenCode {
  readonly kind: "code";
  readonly block: CodeBlock;
  readonly language: BundledLanguage | undefined;
  state: GrammarState | undefined;
  /** Raw code lines, reported for clipboard copy when the block closes. */
  readonly raw: string[];
}

const live = (line: BlockLine): Segment => ({ kind: "live", ...line });
const finished = (line: BlockLine): Segment => ({ kind: "line", ...line });

/**
 * Turns streamed Markdown into message blocks as deltas arrive. Prose goes
 * into a `TEXT · KODA` block and fenced code into a `CODE` block; a fence
 * closes the text block and the next prose opens a new one. The unfinished
 * line is previewed live (replaced on every delta, never duplicated) unless
 * it might be a fence. `flush()` closes whatever is still open, including
 * an unterminated code block.
 */
export class MarkdownStream {
  private partial = "";
  private open: OpenText | OpenCode | undefined;
  private readonly text = new TextBlock("assistant");

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
        segments.push(...this.preview());
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
    this.partial = "";
    const segments = line === "" ? [] : await this.completeLine(line);
    return [...segments, ...this.closeBlock()];
  }

  /** Live preview of the unfinished line (held while it may be a fence). */
  private preview(): Segment[] {
    const line = this.partial;
    if (line.trim() === "" || MAYBE_FENCE.test(line)) return [];
    const open = this.open;
    if (open?.kind === "code") return [live(this.codeLine(open, line, false))];
    return [...this.ensureText(), live(this.text.markdown(line))];
  }

  private async completeLine(line: string): Promise<Segment[]> {
    const open = this.open;
    if (open?.kind === "code") {
      if (FENCE_CLOSE.test(line)) return this.closeBlock();
      return [finished(this.codeLine(open, line, true))];
    }
    const fence = FENCE_OPEN.exec(line);
    if (fence !== null)
      return [...this.closeBlock(), ...(await this.openCode(fence[1] ?? ""))];
    if (line.trim() === "") {
      if (open !== undefined) open.pendingBlanks += 1;
      return [];
    }
    return [...this.ensureText(), finished(this.text.markdown(line))];
  }

  /** Open the text block (header) or emit its pending paragraph breaks. */
  private ensureText(): Segment[] {
    const open = this.open;
    if (open?.kind === "text") {
      const blanks = Array.from({ length: open.pendingBlanks }, () =>
        finished(this.text.blank()),
      );
      open.pendingBlanks = 0;
      return blanks;
    }
    this.open = { kind: "text", pendingBlanks: 0 };
    return [finished(this.text.header())];
  }

  private async openCode(info: string): Promise<Segment[]> {
    const fence = parseFenceInfo(info);
    const language =
      fence.language === ""
        ? undefined
        : await this.highlighter?.resolveLanguage(fence.language);
    const block = new CodeBlock({
      language: language ?? fence.language,
      filename: fence.filename,
    });
    this.open = { kind: "code", block, language, state: undefined, raw: [] };
    return [finished(block.header()), finished(block.spacer())];
  }

  /** Close the open block (if any) and leave a gap before the next one. */
  private closeBlock(): Segment[] {
    const open = this.open;
    this.open = undefined;
    if (open === undefined) return [];
    if (open.kind === "code" && open.raw.length > 0)
      this.onCodeBlock?.(open.raw.join("\n"));
    return [finished(BLOCK_SEPARATOR)];
  }

  /** Render a code line; `commit` records it and advances grammar state. */
  private codeLine(open: OpenCode, raw: string, commit: boolean): BlockLine {
    const code = sanitize(raw);
    if (commit) open.raw.push(code);
    return open.block.line(code, this.highlight(open, code, commit));
  }

  private highlight(open: OpenCode, code: string, commit: boolean): string {
    if (this.highlighter === undefined || open.language === undefined)
      return code;
    try {
      const highlighted = this.highlighter.highlightLine(
        code,
        open.language,
        open.state,
      );
      if (commit) open.state = highlighted.state;
      return highlighted.ansi;
    } catch {
      return code;
    }
  }
}
