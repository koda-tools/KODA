import {
  stringWidth,
  styleToCellAttrs,
  truncate,
  type Color,
  type Screen,
  type Style,
} from "@termuijs/core";
import { TextArea, type TextAreaOptions } from "@termuijs/ui";
import { LAYOUT } from "./constants.js";

const BAR = "▌";
const BAR_COLOR: Color = { type: "named", name: "cyan" };
/** Columns between the left border and the accent bar. */
const BAR_OFFSET = 2;
/** Columns between the left border and the footer text. */
const FOOTER_OFFSET = 3;
/** Columns kept free between the footer hint and the right border. */
const HINT_MARGIN = 5;

/**
 * `TextArea` drawn as a message box: an accent bar beside the text, a
 * placeholder while empty, and a footer inside the border with the agent
 * and model on the left and the send hint on the right:
 *
 *     ┌──────────────────────────────┐
 *     │ ▌                            │
 *     │ ▌  Type your Message      │
 *     │ ▌                            │
 *     │                              │
 *     │  build · gpt-4o-mini  Enter ↵│
 *     └──────────────────────────────┘
 *
 * The bar and footer are drawn in `_renderBorder`, which runs after
 * `_renderSelf`, in the padding the style reserves for them
 * (`LAYOUT.promptChromeRows`). The base class only draws its placeholder
 * while unfocused, so this one draws its own.
 */
export class PromptArea extends TextArea {
  private info = "";

  public constructor(
    private readonly placeholder: string,
    private readonly hint: string,
    style: Partial<Style>,
    options: TextAreaOptions,
  ) {
    super(style, options);
  }

  /** Left footer text, e.g. `build · gpt-4o-mini`. */
  public setInfo(info: string): void {
    if (info === this.info) return;
    this.info = info;
    this.markDirty();
  }

  protected override _renderSelf(screen: Screen): void {
    this.fillBackground(screen);
    super._renderSelf(screen);
    if (this.value !== "") return;
    const { x, y, width, height } = this._getContentRect();
    if (width <= 1 || height <= 0) return;
    // The cursor sits on the first cell while focused; text starts after it.
    const offset = this.isFocused ? 1 : 0;
    screen.writeString(
      x + offset,
      y,
      truncate(this.placeholder, width - offset),
      { ...styleToCellAttrs(this._style), dim: true },
    );
  }

  /**
   * TermUI only paints the cells it writes text to, so the style's `bg`
   * would cover the text alone; fill the whole box first.
   */
  private fillBackground(screen: Screen): void {
    const bg = this._style.bg;
    if (bg === undefined) return;
    const { x, y, width, height } = this._rect;
    for (let row = y; row < y + height; row++)
      for (let column = x; column < x + width; column++)
        screen.setCell(column, row, { char: " ", bg });
  }

  protected override _renderBorder(screen: Screen): void {
    super._renderBorder(screen);
    const { x, y, width, height } = this._rect;
    if (height < LAYOUT.borderRows + LAYOUT.promptChromeRows + 1) return;
    const attrs = styleToCellAttrs(this._style);
    // Bar rows: the top padding, every text row and one row below them.
    const barRows = height - LAYOUT.borderRows - LAYOUT.promptFooterRows;
    for (let row = 0; row < barRows; row++)
      screen.setCell(x + BAR_OFFSET, y + 1 + row, {
        char: BAR,
        ...attrs,
        fg: BAR_COLOR,
      });
    const footerRow = y + height - 2;
    const hintWidth = stringWidth(this.hint);
    if (width > hintWidth + HINT_MARGIN)
      screen.writeString(
        x + width - HINT_MARGIN - hintWidth,
        footerRow,
        this.hint,
        {
          ...attrs,
          dim: true,
        },
      );
    const room = width - FOOTER_OFFSET - HINT_MARGIN - hintWidth - 2;
    if (this.info !== "" && room > 0)
      screen.writeString(
        x + FOOTER_OFFSET,
        footerRow,
        truncate(this.info, room),
        {
          ...attrs,
          dim: true,
        },
      );
  }
}
