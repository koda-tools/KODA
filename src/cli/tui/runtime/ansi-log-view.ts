import { splitGraphemes, stringWidth, type Screen } from "@termuijs/core";
import { Widget } from "@termuijs/widgets";
import { parseAnsiLine } from "./ansi-parser.js";
import type { LineLayout, StyledCell, StyledSpan, VisualRow } from "./types.js";
import { cellsToSpans, wrapCells } from "./wrap.js";

/** Columns kept free between block text and the right edge of the row. */
const BLOCK_RIGHT_MARGIN = 2;

/** Keep graphemes from `text` that fit in `maxWidth` terminal columns. */
function clip(text: string, maxWidth: number): string {
  let width = 0;
  let out = "";
  for (const grapheme of splitGraphemes(text)) {
    width += stringWidth(grapheme);
    if (width > maxWidth) break;
    out += grapheme;
  }
  return out;
}

function toCells(spans: readonly StyledSpan[]): StyledCell[] {
  return spans.flatMap((span) =>
    splitGraphemes(span.text).map((text) => ({
      text,
      width: stringWidth(text),
      style: span.style,
    })),
  );
}

/**
 * Scrollable output view that renders ANSI colors. TermUI's `LogView`
 * writes through `Screen.writeString()`, which strips ANSI codes, so
 * Shiki's colors were lost; this widget maps SGR codes to cell styles.
 * With a line layout set, long lines wrap onto extra rows (repeating their
 * hanging prefix), block lines paint their background to the end of the
 * row, and scrolling counts visual rows.
 */
export class AnsiLogView extends Widget {
  private lines: readonly string[] = [];
  private top = 0;
  private follow = false;
  private layout: LineLayout | undefined;
  private cache: {
    width: number;
    lines: readonly string[];
    rows: VisualRow[][];
  } = { width: -1, lines: [], rows: [] };

  /** Turn on wrapping and row fills, decided per line by `layout`. */
  public setWrap(layout: LineLayout): void {
    this.layout = layout;
    this.markDirty();
  }

  public setLines(lines: readonly string[]): void {
    this.lines = lines;
    this.markDirty();
  }

  /** First visible row. Clamping is the caller's job. */
  public setScrollTop(top: number): void {
    const next = Math.max(0, top);
    if (next === this.top) return;
    this.top = next;
    this.markDirty();
  }

  /** Pin the view to the last row, measured at render time. */
  public setFollow(follow: boolean): void {
    if (follow === this.follow) return;
    this.follow = follow;
    this.markDirty();
  }

  /** Visual rows at the current width (equals the line count without wrap). */
  public rowCount(): number {
    return this.rows().length;
  }

  /** Content width the rows were (or will be) wrapped to. */
  public contentWidth(): number {
    return this._getContentRect().width;
  }

  protected _renderSelf(screen: Screen): void {
    const { x, y, width, height } = this._getContentRect();
    if (width <= 0 || height <= 0) return;
    const rows = this.rows();
    const top = this.follow ? Math.max(0, rows.length - height) : this.top;
    rows.slice(top, top + height).forEach((visual, row) => {
      let column = 0;
      for (const span of visual.spans) {
        const text = clip(span.text, width - column);
        if (text === "") continue;
        screen.writeString(x + column, y + row, text, span.style);
        column += stringWidth(text);
      }
      if (visual.fill !== undefined && column < width)
        screen.writeString(x + column, y + row, " ".repeat(width - column), {
          bg: visual.fill,
        });
    });
  }

  /** Wrapped rows, re-wrapping only lines that changed since last time. */
  private rows(): VisualRow[] {
    const width = this.layout === undefined ? 0 : this.contentWidth();
    const previous = this.cache;
    const sameWidth = previous.width === width;
    const perLine = this.lines.map((line, index) =>
      sameWidth && previous.lines[index] === line
        ? (previous.rows[index] ?? this.wrapLine(line, width))
        : this.wrapLine(line, width),
    );
    this.cache = { width, lines: this.lines, rows: perLine };
    return perLine.flat();
  }

  private wrapLine(line: string, width: number): VisualRow[] {
    const spans = parseAnsiLine(line);
    const layout = this.layout;
    if (layout === undefined) return [{ spans, fill: undefined }];
    const visible = spans.map((span) => span.text).join("");
    // A block's fill color is the background its border is drawn on.
    const fill = layout.fill(visible) ? spans[0]?.style.bg : undefined;
    if (width <= 0) return [{ spans, fill }];
    // Block text stops short of the right edge; only the fill reaches it.
    const wrapWidth =
      fill === undefined ? width : Math.max(1, width - BLOCK_RIGHT_MARGIN);
    return wrapCells(toCells(spans), wrapWidth, layout.indent(visible)).map(
      (cells) => ({ spans: cellsToSpans(cells), fill }),
    );
  }
}
