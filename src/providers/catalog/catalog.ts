import type { ProviderName, ProviderSpec } from "./types.js";

export const DEFAULT_PROVIDER: ProviderName = "openai";

/** Placeholder key accepted by local OpenAI-compatible servers. */
export const LOCAL_API_KEY = "ollama";

/** The media types the Anthropic API accepts as base64 image input. */
const ANTHROPIC_IMAGES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/** Shared defaults for a hosted OpenAI-compatible provider entry. */
function openAICompatible(entry: {
  readonly label: string;
  readonly defaultModel: string;
  readonly envPrefix: string;
  readonly defaultBaseURL: string;
}): ProviderSpec {
  return {
    sdk: "openai-compatible",
    label: entry.label,
    defaultModel: entry.defaultModel,
    modelEnv: `${entry.envPrefix}_MODEL`,
    apiKeyEnv: `${entry.envPrefix}_API_KEY`,
    apiKeyRequired: true,
    baseURLEnv: `${entry.envPrefix}_BASE_URL`,
    defaultBaseURL: entry.defaultBaseURL,
    // Hosted compatible endpoints vary; let the catalog price them later.
    defaultLimit: { context: 128_000, output: 16_384 },
  };
}

/**
 * `defaultLimit` only applies to models the model catalog does not carry
 * (custom ids, aliases, local models), so the values are conservative.
 */
