import { splitGraphemes, stringWidth, type Screen } from "@termuijs/core";
import { Widget } from "@termuijs/widgets";
import { parseAnsiLine } from "./ansi-parser.js";

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

/**
 * Scrollable output view that renders ANSI colors. TermUI's `LogView`
 * writes through `Screen.writeString()`, which strips ANSI codes, so
 * Shiki's colors were lost; this widget maps SGR codes to cell styles.
 */
export class AnsiLogView extends Widget {
  private lines: readonly string[] = [];
  private top = 0;

  public setLines(lines: readonly string[]): void {
    this.lines = lines;
    this.markDirty();
  }

  /** First visible line. Clamping is the caller's job. */
  public setScrollTop(top: number): void {
    const next = Math.max(0, top);
    if (next === this.top) return;
    this.top = next;
    this.markDirty();
  }

  protected _renderSelf(screen: Screen): void {
    const { x, y, width, height } = this._getContentRect();
    if (width <= 0 || height <= 0) return;
    this.lines.slice(this.top, this.top + height).forEach((line, row) => {
      let column = 0;
      for (const span of parseAnsiLine(line)) {
        const text = clip(span.text, width - column);
        if (text === "") continue;
        screen.writeString(x + column, y + row, text, span.style);
        column += stringWidth(text);
      }
    });
  }
}
