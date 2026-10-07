export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface TextContentPart {
  readonly type: "text";
  readonly text: string;
}

export interface ImageContentPart {
  readonly type: "image";
  readonly data: string;
  readonly mediaType: string;
}

export type ContentPart = TextContentPart | ImageContentPart;
export type MessageContent = string | readonly ContentPart[];

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

export interface ChatMessage {
  readonly role: MessageRole;
  readonly content: MessageContent;
  readonly toolCalls?: readonly ToolCall[];
  readonly toolCallId?: string;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface CompletionOptions {
  readonly model?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly tools?: readonly ToolDefinition[];
  readonly signal?: AbortSignal;
}

export interface Usage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface ChatResponse {
  readonly content: string;
  readonly toolCalls: readonly ToolCall[];
  readonly usage?: Usage;
  readonly finishReason?: string;
}

export type StreamEvent =
  | { readonly type: "text-delta"; readonly text: string }
  | {
      readonly type: "tool-call-delta";
      readonly id: string;
      readonly name?: string;
      readonly argumentsDelta: string;
    }
  | { readonly type: "tool-call"; readonly call: ToolCall }
  | { readonly type: "usage"; readonly usage: Usage }
  | { readonly type: "done"; readonly response: ChatResponse };

export interface ProviderCapabilities {
  readonly tools: boolean;
  readonly streaming: boolean;
  readonly images: boolean;
}

export interface ILLMProvider {
  complete(
    messages: readonly ChatMessage[],
    options?: CompletionOptions,
  ): Promise<ChatResponse>;
  stream(
    messages: readonly ChatMessage[],
    options?: CompletionOptions,
  ): AsyncGenerator<StreamEvent, void, unknown>;
  supportsTools(): boolean;
  capabilities(): ProviderCapabilities;
  listModels?(): Promise<readonly string[]>;
}

export function contentToText(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content
    .filter((part): part is TextContentPart => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}
