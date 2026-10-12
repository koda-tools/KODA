import type { ProviderName, ProviderSpec } from "../../catalog/types.js";

/** A `fetch` implementation the adapter can borrow, for tests or proxies. */
export type FetchLike = typeof globalThis.fetch;

/** Options every hosted vendor accepts. */
export interface VendorOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly fetch?: FetchLike;
}

export interface OpenAIProviderOptions extends VendorOptions {
  readonly baseURL?: string;
  readonly toolSupport?: boolean;
}

export interface OllamaProviderOptions
  extends Omit<OpenAIProviderOptions, "apiKey"> {
  readonly apiKey?: string;
}

export type AnthropicProviderOptions = VendorOptions;
export type GeminiProviderOptions = VendorOptions;

/** Everything the shared adapter needs to serve one catalog entry. */
export interface AISDKOptions {
  /** Catalog key, used to resolve per-model limits. */
  readonly provider: ProviderName;
  readonly spec: ProviderSpec;
  /** Name used in error messages, e.g. `OpenAI completion failed`. */
  readonly label: string;
  readonly apiKey: string;
  readonly model?: string | undefined;
  readonly baseURL?: string | undefined;
  readonly fetch?: FetchLike | undefined;
  readonly toolSupport?: boolean | undefined;
  /** Media types the vendor accepts; any type is sent when omitted. */
  readonly imageMediaTypes?: readonly string[] | undefined;
  readonly images?: boolean | undefined;
}
