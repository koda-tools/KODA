import type {
  ChatMessage,
  ToolCall,
  ToolDefinition,
  Usage,
} from "../../providers/index.js";

/** Provider and default model the agent talks to. */
export interface AgentIdentity {
  readonly provider: string;
  readonly model: string;
}

export interface ToolObservation {
  readonly ok: boolean;
  readonly content: string;
}

/** What the agent needs from a tool set (definitions, execution, labels). */
export interface ToolExecutor {
  readonly definitions: readonly ToolDefinition[];
  /** `signal` aborts long-running tools when the run is cancelled. */
  execute(
    name: string,
    serializedArguments: string,
    signal?: AbortSignal,
  ): Promise<ToolObservation>;
  /** Progress label shown while the tool runs, if the tool declares one. */
  statusLabel(name: string): string | undefined;
}

/** Optional hooks to follow a run as it happens. */
export interface AgentObserver {
  onTextDelta?(text: string): void;
  onStatus?(label: string | undefined): void;
  onToolStart?(call: ToolCall): Promise<void> | void;
  onToolResult?(
    call: ToolCall,
    observation: ToolObservation,
  ): Promise<void> | void;
}

/** What happens when a run uses up `maxIterations`. */
export type StepLimitBehavior = "error" | "summarize";

export interface CodeAgentOptions {
  readonly identity: AgentIdentity;
  readonly maxIterations?: number;
  readonly systemPrompt?: string;
  readonly temperature?: number;
  /**
   * `error` (default) fails the run; `summarize` makes one last call without
   * tools so the model reports what it did and what is left.
   */
  readonly onStepLimit?: StepLimitBehavior;
}

export interface AgentRunOptions {
  readonly model?: string;
  readonly signal?: AbortSignal;
  readonly history?: readonly ChatMessage[];
  readonly observer?: AgentObserver;
}

export interface AgentRunResult {
  readonly content: string;
  readonly usage: Usage;
  readonly provider: string;
  readonly model: string;
  /** Messages produced during this turn, starting with the user prompt. */
  readonly messages: readonly ChatMessage[];
}
