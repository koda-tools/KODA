import path from "node:path";
import { bounded } from "./limits.js";
import { walk } from "./walker.js";

export interface ListDirectoryArgs {
  readonly path?: string;
  readonly depth?: number;
  readonly limit?: number;
  readonly includeHidden?: boolean;
}

export interface ListDirectoryOptions {
  readonly workspaceRoot: string;
  readonly maxDepth?: number;
  readonly maxEntries?: number;
  readonly signal?: AbortSignal;
}

const DEFAULT_DEPTH = 2;
const DEFAULT_ENTRIES = 200;

function indent(depth: number): string {
  return "  ".repeat(Math.max(0, depth - 1));
}

function format(relative: string, isDirectory: boolean, depth: number): string {
  const name = path.posix.basename(relative) || relative;
  return `${indent(depth)}${name}${isDirectory ? "/" : ""}`;
}

export async function listDirectoryTool(
  args: ListDirectoryArgs,
  options: ListDirectoryOptions,
): Promise<string> {
  const depth = bounded(args.depth, DEFAULT_DEPTH, options.maxDepth);
  const limit = bounded(args.limit, DEFAULT_ENTRIES, options.maxEntries);
  const lines: string[] = [];
  let total = 0;
  let truncated = false;
  const walker = walk(options.workspaceRoot, args.path, {
    maxDepth: depth,
    includeHidden: args.includeHidden ?? false,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  for await (const entry of walker) {
    total += 1;
    if (lines.length >= limit) {
      truncated = true;
      continue;
    }
    lines.push(format(entry.relativePath, entry.isDirectory, entry.depth));
  }
  if (lines.length === 0) return "(empty)";
  if (truncated)
    lines.push(`…more entries truncated (${lines.length} of ${total} shown)`);
  return lines.join("\n");
}
