import type { ProviderCapabilities } from "../base.provider.js";
import { DEFAULT_MODELS } from "../defaults.js";
import {
  OpenAIProvider,
  type OpenAIProviderOptions,
} from "./openai.provider.js";

export interface OllamaProviderOptions
  extends Omit<OpenAIProviderOptions, "apiKey"> {
  readonly apiKey?: string;
}

export class OllamaProvider extends OpenAIProvider {
  public constructor(options: OllamaProviderOptions = {}) {
    super({
      apiKey: options.apiKey ?? "ollama",
      baseURL: options.baseURL ?? "http://127.0.0.1:11434/v1",
      model: options.model ?? DEFAULT_MODELS.ollama,
      ...(options.client === undefined ? {} : { client: options.client }),
      ...(options.toolSupport === undefined
        ? {}
        : { toolSupport: options.toolSupport }),
    });
  }

  public override capabilities(): ProviderCapabilities {
    return { ...super.capabilities(), images: false };
  }

  protected override isChatModel(): boolean {
    return true;
  }
}
