import { isAbsolute, resolve } from "node:path";
import {
  methods,
  type AgentContext,
  type SessionUpdate,
} from "@agentclientprotocol/sdk";
import type { AgentObserver, ToolCall } from "@koda-tools/core";
import { safeDescription } from "./permissions.js";
import { isWithinWorkspace } from "../session/session.js";

const MAX_CHUNK = 16_384;

type ToolKind = "read" | "edit" | "execute" | "search" | "other";

/** Fonte única de verdade sobre cada ferramenta conhecida. */
const TOOLS: Readonly<Record<string, { kind: ToolKind; pathArg?: string }>> = {
  writeFile: { kind: "edit", pathArg: "filePath" },
  runCommand: { kind: "execute" },
  readFile: { kind: "read" },
  getFileInfo: { kind: "read" },
  searchFiles: { kind: "search" },
  listDirectory: { kind: "search" },
};

const kindOf = (name: string): ToolKind => TOOLS[name]?.kind ?? "other";

/**
 * Arquivo dentro do workspace que a chamada alterou, se identificável.
 * Falhas de parsing só omitem `locations`; nunca devem quebrar a sessão.
 */
function changedFile(call: ToolCall, root: string): string | undefined {
  const tool = TOOLS[call.name];
  if (tool?.kind !== "edit" || tool.pathArg === undefined) return undefined;

  let args: unknown;
  try {
    args = JSON.parse(call.arguments);
  } catch {
    return undefined;
  }

  const value = (args as Record<string, unknown> | null)?.[tool.pathArg];
  if (typeof value !== "string") return undefined;

  const candidate = isAbsolute(value) ? value : resolve(root, value);
  return isWithinWorkspace(root, candidate) ? candidate : undefined;
}

/**
 * Divide por pontos de código, não por unidades UTF-16, para nunca cortar
 * um par substituto ao meio.
 */
function* chunks(text: string, size: number): Generator<string> {
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    const last = text.charCodeAt(end - 1);
    // Se terminaria no meio de um par substituto, recua uma unidade.
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    yield text.slice(start, end);
    start = end;
  }
}

/** Observer methods are awaited by Core, so at most one ACP update is pending. */
export class AcpEventSink {
  #sentText = false;

  public constructor(
    private readonly client: AgentContext,
    private readonly sessionId: string,
    private readonly workspaceRoot: string,
    private readonly signal: AbortSignal,
  ) {}

  public get sentText(): boolean {
    return this.#sentText;
  }

  private async update(update: SessionUpdate): Promise<void> {
    if (this.signal.aborted) return;
    await this.client.notify(methods.client.session.update, {
      sessionId: this.sessionId,
      update,
    });
  }

  public async text(value: string): Promise<void> {
    if (value === "" || this.signal.aborted) return;
    for (const piece of chunks(value, MAX_CHUNK)) {
      await this.update({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: piece },
      });
      this.#sentText = true; // só marca depois de realmente enviar
    }
  }

  public observer(): AgentObserver {
    return {
      onTextDelta: (text) => this.text(text),
      onToolStart: (call) =>
        this.update({
          sessionUpdate: "tool_call",
          toolCallId: call.id,
          title: safeDescription(call.name),
          name: call.name,
          kind: kindOf(call.name),
          status: "in_progress",
        }),
      onToolResult: (call, observation) => {
        const path = observation.ok
          ? changedFile(call, this.workspaceRoot)
          : undefined;
        return this.update({
          sessionUpdate: "tool_call_update",
          toolCallId: call.id,
          status: observation.ok ? "completed" : "failed",
          ...(path === undefined ? {} : { locations: [{ path }] }),
        });
      },
    };
  }

  public async error(): Promise<void> {
    await this.text(
      "KODA could not complete this request. See agent diagnostics.",
    );
  }
}
