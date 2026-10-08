import type { Usage } from "../../../providers/index.js";

/** Total tokens for a usage record (input + output). */
export function totalTokens(usage: Usage): number {
  return (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
}

/** Human token count: `1.2k tokens` once past a thousand, else `N tokens`. */
export function formatTokens(usage: Usage): string {
  const total = totalTokens(usage);
  return total >= 1_000
    ? `${(total / 1_000).toFixed(1)}k tokens`
    : `${total} tokens`;
}

/** Estimated cost, or `N/A` when the provider/model is unpriced. */
export function formatCost(cost: number | undefined): string {
  return cost === undefined ? "N/A" : `$${cost.toFixed(4)} estimated`;
}
