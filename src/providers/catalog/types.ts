export type ProviderName = "openai" | "anthropic" | "gemini" | "ollama";

export interface ProviderSpec {
  readonly defaultModel: string;
  /** Environment variable that overrides the default model. */
  readonly modelEnv: string;
  /** Environment variable holding the API key. */
  readonly apiKeyEnv: string;
  /** Whether the API key is mandatory (false for local servers). */
  readonly apiKeyRequired: boolean;
  /** Default `max_tokens` for vendors that require one. */
  readonly defaultMaxTokens?: number;
  readonly baseURLEnv?: string;
  readonly defaultBaseURL?: string;
  readonly toolSupportEnv?: string;
}

/** USD per million tokens. */
export interface ModelPrice {
  readonly input: number;
  readonly output: number;
}
