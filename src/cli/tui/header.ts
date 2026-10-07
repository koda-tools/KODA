import type { Usage } from "../../providers/base.provider.js";
import { estimateCost } from "./pricing.js";

export interface SessionStatus {
  readonly provider: string;
  readonly model: string;
  readonly usage: Usage;
}

function tokens(usage: Usage): string {
  const total = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  return total >= 1_000
    ? `${(total / 1_000).toFixed(1)}k tokens`
    : `${total} tokens`;
}

export function renderHeader(status: SessionStatus): string {
  const cost = estimateCost(status.provider, status.model, status.usage);
  const line = "─".repeat(63);
  return [
    `  ▄▖██▗▄   KODA`,
    `  █▀██▀█   AI Coding Agent`,
    `  ▝▀██▀▘   ${"─".repeat(52)}`,
    `  Model      ${status.model}`,
    `  Provider   ${status.provider}`,
    `  Usage      ${tokens(status.usage)}`,
    `  Cost       ${cost === undefined ? "N/A" : `$${cost.toFixed(4)} estimated`}`,
    line,
  ].join("\n");
}
