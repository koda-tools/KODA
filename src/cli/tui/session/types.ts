import type { Usage } from "../../../providers/index.js";

export interface SessionIdentity {
  readonly provider: string;
  readonly model: string;
}

export interface SessionStatus extends SessionIdentity {
  readonly usage: Usage;
}
