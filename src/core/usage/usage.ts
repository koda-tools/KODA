import type { Usage } from "../../providers/index.js";

export const EMPTY_USAGE: Usage = { inputTokens: 0, outputTokens: 0 };

/** Adds two usages; missing token counts count as zero. */
export function sumUsage(current: Usage, next: Usage | undefined): Usage {
  return {
    inputTokens: (current.inputTokens ?? 0) + (next?.inputTokens ?? 0),
    outputTokens: (current.outputTokens ?? 0) + (next?.outputTokens ?? 0),
  };
}
