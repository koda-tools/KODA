import type { ManagedSession, SessionFactory } from "./types.js";

/**
 * Holds every live session and which one is active. The manager is the source
 * of truth for session state; the TUI store only mirrors the active session.
 * Only one session is active at a time (no concurrent runs).
 */
export class SessionManager {
  private readonly sessions: ManagedSession[] = [];
  private active = 0;
  private counter = 0;

  public constructor(
    private readonly factory: SessionFactory,
    private readonly titleFor: (index: number) => string = (i) =>
      `Session ${i + 1}`,
  ) {
    this.create();
  }

  public activeSession(): ManagedSession {
    const entry = this.sessions[this.active];
    if (entry === undefined) throw new Error("No active session.");
    return entry;
  }

  public list(): readonly ManagedSession[] {
    return this.sessions;
  }

  public activeIndex(): number {
    return this.active;
  }

  public count(): number {
    return this.sessions.length;
  }

  /**
   * Create a new session and return it. It becomes active unless
   * `activate` is false (a subagent's child session runs in background).
   */
  public create(
    title?: string,
    options: { readonly activate?: boolean; readonly parentId?: string } = {},
  ): ManagedSession {
    const id = `s${(this.counter += 1)}`;
    const index = this.sessions.length;
    const entry: ManagedSession = {
      id,
      title: title ?? this.titleFor(index),
      session: this.factory(id),
      transcript: [""],
      ...(options.parentId === undefined ? {} : { parentId: options.parentId }),
    };
    this.sessions.push(entry);
    if (options.activate !== false) this.active = index;
    return entry;
  }

  /** Switch the active session; returns it, or `undefined` if out of range. */
  public switchTo(index: number): ManagedSession | undefined {
    if (index < 0 || index >= this.sessions.length) return undefined;
    this.active = index;
    return this.sessions[index];
  }

  /**
   * Remove a session. The active index is kept pointing at a valid session;
   * the last session cannot be removed (there is always one active).
   */
  public remove(index: number): boolean {
    if (this.sessions.length <= 1) return false;
    if (index < 0 || index >= this.sessions.length) return false;
    this.sessions.splice(index, 1);
    if (this.active >= this.sessions.length) {
      this.active = this.sessions.length - 1;
    } else if (index < this.active) {
      this.active -= 1;
    }
    return true;
  }
}
