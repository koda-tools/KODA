import type { ProviderName } from "../catalog/types.js";

interface RemoteProviderConfig<P extends ProviderName> {
  readonly provider: P;
  readonly apiKey: string;
  readonly model?: string;
}

export interface OllamaProviderConfig {
  readonly provider: "ollama";
  readonly apiKey?: string;
  readonly model?: string;
  readonly baseURL?: string;
  readonly toolSupport?: boolean;
}

export type ProviderConfig =
  | RemoteProviderConfig<"openai">
  | RemoteProviderConfig<"anthropic">
  | RemoteProviderConfig<"gemini">
  | OllamaProviderConfig;

export interface ProviderIdentity {
  readonly provider: ProviderName;
  readonly model: string;
}
