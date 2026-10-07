import type { CommandResult } from "./types.js";

const DEFAULT_BUDGET = 8 * 1024;
const HEAD_RATIO = 0.25;

export interface Truncation {
  readonly text: string;
  readonly omitted: number;
  readonly total: number;
}

function lineBoundary(text: string, near: number, forward: boolean): number {
  const window = forward
    ? text.indexOf("\n", near)
    : text.lastIndexOf("\n", near);
  if (window === -1) return near;
  return forward ? window + 1 : window + 1;
}

/**
 * Keeps the head and tail of `text` within `budget` bytes, cutting on line
 * boundaries when possible. The tail is favored because errors tend to land
 * at the end of a log.
 */
export function truncate(text: string, budget = DEFAULT_BUDGET): Truncation {
  const total = Buffer.byteLength(text, "utf8");
  if (total <= budget) return { text, omitted: 0, total };
  const headBudget = Math.floor(budget * HEAD_RATIO);
  const tailBudget = budget - headBudget;
  const headEnd = lineBoundary(text, headBudget, true);
  const tailStart = lineBoundary(text, text.length - tailBudget, false);
  const head = text.slice(0, headEnd);
  const tail = text.slice(Math.max(headEnd, tailStart));
  const omitted = total - Buffer.byteLength(head + tail, "utf8");
  return { text: `${head}[... ${kb(omitted)} omitted ...]\n${tail}`, omitted, total };
}

function kb(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

function section(label: string, stream: string, budget: number): string {
  if (stream === "") return "";
  const { text, omitted, total } = truncate(stream, budget);
  const header =
    omitted === 0
      ? `--- ${label} (${kb(total)}) ---`
      : `--- ${label} (${kb(total)}, showing first and last) ---`;
  return `${header}\n${text.replace(/\n$/, "")}\n`;
}

function status(result: CommandResult): string {
  const seconds = (result.durationMs / 1000).toFixed(1);
  if (result.timedOut) return `timed out after ${seconds}s`;
  if (result.cancelled) return `cancelled after ${seconds}s`;
  return `exit ${result.exitCode ?? "unknown"} · ${seconds}s`;
}

/** Renders a command result for the model: command line, status, streams. */
export function formatResult(
  command: string,
  result: CommandResult,
  budget = DEFAULT_BUDGET,
): string {
  return [
    `$ ${command}`,
    status(result),
    section("stdout", result.stdout, budget),
    section("stderr", result.stderr, budget),
  ]
    .filter((part) => part !== "")
    .join("\n")
    .replace(/\n$/, "");
}
