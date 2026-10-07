import type { CodeAgent } from "../../../core/index.js";
import type { DiscoveryOptions } from "../../commands/discovery.js";
import type { ShellPolicy } from "../../commands/types.js";
import type { CodeHighlighter } from "../highlight/types.js";
import type { InteractiveIO } from "../shared/types.js";

/** A terminal front end that owns `io` while `task` runs. */
export interface InteractiveRuntime {
  readonly io: InteractiveIO;
  readonly run: (task: () => Promise<void>) => Promise<void>;
}

export interface InteractiveOptions extends DiscoveryOptions {
  readonly agent: CodeAgent;
  readonly provider: string;
  readonly model: string;
  readonly io?: InteractiveIO;
  readonly runtime?: InteractiveRuntime;
  readonly shellPolicy?: ShellPolicy;
  readonly highlighter?: CodeHighlighter;
}
