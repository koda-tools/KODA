import type { Usage } from "../contracts/types.js";
import { isProviderName } from "./catalog.js";
import { modelInfo } from "./model-catalog.js";

const TOKENS_PER_PRICE_UNIT = 1_000_000;

/** Estimated cost in USD, or undefined when the model has no known price. */
export function estimateCost(
  provider: string,
  model: string,
  usage: Usage,
): number | undefined {
  if (!isProviderName(provider)) return undefined;
  const info = modelInfo(provider, model);
  const price = info?.cost;
  if (price === undefined) return undefined;
  const input = (usage.inputTokens ?? 0) * price.input;
  const output = (usage.outputTokens ?? 0) * price.output;
  return (input + output) / TOKENS_PER_PRICE_UNIT;
}
