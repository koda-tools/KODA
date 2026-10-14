import { resolvePermission } from "./permissions.js";
import type {
  AgentDefinition,
  AgentTool,
  Delegate,
  Permissions,
} from "./types.js";

export const TASK_TOOL = "task";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function describeAgents(agents: readonly AgentDefinition[]): string {
  const entries = agents.map(
    (agent) =>
      `  <agent>\n    <name>${agent.name}</name>\n    <description>${escapeXml(agent.description)}</description>\n  </agent>`,
  );
  return [
    "Delegate a self-contained task to a subagent. The subagent starts without this conversation, so the prompt must include every detail it needs. Its final reply comes back as this tool's result.",
    "<available_agents>",
    ...entries,
    "</available_agents>",
  ].join("\n");
}

/**
 * The `task` tool over the subagents the layers allow; undefined when there
 * is none. Subagents never receive it (depth 1).
 */
export function createTaskTool(
  subagents: readonly AgentDefinition[],
  layers: readonly Permissions[],
  delegate: Delegate,
): AgentTool | undefined {
  const available = subagents.filter(
    (agent) => resolvePermission(layers, "task", agent.name) !== "deny",
  );
  if (available.length === 0) return undefined;
  const names = new Set(available.map((agent) => agent.name));
  return {
    statusLabel: "Delegating...",
    definition: {
      name: TASK_TOOL,
      description: describeAgents(available),
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          agent: {
            type: "string",
            minLength: 1,
            description: "Subagent name, from <available_agents>",
          },
          description: {
            type: "string",
            description: "Short (3-5 words) label of the task",
          },
          prompt: {
            type: "string",
            minLength: 1,
            description: "Complete instructions for the subagent",
          },
        },
        required: ["agent", "prompt"],
      },
    },
    execute: async (args, signal) => {
      const agent = typeof args.agent === "string" ? args.agent.trim() : "";
      const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
      if (!names.has(agent))
        return {
          ok: false,
          content: `Tool error: Unknown subagent '${agent}'.`,
        };
      if (prompt === "")
        return { ok: false, content: "Tool error: The prompt is required." };
      return delegate(agent, prompt, signal);
    },
  };
}
