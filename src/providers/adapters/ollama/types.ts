import type { OpenAIProviderOptions } from "../openai/types.js";

export interface OllamaProviderOptions
  extends Omit<OpenAIProviderOptions, "apiKey"> {
  readonly apiKey?: string;
}
