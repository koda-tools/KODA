import { LOCAL_API_KEY, PROVIDERS } from "../../catalog/catalog.js";
import type { ProviderCapabilities } from "../../contracts/types.js";
import { optional } from "../../shared/request.js";
import { OpenAIProvider } from "../openai/openai.provider.js";
import type { OllamaProviderOptions } from "./types.js";

const SPEC = PROVIDERS.ollama;

/** Ollama speaks the OpenAI-compatible API on a local server. */
export class OllamaProvider extends OpenAIProvider {
  public constructor(options: OllamaProviderOptions = {}) {
    super({
      apiKey: options.apiKey ?? LOCAL_API_KEY,
      model: options.model ?? SPEC.defaultModel,
      ...optional("baseURL", options.baseURL ?? SPEC.defaultBaseURL),
      ...optional("client", options.client),
      ...optional("toolSupport", options.toolSupport),
    });
  }

  public override capabilities(): ProviderCapabilities {
    return { ...super.capabilities(), images: false };
  }

  protected override isChatModel(): boolean {
    return true;
  }
}
