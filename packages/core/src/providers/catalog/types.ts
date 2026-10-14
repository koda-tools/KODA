/**
 * A provider id. Open on purpose: a provider is a catalog entry, not a
 * compile-time literal, so adding one needs no type change. Runtime code
 * validates every name against the catalog with `isProviderName`.
 */
export type ProviderName = string;

/**
 * The providers KODA ships with named classes for. The catalog carries
 * many more; this union only labels the built-in surface for SDK users.
 */
export type BuiltInProvider = "openai" | "anthropic" | "gemini" | "ollama";

/** Which AI SDK provider package serves a vendor. */
export type SdkKind = "openai" | "anthropic" | "google" | "openai-compatible";

export interface ProviderSpec {
  readonly sdk: SdkKind;
  /** Display name for the connect list and errors (e.g. `OpenRouter`). */
  readonly label: string;
  readonly defaultModel: string;
  /** Environment variable that overrides the default model. */
  readonly modelEnv: string;
  /** Environment variable holding the API key. */
  readonly apiKeyEnv: string;
  /** Whether the API key is mandatory (false for local servers). */
  readonly apiKeyRequired: boolean;
  /** A server the user runs locally, not a hosted service. */
  readonly local?: boolean;
  /** Limits for models the model catalog does not carry. */
  readonly defaultLimit: ModelLimit;
  readonly baseURLEnv?: string;
  readonly defaultBaseURL?: string;
  readonly toolSupportEnv?: string;
  /** Base64 image media types the vendor accepts; any type when omitted. */
  readonly imageMediaTypes?: readonly string[];
  /** Whether the vendor accepts image input at all (default true). */
  readonly images?: boolean;
}

/** USD per million tokens. */
export interface ModelPrice {
  readonly input: number;
  readonly output: number;
}

/** Token limits for a model, in tokens. */
export interface ModelLimit {
  readonly context: number;
  readonly output: number;
}

/**
 * Generated facts about one model: price, limits and capability. Absent
 * `cost` or `limit` means the source catalog had no value for that model.
 */
export interface ModelInfo {
  readonly cost?: ModelPrice;
  readonly limit?: ModelLimit;
  readonly toolCall: boolean;
  readonly releaseDate?: string;
}

/**
 * The model catalog table (price/limits), keyed by the four providers the
 * models.dev snapshot covers. The open provider registry (`ProviderName`)
 * is separate: a catalog-only provider simply has no priced models yet.
 */
export type CatalogTable = Readonly<
  Record<BuiltInProvider, Readonly<Record<string, ModelInfo>>>
>;

/** The on-disk shape of the runtime catalog cache. */
export interface CatalogCache {
  readonly fetchedAt: number;
  readonly table: CatalogTable;
}
