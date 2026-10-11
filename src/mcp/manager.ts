import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import type { AgentTool } from "../agents/types.js";
import { toAgentTool } from "./tools.js";
import type {
  McpConfig,
  McpLocalConfig,
  McpManagerOptions,
  McpRemoteConfig,
  McpServerStatus,
  McpState,
  McpTools,
} from "./types.js";

const CLIENT_INFO = { name: "koda", version: "1.0.0" } as const;
const STDERR_TAIL_CHARS = 400;

interface ServerRuntime {
  state: McpState;
  tools: AgentTool[];
  error?: string;
  client?: Client;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Connects to the configured MCP servers and exposes their tools to the
 * agents. Connecting happens in the background: tools show up as servers
 * answer, and a server that fails never blocks the others or the session.
 */
export class McpManager implements McpTools {
  private readonly runtimes = new Map<string, ServerRuntime>();
  private closing = false;
  private started: Promise<void> | undefined;

  public constructor(
    private readonly config: McpConfig,
    private readonly options: McpManagerOptions,
  ) {
    for (const [name, server] of config.servers)
      this.runtimes.set(name, {
        state: server.enabled ? "connecting" : "disabled",
        tools: [],
      });
  }

  public get diagnostics(): readonly string[] {
    return this.config.diagnostics;
  }

  /** Starts every enabled server; resolves once all have settled. */
  public start(): Promise<void> {
    this.started ??= Promise.all(
      [...this.config.servers]
        .filter(([, server]) => server.enabled)
        .map(([name, server]) => this.connect(name, server)),
    ).then(() => undefined);
    return this.started;
  }

  /** Connected tools; on a name clash the first server wins. */
  public tools = (): readonly AgentTool[] => {
    const unique = new Map<string, AgentTool>();
    for (const runtime of this.runtimes.values())
      for (const tool of runtime.tools)
        if (!unique.has(tool.definition.name))
          unique.set(tool.definition.name, tool);
    return [...unique.values()];
  };

  public status = (): readonly McpServerStatus[] =>
    [...this.config.servers].map(([name, server]) => {
      const runtime = this.runtimes.get(name);
      return {
        name,
        type: server.type,
        state: runtime?.state ?? "disabled",
        tools: runtime?.tools.length ?? 0,
        ...(runtime?.error === undefined ? {} : { error: runtime.error }),
      };
    });

  /** Stops every server (local ones are killed). Safe to call twice. */
  public async close(): Promise<void> {
    this.closing = true;
    await Promise.all(
      [...this.runtimes.values()].map((runtime) =>
        runtime.client?.close().catch(() => undefined),
      ),
    );
  }

  private async connect(
    name: string,
    server: McpLocalConfig | McpRemoteConfig,
  ): Promise<void> {
    const runtime = this.runtimes.get(name);
    if (runtime === undefined) return;
    try {
      const { client, tools } = await this.open(name, server);
      if (this.closing) {
        await client.close().catch(() => undefined);
        return;
      }
      runtime.client = client;
      runtime.tools = tools;
      runtime.state = "connected";
      client.onclose = () => {
        if (this.closing) return;
        runtime.state = "failed";
        runtime.error = "Connection closed.";
        runtime.tools = [];
      };
    } catch (error: unknown) {
      runtime.state = "failed";
      runtime.error = messageOf(error);
    }
  }

  private async open(
    name: string,
    server: McpLocalConfig | McpRemoteConfig,
  ): Promise<{ client: Client; tools: AgentTool[] }> {
    if (server.type === "local")
      return this.attach(name, server, this.stdio(server));
    try {
      return await this.attach(name, server, this.http(server));
    } catch {
      // Servers that predate streamable HTTP only speak SSE.
      return this.attach(name, server, this.sse(server));
    }
  }

  private async attach(
    name: string,
    server: McpLocalConfig | McpRemoteConfig,
    created: Transport | { transport: Transport; stderr: () => string },
  ): Promise<{ client: Client; tools: AgentTool[] }> {
    const { transport, stderr } =
      "transport" in created
        ? created
        : { transport: created, stderr: () => "" };
    const client = new Client(CLIENT_INFO);
    const signal = AbortSignal.timeout(server.timeout);
    try {
      await client.connect(transport, { signal });
      const tools: AgentTool[] = [];
      let cursor: string | undefined;
      do {
        const page = await client.listTools(
          cursor === undefined ? {} : { cursor },
          { signal },
        );
        for (const tool of page.tools)
          tools.push(toAgentTool(name, tool, client));
        cursor = page.nextCursor;
      } while (cursor !== undefined);
      return { client, tools };
    } catch (error: unknown) {
      await client.close().catch(() => undefined);
      const detail = stderr();
      throw new Error(
        detail === "" ? messageOf(error) : `${messageOf(error)} (${detail})`,
      );
    }
  }

  private stdio(server: McpLocalConfig) {
    const [command = "", ...args] = server.command;
    const transport = new StdioClientTransport({
      command,
      args,
      cwd: this.options.cwd,
      stderr: "pipe",
      // The SDK adds a safe default environment (PATH, HOME…); API keys of
      // the session are not passed on unless the config names them.
      env: { ...server.environment },
    });
    let tail = "";
    transport.stderr?.on("data", (chunk: Buffer | string) => {
      tail = `${tail}${chunk.toString()}`.slice(-STDERR_TAIL_CHARS);
    });
    return { transport, stderr: () => tail.trim().replace(/\s+/g, " ") };
  }

  private http(server: McpRemoteConfig): Transport {
    return new StreamableHTTPClientTransport(new URL(server.url), {
      requestInit: { headers: { ...server.headers } },
    }) as Transport;
  }

  private sse(server: McpRemoteConfig): Transport {
    return new SSEClientTransport(new URL(server.url), {
      requestInit: { headers: { ...server.headers } },
    });
  }
}
