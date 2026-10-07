import { Box } from "@termuijs/widgets";
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
  private timer: ReturnType<typeof setInterval> | undefined;
  private unsubscribe: (() => void) | undefined;

  public constructor(private readonly store: ConversationStore) {}

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
    // Resizes change the viewport height without changing the transcript.
    this.timer = setInterval(() => {
      if (this.viewportLines() !== this.lastViewport) this.sync();
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

  private maxScrollTop(): number {
    const lines = this.store.getState().transcript.length;
    return Math.max(0, lines - this.viewportLines());
  }

  private sync(): void {
    const lines = this.store.getState().transcript;
    const viewport = this.viewportLines();
    const max = this.maxScrollTop();
    this.scrollTop = this.followOutput ? max : Math.min(this.scrollTop, max);
    this.view.setLines(lines);
    this.view.setScrollTop(this.scrollTop);
    this.scrollbar.setContentLength(Math.max(1, lines.length));
    this.scrollbar.setViewportLength(viewport);
    this.scrollbar.setPosition(this.scrollTop);
    this.lastViewport = viewport;
  }
}
