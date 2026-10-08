import { Box } from "@termuijs/widgets";
import { formatCost, formatTokens } from "../session/usage-format.js";
import { AnsiLogView } from "./ansi-log-view.js";
import { LAYOUT, SCROLL_SYNC_INTERVAL_MS } from "./constants.js";
import { TrackScrollbar } from "./track-scrollbar.js";
import type { ConversationStore, SessionSummary } from "./types.js";

const WIDTH = LAYOUT.sidebarWidth;
/** Scrollbar only shows up once the session list actually needs it. */
const SCROLLBAR_THRESHOLD = 20;

/** `1.2k` style token count from a raw total (sidebar is width-constrained). */
function compactTokens(tokens: number): string {
  return formatTokens({ inputTokens: tokens }).replace(" tokens", "");
}

function compactCost(cost: number | undefined): string {
  return cost === undefined ? "N/A" : `$${cost.toFixed(4)}`;
}

/** Clip a label to the sidebar's inner width so it never wraps. */
function clip(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, width - 1)}…` : text;
}

/** The logo lines, mirroring the header art. */
const LOGO = [" ▀ ▀   KODA", "█▀█▀█  AI Coding Agent", "▀▀▀▀▀"];
/** Left + right border of the sidebar box. */
const BORDER_COLUMNS = 2;

/** Columns available for text inside the border (minus the scrollbar). */
function innerWidth(sessionCount: number): number {
  const scrollbar = sessionCount > SCROLLBAR_THRESHOLD ? 1 : 0;
  return WIDTH - BORDER_COLUMNS - scrollbar;
}

/**
 * Center the logo as one block, so the icon rows stay aligned with each
 * other instead of each line being centered on its own.
 */
function centeredLogo(width: number): string[] {
  const blockWidth = Math.max(...LOGO.map((line) => line.length));
  const pad = " ".repeat(Math.max(0, Math.floor((width - blockWidth) / 2)));
  return [...LOGO.map((line) => `${pad}${line}`), ""];
}

interface SidebarContent {
  readonly lines: string[];
  /** Index of the active session's line, for keeping it in view. */
  readonly activeLine: number | undefined;
  readonly sessionCount: number;
}

function sessionLines(
  sessions: readonly SessionSummary[],
): Pick<SidebarContent, "lines" | "activeLine"> {
  const lines = [...centeredLogo(innerWidth(sessions.length)), " SESSIONS", ""];
  let activeLine: number | undefined;
  for (const session of sessions) {
    if (session.active) activeLine = lines.length;
    const marker = session.active ? "●" : "○";
    lines.push(`  ${marker} ${clip(session.title, WIDTH - 6)}`);
  }
  lines.push("", "  + New session");
  return { lines, activeLine };
}

function currentLines(sessions: readonly SessionSummary[]): string[] {
  const current = sessions.find((session) => session.active);
  if (current === undefined) return [];
  return [
    "",
    " CURRENT",
    "",
    `  Model     ${clip(current.model, WIDTH - 12)}`,
    `  Provider  ${clip(current.provider, WIDTH - 12)}`,
    `  Tokens    ${compactTokens(current.tokens)}`,
    `  Cost      ${compactCost(current.cost)}`,
  ];
}

function sidebarContent(sessions: readonly SessionSummary[]): SidebarContent {
  const sessionPart = sessionLines(sessions);
  return {
    lines: [...sessionPart.lines, ...currentLines(sessions)],
    activeLine: sessionPart.activeLine,
    sessionCount: sessions.length,
  };
}

/**
 * Left column listing every session and the active session's stats. Scrolls
 * like the transcript (`AnsiLogView` + `TrackScrollbar`) so a long session
 * list doesn't overflow the screen; auto-scrolls to keep the active session
 * in view, since the sidebar itself isn't a focusable, user-scrollable list.
 * Reads only from the store; collapses to width 0 when hidden.
 */
export class SessionSidebar {
  private readonly view = new AnsiLogView({
    flexGrow: 1,
    flexShrink: 1,
    height: "100%",
  });
  private readonly scrollbar = new TrackScrollbar({
    width: 1,
    flexGrow: 0,
    flexShrink: 0,
    height: "100%",
  });
  public readonly widget: Box;
  private scrollTop = 0;
  private lastViewport = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private unsubscribe: (() => void) | undefined;

  public constructor(private readonly store: ConversationStore) {
    this.widget = new Box({
      flexDirection: "row",
      alignItems: "stretch",
      flexGrow: 0,
      flexShrink: 0,
      border: "single",
      borderColor: { type: "named", name: "brightBlack" },
    });
    this.widget.addChild(this.view);
    this.widget.addChild(this.scrollbar);
    this.applyVisible(this.store.getState().sidebarVisible);
  }

  public start(): void {
    this.unsubscribe = this.store.subscribe((state, previous) => {
      if (
        state.sessions !== previous.sessions ||
        state.sidebarVisible !== previous.sidebarVisible
      ) {
        this.sync();
      }
    });
    this.sync();
    // Resizes change the viewport height without changing the sessions.
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

  /** Grow to the fixed width when visible, collapse to 0 when hidden. */
  public applyVisible(visible: boolean): void {
    this.widget.setStyle({ width: visible ? WIDTH : 0 });
    this.sync();
  }

  private viewportLines(): number {
    const height = this.view.rect.height;
    return height > 0 ? height : LAYOUT.fallbackViewportLines;
  }

  private maxScrollTop(lineCount: number): number {
    return Math.max(0, lineCount - this.viewportLines());
  }

  /** Clamp scroll so the active session's line stays in the viewport. */
  private scrollToActive(activeLine: number | undefined, max: number): void {
    if (activeLine === undefined) return;
    const viewport = this.viewportLines();
    if (activeLine < this.scrollTop) this.scrollTop = activeLine;
    else if (activeLine >= this.scrollTop + viewport)
      this.scrollTop = activeLine - viewport + 1;
    this.scrollTop = Math.min(max, Math.max(0, this.scrollTop));
  }

  private sync(): void {
    const { sessions } = this.store.getState();
    const { lines, activeLine, sessionCount } = sidebarContent(sessions);
    const viewport = this.viewportLines();
    const max = this.maxScrollTop(lines.length);
    this.scrollToActive(activeLine, max);
    this.scrollTop = Math.min(max, this.scrollTop);
    this.view.setLines(lines);
    this.view.setScrollTop(this.scrollTop);
    this.scrollbar.setStyle({
      width: sessionCount > SCROLLBAR_THRESHOLD ? 1 : 0,
    });
    this.scrollbar.setContentLength(Math.max(1, lines.length));
    this.scrollbar.setViewportLength(viewport);
    this.scrollbar.setPosition(this.scrollTop);
    this.lastViewport = viewport;
  }
}
