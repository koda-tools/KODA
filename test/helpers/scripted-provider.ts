import type {
  ChatMessage,
  ChatResponse,
  CompletionOptions,
  ILLMProvider,
  ProviderCapabilities,
  StreamEvent,
  ToolCall,
} from "../../src/providers/index.js";

/** A reply, or a function deciding it from the request (may wait/throw). */
export type ScriptStep =
  | ChatResponse
  | ((
      messages: readonly ChatMessage[],
      options: CompletionOptions | undefined,
    ) => ChatResponse | Promise<ChatResponse>);

export interface RecordedCall {
  readonly messages: readonly ChatMessage[];
  readonly options: CompletionOptions | undefined;
}

export const reply = (content: string, usage = 10): ChatResponse => ({
  content,
  toolCalls: [],
  usage: { inputTokens: usage, outputTokens: 0 },
});

export const callTool = (
  name: string,
  args: Record<string, unknown>,
  id = `${name}-1`,
): ChatResponse => ({
  content: "",
  toolCalls: [{ id, name, arguments: JSON.stringify(args) } satisfies ToolCall],
  usage: { inputTokens: 1, outputTokens: 0 },
});

/** Waits until the request is aborted, then fails like a real provider. */
export const hangUntilAborted: ScriptStep = (_messages, options) =>
  new Promise<ChatResponse>((_resolve, reject) => {
    const signal = options?.signal;
    const fail = () => reject(new Error("Request aborted."));
    if (signal?.aborted === true) fail();
    else signal?.addEventListener("abort", fail, { once: true });
  });

/**
 * Answers `complete` and `stream` from a shared script, in call order, and
 * records every request (messages, model, tools, signal).
 */
export class ScriptedProvider implements ILLMProvider {
  public readonly calls: RecordedCall[] = [];

  public constructor(private readonly script: ScriptStep[]) {}

  public async complete(
    messages: readonly ChatMessage[],
    options?: CompletionOptions,
  ): Promise<ChatResponse> {
    this.calls.push({ messages: [...messages], options });
    const step = this.script.shift();
    if (step === undefined) throw new Error("No scripted response left.");
    return typeof step === "function" ? step(messages, options) : step;
  }

  public async *stream(
    messages: readonly ChatMessage[],
    options?: CompletionOptions,
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const response = await this.complete(messages, options);
    if (response.content !== "")
      yield { type: "text-delta", text: response.content };
    yield { type: "done", response };
  }

  public supportsTools(): boolean {
    return true;
  }

  public capabilities(): ProviderCapabilities {
    return { tools: true, streaming: true, images: false };
  }

  /** Tool names offered in the `index`-th request. */
  public toolsOf(index: number): string[] {
    return (this.calls[index]?.options?.tools ?? []).map((tool) => tool.name);
  }

  public systemOf(index: number): string {
    const first = this.calls[index]?.messages[0];
    return typeof first?.content === "string" ? first.content : "";
  }

  /** Content of the tool replies sent in the `index`-th request. */
  public toolRepliesOf(index: number): string[] {
    return (this.calls[index]?.messages ?? [])
      .filter((message) => message.role === "tool")
      .map((message) =>
        typeof message.content === "string" ? message.content : "",
      );
  }
}
