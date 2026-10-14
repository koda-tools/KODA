import { providerSpec } from "../catalog/catalog.js";
import { providerFromConfig } from "../adapters/ai-sdk/vendors.js";
import { configFromEnvironment } from "../config/environment.js";
import type { ProviderConfig } from "../config/types.js";
import { validateBaseURL } from "../config/validation.js";
import type { ILLMProvider } from "../contracts/types.js";

export class ProviderFactory {
  public static create(config: ProviderConfig): ILLMProvider {
    const spec = providerSpec(config.provider);
    // Validate a custom base URL for any provider that accepts one, not
    // just the local server it used to be special-cased for.
    if (config.baseURL !== undefined)
      validateBaseURL(config.baseURL, spec.baseURLEnv ?? "baseURL");
    return providerFromConfig(config);
  }

  public static fromEnvironment(env: NodeJS.ProcessEnv): ILLMProvider {
    return this.create(configFromEnvironment(env));
  }
}
