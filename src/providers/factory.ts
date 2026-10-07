import { ProviderError } from "../utils/errors.js";
import { AnthropicProvider } from "./adapters/anthropic.provider.js";
import { GeminiProvider } from "./adapters/gemini.provider.js";
import { OllamaProvider } from "./adapters/ollama.provider.js";
import { OpenAIProvider } from "./adapters/openai.provider.js";
import type { ILLMProvider } from "./base.provider.js";
import {
  isProviderName,
  optionalEnv,
  selectedProvider,
  type ProviderName,
} from "./defaults.js";

export type { ProviderName };
export type ProviderConfig =
  | {
      readonly provider: "openai";
      readonly apiKey: string;
      readonly model?: string;
    }
  | {
      readonly provider: "anthropic";
      readonly apiKey: string;
      readonly model?: string;
    }
  | {
      readonly provider: "gemini";
      readonly apiKey: string;
      readonly model?: string;
    }
  | {
      readonly provider: "ollama";
      readonly model?: string;
      readonly baseURL?: string;
      readonly toolSupport?: boolean;
    };

export class ProviderFactory {
  public static create(config: ProviderConfig): ILLMProvider {
    switch (config.provider) {
      case "openai":
        return new OpenAIProvider(config);
      case "anthropic":
        return new AnthropicProvider(config);
      case "gemini":
        return new GeminiProvider(config);
      case "ollama": {
        if (config.baseURL !== undefined) this.validateURL(config.baseURL);
        return new OllamaProvider(config);
      }
    }
  }

  public static fromEnvironment(env: NodeJS.ProcessEnv): ILLMProvider {
    const raw = selectedProvider(env);
    if (!isProviderName(raw))
      throw new ProviderError(`Unsupported provider '${raw}'.`);
    switch (raw) {
      case "openai":
        return this.create({
          provider: raw,
          apiKey: this.required(env, "OPENAI_API_KEY"),
          ...this.modelConfig(env.OPENAI_MODEL),
        });
      case "anthropic":
        return this.create({
          provider: raw,
          apiKey: this.required(env, "ANTHROPIC_API_KEY"),
          ...this.modelConfig(env.ANTHROPIC_MODEL),
        });
      case "gemini":
        return this.create({
          provider: raw,
          apiKey: this.required(env, "GEMINI_API_KEY"),
          ...this.modelConfig(env.GEMINI_MODEL),
        });
      case "ollama":
        return this.create({
          provider: raw,
          ...this.modelConfig(env.OLLAMA_MODEL),
          ...this.baseURLConfig(env.OLLAMA_BASE_URL),
          ...(env.OLLAMA_TOOL_SUPPORT === undefined
            ? {}
            : {
                toolSupport: env.OLLAMA_TOOL_SUPPORT.toLowerCase() === "true",
              }),
        });
    }
  }

  private static modelConfig(value: string | undefined): { model?: string } {
    const model = this.optional(value);
    return model === undefined ? {} : { model };
  }
  private static baseURLConfig(value: string | undefined): {
    baseURL?: string;
  } {
    const baseURL = this.optional(value);
    return baseURL === undefined ? {} : { baseURL };
  }
  private static required(env: NodeJS.ProcessEnv, name: string): string {
    const value = this.optional(env[name]);
    if (value === undefined)
      throw new ProviderError(`Missing required environment variable ${name}.`);
    return value;
  }
  private static optional(value: string | undefined): string | undefined {
    return optionalEnv(value);
  }
  private static validateURL(value: string): void {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:")
        throw new Error();
    } catch {
      throw new ProviderError("OLLAMA_BASE_URL must be a valid HTTP(S) URL.");
    }
  }
}
