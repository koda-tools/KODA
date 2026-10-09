import type {
  AgentRunResult,
  CodeAgent,
  ToolObservation,
} from "../core/index.js";
import type { ILLMProvider, ToolDefinition } from "../providers/index.js";
import type { CommandPolicy } from "../tools/command/types.js";
import type { WritePolicy } from "../tools/registry.js";

export type PermissionAction = "allow" | "ask" | "deny";

/** A single action, or glob pattern → action rules (the last match wins). */
export type PermissionRule =
  | PermissionAction
  | Readonly<Record<string, PermissionAction>>;

/** OpenCode permission keys that map to KODA tools. */
export type PermissionKey =
  | "read"
  | "edit"
  | "list"
  | "glob"
  | "grep"
  | "bash"
  | "task"
  | "skill";

export type Permissions = Readonly<
  Partial<Record<PermissionKey, PermissionRule>>
>;

/** The permission a tool call needs and how the layers resolved it. */
export interface PermissionCheck {
  readonly key: PermissionKey;
  /** The value the rule patterns were matched against (path, command…). */
  readonly subject: string;
  readonly action: PermissionAction;
}

export type AgentMode = "primary" | "subagent" | "all";

export interface AgentDefinition {
  readonly name: string;
  readonly description: string;
  readonly mode: AgentMode;
  /** Agent instructions (the Markdown body or the JSON `prompt`). */
  readonly prompt: string;
  /** `provider/model` or a bare model of the session's provider. */
  readonly model?: string | undefined;
  readonly temperature?: number | undefined;
  /** Max agentic steps before the agent must summarize. */
  readonly steps?: number | undefined;
  readonly permission: Permissions;
  /** Hidden from `@` and listings; still usable through the task tool. */
  readonly hidden: boolean;
  readonly disable: boolean;
  readonly color?: string | undefined;
  /** File the agent came from, or `built-in`. */
  readonly source: string;
}

/** Fields an agent file may set; anything absent keeps the base value. */
export type AgentFields = Partial<Omit<AgentDefinition, "name" | "source">>;

export interface SkillDefinition {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  /** Folder holding SKILL.md; relative paths in the skill resolve here. */
  readonly directory: string;
  readonly source: string;
  readonly license?: string | undefined;
  readonly compatibility?: string | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

export interface AgentCatalog {
  readonly agents: readonly AgentDefinition[];
  readonly skills: readonly SkillDefinition[];
  /** Files that were skipped, with the reason. */
  readonly diagnostics: readonly string[];
}

export interface CatalogOptions {
  readonly workspaceRoot: string;
  readonly globalKodaRoot?: string | undefined;
  readonly globalOpenCodeRoot?: string | undefined;
  /** Home folder for `~/.claude` and `~/.agents` skills (tests override it). */
  readonly homeDir?: string | undefined;
}

/** Asks the user to approve an action; resolves true to proceed. */
export type ApprovalPrompt = (
  title: string,
  fallbackPrompt: string,
) => Promise<boolean>;

/** Runs a subagent for the task tool and returns its observation. */
export type Delegate = (
  agent: string,
  task: string,
  signal: AbortSignal | undefined,
) => Promise<ToolObservation>;

/** An extra tool an agent can be given (skill, task). */
export interface AgentTool {
  readonly definition: ToolDefinition;
  readonly statusLabel: string;
  readonly execute: (
    args: Readonly<Record<string, unknown>>,
    signal: AbortSignal | undefined,
  ) => Promise<ToolObservation>;
}

/** Set by the permission gate while a pre-approved (allow) call runs. */
export interface GateState {
  preapproved: boolean;
}

export interface ToolsetOptions {
  readonly layers: readonly Permissions[];
  readonly extraTools: readonly AgentTool[];
  readonly gate: GateState;
  readonly approve?: ApprovalPrompt | undefined;
  readonly agentName: string;
}

export interface RuntimeOptions {
  readonly catalog: AgentCatalog;
  readonly workspaceRoot: string;
  readonly env: NodeJS.ProcessEnv;
  /** Provider and model of the session (used when an agent pins none). */
  readonly identity: { readonly provider: string; readonly model: string };
  readonly defaultProvider: ILLMProvider;
  readonly writePolicy?: WritePolicy | undefined;
  readonly commandPolicy?: CommandPolicy | undefined;
  readonly approve?: ApprovalPrompt | undefined;
  /** Builds the provider for an agent's `model` (tests inject fakes). */
  readonly createProvider?: ((provider: string) => ILLMProvider) | undefined;
  /** Time limit of one subagent run (default 5 minutes). */
  readonly subagentTimeoutMs?: number | undefined;
}

/**
 * Runs a prepared subagent on a task (the TUI streams it into a child
 * session; batch mode just runs it).
 */
export type SubagentRunner = (
  prepared: PreparedAgent,
  task: string,
  signal: AbortSignal,
) => Promise<AgentRunResult>;

export interface SubagentRunOptions {
  /** Layers of the delegating agent; omitted when the user asked directly. */
  readonly parentLayers?: readonly Permissions[] | undefined;
  readonly model?: string | undefined;
  readonly fallbackModel?: string | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly run?: SubagentRunner | undefined;
}

/** A signal that aborts with its parent or after a timeout. */
export interface TimeoutScope {
  readonly signal: AbortSignal;
  readonly timedOut: () => boolean;
  readonly dispose: () => void;
}

export interface RunContext {
  /** Enables the task tool; omitted for subagents (depth 1). */
  readonly runSubagent?: SubagentRunner | undefined;
  /** Permission layers of the calling agent; a child can't exceed them. */
  readonly parentLayers?: readonly Permissions[] | undefined;
  /** Model forced for this run (a command's `model`); beats the agent's. */
  readonly model?: string | undefined;
  /** Model used when the agent pins none (session choice, parent model). */
  readonly fallbackModel?: string | undefined;
}

export interface PreparedAgent {
  readonly definition: AgentDefinition;
  readonly agent: CodeAgent;
  /** Layers this run enforces (handed down to its subagents). */
  readonly layers: readonly Permissions[];
  /** Provider and model this run talks to. */
  readonly identity: { readonly provider: string; readonly model: string };
}

/** `@agent task` typed in the prompt. */
export interface Mention {
  readonly agent: string;
  readonly task: string;
}
