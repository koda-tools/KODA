import type { TextStreamPart, ToolSet } from "ai";
import { ProviderError } from "../../../utils/errors.js";
import type { StreamEvent } from "../../contracts/types.js";
import { optional } from "../../shared/request.js";
import { ResponseAccumulator } from "../../shared/stream.js";
import { toProviderError } from "./errors.js";
import { finishReasonOf, toToolCall, usageOf } from "./response.js";

/**
 * Translates the AI SDK full stream into normalized events. Argument deltas
 * are informational; the complete `tool-call` parts are what the accumulator
 * records, so the final response always carries parsed calls.
 */
export async function* fromFullStream(
  parts: AsyncIterable<TextStreamPart<ToolSet>>,
  action: string,
): AsyncGenerator<StreamEvent, void, unknown> {
  const accumulator = new ResponseAccumulator();
  for await (const part of parts)
    switch (part.type) {
      case "text-delta":
        yield* accumulator.text(part.text);
        break;
      case "tool-input-start":
        yield {
          type: "tool-call-delta",
          id: part.id,
          ...optional("name", part.toolName),
          argumentsDelta: "",
        };
        break;
      case "tool-input-delta":
        yield {
          type: "tool-call-delta",
          id: part.id,
          argumentsDelta: part.delta,
        };
        break;
      case "tool-call":
        accumulator.toolCall(toToolCall(part));
        break;
      case "finish":
        accumulator.addUsage(usageOf(part.totalUsage));
        accumulator.finish(
          finishReasonOf(part.rawFinishReason, part.finishReason),
        );
        break;
      case "abort":
        throw new ProviderError(`${action} was cancelled.`);
      case "error":
        throw toProviderError(action, part.error);
      default:
        break;
    }
  yield* accumulator.close();
}
