import type { ProviderName } from "../catalog/types.js";

export interface StoredApiKey {
  readonly type: "api";
  readonly key: string;
}

/** Contents of `auth.json`: credentials and the default provider. */
export interface StoredAuth {
  readonly default?: ProviderName;
  readonly providers: Readonly<Partial<Record<ProviderName, StoredApiKey>>>;
}

/** Where a provider's API key comes from right now. */
export type CredentialSource = "environment" | "saved" | "none";
