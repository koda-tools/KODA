import type { McpServerStatus, McpTools } from "./types.js";

const MARK = {
  connected: "✓",
  connecting: "…",
  failed: "✗",
  disabled: "-",
} as const;

const NO_SERVERS =
  "No MCP servers configured. Add an `mcp` section to koda.json or opencode.json.";

function row(status: McpServerStatus, width: number): string {
  const tools =
    status.state === "connected"
      ? `  ${status.tools} ${status.tools === 1 ? "tool" : "tools"}`
      : "";
  const error = status.error === undefined ? "" : `  ${status.error}`;
  return `  ${MARK[status.state]} ${status.name.padEnd(width)}  ${status.type.padEnd(6)}  ${status.state}${tools}${error}`;
}

/** The `/mcp` listing: one row per server, then config warnings. */
export function formatMcpStatus(mcp: McpTools): string {
  const servers = mcp.status();
  const warnings = mcp.diagnostics.map((issue) => `Warning: ${issue}`);
  if (servers.length === 0) return [NO_SERVERS, ...warnings].join("\n");
  const width = Math.max(...servers.map((server) => server.name.length));
  return [
    "MCP servers:",
    ...servers.map((s) => row(s, width)),
    ...warnings,
  ].join("\n");
}
