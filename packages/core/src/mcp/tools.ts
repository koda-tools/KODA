import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type { AgentTool } from "../agents/types.js";
import type { ToolObservation } from "../core/index.js";

const MAX_TOOL_NAME = 64;
const MAX_RESULT_CHARS = 50_000;

/** Tool names must match what every provider accepts. */
export function mcpToolName(server: string, tool: string): string {
  return `${server}_${tool}`
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, MAX_TOOL_NAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeBlock(block: unknown): string {
  if (!isRecord(block)) return "";
  switch (block.type) {
    case "text":
      return typeof block.text === "string" ? block.text : "";
    case "image":
    case "audio":
      return `[${String(block.type)}: ${String(block.mimeType ?? "unknown")}]`;
    case "resource_link":
      return `[resource: ${String(block.uri ?? "")}]`;
    case "resource": {
      const resource = block.resource;
      if (!isRecord(resource)) return "";
      return typeof resource.text === "string"
        ? resource.text
        : `[resource: ${String(resource.uri ?? "")}]`;
    }
    default:
      return "";
  }
}

function clip(text: string): string {
  return text.length > MAX_RESULT_CHARS
    ? `${text.slice(0, MAX_RESULT_CHARS)}\n[output truncated]`
    : text;
}

/** The text of a `tools/call` result, as a tool observation. */
export function toObservation(result: unknown): ToolObservation {
  const record = isRecord(result) ? result : {};
  const blocks = Array.isArray(record.content) ? record.content : [];
  let text = blocks
    .map(describeBlock)
    .filter((part) => part !== "")
    .join("\n");
  if (text === "" && record.structuredContent !== undefined)
    text = JSON.stringify(record.structuredContent);
  if (record.isError === true)
    return { ok: false, content: `Tool error: ${text || "the tool failed."}` };
  return { ok: true, content: clip(text === "" ? "(no output)" : text) };
}

/** Provider-safe JSON schema of the tool arguments. */
function parametersOf(tool: Tool): Readonly<Record<string, unknown>> {
  const { $schema: _schema, ...rest } = tool.inputSchema as Record<
    string,
    unknown
  >;
  return { type: "object", properties: {}, ...rest };
}

/**
 * One MCP tool as an agent tool named `<server>_<tool>`, permission-checked
 * through the `mcp` key (the subject is the full tool name).
 */
export function toAgentTool(
  server: string,
  tool: Tool,
  client: Client,
): AgentTool {
  const name = mcpToolName(server, tool.name);
  return {
    definition: {
      name,
      description: `[MCP ${server}] ${tool.description ?? tool.name}`,
      parameters: parametersOf(tool),
    },
    statusLabel: `Calling ${server}...`,
    permission: { key: "mcp" },
    execute: async (args, signal) => {
      try {
        return toObservation(
          await client.callTool(
            { name: tool.name, arguments: { ...args } },
            undefined,
            signal === undefined ? {} : { signal },
          ),
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, content: `Tool error: ${message}` };
      }
    },
  };
}
