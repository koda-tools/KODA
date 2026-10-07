import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
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

export interface AnthropicProviderOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly client?: Anthropic;
}

function failureSuffix(error: unknown): string {
  return describeFailure({
    status: error instanceof Anthropic.APIError ? error.status : undefined,
    connection: error instanceof Anthropic.APIConnectionError,
  });
}

export class AnthropicProvider implements ILLMProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  public constructor(options: AnthropicProviderOptions) {
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey });
    this.model = options.model ?? DEFAULT_MODELS.anthropic;
  }

  public supportsTools(): boolean {
    return true;
  }
  public capabilities(): ProviderCapabilities {
    return { tools: true, streaming: true, images: true };
  }

  public async complete(
    messages: readonly ChatMessage[],
    options: CompletionOptions = {},
  ): Promise<ChatResponse> {
    try {
      const response = await this.client.messages.create(
        {
          model: options.model ?? this.model,
          max_tokens: options.maxTokens ?? 4096,
          ...this.system(messages),
          messages: this.messages(messages),
          ...(options.temperature === undefined
            ? {}
            : { temperature: options.temperature }),
          ...this.tools(options),
        },
        { signal: options.signal },
      );
      const toolCalls: ToolCall[] = response.content.flatMap((block) =>
        block.type === "tool_use"
          ? [
              {
                id: block.id,
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
            ]
          : [],
      );
      const content = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      return {
        content,
        toolCalls,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        ...(response.stop_reason === null
          ? {}
          : { finishReason: response.stop_reason }),
      };
    } catch (error: unknown) {
      throw new ProviderError(
        `Anthropic completion failed${failureSuffix(error)}.`,
        { cause: error },
      );
    }
  }

  public async *stream(
    messages: readonly ChatMessage[],
    options: CompletionOptions = {},
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const response = await this.complete(messages, options);
    if (response.content !== "")
      yield { type: "text-delta", text: response.content };
    for (const call of response.toolCalls) yield { type: "tool-call", call };
    if (response.usage !== undefined)
      yield { type: "usage", usage: response.usage };
    yield { type: "done", response };
  }

  private system(messages: readonly ChatMessage[]): { system?: string } {
    const text = messages
      .filter((message) => message.role === "system")
      .map((message) => contentToText(message.content))
      .join("\n");
    return text === "" ? {} : { system: text };
  }

  private messages(messages: readonly ChatMessage[]): MessageParam[] {
    return messages
      .filter((message) => message.role !== "system")
      .map((message): MessageParam => {
        if (message.role === "tool") {
          if (message.toolCallId === undefined)
            throw new ProviderError("Tool messages require a toolCallId.");
          return {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: message.toolCallId,
                content: contentToText(message.content),
              },
            ],
          };
        }
        if (message.role === "assistant" && message.toolCalls !== undefined)
          return {
            role: "assistant",
            content: [
              { type: "text", text: contentToText(message.content) },
              ...message.toolCalls.map((call) => ({
                type: "tool_use" as const,
                id: call.id,
                name: call.name,
                input: this.parseArguments(call.arguments),
              })),
            ],
          };
        return {
          role: message.role === "assistant" ? "assistant" : "user",
          content: contentToText(message.content),
        };
      });
  }

  private tools(options: CompletionOptions): { tools?: Tool[] } {
    const tools = (options.tools ?? []).map<Tool>((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: { type: "object", ...tool.parameters },
    }));
    return tools.length === 0 ? {} : { tools };
  }

  private parseArguments(value: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return {};
    }
  }
}
