import { AnthropicProvider } from "../adapters/anthropic/anthropic.provider.js";
import { GeminiProvider } from "../adapters/gemini/gemini.provider.js";
import { OllamaProvider } from "../adapters/ollama/ollama.provider.js";
import { OpenAIProvider } from "../adapters/openai/openai.provider.js";
import { PROVIDERS } from "../catalog/catalog.js";
import type { ProviderName } from "../catalog/types.js";
import { configFromEnvironment } from "../config/environment.js";
import type { ProviderConfig } from "../config/types.js";
import { validateBaseURL } from "../config/validation.js";
import type { ILLMProvider } from "../contracts/types.js";

/** Config narrowed to a single provider, e.g. ConfigMap["ollama"]. */
type ConfigMap = {
  readonly [P in ProviderName]: Extract<ProviderConfig, { provider: P }>;
};

/** One constructor per provider, each receiving only its own config. */
type FactoryMap = {
  readonly [P in ProviderName]: (config: ConfigMap[P]) => ILLMProvider;
};

const factories: FactoryMap = {
  openai: (config) => new OpenAIProvider(config),
  anthropic: (config) => new AnthropicProvider(config),
  gemini: (config) => new GeminiProvider(config),
  ollama: (config) => {
    if (config.baseURL !== undefined)
      validateBaseURL(config.baseURL, PROVIDERS.ollama.baseURLEnv);
    return new OllamaProvider(config);
  },
};

/**
 * Correlates the provider key with its config through the generic `P`,
 * so `factories[provider]` accepts `config` without casts or `any`.
 */
function createFor<P extends ProviderName>(
  provider: P,
  config: ConfigMap[P],
): ILLMProvider {
  return factories[provider](config);
}

export class ProviderFactory {
  public static create(config: ProviderConfig): ILLMProvider {
    return createFor(config.provider, config);
  }

  public static fromEnvironment(env: NodeJS.ProcessEnv): ILLMProvider {
    return this.create(configFromEnvironment(env));
  }
}
