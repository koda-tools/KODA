import type { ChatMessage } from "@koda-tools/core";
import type { KodaChatRuntime } from "../contracts.js";
import { canonicalWorkspaceUri, sessionKey } from "./identity.js";
export interface SessionEntry {
  readonly key: string; readonly workspaceUri: string; readonly conversationKey: string;
  readonly runtime: KodaChatRuntime; readonly history: ChatMessage[];
}
export class SessionRegistry {
  private readonly entries = new Map<string, SessionEntry>();
  public get(workspaceUri: string, conversationKey: string): SessionEntry | undefined { return this.entries.get(sessionKey(workspaceUri, conversationKey)); }
  public set(entry: SessionEntry): void {
    if (canonicalWorkspaceUri(entry.workspaceUri) !== entry.workspaceUri) throw new Error("Session workspace must be canonical.");
    this.entries.set(entry.key, entry);
  }
  public async dispose(): Promise<void> {
    const entries = [...this.entries.values()]; this.entries.clear();
    await Promise.all(entries.map((entry) => entry.runtime.dispose()));
  }
}
