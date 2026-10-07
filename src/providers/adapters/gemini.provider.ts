import {
  ApiError,
  GoogleGenAI,
  type Content,
  type Part,
  type Tool,
} from "@google/genai";
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

export interface GeminiProviderOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly client?: GoogleGenAI;
}

function failureSuffix(error: unknown): string {
  return describeFailure({
    status: error instanceof ApiError ? error.status : undefined,
  });
}

export class GeminiProvider implements ILLMProvider {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  public constructor(options: GeminiProviderOptions) {
    this.client = options.client ?? new GoogleGenAI({ apiKey: options.apiKey });
    this.model = options.model ?? DEFAULT_MODELS.gemini;
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
      const response = await this.client.models.generateContent({
        model: options.model ?? this.model,
        contents: this.contents(messages),
        config: this.config(messages, options),
      });
      const usage = this.usage(response.usageMetadata);
      return {
        content: response.text ?? "",
        toolCalls: this.toolCalls(response.functionCalls ?? []),
        ...(usage === undefined ? {} : { usage }),
      };
    } catch (error: unknown) {
      throw new ProviderError(
        `Gemini completion failed${failureSuffix(error)}.`,
        { cause: error },
      );
    }
  }

  private contents(messages: readonly ChatMessage[]): Content[] {
    return messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: this.parts(message),
      }));
  }

  private tools(options: CompletionOptions): Tool[] {
    return (options.tools ?? []).map((tool) => ({
      functionDeclarations: [
        {
          name: tool.name,
          description: tool.description,
          parametersJsonSchema: tool.parameters,
        },
      ],
    }));
  }

  private config(messages: readonly ChatMessage[], options: CompletionOptions) {
    const system = this.system(messages);
    const tools = this.tools(options);
    return {
      ...(system === "" ? {} : { systemInstruction: system }),
      ...(options.temperature === undefined
        ? {}
        : { temperature: options.temperature }),
      ...(options.maxTokens === undefined
        ? {}
        : { maxOutputTokens: options.maxTokens }),
      ...(tools.length === 0 ? {} : { tools }),
    };
  }

  private toolCalls(
    calls: readonly { id?: string; name?: string; args?: unknown }[],
  ): ToolCall[] {
    return calls.map((call, index) => ({
      id: call.id ?? this.callId(call.name ?? "tool", index),
      name: call.name ?? "unknown",
      arguments: JSON.stringify(call.args ?? {}),
    }));
  }

  private usage(
    metadata:
      | { promptTokenCount?: number; candidatesTokenCount?: number }
      | undefined,
  ): ChatResponse["usage"] {
    if (metadata === undefined) return undefined;
    return {
      ...(metadata.promptTokenCount === undefined
        ? {}
        : { inputTokens: metadata.promptTokenCount }),
      ...(metadata.candidatesTokenCount === undefined
        ? {}
        : { outputTokens: metadata.candidatesTokenCount }),
    };
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

  private system(messages: readonly ChatMessage[]): string {
    return messages
      .filter((message) => message.role === "system")
      .map((message) => contentToText(message.content))
      .join("\n");
  }

  private parts(message: ChatMessage): Part[] {
    if (message.role === "tool")
      return [
        {
          functionResponse: {
            name: message.toolCallId ?? "tool",
            response: { result: contentToText(message.content) },
          },
        },
      ];
    const parts: Part[] =
      typeof message.content === "string"
        ? [{ text: message.content }]
        : message.content.map(
            (part): Part =>
              part.type === "text"
                ? { text: part.text }
                : { inlineData: { mimeType: part.mediaType, data: part.data } },
          );
    for (const call of message.toolCalls ?? [])
      parts.push({
        functionCall: {
          id: call.id,
          name: call.name,
          args: this.parseArguments(call.arguments),
        },
      });
    return parts;
  }

  private parseArguments(value: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  private callId(name: string, index: number): string {
    return `gemini-${name}-${index}`;
  }
}
