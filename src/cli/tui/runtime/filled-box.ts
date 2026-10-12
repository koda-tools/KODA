import type { Color, Screen } from "@termuijs/core";
import { Box } from "@termuijs/widgets";

/** Very dark gray behind the sidebar. */
export const CONTENT_BACKGROUND: Color = { type: "rgb", r: 24, g: 24, b: 24 };

/**
 * `Box` that paints its whole rect with `style.bg`: TermUI only paints the
 * cells it writes text to, so the padding would keep the terminal's color.
 */
export class FilledBox extends Box {
  protected override _renderSelf(screen: Screen): void {
    const bg = this._style.bg;
    if (bg !== undefined) {
      const { x, y, width, height } = this._rect;
      for (let row = y; row < y + height; row++)
        for (let column = x; column < x + width; column++)
          screen.setCell(column, row, { char: " ", bg });
    }
    super._renderSelf(screen);
  }
}
