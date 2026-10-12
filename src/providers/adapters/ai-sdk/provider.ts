import { generateText, streamText, type LanguageModel, type ToolSet } from "ai";
import { ProviderError } from "../../../utils/errors.js";
import { modelLimit } from "../../catalog/limits.js";
import type {
  ChatMessage,
  ChatResponse,
  CompletionOptions,
  ILLMProvider,
  ProviderCapabilities,
  StreamEvent,
} from "../../contracts/types.js";
import { optional } from "../../shared/request.js";
import { toProviderError } from "./errors.js";
import { toModelMessages } from "./messages.js";
import { createModel, sendsToolChoice, silenceSdkWarnings } from "./models.js";
import { fromGenerateResult } from "./response.js";
import { fromFullStream } from "./stream.js";
import { toToolSet } from "./tools.js";
import type { AISDKOptions } from "./types.js";

/** Matches the retry budget the vendor SDKs used before the migration. */
const MAX_RETRIES = 2;

/**
 * Serves every provider through the AI SDK. Tools are declared without an
 * `execute`, so each call is a single step and the agent keeps owning the
 * tool loop.
 */
export class AISDKProvider implements ILLMProvider {
  private readonly modelId: string;
  private readonly model: LanguageModel;
  private readonly toolSupport: boolean;

  public constructor(protected readonly options: AISDKOptions) {
    silenceSdkWarnings();
    this.modelId = options.model ?? options.spec.defaultModel;
    this.model = createModel(options, this.modelId);
    this.toolSupport = options.toolSupport ?? true;
  }

  public supportsTools(): boolean {
    return this.toolSupport;
  }

  public capabilities(): ProviderCapabilities {
    return {
      tools: this.toolSupport,
      streaming: true,
      images: this.options.images ?? true,
    };
  }

  public async complete(
    messages: readonly ChatMessage[],
    options: CompletionOptions = {},
  ): Promise<ChatResponse> {
    const action = `${this.options.label} completion`;
    try {
      return fromGenerateResult(
        await generateText(this.request(messages, options)),
      );
    } catch (error: unknown) {
      throw toProviderError(action, error);
    }
  }

  public async *stream(
    messages: readonly ChatMessage[],
    options: CompletionOptions = {},
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const action = `${this.options.label} streaming`;
    const request = this.request(messages, options);
    try {
      const result = streamText({
        ...request,
        // The default handler prints to the console, which would corrupt
        // the terminal UI; failures surface through the stream instead.
        onError: () => undefined,
      });
      yield* fromFullStream(result.fullStream, action);
    } catch (error: unknown) {
      throw toProviderError(action, error);
    }
  }

  /** Shared request for `generateText` and `streamText`. */
  private request(
    messages: readonly ChatMessage[],
    options: CompletionOptions,
  ) {
    this.assertTools(options);
    const { instructions, messages: prompt } = toModelMessages(
      messages,
      this.options,
    );
    const tools = toToolSet(options.tools ?? []);
    return {
      model: this.modelFor(options.model),
      messages: prompt,
      maxRetries: MAX_RETRIES,
      ...optional(
        "instructions",
        instructions === "" ? undefined : instructions,
      ),
      ...this.toolFields(tools),
      ...optional("temperature", options.temperature),
      // Always explicit: without it each vendor applies its own default
      // (Anthropic even requires one), so replies were capped unevenly.
      maxOutputTokens:
        options.maxTokens ??
        modelLimit(this.options.provider, options.model ?? this.modelId).output,
      ...optional("abortSignal", options.signal),
    };
  }

  private toolFields(tools: ToolSet) {
    if (Object.keys(tools).length === 0) return {};
    return sendsToolChoice(this.options)
      ? { tools, toolChoice: "auto" as const }
      : { tools };
  }

  /** Reuses the configured model, building another only for an override. */
  private modelFor(model: string | undefined): LanguageModel {
    return model === undefined || model === this.modelId
      ? this.model
      : createModel(this.options, model);
  }

  private assertTools(options: CompletionOptions): void {
    if ((options.tools?.length ?? 0) > 0 && !this.toolSupport)
      throw new ProviderError(
        `Model '${options.model ?? this.modelId}' does not support tools.`,
      );
  }
}
