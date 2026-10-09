import { estimateCost } from "../../../providers/index.js";
import { createLineWriter } from "../output/line-writer.js";
import type { InteractiveIO, SessionSummaryView } from "../shared/types.js";
import type { Session } from "./session.js";
import { createSessionIO } from "./session-io.js";
import { SessionManager } from "./session-manager.js";
import type {
  BoundSessionFactory,
  ManagedSession,
  SessionBinding,
} from "./types.js";
import { totalTokens } from "./usage-format.js";

const MAX_TITLE_LENGTH = 40;

/** First line of the message, whitespace collapsed and clipped. */
function titleFrom(message: string): string {
  const line = message.trim().split(/\r?\n/, 1)[0] ?? "";
  const text = line.replace(/\s+/g, " ");
  return text.length > MAX_TITLE_LENGTH
    ? `${text.slice(0, MAX_TITLE_LENGTH - 1)}…`
    : text;
}

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
    ...(status.agent === undefined ? {} : { agent: status.agent }),
  };
}

/**
 * Owns the `SessionManager` and keeps the TUI in sync: pushes session
 * summaries to the sidebar and swaps the visible transcript when switching.
 * One session is active at a time; the manager is the source of truth.
 * Each session writes through its own binding, so output of a session that
 * is not on screen (a subagent's child session) lands in its buffer.
 */
export class SessionController {
  private readonly manager: SessionManager;
  private readonly bindings = new Map<string, SessionBinding>();

  public constructor(
    private readonly io: InteractiveIO,
    createSession: BoundSessionFactory,
  ) {
    this.manager = new SessionManager((id) => {
      const binding = this.bind(id);
      return createSession(id, binding.io, binding.writer);
    });
    this.pushSummaries();
  }

  public active(): Session {
    return this.manager.activeSession().session;
  }

  public activeEntry(): ManagedSession {
    return this.manager.activeSession();
  }

  /**
   * Abort the running request, even when the user is looking at another
   * session (e.g. a subagent's child session) while it runs.
   */
  public abortRunning(): boolean {
    if (this.active().abortRequest()) return true;
    return this.manager.list().some((entry) => entry.session.abortRequest());
  }

  /** The IO and writer of `entry` (screen when active, buffer otherwise). */
  public bindingFor(entry: ManagedSession): SessionBinding {
    return this.bindings.get(entry.id) ?? this.bind(entry.id);
  }

  /** Create a new session, show its (empty) transcript, and refresh header. */
  public newSession(): void {
    this.saveVisibleTranscript();
    const entry = this.manager.create();
    this.io.setTranscript?.(entry.transcript);
    entry.session.showHeader();
    this.pushSummaries();
  }

  /**
   * A child session for a subagent run. It is not activated: its output
   * fills its own buffer, and the user can open it from the switcher.
   */
  public createChild(title: string, parent: ManagedSession): ManagedSession {
    const entry = this.manager.create(title, {
      activate: false,
      parentId: parent.id,
    });
    this.pushSummaries();
    return entry;
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

  /**
   * Name a `Session N` after the first message typed in it. Sessions that
   * already have a real title (subagent children) keep it.
   */
  public nameFromMessage(entry: ManagedSession, message: string): void {
    const title = titleFrom(message);
    if (entry.named || title === "") return;
    entry.title = title;
    entry.named = true;
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

  private find(id: string): ManagedSession | undefined {
    return this.manager.list().find((entry) => entry.id === id);
  }

  private bind(id: string): SessionBinding {
    const io = createSessionIO(this.io, {
      // During construction the manager doesn't exist yet; the first
      // session is the active one.
      isActive: () =>
        this.manager === undefined || this.manager.activeSession().id === id,
      read: () => this.find(id)?.transcript ?? [""],
      store: (lines) => {
        const entry = this.find(id);
        if (entry !== undefined) entry.transcript = lines;
      },
    });
    const binding = { io, writer: createLineWriter(io) };
    this.bindings.set(id, binding);
    return binding;
  }

  /** Save what is on screen into the active session's own buffer. */
  private saveVisibleTranscript(): void {
    const visible = this.io.getTranscript?.();
    if (visible !== undefined) {
      this.manager.activeSession().transcript = [...visible];
    }
  }
}
