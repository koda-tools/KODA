import type Anthropic from "@anthropic-ai/sdk";

export interface AnthropicProviderOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly client?: Anthropic;
}
