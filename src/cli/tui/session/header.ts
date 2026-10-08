import { estimateCost } from "../../../providers/index.js";
import type { SessionStatus } from "./types.js";
import { formatCost, formatTokens } from "./usage-format.js";

export function renderHeader(status: SessionStatus): string {
  const cost = estimateCost(status.provider, status.model, status.usage);
  return [
    `   ▀ ▀   KODA`,
    `  █▀█▀█   AI Coding Agent`,
    `  ▀▀▀▀▀     ${"─".repeat(52)}`,
    `  Model:    ${status.model}`,
    `  Provider: ${status.provider}`,
    `  Usage:    ${formatTokens(status.usage)}`,
    `  Cost:     ${formatCost(cost)}`,
  ].join("\n");
}
