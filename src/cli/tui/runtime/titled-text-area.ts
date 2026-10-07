import { stringWidth, styleToCellAttrs, type Screen } from "@termuijs/core";
import { TextArea, type TextAreaOptions } from "@termuijs/ui";
import type { Style } from "@termuijs/core";

/** Dashes kept between the top-left corner and the label. */
const TITLE_INDENT = 3;

/**
 * `TextArea` with a label drawn inside its top border, like
 * `┌───Message────┐`.
 *
 * TermUI has no `style.title`. The label must be written in
 * `_renderBorder`, not `_renderSelf`: `Widget.render()` calls
 * `_renderSelf()` first and `_renderBorder()` after, and the latter repaints
 * the whole top row, erasing anything drawn there. TermUI's own `Panel`
 * widget writes its title in `_renderSelf` and is invisible for this very
 * reason.
 */
export class TitledTextArea extends TextArea {
  private title: string;

  public constructor(
    title: string,
    style: Partial<Style>,
    options: TextAreaOptions,
  ) {
    super(style, options);
    this.title = title;
  }

  public setTitle(title: string): void {
    if (title === this.title) return;
    this.title = title;
    this.markDirty();
  }

  protected override _renderBorder(screen: Screen): void {
    super._renderBorder(screen);
    const { x, y, width } = this._rect;
    const available = width - 2 - TITLE_INDENT;
    if (this.title === "" || stringWidth(this.title) > available) return;
    const attrs = styleToCellAttrs(this._style);
    const fg = this._style.borderColor ?? attrs.fg;
    screen.writeString(x + 1 + TITLE_INDENT, y, this.title, {
      ...attrs,
      ...(fg === undefined ? {} : { fg }),
      bold: true,
    });
  }
}
