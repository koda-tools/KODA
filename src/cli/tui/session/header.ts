import {
  estimateCost,
  type Usage,
} from "../../../providers/index.js";
import type { SessionStatus } from "./types.js";

function formatTokens(usage: Usage): string {
  const total = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  return total >= 1_000
    ? `${(total / 1_000).toFixed(1)}k tokens`
    : `${total} tokens`;
}

function formatCost(cost: number | undefined): string {
  return cost === undefined ? "N/A" : `$${cost.toFixed(4)} estimated`;
}

export function renderHeader(status: SessionStatus): string {
  const cost = estimateCost(status.provider, status.model, status.usage);
  return [
    `   ▀ ▀   KODA`,
    `  █▀█▀█   AI Coding Agent`,
    `  ▀▀▀▀▀     ${"─".repeat(52)}`,
    `  Model:    ${status.model}`,
    `  Provider: ${status.provider}`,
    `  Usage:    ${formatTokens(status.usage)}`,
    `  Cost:     ${formatCost(cost)}`
  ].join("\n");
}
