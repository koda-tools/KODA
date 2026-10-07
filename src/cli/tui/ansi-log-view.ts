import {
  splitGraphemes,
  stringWidth,
  type Color,
  type Screen,
} from "@termuijs/core";
import { Widget } from "@termuijs/widgets";

/**
 * Cell attributes carried by an ANSI SGR sequence, in the shape TermUI's
 * `Screen.writeString()` accepts as its style argument.
 */
interface SpanStyle {
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

const SGR = /\x1b\[([0-9;]*)m/g;

function rgb(r: number, g: number, b: number): Color {
  return { type: "rgb", r, g, b };
}

/** Apply one SGR parameter list (e.g. `38;2;255;0;0`) to `style`. */
function applySgr(style: SpanStyle, params: readonly number[]): SpanStyle {
  const next: SpanStyle = { ...style };
  for (let index = 0; index < params.length; index += 1) {
    const code = params[index] ?? 0;
    if (code === 0) {
      for (const key of Object.keys(next)) delete next[key as keyof SpanStyle];
    } else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 3) next.italic = true;
    else if (code === 4) next.underline = true;
    else if (code === 22) {
      delete next.bold;
      delete next.dim;
    } else if (code === 23) delete next.italic;
    else if (code === 24) delete next.underline;
    else if (code === 39) delete next.fg;
    else if (code === 49) delete next.bg;
    else if ((code === 38 || code === 48) && params[index + 1] === 2) {
      const color = rgb(
        params[index + 2] ?? 0,
        params[index + 3] ?? 0,
        params[index + 4] ?? 0,
      );
      if (code === 38) next.fg = color;
      else next.bg = color;
      index += 4;
    } else if ((code === 38 || code === 48) && params[index + 1] === 5) {
      const color: Color = { type: "ansi256", code: params[index + 2] ?? 0 };
      if (code === 38) next.fg = color;
      else next.bg = color;
      index += 2;
    }
  }
  return next;
}

/**
 * Split a line containing SGR color codes (as produced by the Shiki
 * highlighter and the diff renderer) into plain-text spans with styles.
 * Any non-SGR escape has already been removed by `sanitizeStyled`.
 */
export function parseAnsiLine(line: string): StyledSpan[] {
  const spans: StyledSpan[] = [];
  let style: SpanStyle = {};
  let last = 0;
  for (const match of line.matchAll(SGR)) {
    const index = match.index ?? 0;
    if (index > last) spans.push({ text: line.slice(last, index), style });
    const params = (match[1] ?? "")
      .split(";")
      .filter((part) => part !== "")
      .map((part) => Number.parseInt(part, 10));
    style = applySgr(style, params.length === 0 ? [0] : params);
    last = index + match[0].length;
  }
  if (last < line.length) spans.push({ text: line.slice(last), style });
  return spans;
}

/** Keep graphemes from `text` until `maxWidth` terminal columns are used. */
function clip(text: string, maxWidth: number): string {
  let width = 0;
  let out = "";
  for (const grapheme of splitGraphemes(text)) {
    const next = stringWidth(grapheme);
    if (width + next > maxWidth) break;
    width += next;
    out += grapheme;
  }
  return out;
}

/**
 * Scrollable output view that renders ANSI colors.
 *
 * TermUI's `LogView` (like every widget) writes through
 * `Screen.writeString()`, which runs `stripAnsiControl()` on the text — so
 * Shiki's ANSI-colored code showed up uncolored. This widget converts SGR
 * sequences into TermUI cell styles (`fg`, `bg`, `bold`, …) instead.
 */
export class AnsiLogView extends Widget {
  private lines: readonly string[] = [];
  private top = 0;

  public setLines(lines: readonly string[]): void {
    this.lines = lines;
    this.markDirty();
  }

  /** First visible line (0-based). Clamping is the caller's job. */
  public setScrollTop(top: number): void {
    if (top === this.top) return;
    this.top = Math.max(0, top);
    this.markDirty();
  }

  protected _renderSelf(screen: Screen): void {
    const { x, y, width, height } = this._getContentRect();
    if (width <= 0 || height <= 0) return;
    const visible = this.lines.slice(this.top, this.top + height);
    visible.forEach((line, row) => {
      let column = 0;
      for (const span of parseAnsiLine(line)) {
        const remaining = width - column;
        if (remaining <= 0) break;
        const text = clip(span.text, remaining);
        if (text === "") continue;
        screen.writeString(x + column, y + row, text, span.style);
        column += stringWidth(text);
      }
    });
  }
}
