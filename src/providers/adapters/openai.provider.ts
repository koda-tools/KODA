import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { ProviderError } from "../../utils/errors.js";
import { DEFAULT_MODELS } from "../defaults.js";
import { describeFailure } from "./error-description.js";
import {
  contentToText,
  type ChatMessage,
  type ChatResponse,
  type CompletionOptions,
  type ILLMProvider,
  type ProviderCapabilities,
  type StreamEvent,
  type ToolCall,
} from "../base.provider.js";

export interface OpenAIProviderOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseURL?: string;
  readonly client?: OpenAI;
  readonly toolSupport?: boolean;
}

function failureSuffix(error: unknown): string {
  return describeFailure({
    status: error instanceof OpenAI.APIError ? error.status : undefined,
    connection: error instanceof OpenAI.APIConnectionError,
  });
}

interface PartialToolCall {
  id: string;
  name: string;
  arguments: string;
}

class StreamAccumulator {
  private content = "";
  private usage: ChatResponse["usage"];
  private finishReason: string | undefined;
  private readonly calls = new Map<number, PartialToolCall>();

  public *consume(chunk: ChatCompletionChunk): Generator<StreamEvent> {
    const choice = chunk.choices[0];
    const text = choice?.delta.content;
    if (text !== undefined && text !== null) {
      this.content += text;
      yield { type: "text-delta", text };
    }
    for (const delta of choice?.delta.tool_calls ?? [])
      yield this.applyToolCallDelta(delta);
    if (choice?.finish_reason != null) this.finishReason = choice.finish_reason;
    if (chunk.usage !== undefined && chunk.usage !== null) {
      this.usage = {
        inputTokens: chunk.usage.prompt_tokens,
        outputTokens: chunk.usage.completion_tokens,
      };
      yield { type: "usage", usage: this.usage };
    }
  }

  public *finish(): Generator<StreamEvent> {
    const toolCalls: ToolCall[] = [...this.calls.values()];
    for (const call of toolCalls) yield { type: "tool-call", call };
    yield {
      type: "done",
      response: {
        content: this.content,
        toolCalls,
        ...(this.usage === undefined ? {} : { usage: this.usage }),
        ...(this.finishReason === undefined
          ? {}
          : { finishReason: this.finishReason }),
      },
    };
  }

  private applyToolCallDelta(
    delta: NonNullable<
      ChatCompletionChunk["choices"][number]["delta"]["tool_calls"]
    >[number],
  ): StreamEvent {
    const current = this.calls.get(delta.index) ?? {
      id: delta.id ?? `tool-${delta.index}`,
      name: "",
      arguments: "",
    };
    if (delta.id !== undefined) current.id = delta.id;
    if (delta.function?.name !== undefined) current.name += delta.function.name;
    const argumentsDelta = delta.function?.arguments ?? "";
    current.arguments += argumentsDelta;
    this.calls.set(delta.index, current);
    return {
      type: "tool-call-delta",
      id: current.id,
      ...(current.name === "" ? {} : { name: current.name }),
      argumentsDelta,
    };
  }
}

export class OpenAIProvider implements ILLMProvider {
  protected readonly client: OpenAI;
  protected readonly model: string;
  private readonly toolSupport: boolean;

  public constructor(options: OpenAIProviderOptions) {
    this.client =
      options.client ??
      new OpenAI({
        apiKey: options.apiKey,
        ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
      });
    this.model = options.model ?? DEFAULT_MODELS.openai;
    this.toolSupport = options.toolSupport ?? true;
  }

  public supportsTools(): boolean {
    return this.toolSupport;
  }
  public capabilities(): ProviderCapabilities {
    return { tools: this.toolSupport, streaming: true, images: true };
  }

  public async listModels(): Promise<readonly string[]> {
    try {
      const ids: string[] = [];
      for await (const model of this.client.models.list())
        if (this.isChatModel(model.id)) ids.push(model.id);
      return ids.sort();
    } catch (error: unknown) {
      throw new ProviderError(`Listing models failed${failureSuffix(error)}.`, {
        cause: error,
      });
    }
  }

