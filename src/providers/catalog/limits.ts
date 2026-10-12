import { isProviderName, providerSpec } from "./catalog.js";
import { modelInfo } from "./model-catalog.js";
import type { ModelLimit } from "./types.js";

/** For identities outside the known providers (custom wiring, tests). */
const UNKNOWN_PROVIDER_LIMIT: ModelLimit = { context: 8_192, output: 2_048 };

/**
 * Ceiling on the output KODA reserves per request. Catalog output limits
 * reach 128k tokens; reserving all of it on every call would shrink the
 * conversation budget for no gain, while 32k still lets a model write a
 * large file in one reply.
 */
const MAX_OUTPUT_TOKENS = 32_768;

/**
 * The effective limits for a model: the model catalog's entry when it has
 * one, otherwise the provider's conservative default. The output limit is
 * capped, and never exceeds the context window.
 */
export function modelLimit(provider: string, model: string): ModelLimit {
  const limit = isProviderName(provider)
    ? (modelInfo(provider, model)?.limit ?? providerSpec(provider).defaultLimit)
    : UNKNOWN_PROVIDER_LIMIT;
  return {
    context: limit.context,
    output: Math.min(limit.output, MAX_OUTPUT_TOKENS, limit.context),
  };
}
