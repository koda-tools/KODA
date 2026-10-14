import {
  AgentRuntime,
  loadCatalog,
  type AgentCatalog,
  type ApprovalPrompt,
} from "../agents/index.js";
import { CodeAgent } from "../core/index.js";
import { McpManager, loadMcpConfig } from "../mcp/index.js";
import {
  ProviderFactory,
  initCatalog,
  resolveProviderIdentity,
  type ILLMProvider,
  type ProviderIdentity,
} from "../providers/index.js";
import type { CommandPolicy } from "../tools/command/types.js";
import { ToolRegistry, type WritePolicy } from "../tools/registry.js";
import type { Connection } from "./connection.js";
import { globalRoots, type GlobalRoots } from "./roots.js";

/** How the host asks the user to approve writes, commands and other tools. */
export interface BootstrapPolicies {
  readonly writePolicy?: WritePolicy | undefined;
  readonly commandPolicy?: CommandPolicy | undefined;
  readonly approve?: ApprovalPrompt | undefined;
}

/** Policies, or a factory run once the provider is built (so a missing key fails first). */
export type PolicySource =
  | BootstrapPolicies
  | (() => BootstrapPolicies | Promise<BootstrapPolicies>);

export interface BootstrapOptions {
  readonly cwd: string;
  readonly connection: Connection;
  /** Variables for `{env:NAME}` in MCP config; defaults to the connection's. */
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly configRoot?: string | undefined;
  /** Used for the background model-catalog refresh. */
  readonly fetch?: typeof globalThis.fetch | undefined;
  readonly policies?: PolicySource | undefined;
}

export interface KodaRuntime {
  readonly provider: ILLMProvider;
  /** Provider and model the session starts with. */
  readonly identity: ProviderIdentity;
  readonly catalog: AgentCatalog;
  readonly mcp: McpManager;
  readonly agents: AgentRuntime;
  readonly roots: GlobalRoots;
  /** A bare agent on the session's provider (no agent definition applied). */
  createAgent(): CodeAgent;
  close(): Promise<void>;
}

/**
 * Assemble KODA for a host: provider, agent catalog, MCP manager and agent
 * runtime. Never reads or writes the process terminal; the host supplies its
 * own approval policies. Provider first, so a missing key fails before
 * anything else loads. `mcp.start()` is left to the caller.
 */
export async function bootstrapKoda(
  options: BootstrapOptions,
): Promise<KodaRuntime> {
  const { cwd, connection } = options;
  const env = connection.env;
  const roots = globalRoots(options.configRoot);
  void initCatalog(roots.globalKodaRoot, options.fetch);
  const provider = ProviderFactory.fromEnvironment(env);
  const source = options.policies;
  const { writePolicy, commandPolicy, approve }: BootstrapPolicies =
    typeof source === "function" ? await source() : (source ?? {});
  const identity = resolveProviderIdentity(env);
  const catalog = await loadCatalog({ workspaceRoot: cwd, ...roots });
  const mcp = new McpManager(
    await loadMcpConfig({
      workspaceRoot: cwd,
      ...roots,
      env: options.env ?? env,
    }),
    { cwd, env },
  );
  const agents = new AgentRuntime({
    catalog,
    workspaceRoot: cwd,
    env,
    identity,
    defaultProvider: provider,
    extraTools: mcp.tools,
    writePolicy,
    commandPolicy,
    approve,
  });
  return {
    provider,
    identity,
    catalog,
    mcp,
    agents,
    roots,
    createAgent: () =>
      new CodeAgent(
        provider,
        new ToolRegistry({
          workspaceRoot: cwd,
          ...(writePolicy === undefined ? {} : { writePolicy }),
          ...(commandPolicy === undefined ? {} : { commandPolicy }),
        }),
        { identity },
      ),
    close: () => mcp.close(),
  };
}
