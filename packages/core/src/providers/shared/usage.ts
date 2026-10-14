import type { Usage } from "../contracts/types.js";
import { optional } from "./request.js";

type TokenCount = number | null | undefined;

/** Normalizes vendor token counts; undefined when neither count is known. */
export function toUsage(
  input: TokenCount,
  output: TokenCount,
): Usage | undefined {
  const usage: Usage = {
    ...optional("inputTokens", input),
    ...optional("outputTokens", output),
  };
  return Object.keys(usage).length === 0 ? undefined : usage;
}
