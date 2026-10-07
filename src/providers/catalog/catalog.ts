import type { ProviderName, ProviderSpec } from "./types.js";

export const PROVIDER_NAMES: readonly ProviderName[] = [
  "openai",
  "anthropic",
  "gemini",
  "ollama",
];

export const DEFAULT_PROVIDER: ProviderName = "openai";

/** Placeholder key accepted by local OpenAI-compatible servers. */
export const LOCAL_API_KEY = "ollama";

export const PROVIDERS = {
  openai: {
    defaultModel: "gpt-4o-mini",
    modelEnv: "OPENAI_MODEL",
    apiKeyEnv: "OPENAI_API_KEY",
    apiKeyRequired: true,
  },
  anthropic: {
    defaultModel: "claude-3-5-sonnet-latest",
    modelEnv: "ANTHROPIC_MODEL",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    apiKeyRequired: true,
    defaultMaxTokens: 4096,
  },
  gemini: {
    defaultModel: "gemini-2.5-flash",
    modelEnv: "GEMINI_MODEL",
    apiKeyEnv: "GEMINI_API_KEY",
    apiKeyRequired: true,
  },
  ollama: {
    defaultModel: "llama3.2",
    modelEnv: "OLLAMA_MODEL",
    apiKeyEnv: "OLLAMA_API_KEY",
    apiKeyRequired: false,
    baseURLEnv: "OLLAMA_BASE_URL",
    defaultBaseURL: "http://127.0.0.1:11434/v1",
    toolSupportEnv: "OLLAMA_TOOL_SUPPORT",
  },
} as const satisfies Readonly<Record<ProviderName, ProviderSpec>>;

export function providerSpec(name: ProviderName): ProviderSpec {
  return PROVIDERS[name];
}

export function isProviderName(value: string): value is ProviderName {
  return PROVIDER_NAMES.some((name) => name === value);
}