  protected isChatModel(id: string): boolean {
    return (
      /^(gpt-|chatgpt-|o\d)/.test(id) &&
      !/(audio|realtime|tts|transcribe|image|embedding|moderation)/.test(id)
    );
  }

  public async complete(
    messages: readonly ChatMessage[],
    options: CompletionOptions = {},
  ): Promise<ChatResponse> {
    this.assertTools(options);
    try {
      const response = await this.client.chat.completions.create(
        {
          model: options.model ?? this.model,
          messages: messages.map((message) => this.toMessage(message)),
          ...this.requestOptions(options),
        },
        { signal: options.signal },
      );
      const message = response.choices[0]?.message;
      if (message === undefined)
        throw new ProviderError("OpenAI returned no completion choice.");
      return {
        content: message.content ?? "",
        toolCalls: (message.tool_calls ?? []).flatMap((call) =>
          call.type === "function"
            ? [
                {
                  id: call.id,
                  name: call.function.name,
                  arguments: call.function.arguments,
                },
              ]
            : [],
        ),
        ...(response.usage === undefined
          ? {}
          : {
              usage: {
                inputTokens: response.usage.prompt_tokens,
                outputTokens: response.usage.completion_tokens,
              },
            }),
        ...(response.choices[0]?.finish_reason == null
          ? {}
          : { finishReason: response.choices[0].finish_reason }),
      };
    } catch (error: unknown) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        `OpenAI completion failed${failureSuffix(error)}.`,
        { cause: error },
      );
    }
  }

  public async *stream(
    messages: readonly ChatMessage[],
    options: CompletionOptions = {},
  ): AsyncGenerator<StreamEvent, void, unknown> {
    this.assertTools(options);
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: options.model ?? this.model,
          messages: messages.map((message) => this.toMessage(message)),
          ...this.requestOptions(options),
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: options.signal },
      );
      const accumulator = new StreamAccumulator();
      for await (const chunk of stream) yield* accumulator.consume(chunk);
      yield* accumulator.finish();
    } catch (error: unknown) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        `OpenAI streaming failed${failureSuffix(error)}.`,
        { cause: error },
      );
    }
  }

  private assertTools(options: CompletionOptions): void {
    if ((options.tools?.length ?? 0) > 0 && !this.toolSupport)
      throw new ProviderError(
        `Model '${options.model ?? this.model}' does not support tools.`,
      );
  }

  private requestOptions(options: CompletionOptions): {
    tools?: ChatCompletionTool[];
    tool_choice?: "auto";
    temperature?: number;
    max_tokens?: number;
  } {
    const tools = (options.tools ?? []).map<ChatCompletionTool>((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
    return {
      ...(tools.length === 0 ? {} : { tools, tool_choice: "auto" }),
      ...(options.temperature === undefined
        ? {}
        : { temperature: options.temperature }),
      ...(options.maxTokens === undefined
        ? {}
        : { max_tokens: options.maxTokens }),
    };
  }

  private toMessage(message: ChatMessage): ChatCompletionMessageParam {
    if (message.role === "tool") {
      if (message.toolCallId === undefined)
        throw new ProviderError("Tool messages require a toolCallId.");
      return {
        role: "tool",
        tool_call_id: message.toolCallId,
        content: contentToText(message.content),
      };
    }
    if (message.role === "assistant")
      return {
        role: "assistant",
        content: contentToText(message.content),
        ...(message.toolCalls === undefined
          ? {}
          : {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: "function" as const,
                function: { name: call.name, arguments: call.arguments },
              })),
            }),
      };
    if (message.role === "user" && typeof message.content !== "string")
      return {
        role: "user",
        content: message.content.map((part) =>
          part.type === "text"
            ? { type: "text" as const, text: part.text }
            : {
                type: "image_url" as const,
                image_url: {
                  url: `data:${part.mediaType};base64,${part.data}`,
                },
              },
        ),
      };
    return { role: message.role, content: contentToText(message.content) };
  }
}
