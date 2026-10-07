import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages";
import { PROVIDERS } from "../../catalog/catalog.js";
import type {
  ChatMessage,
  ChatResponse,
  CompletionOptions,
  ILLMProvider,
  ProviderCapabilities,
  StreamEvent,
} from "../../contracts/types.js";
import { wrapProviderError } from "../../shared/errors.js";
import { splitSystem } from "../../shared/messages.js";
import { optional, optionalNonEmpty } from "../../shared/request.js";
import type { FailureInfo } from "../../shared/types.js";
import {
  fromAnthropicMessage,
  toAnthropicMessages,
  toAnthropicTools,
} from "./mapping.js";
import { AnthropicStreamAccumulator } from "./stream.js";
import type { AnthropicProviderOptions } from "./types.js";

const SPEC = PROVIDERS.anthropic;

function inspect(error: unknown): FailureInfo {
  return {
    status: error instanceof Anthropic.APIError ? error.status : undefined,
    connection: error instanceof Anthropic.APIConnectionError,
  };
}

export class AnthropicProvider implements ILLMProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  public constructor(options: AnthropicProviderOptions) {
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey });
    this.model = options.model ?? SPEC.defaultModel;
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
        { ...this.request(messages, options), stream: false },
        { signal: options.signal },
      );
      return fromAnthropicMessage(response);
    } catch (error: unknown) {
      throw wrapProviderError("Anthropic completion", error, inspect);
    }
  }

  public async *stream(
    messages: readonly ChatMessage[],
    options: CompletionOptions = {},
  ): AsyncGenerator<StreamEvent, void, unknown> {
    try {
      const stream = await this.client.messages.create(
        { ...this.request(messages, options), stream: true },
        { signal: options.signal },
      );
      const accumulator = new AnthropicStreamAccumulator();
      for await (const event of stream) yield* accumulator.consume(event);
      yield* accumulator.close();
    } catch (error: unknown) {
      throw wrapProviderError("Anthropic streaming", error, inspect);
    }
  }

  private request(
    messages: readonly ChatMessage[],
    options: CompletionOptions,
  ): MessageCreateParamsBase {
    const { system, conversation } = splitSystem(messages);
    return {
      model: options.model ?? this.model,
      max_tokens: options.maxTokens ?? SPEC.defaultMaxTokens,
      messages: toAnthropicMessages(conversation),
      ...optionalNonEmpty("system", system),
      ...optional("temperature", options.temperature),
      ...optionalNonEmpty("tools", toAnthropicTools(options.tools ?? [])),
    };
  }
}
