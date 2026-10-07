import type { RawMessageStreamEvent } from "@anthropic-ai/sdk/resources/messages";
import type { StreamEvent } from "../../contracts/types.js";
import { ResponseAccumulator } from "../../shared/stream.js";
import { toUsage } from "../../shared/usage.js";

/** Translates Anthropic message stream events into normalized stream events. */
export class AnthropicStreamAccumulator {
  private readonly response = new ResponseAccumulator();

  public *consume(event: RawMessageStreamEvent): Generator<StreamEvent> {
    switch (event.type) {
      case "message_start":
        this.response.addUsage(
          toUsage(
            event.message.usage.input_tokens,
            event.message.usage.output_tokens,
          ),
        );
        return;
      case "content_block_start":
        if (event.content_block.type === "tool_use")
          yield this.response.toolCallDelta(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
          });
        return;
      case "content_block_delta":
        if (event.delta.type === "text_delta")
          yield* this.response.text(event.delta.text);
        else if (event.delta.type === "input_json_delta")
          yield this.response.toolCallDelta(event.index, {
            arguments: event.delta.partial_json,
          });
        return;
      case "message_delta":
        this.response.finish(event.delta.stop_reason);
        this.response.addUsage(
          toUsage(event.usage.input_tokens, event.usage.output_tokens),
        );
        return;
      default:
        return;
    }
  }

  public close(): Generator<StreamEvent> {
    return this.response.close();
  }
}
