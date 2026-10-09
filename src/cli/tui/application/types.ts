import type { AgentRuntime } from "../../../agents/index.js";
import type { CodeAgent } from "../../../core/index.js";
import type {
  CommandRegistry,
  DiscoveryOptions,
} from "../../commands/discovery.js";
import type { ShellPolicy } from "../../commands/types.js";
import type { CodeHighlighter } from "../highlight/types.js";
import type { SessionController } from "../session/session-controller.js";
import type { InteractiveIO, LineWriter } from "../shared/types.js";
import type { Spinner } from "../turn/types.js";

/** A terminal front end that owns `io` while `task` runs. */
export interface InteractiveRuntime {
  readonly io: InteractiveIO;
  readonly run: (task: () => Promise<void>) => Promise<void>;
}

export interface InteractiveOptions extends DiscoveryOptions {
  /** Runs prompts when no `agents` runtime is given; lists models. */
  readonly agent: CodeAgent;
  /**
   * Agents and skills of the workspace. With it, each session has a
   * primary agent (Tab cycles), `@name` and the task tool delegate to
   * subagents in child sessions.
   */
  readonly agents?: AgentRuntime;
  readonly provider: string;
  readonly model: string;
  readonly io?: InteractiveIO;
  readonly runtime?: InteractiveRuntime;
  readonly shellPolicy?: ShellPolicy;
  readonly highlighter?: CodeHighlighter;
}

/** What the interactive loop's handlers share. */
export interface Dependencies {
  readonly options: InteractiveOptions;
  readonly io: InteractiveIO;
  readonly registry: CommandRegistry;
  readonly sessions: SessionController;
  readonly writer: LineWriter;
  readonly spinner: Spinner;
}
