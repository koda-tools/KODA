import { ApiError, GoogleGenAI } from "@google/genai";
import type { GenerateContentParameters } from "@google/genai";
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
import type { FailureInfo } from "../../shared/types.js";
import {
  fromGeminiResponse,
  toGeminiConfig,
  toGeminiContents,
} from "./mapping.js";
import { GeminiStreamAccumulator } from "./stream.js";
import type { GeminiProviderOptions } from "./types.js";

function inspect(error: unknown): FailureInfo {
  return { status: error instanceof ApiError ? error.status : undefined };
}

export class GeminiProvider implements ILLMProvider {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  public constructor(options: GeminiProviderOptions) {
    this.client = options.client ?? new GoogleGenAI({ apiKey: options.apiKey });
    this.model = options.model ?? PROVIDERS.gemini.defaultModel;
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
      const response = await this.client.models.generateContent(
        this.request(messages, options),
      );
      return fromGeminiResponse(response);
    } catch (error: unknown) {
      throw wrapProviderError("Gemini completion", error, inspect);
    }
  }

  public async *stream(
    messages: readonly ChatMessage[],
    options: CompletionOptions = {},
  ): AsyncGenerator<StreamEvent, void, unknown> {
    try {
      const stream = await this.client.models.generateContentStream(
        this.request(messages, options),
      );
      const accumulator = new GeminiStreamAccumulator();
      for await (const chunk of stream) yield* accumulator.consume(chunk);
      yield* accumulator.close();
    } catch (error: unknown) {
      throw wrapProviderError("Gemini streaming", error, inspect);
    }
  }

  private request(
    messages: readonly ChatMessage[],
    options: CompletionOptions,
  ): GenerateContentParameters {
    const { system, conversation } = splitSystem(messages);
    return {
      model: options.model ?? this.model,
      contents: toGeminiContents(conversation),
      config: toGeminiConfig(system, options),
    };
  }
}
