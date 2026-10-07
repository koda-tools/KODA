import type { ChatCompletionChunk } from "openai/resources/chat/completions";
import type { StreamEvent } from "../../contracts/types.js";
import { optional } from "../../shared/request.js";
import { ResponseAccumulator } from "../../shared/stream.js";
import { toUsage } from "../../shared/usage.js";

/** Translates OpenAI chat-completion chunks into normalized stream events. */
export class OpenAIStreamAccumulator {
  private readonly response = new ResponseAccumulator();

  public *consume(chunk: ChatCompletionChunk): Generator<StreamEvent> {
    const choice = chunk.choices[0];
    yield* this.response.text(choice?.delta.content);
    for (const delta of choice?.delta.tool_calls ?? [])
      yield this.response.toolCallDelta(delta.index, {
        ...optional("id", delta.id),
        ...optional("name", delta.function?.name),
        ...optional("arguments", delta.function?.arguments),
      });
    this.response.finish(choice?.finish_reason);
    this.response.addUsage(
      toUsage(chunk.usage?.prompt_tokens, chunk.usage?.completion_tokens),
    );
  }

  public close(): Generator<StreamEvent> {
    return this.response.close();
  }
}
