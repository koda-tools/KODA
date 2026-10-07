import type { ChatMessage, ToolCall } from "../../providers/index.js";
import { DEFAULT_TOOL_STATUS } from "./constants.js";
import type { AgentObserver, ToolExecutor } from "./types.js";

/** Runs tool calls in order and returns one `tool` message per call. */
export async function runToolCalls(
  calls: readonly ToolCall[],
  tools: ToolExecutor,
  observer: AgentObserver,
): Promise<ChatMessage[]> {
  const results: ChatMessage[] = [];
  for (const call of calls) {
    observer.onStatus?.(tools.statusLabel(call.name) ?? DEFAULT_TOOL_STATUS);
    await observer.onToolStart?.(call);
    const observation = await tools.execute(call.name, call.arguments);
    await observer.onToolResult?.(call, observation);
    results.push({
      role: "tool",
      toolCallId: call.id,
      content: observation.content,
    });
  }
  return results;
}
