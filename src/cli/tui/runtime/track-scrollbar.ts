import { ScrollbarSets, type Screen } from "@termuijs/core";
import { Widget } from "@termuijs/widgets";

const SYMBOLS = ScrollbarSets.VERTICAL;
const TRACK_COLOR = { type: "named", name: "brightBlack" } as const;
const THUMB_COLOR = { type: "named", name: "white" } as const;

/**
 * Vertical scrollbar that always shows the up/down arrows, even when all
 * content fits. TermUI's `Scrollbar` early-returns in that case and the
 * column goes blank; this widget keeps the chrome drawn so the UI stays
 * stable. The thumb spans the full track when there is nothing to scroll
 * and shrinks proportionally otherwise.
 */
export class TrackScrollbar extends Widget {
  private contentLength = 1;
  private viewportLength = 1;
  private position = 0;

  public setContentLength(length: number): void {
    const value = Math.max(1, length);
    if (value === this.contentLength) return;
    this.contentLength = value;
    this.markDirty();
  }

  public setViewportLength(length: number): void {
    const value = Math.max(1, length);
    if (value === this.viewportLength) return;
    this.viewportLength = value;
    this.markDirty();
  }

  public setPosition(position: number): void {
    const value = Math.max(0, position);
    if (value === this.position) return;
    this.position = value;
    this.markDirty();
  }

  protected override _renderSelf(screen: Screen): void {
    const { x, y, width, height } = this._getContentRect();
    if (width <= 0 || height <= 0) return;
    const column = x + width - 1;
    if (height === 1) {
      screen.setCell(column, y, { char: SYMBOLS.track, fg: TRACK_COLOR });
      return;
    }
    screen.setCell(column, y, { char: SYMBOLS.begin, fg: TRACK_COLOR });
    screen.setCell(column, y + height - 1, {
      char: SYMBOLS.end,
      fg: TRACK_COLOR,
    });
    const trackLength = height - 2;
    if (trackLength <= 0) return;
    const { thumbStart, thumbEnd } = this.thumbRange(trackLength);
    for (let i = 0; i < trackLength; i++) {
      const isThumb = i >= thumbStart && i < thumbEnd;
      screen.setCell(column, y + 1 + i, {
        char: isThumb ? SYMBOLS.thumb : SYMBOLS.track,
        fg: isThumb ? THUMB_COLOR : TRACK_COLOR,
      });
    }
  }

  private thumbRange(trackLength: number): {
    thumbStart: number;
    thumbEnd: number;
  } {
    if (this.contentLength <= this.viewportLength)
      return { thumbStart: 0, thumbEnd: trackLength };
    const thumbSize = Math.max(
      1,
      Math.floor((trackLength * this.viewportLength) / this.contentLength),
    );
    const maxScroll = this.contentLength - this.viewportLength;
    const offset = Math.min(
      trackLength - thumbSize,
      Math.floor((this.position * (trackLength - thumbSize)) / maxScroll),
    );
    return { thumbStart: offset, thumbEnd: offset + thumbSize };
  }
}
