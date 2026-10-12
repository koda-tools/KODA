import {
  LOCAL_API_KEY,
  PROVIDERS,
  providerSpec,
} from "../../catalog/catalog.js";
import type { ProviderSpec } from "../../catalog/types.js";
import type { ProviderConfig } from "../../config/types.js";
import type { ILLMProvider } from "../../contracts/types.js";
import { optional } from "../../shared/request.js";
import {
  listAnthropicModels,
  listChatModels,
  listGeminiModels,
} from "./list-models.js";
import { AISDKProvider } from "./provider.js";
import type {
  AnthropicProviderOptions,
  FetchLike,
  GeminiProviderOptions,
  OllamaProviderOptions,
  OpenAIProviderOptions,
} from "./types.js";

const CHAT_MODEL = /^(gpt-|chatgpt-|o\d)/;
const NON_CHAT_MODEL =
  /(audio|realtime|tts|transcribe|image|embedding|moderation)/;

const OPENAI_BASE_URL = "https://api.openai.com/v1";

/** Anthropic only accepts these base64 image types. */
const ANTHROPIC_IMAGES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/** OpenAI-shaped APIs expose `GET /models`, so they can list models. */
abstract class OpenAIShapedProvider extends AISDKProvider {
  public async listModels(): Promise<readonly string[]> {
    const { baseURL, spec, apiKey, fetch } = this.options;
    return listChatModels({
      baseURL: baseURL ?? spec.defaultBaseURL ?? OPENAI_BASE_URL,
      apiKey,
      fetch,
      accept: (id) => this.isChatModel(id),
      action: "Listing models",
    });
  }

  protected abstract isChatModel(id: string): boolean;
}

export class OpenAIProvider extends OpenAIShapedProvider {
  public constructor(options: OpenAIProviderOptions) {
    super({
      provider: "openai",
      spec: PROVIDERS.openai,
      label: "OpenAI",
      apiKey: options.apiKey,
      model: options.model,
      baseURL: options.baseURL,
      fetch: options.fetch,
      toolSupport: options.toolSupport,
    });
  }

  protected isChatModel(id: string): boolean {
    return CHAT_MODEL.test(id) && !NON_CHAT_MODEL.test(id);
  }
}

/** Ollama speaks the OpenAI-compatible API on a local server. */
export class OllamaProvider extends OpenAIShapedProvider {
  public constructor(options: OllamaProviderOptions = {}) {
    super({
      provider: "ollama",
      spec: PROVIDERS.ollama,
      label: "Ollama",
      apiKey: options.apiKey ?? LOCAL_API_KEY,
      model: options.model,
      baseURL: options.baseURL,
      fetch: options.fetch,
      toolSupport: options.toolSupport,
      images: false,
    });
  }

  /** A local server only serves chat models, whatever they are named. */
  protected isChatModel(): boolean {
    return true;
  }
}

export class AnthropicProvider extends AISDKProvider {
  public constructor(options: AnthropicProviderOptions) {
    super({
      provider: "anthropic",
      spec: PROVIDERS.anthropic,
      label: "Anthropic",
      apiKey: options.apiKey,
      model: options.model,
      fetch: options.fetch,
      imageMediaTypes: ANTHROPIC_IMAGES,
    });
  }

  public async listModels(): Promise<readonly string[]> {
    const { apiKey, fetch } = this.options;
    return listAnthropicModels({ apiKey, fetch });
  }
}

export class GeminiProvider extends AISDKProvider {
  public constructor(options: GeminiProviderOptions) {
    super({
      provider: "gemini",
      spec: PROVIDERS.gemini,
      label: "Gemini",
      apiKey: options.apiKey,
      model: options.model,
      fetch: options.fetch,
    });
  }

  public async listModels(): Promise<readonly string[]> {
    const { apiKey, fetch } = this.options;
    return listGeminiModels({ apiKey, fetch });
  }
}

/**
 * Serves any catalog provider whose entry says it speaks the OpenAI-compatible
 * API, hosted or local, straight from the spec. A provider is a catalog
 * entry, so adding one needs no class here.
 */
class CatalogOpenAICompatibleProvider extends OpenAIShapedProvider {
  protected isChatModel(): boolean {
    // A compatible endpoint serves whatever it serves; no name heuristic.
    return true;
  }
}

/**
 * Builds the provider for a resolved config, dispatching on the catalog
 * entry's SDK kind. The four named classes stay for the public API and for
 * their vendor-specific `listModels`; every other catalog entry is served
 * generically with no new code.
 */
export function providerFromConfig(
  config: ProviderConfig,
  fetch?: FetchLike,
): ILLMProvider {
  const spec = providerSpec(config.provider);
  const fetchOption = optionalFetch(fetch);
  switch (config.provider) {
    case "openai":
      return new OpenAIProvider(openAICompatibleOptions(config, fetch));
    case "anthropic":
      return new AnthropicProvider({
        apiKey: config.apiKey ?? "",
        ...optional("model", config.model),
        ...fetchOption,
      });
    case "gemini":
      return new GeminiProvider({
        apiKey: config.apiKey ?? "",
        ...optional("model", config.model),
        ...fetchOption,
      });
    case "ollama":
      return new OllamaProvider(ollamaOptions(config, fetch));
    default:
      return new CatalogOpenAICompatibleProvider({
        provider: config.provider,
        spec,
        label: spec.label,
        apiKey: config.apiKey ?? LOCAL_API_KEY,
        ...optional("model", config.model),
        ...optional("baseURL", config.baseURL),
        ...optional("toolSupport", config.toolSupport),
        ...optionalImages(spec),
        ...optionalImageMediaTypes(spec),
        ...fetchOption,
      });
  }
}

function openAICompatibleOptions(
  config: ProviderConfig,
  fetch: FetchLike | undefined,
): OpenAIProviderOptions {
  return {
    apiKey: config.apiKey ?? "",
    ...optional("model", config.model),
    ...optional("baseURL", config.baseURL),
    ...optional("toolSupport", config.toolSupport),
    ...optionalFetch(fetch),
  };
}

function ollamaOptions(
  config: ProviderConfig,
  fetch: FetchLike | undefined,
): OllamaProviderOptions {
  return {
    ...optional("apiKey", config.apiKey),
    ...optional("model", config.model),
    ...optional("baseURL", config.baseURL),
    ...optional("toolSupport", config.toolSupport),
    ...optionalFetch(fetch),
  };
}

function optionalFetch(fetch: FetchLike | undefined) {
  return optional("fetch", fetch);
}

function optionalImages(spec: ProviderSpec) {
  return spec.images === undefined ? {} : { images: spec.images };
}

function optionalImageMediaTypes(spec: ProviderSpec) {
  return spec.imageMediaTypes === undefined
    ? {}
    : { imageMediaTypes: spec.imageMediaTypes };
}
