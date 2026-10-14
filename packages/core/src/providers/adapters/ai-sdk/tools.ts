import { jsonSchema, tool, type JSONSchema7, type ToolSet } from "ai";
import type { ToolDefinition } from "../../contracts/types.js";

/**
 * Exposes the agent's tools to the model without an `execute`, so the AI SDK
 * only reports the calls and the agent keeps running them itself.
 */
export function toToolSet(tools: readonly ToolDefinition[]): ToolSet {
  const set: Record<string, ToolSet[string]> = {};
  for (const definition of tools)
    set[definition.name] = tool({
      description: definition.description,
      // The agent's schemas are already JSON Schema objects.
      inputSchema: jsonSchema(definition.parameters as JSONSchema7),
    });
  return set;
}
