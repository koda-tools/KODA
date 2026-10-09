import { Box } from "@termuijs/widgets";
import { blockIndent, isBlockLine } from "../blocks/style.js";
import { AnsiLogView } from "./ansi-log-view.js";
import { LAYOUT, SCROLL_SYNC_INTERVAL_MS } from "./constants.js";
import { TrackScrollbar } from "./track-scrollbar.js";
import type { ConversationStore } from "./types.js";

/**
 * The output area: an `AnsiLogView` plus a one-column `TrackScrollbar`,
 * kept in step. Follows new output until the user scrolls up, and resumes
 * once back at the bottom. The scrollbar always shows the up/down arrows
 * so the column stays stable even when the content fits.
 */
export class Transcript {
  private readonly view = new AnsiLogView({
    flexGrow: 1,
    flexShrink: 1,
    height: "100%",
    border: "single",
    borderColor: { type: "named", name: "brightBlack" },
    padding: 1,
  });
  private readonly scrollbar = new TrackScrollbar({
    width: 1,
    flexGrow: 0,
    flexShrink: 0,
    height: "100%",
  });
  private scrollTop = 0;
  private followOutput = true;
  private lastViewport = 0;
  private lastWidth = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private unsubscribe: (() => void) | undefined;

  public constructor(private readonly store: ConversationStore) {
    // Long lines wrap; message blocks keep their left border on every row
    // and paint their background across the full width.
    this.view.setWrap({ indent: blockIndent, fill: isBlockLine });
  }

  /**
   * View + scrollbar side by side, filling the leftover space. Not built
   * with quick's `row()`: it forces `flexGrow: 1` on children whose value
   * is falsy (so `0` too), which split the width 50/50 with the scrollbar.
   */
  public createRow(): Box {
    const row = new Box({
      flexDirection: "row",
      alignItems: "stretch",
      flexGrow: 1,
      flexShrink: 1,
      width: "100%",
    });
    row.addChild(this.view);
    row.addChild(this.scrollbar);
    return row;
  }

  public start(): void {
    this.unsubscribe = this.store.subscribe((state, previous) => {
      if (state.transcript !== previous.transcript) this.sync();
    });
    this.sync();
    // Resizes (and the sidebar toggle) change the viewport without changing
    // the transcript; a new width also changes how many rows lines wrap to.
    this.timer = setInterval(() => {
      if (
        this.viewportLines() !== this.lastViewport ||
        this.view.contentWidth() !== this.lastWidth
      )
        this.sync();
    }, SCROLL_SYNC_INTERVAL_MS);
  }

  public stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  public pageSize(): number {
    return Math.max(1, this.viewportLines() - 1);
  }

  public scrollBy(delta: number): void {
    const max = this.maxScrollTop();
    this.scrollTop = Math.min(max, Math.max(0, this.scrollTop + delta));
    this.followOutput = this.scrollTop >= max;
    this.sync();
  }

  private viewportLines(): number {
    const height = this.view.rect.height - LAYOUT.transcriptChromeRows;
    return height > 0 ? height : LAYOUT.fallbackViewportLines;
  }

  /** Scroll limit in visual rows (wrapped lines count once per row). */
  private maxScrollTop(): number {
    return Math.max(0, this.view.rowCount() - this.viewportLines());
  }

  private sync(): void {
    this.view.setLines(this.store.getState().transcript);
    const rows = this.view.rowCount();
    const viewport = this.viewportLines();
    const max = this.maxScrollTop();
    this.scrollTop = this.followOutput ? max : Math.min(this.scrollTop, max);
    // Following is re-measured at render time, so a stale width never
    // leaves the newest rows below the fold.
    this.view.setFollow(this.followOutput);
    this.view.setScrollTop(this.scrollTop);
    this.scrollbar.setContentLength(Math.max(1, rows));
    this.scrollbar.setViewportLength(viewport);
    this.scrollbar.setPosition(this.scrollTop);
    this.lastViewport = viewport;
    this.lastWidth = this.view.contentWidth();
  }
}
