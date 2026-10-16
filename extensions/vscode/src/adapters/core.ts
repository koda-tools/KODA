import {
  bootstrapKoda,
  loadConnection,
  type AgentRunResult,
  type ChatMessage,
  type KodaRuntime,
  type ToolCall,
  type ToolObservation,
} from "@koda-tools/core";
import { contextPrompt } from "./workspace.js";
import type { KodaChatRequest, KodaChatRuntime, KodaEvent } from "../contracts.js";

export async function createKodaRuntime(workspaceRoot: string, env: NodeJS.ProcessEnv, approve: (title: string, prompt: string) => Promise<boolean>): Promise<KodaChatRuntime> {
  const connection = await loadConnection({ env });
  const core = await bootstrapKoda({
    cwd: workspaceRoot,
    connection,
    policies: {
      writePolicy: { confirm: (request) => approve("KODA file change", `Allow writing ${request.filePath}?`) },
      commandPolicy: { confirm: (request) => approve("KODA command", `Allow running '${request.command}' in ${request.cwd}?`) },
      approve,
    },
  });
  return new CoreChatRuntime(core);
}

class CoreChatRuntime implements KodaChatRuntime {
  public constructor(private readonly core: KodaRuntime) {}

  public async execute(request: KodaChatRequest, options: { readonly signal: AbortSignal; readonly onEvent: (event: KodaEvent) => void }): Promise<{ readonly result: AgentRunResult; readonly history: readonly ChatMessage[] }> {
    const prepared = this.core.agents.prepare(request.mode);
    options.onEvent({ type: "agent.started", mode: request.mode });
    try {
      const result = await prepared.agent.runDetailed(request.prompt + contextPrompt(request.context), {
        signal: options.signal,
        ...(request.modelId === undefined ? {} : { model: request.modelId }),
        ...(request.history === undefined ? {} : { history: request.history }),
        observer: {
          onTextDelta: (text) => options.onEvent({ type: "agent.message", text }),
          onToolStart: (call: ToolCall) => options.onEvent({ type: "tool.started", call }),
          onToolResult: (call: ToolCall, observation: ToolObservation) => options.onEvent({ type: "tool.completed", call, observation }),
        },
      });
      options.onEvent({ type: "agent.completed", result });
      return { result, history: result.messages };
    } catch (error) {
      const message = error instanceof Error ? error.message : "KODA execution failed.";
      options.onEvent({ type: "error", message });
      throw error;
    }
  }

  public async dispose(): Promise<void> { await this.core.close(); }
}
