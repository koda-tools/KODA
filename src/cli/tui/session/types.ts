import type { Usage } from "../../../providers/index.js";
import type { Session } from "./session.js";

export interface SessionIdentity {
  readonly provider: string;
  readonly model: string;
}

export interface SessionStatus extends SessionIdentity {
  readonly usage: Usage;
}

/** One session plus the UI state that travels with it. */
export interface ManagedSession {
  readonly id: string;
  title: string;
  readonly session: Session;
  /** This session's own transcript buffer (only the active one is shown). */
  transcript: string[];
}

/** Builds a fresh `Session` for a new tab. */
export type SessionFactory = (id: string) => Session;
