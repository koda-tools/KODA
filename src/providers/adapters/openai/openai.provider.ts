import OpenAI from "openai";
import { ProviderError } from "../../../utils/errors.js";
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
import type { FailureInfo } from "../../shared/types.js";
import { optional } from "../../shared/request.js";
import {
  fromOpenAICompletion,
  toOpenAIMessage,
  toOpenAIRequestOptions,
} from "./mapping.js";
import { OpenAIStreamAccumulator } from "./stream-accumulator.js";
import type { OpenAIProviderOptions } from "./types.js";

const CHAT_MODEL = /^(gpt-|chatgpt-|o\d)/;
const NON_CHAT_MODEL =
  /(audio|realtime|tts|transcribe|image|embedding|moderation)/;

function inspect(error: unknown): FailureInfo {
  return {
    status: error instanceof OpenAI.APIError ? error.status : undefined,
    connection: error instanceof OpenAI.APIConnectionError,
  };
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
        ...optional("baseURL", options.baseURL),
      });
    this.model = options.model ?? PROVIDERS.openai.defaultModel;
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
      throw wrapProviderError("Listing models", error, inspect);
    }
  }

  protected isChatModel(id: string): boolean {
    return CHAT_MODEL.test(id) && !NON_CHAT_MODEL.test(id);
  }

  public async complete(
    messages: readonly ChatMessage[],
    options: CompletionOptions = {},
  ): Promise<ChatResponse> {
    this.assertTools(options);
    try {
      const response = await this.client.chat.completions.create(
        this.request(messages, options),
        { signal: options.signal },
      );
      return fromOpenAICompletion(response);
    } catch (error: unknown) {
      throw wrapProviderError("OpenAI completion", error, inspect);
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
          ...this.request(messages, options),
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: options.signal },
      );
      const accumulator = new OpenAIStreamAccumulator();
      for await (const chunk of stream) yield* accumulator.consume(chunk);
      yield* accumulator.close();
    } catch (error: unknown) {
      throw wrapProviderError("OpenAI streaming", error, inspect);
    }
  }

  private request(
    messages: readonly ChatMessage[],
    options: CompletionOptions,
  ) {
    return {
      model: options.model ?? this.model,
      messages: messages.map(toOpenAIMessage),
      ...toOpenAIRequestOptions(options),
    };
  }

  private assertTools(options: CompletionOptions): void {
    if ((options.tools?.length ?? 0) > 0 && !this.toolSupport)
      throw new ProviderError(
        `Model '${options.model ?? this.model}' does not support tools.`,
      );
  }
}
