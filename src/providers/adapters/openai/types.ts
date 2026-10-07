import type OpenAI from "openai";

export interface OpenAIProviderOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseURL?: string;
  readonly client?: OpenAI;
  readonly toolSupport?: boolean;
}

export interface OpenAIRequestOptions {
  readonly tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
  readonly tool_choice?: "auto";
  readonly temperature?: number;
  readonly max_tokens?: number;
}
