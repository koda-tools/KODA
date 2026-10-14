import type { ProviderName } from "../catalog/types.js";

/**
 * A resolved provider configuration. `apiKey` is required at runtime only
 * when the catalog entry sets `apiKeyRequired`; `baseURL` and `toolSupport`
 * apply to providers whose catalog entry declares those variables.
 */
export interface ProviderConfig {
  readonly provider: ProviderName;
  readonly apiKey?: string;
  readonly model?: string;
  readonly baseURL?: string;
  readonly toolSupport?: boolean;
}

export interface ProviderIdentity {
  readonly provider: ProviderName;
  readonly model: string;
}
