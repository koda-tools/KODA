import type { LanguageModelUsage, TypedToolCall, ToolSet } from "ai";
import type { ChatResponse, ToolCall } from "../../contracts/types.js";
import { stringifyToolArguments } from "../../shared/arguments.js";
import { optional } from "../../shared/request.js";
import { toUsage } from "../../shared/usage.js";

export function toToolCall(call: TypedToolCall<ToolSet>): ToolCall {
  return {
    id: call.toolCallId,
    name: call.toolName,
    arguments: stringifyToolArguments(call.input),
  };
}

export function usageOf(usage: LanguageModelUsage) {
  return toUsage(usage.inputTokens, usage.outputTokens);
}

/** The vendor's own stop reason is kept when the SDK reports it. */
export function finishReasonOf(
  raw: string | undefined,
  normalized: string,
): string {
  return raw ?? normalized;
}

export function fromGenerateResult(result: {
  readonly text: string;
  readonly toolCalls: readonly TypedToolCall<ToolSet>[];
  readonly usage: LanguageModelUsage;
  readonly finishReason: string;
  readonly rawFinishReason: string | undefined;
}): ChatResponse {
  const usage = usageOf(result.usage);
  return {
    content: result.text,
    toolCalls: result.toolCalls.map(toToolCall),
    ...optional("usage", usage),
    finishReason: finishReasonOf(result.rawFinishReason, result.finishReason),
  };
}
