import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { KodaRuntime } from "@koda-tools/core";
import { canonicalWorkspaceUri, type AcpSession } from "./session.js";

export class AcpSessionRegistry {
  private readonly sessions = new Map<string, AcpSession>();

  public create(
    workspaceRoot: string,
    runtime: KodaRuntime,
    id = randomUUID(),
  ): AcpSession {
    const root = resolve(workspaceRoot);
    const session: AcpSession = {
      id,
      workspaceRoot: root,
      workspaceUri: canonicalWorkspaceUri(root),
      runtime,
      history: [],
      mode: "build",
      active: undefined,
    };
    this.sessions.set(id, session);
    return session;
  }

  public get(id: string): AcpSession | undefined {
    return this.sessions.get(id);
  }

  public async close(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session === undefined) return;
    this.sessions.delete(id);
    session.active?.abort();
    await session.runtime.close();
  }

  public async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)));
  }
}
