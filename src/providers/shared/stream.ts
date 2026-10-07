import type {
  ChatResponse,
  StreamEvent,
  ToolCall,
  Usage,
} from "../contracts/types.js";
import { optional } from "./request.js";
import type { ToolCallDelta } from "./types.js";

interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

const EMPTY_ARGUMENTS = "{}";

/**
 * Accumulates a streamed response (text, tool calls, usage, finish reason)
 * and emits the normalized closing events. Vendor adapters only translate
 * their chunks into calls on this accumulator.
 */
export class ResponseAccumulator {
  private content = "";
  private usage: Usage | undefined;
  private finishReason: string | undefined;
  private readonly calls = new Map<number, PendingToolCall>();

  public text(delta: string | null | undefined): StreamEvent[] {
    if (delta === undefined || delta === null || delta === "") return [];
    this.content += delta;
    return [{ type: "text-delta", text: delta }];
  }

  public toolCallDelta(index: number, delta: ToolCallDelta): StreamEvent {
    const current = this.calls.get(index) ?? {
      id: delta.id ?? `tool-${index}`,
      name: "",
      arguments: "",
    };
    if (delta.id !== undefined) current.id = delta.id;
    current.name += delta.name ?? "";
    const argumentsDelta = delta.arguments ?? "";
    current.arguments += argumentsDelta;
    this.calls.set(index, current);
    return {
      type: "tool-call-delta",
      id: current.id,
      ...optional("name", current.name === "" ? undefined : current.name),
      argumentsDelta,
    };
  }

  /** Registers a tool call that arrived complete in a single chunk. */
  public toolCall(call: ToolCall): void {
    this.calls.set(this.calls.size, { ...call });
  }

  /** Merges usage; later chunks override earlier counts. */
  public addUsage(usage: Usage | undefined): void {
    if (usage !== undefined) this.usage = { ...this.usage, ...usage };
  }

  public finish(reason: string | null | undefined): void {
    if (reason !== undefined && reason !== null) this.finishReason = reason;
  }

  public *close(): Generator<StreamEvent> {
    const toolCalls: ToolCall[] = [...this.calls.values()].map((call) => ({
      ...call,
      arguments: call.arguments === "" ? EMPTY_ARGUMENTS : call.arguments,
    }));
    for (const call of toolCalls) yield { type: "tool-call", call };
    if (this.usage !== undefined) yield { type: "usage", usage: this.usage };
    const response: ChatResponse = {
      content: this.content,
      toolCalls,
      ...optional("usage", this.usage),
      ...optional("finishReason", this.finishReason),
    };
    yield { type: "done", response };
  }
}
