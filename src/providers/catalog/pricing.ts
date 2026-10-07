import type { Usage } from "../contracts/types.js";
import type { ModelPrice } from "./types.js";

const PRICES: Readonly<Record<string, ModelPrice>> = {
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "anthropic/claude-3-5-sonnet-latest": { input: 3, output: 15 },
  "gemini/gemini-2.5-flash": { input: 0.3, output: 2.5 },
};

const TOKENS_PER_PRICE_UNIT = 1_000_000;

/** Estimated cost in USD, or undefined when the model has no known price. */
export function estimateCost(
  provider: string,
  model: string,
  usage: Usage,
): number | undefined {
  const price = PRICES[`${provider}/${model}`];
  if (price === undefined) return undefined;
  const input = (usage.inputTokens ?? 0) * price.input;
  const output = (usage.outputTokens ?? 0) * price.output;
  return (input + output) / TOKENS_PER_PRICE_UNIT;
}