export const PROVIDERS = {
  openai: {
    sdk: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4.1-mini",
    modelEnv: "OPENAI_MODEL",
    apiKeyEnv: "OPENAI_API_KEY",
    apiKeyRequired: true,
    defaultLimit: { context: 128_000, output: 16_384 },
  },
  anthropic: {
    sdk: "anthropic",
    label: "Anthropic",
    defaultModel: "claude-sonnet-4-6",
    modelEnv: "ANTHROPIC_MODEL",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    apiKeyRequired: true,
    defaultLimit: { context: 200_000, output: 8_192 },
    imageMediaTypes: ANTHROPIC_IMAGES,
  },
  gemini: {
    sdk: "google",
    label: "Gemini",
    defaultModel: "gemini-3.8-flash",
    modelEnv: "GEMINI_MODEL",
    apiKeyEnv: "GEMINI_API_KEY",
    apiKeyRequired: true,
    defaultLimit: { context: 1_048_576, output: 8_192 },
  },
  ollama: {
    sdk: "openai-compatible",
    label: "Ollama",
    defaultModel: "llama3.2",
    modelEnv: "OLLAMA_MODEL",
    apiKeyEnv: "OLLAMA_API_KEY",
    apiKeyRequired: false,
    local: true,
    baseURLEnv: "OLLAMA_BASE_URL",
    defaultBaseURL: "http://127.0.0.1:11434/v1",
    toolSupportEnv: "OLLAMA_TOOL_SUPPORT",
    images: false,
    // The local server's `num_ctx` decides the real window, and exceeding
    // it makes the server drop context silently, so stay small.
    defaultLimit: { context: 8_192, output: 2_048 },
  },

  // --- OpenAI-compatible hosted providers (no new dependency) ------------
  openrouter: openAICompatible({
    label: "OpenRouter",
    defaultModel: "anthropic/claude-sonnet-4.5",
    envPrefix: "OPENROUTER",
    defaultBaseURL: "https://openrouter.ai/api/v1",
  }),
  groq: openAICompatible({
    label: "Groq",
    defaultModel: "moonshotai/kimi-k2-instruct",
    envPrefix: "GROQ",
    defaultBaseURL: "https://api.groq.com/openai/v1",
  }),
  cerebras: openAICompatible({
    label: "Cerebras",
    defaultModel: "qwen-3-coder-480b",
    envPrefix: "CEREBRAS",
    defaultBaseURL: "https://api.cerebras.ai/v1",
  }),
  together: openAICompatible({
    label: "Together",
    defaultModel: "moonshotai/Kimi-K2-Instruct",
    envPrefix: "TOGETHER",
    defaultBaseURL: "https://api.together.xyz/v1",
  }),
  fireworks: openAICompatible({
    label: "Fireworks",
    defaultModel: "accounts/fireworks/models/kimi-k2-instruct",
    envPrefix: "FIREWORKS",
    defaultBaseURL: "https://api.fireworks.ai/inference/v1",
  }),
  deepinfra: openAICompatible({
    label: "DeepInfra",
    defaultModel: "moonshotai/Kimi-K2-Instruct",
    envPrefix: "DEEPINFRA",
    defaultBaseURL: "https://api.deepinfra.com/v1/openai",
  }),
  nebius: openAICompatible({
    label: "Nebius",
    defaultModel: "moonshotai/Kimi-K2-Instruct",
    envPrefix: "NEBIUS",
    defaultBaseURL: "https://api.studio.nebius.com/v1",
  }),
  baseten: openAICompatible({
    label: "Baseten",
    defaultModel: "moonshotai/Kimi-K2-Instruct",
    envPrefix: "BASETEN",
    defaultBaseURL: "https://inference.baseten.co/v1",
  }),
  deepseek: openAICompatible({
    label: "DeepSeek",
    defaultModel: "deepseek-chat",
    envPrefix: "DEEPSEEK",
    defaultBaseURL: "https://api.deepseek.com/v1",
  }),
  xai: openAICompatible({
    label: "xAI",
    defaultModel: "grok-code-fast-1",
    envPrefix: "XAI",
    defaultBaseURL: "https://api.x.ai/v1",
  }),
  mistral: openAICompatible({
    label: "Mistral",
    defaultModel: "devstral-medium-latest",
    envPrefix: "MISTRAL",
    defaultBaseURL: "https://api.mistral.ai/v1",
  }),
  moonshot: openAICompatible({
    label: "Moonshot",
    defaultModel: "kimi-k2-0905-preview",
    envPrefix: "MOONSHOT",
    defaultBaseURL: "https://api.moonshot.ai/v1",
  }),
  zai: openAICompatible({
    label: "Z.AI",
    defaultModel: "glm-4.6",
    envPrefix: "ZAI",
    defaultBaseURL: "https://api.z.ai/api/paas/v4",
  }),
  nvidia: openAICompatible({
    label: "NVIDIA",
    defaultModel: "moonshotai/kimi-k2-instruct",
    envPrefix: "NVIDIA",
    defaultBaseURL: "https://integrate.api.nvidia.com/v1",
  }),

  // --- OpenAI-compatible local servers (no key) --------------------------
  lmstudio: {
    sdk: "openai-compatible",
    label: "LM Studio",
    defaultModel: "qwen2.5-coder-7b-instruct",
    modelEnv: "LMSTUDIO_MODEL",
    apiKeyEnv: "LMSTUDIO_API_KEY",
    apiKeyRequired: false,
    local: true,
    baseURLEnv: "LMSTUDIO_BASE_URL",
    defaultBaseURL: "http://127.0.0.1:1234/v1",
    toolSupportEnv: "LMSTUDIO_TOOL_SUPPORT",
    images: false,
    defaultLimit: { context: 8_192, output: 2_048 },
  },
  vllm: {
    sdk: "openai-compatible",
    label: "vLLM",
    defaultModel: "Qwen/Qwen2.5-Coder-7B-Instruct",
    modelEnv: "VLLM_MODEL",
    apiKeyEnv: "VLLM_API_KEY",
    apiKeyRequired: false,
    local: true,
    baseURLEnv: "VLLM_BASE_URL",
    defaultBaseURL: "http://127.0.0.1:8000/v1",
    toolSupportEnv: "VLLM_TOOL_SUPPORT",
    images: false,
    defaultLimit: { context: 8_192, output: 2_048 },
  },
  llamacpp: {
    sdk: "openai-compatible",
    label: "llama.cpp",
    defaultModel: "default",
    modelEnv: "LLAMACPP_MODEL",
    apiKeyEnv: "LLAMACPP_API_KEY",
    apiKeyRequired: false,
    local: true,
    baseURLEnv: "LLAMACPP_BASE_URL",
    defaultBaseURL: "http://127.0.0.1:8080/v1",
    toolSupportEnv: "LLAMACPP_TOOL_SUPPORT",
    images: false,
    defaultLimit: { context: 8_192, output: 2_048 },
  },
} as const satisfies Readonly<Record<string, ProviderSpec>>;

export const PROVIDER_NAMES: readonly ProviderName[] = Object.keys(PROVIDERS);

export function providerSpec(name: ProviderName): ProviderSpec {
  const spec = (PROVIDERS as Readonly<Record<string, ProviderSpec>>)[name];
  if (spec === undefined) throw new Error(`Unknown provider '${name}'.`);
  return spec;
}

export function isProviderName(value: string): value is ProviderName {
  return value in PROVIDERS;
}
