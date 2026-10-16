import type { AgentRunResult, ChatMessage, ToolCall, ToolObservation } from "@koda-tools/core";

export type KodaMode = "build" | "plan";
export interface WorkspaceContext {
  readonly workspaceUri: string;
  readonly activeFile?: string;
  readonly selection?: string;
  readonly language?: string;
  readonly diagnostics?: readonly string[];
  readonly references?: readonly string[];
}
export interface KodaChatRequest {
  readonly prompt: string;
  readonly mode: KodaMode;
  readonly workspaceUri: string;
  readonly conversationKey: string;
  readonly context?: WorkspaceContext;
  readonly modelId?: string;
  readonly history?: readonly ChatMessage[];
}
export type KodaEvent =
  | { readonly type: "agent.started"; readonly mode: KodaMode }
  | { readonly type: "agent.message"; readonly text: string }
  | { readonly type: "tool.started"; readonly call: ToolCall }
  | { readonly type: "tool.completed"; readonly call: ToolCall; readonly observation: ToolObservation }
  | { readonly type: "agent.completed"; readonly result: AgentRunResult }
  | { readonly type: "error"; readonly message: string };
export interface ChatTurnResult { readonly result: AgentRunResult; readonly history: readonly ChatMessage[]; }
export interface KodaChatRuntime {
  execute(request: KodaChatRequest, options: { readonly signal: AbortSignal; readonly onEvent: (event: KodaEvent) => void }): Promise<ChatTurnResult>;
  dispose(): Promise<void>;
}
