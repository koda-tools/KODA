import type { AgentTool } from "../agents/types.js";

interface McpServerBase {
  readonly enabled: boolean;
  /** Milliseconds allowed to connect and list the tools. */
  readonly timeout: number;
}

/** A server KODA starts itself and talks to over stdio. */
export interface McpLocalConfig extends McpServerBase {
  readonly type: "local";
  /** Executable followed by its arguments. */
  readonly command: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
}

/** A server reached over HTTP (streamable HTTP, falling back to SSE). */
export interface McpRemoteConfig extends McpServerBase {
  readonly type: "remote";
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

export type McpServerConfig = McpLocalConfig | McpRemoteConfig;

export interface McpConfig {
  readonly servers: ReadonlyMap<string, McpServerConfig>;
  /** Entries that were skipped, with the reason. */
  readonly diagnostics: readonly string[];
}

export interface McpConfigOptions {
  readonly workspaceRoot: string;
  readonly globalKodaRoot?: string | undefined;
  readonly globalOpenCodeRoot?: string | undefined;
  /** Source of `{env:NAME}` placeholders. */
  readonly env: NodeJS.ProcessEnv;
}

export type McpState = "connecting" | "connected" | "failed" | "disabled";

export interface McpServerStatus {
  readonly name: string;
  readonly type: McpServerConfig["type"];
  readonly state: McpState;
  readonly tools: number;
  readonly error?: string;
}

export interface McpManagerOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

/** What the CLI hands to the agents and the `/mcp` command. */
export interface McpTools {
  /** Tools of the servers connected so far (grows as servers connect). */
  readonly tools: () => readonly AgentTool[];
  readonly status: () => readonly McpServerStatus[];
  /** Config entries that were skipped, with the reason. */
  readonly diagnostics: readonly string[];
}
