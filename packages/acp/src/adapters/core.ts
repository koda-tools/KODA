import {
  bootstrapKoda,
  loadConnection,
  type BootstrapPolicies,
  type KodaRuntime,
} from "@koda-tools/core";

export interface AcpEnvironment {
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: string;
  readonly configRoot?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

export type RuntimeFactory = (
  cwd: string,
  policies: BootstrapPolicies,
  environment: AcpEnvironment,
) => Promise<KodaRuntime>;

/** The ACP host delegates model, agent, tool, and MCP setup to Core. */
export const defaultRuntimeFactory: RuntimeFactory = async (
  cwd,
  policies,
  environment,
) => {
  const connection = await loadConnection({
    env: environment.env,
    configRoot: environment.configRoot,
  });
  const runtime = await bootstrapKoda({
    cwd,
    connection,
    env: environment.env,
    configRoot: environment.configRoot,
    fetch: environment.fetch ?? globalThis.fetch,
    policies,
  });
  try {
    await runtime.mcp.start();
    return runtime;
  } catch (error) {
    await runtime.close();
    throw error;
  }
};
