import type { Usage } from "../../../providers/index.js";
import type { InteractiveIO, LineWriter } from "../shared/types.js";
import type { Session } from "./session.js";

export interface SessionIdentity {
  readonly provider: string;
  readonly model: string;
}

export interface SessionStatus extends SessionIdentity {
  readonly usage: Usage;
  readonly agent?: string;
}

/** One session plus the UI state that travels with it. */
export interface ManagedSession {
  readonly id: string;
  title: string;
  readonly session: Session;
  /** This session's own transcript buffer (only the active one is shown). */
  transcript: string[];
  /** Set on a subagent's child session: the session that delegated. */
  readonly parentId?: string;
}

/** Builds a fresh `Session` for a new tab. */
export type SessionFactory = (id: string) => Session;

/**
 * Where one session's output goes: the screen while it is active, its own
 * transcript buffer otherwise (a background subagent, a switched-away run).
 */
export interface SessionBinding {
  readonly io: InteractiveIO;
  readonly writer: LineWriter;
}

/** Builds the `Session` of a new tab, writing through its binding. */
export type BoundSessionFactory = (
  id: string,
  io: InteractiveIO,
  writer: LineWriter,
) => Session;
