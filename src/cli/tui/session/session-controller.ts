import { estimateCost } from "../../../providers/index.js";
import type { InteractiveIO, SessionSummaryView } from "../shared/types.js";
import type { Session } from "./session.js";
import { SessionManager } from "./session-manager.js";
import type { ManagedSession } from "./types.js";
import { totalTokens } from "./usage-format.js";

/** Build the sidebar summary for one managed session. */
function summarize(entry: ManagedSession, active: boolean): SessionSummaryView {
  const status = entry.session.status();
  return {
    id: entry.id,
    title: entry.title,
    active,
    model: status.model,
    provider: status.provider,
    tokens: totalTokens(status.usage),
    cost: estimateCost(status.provider, status.model, status.usage),
  };
}

/**
 * Owns the `SessionManager` and keeps the TUI in sync: pushes session
 * summaries to the sidebar and swaps the visible transcript when switching.
 * One session is active at a time; the manager is the source of truth.
 */
export class SessionController {
  private readonly manager: SessionManager;

  public constructor(
    private readonly io: InteractiveIO,
    createSession: (id: string) => Session,
  ) {
    this.manager = new SessionManager(createSession);
    this.pushSummaries();
  }

  public active(): Session {
    return this.manager.activeSession().session;
  }

  /** Create a new session, show its (empty) transcript, and refresh header. */
  public newSession(): void {
    this.saveVisibleTranscript();
    const entry = this.manager.create();
    this.io.setTranscript?.(entry.transcript);
    entry.session.showHeader();
    this.pushSummaries();
  }

  /** Switch to the session at `index`, restoring its transcript. */
  public switchTo(index: number): void {
    if (index === this.manager.activeIndex()) return;
    this.saveVisibleTranscript();
    const entry = this.manager.switchTo(index);
    if (entry === undefined) return;
    this.io.setTranscript?.(entry.transcript);
    entry.session.showHeader();
    this.pushSummaries();
  }

  /** Labels for the switcher modal, in manager order. */
  public pickerItems(): { label: string; active: boolean }[] {
    const activeIndex = this.manager.activeIndex();
    return this.manager.list().map((entry, index) => ({
      label: entry.title,
      active: index === activeIndex,
    }));
  }

  /** Recompute and push summaries (call after usage/model changes). */
  public pushSummaries(): void {
    const activeIndex = this.manager.activeIndex();
    const summaries = this.manager
      .list()
      .map((entry, index) => summarize(entry, index === activeIndex));
    this.io.setSessions?.(summaries);
  }

  /** Save what is on screen into the active session's own buffer. */
  private saveVisibleTranscript(): void {
    const visible = this.io.getTranscript?.();
    if (visible !== undefined) {
      this.manager.activeSession().transcript = [...visible];
    }
  }
}
