import type { Usage } from "../../providers/base.provider.js";

interface ModelPrice {
  readonly input: number;
  readonly output: number;
}
const PRICES: Readonly<Record<string, ModelPrice>> = {
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "anthropic/claude-3-5-sonnet-latest": { input: 3, output: 15 },
  "gemini/gemini-2.5-flash": { input: 0.3, output: 2.5 },
};

export function estimateCost(
  provider: string,
  model: string,
  usage: Usage,
): number | undefined {
  const price = PRICES[`${provider}/${model}`];
  if (price === undefined) return undefined;
  return (
    ((usage.inputTokens ?? 0) * price.input +
      (usage.outputTokens ?? 0) * price.output) /
    1_000_000
  );
}
