import { readFile, stat } from "node:fs/promises";
import { isLikelyBinary } from "../../utils/binary.js";
import { ToolError } from "../../utils/errors.js";
import { bounded } from "./limits.js";
import { walk } from "./walker.js";

export interface SearchFilesArgs {
  readonly query: string;
  readonly path?: string;
  readonly regex?: boolean;
  readonly caseSensitive?: boolean;
  readonly include?: string;
  readonly exclude?: string;
  readonly maxFiles?: number;
  readonly maxMatches?: number;
  readonly perFileMatches?: number;
}

export interface SearchFilesOptions {
  readonly workspaceRoot: string;
  readonly maxFileBytes?: number;
  readonly maxFiles?: number;
  readonly maxMatches?: number;
  readonly perFileMatches?: number;
  readonly signal?: AbortSignal;
}

type Limits = Record<"maxFiles" | "maxMatches" | "perFileMatches", number>;

const LIMITS: Limits = {
  maxFiles: 100,
  maxMatches: 200,
  perFileMatches: 20,
};

const MAX_FILE_BYTES = 1_048_576;
const LINE_WIDTH = 200;
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

interface Match {
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly text: string;
}

/** Requested limits, defaulted, then capped by the registry ceilings. */
function resolveLimits(args: SearchFilesArgs, options: SearchFilesOptions): Limits {
  const pick = (name: keyof Limits): number =>
    bounded(args[name], LIMITS[name], options[name]);
  return {
    maxFiles: pick("maxFiles"),
    maxMatches: pick("maxMatches"),
    perFileMatches: pick("perFileMatches"),
  };
}

function compileQuery(args: SearchFilesArgs): RegExp {
  if (args.query.trim() === "") throw new ToolError("The query is required.");
  const source =
    args.regex === true ? args.query : args.query.replace(REGEX_SPECIALS, "\\$&");
  try {
    return new RegExp(source, args.caseSensitive === true ? "g" : "gi");
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "invalid pattern";
    throw new ToolError(`Invalid regular expression: ${reason}`);
  }
}

/** Escapes everything, then restores `**`, `*` and `?` as wildcards. */
function globToRegex(glob: string): RegExp {
  const source = glob
    .replace(REGEX_SPECIALS, "\\$&")
    .replace(/\\\*\\\*\//g, "(?:.*/)?")
    .replace(/\\\*\\\*/g, ".*")
    .replace(/\\\*/g, "[^/]*")
    .replace(/\\\?/g, "[^/]");
  return new RegExp(`^${source}$`);
}

function pathFilter(args: SearchFilesArgs): (path: string) => boolean {
  const include = args.include === undefined ? undefined : globToRegex(args.include);
  const exclude = args.exclude === undefined ? undefined : globToRegex(args.exclude);
  return (path) =>
    (include?.test(path) ?? true) && !(exclude?.test(path) ?? false);
}

/** File text, or undefined when it is too large or not text at all. */
async function readText(
  absolutePath: string,
  maxBytes: number,
): Promise<string | undefined> {
  if ((await stat(absolutePath)).size > maxBytes) return undefined;
  const buffer = await readFile(absolutePath);
  return isLikelyBinary(buffer) ? undefined : buffer.toString("utf8");
}

/** `matchAll` clones the regex, so there is no shared `lastIndex` to reset. */
function* matchesIn(
  path: string,
  text: string,
  pattern: RegExp,
  limit: number,
): Generator<Match> {
  let found = 0;
  for (const [index, line] of text.split("\n").entries())
    for (const hit of line.matchAll(pattern)) {
      yield {
        path,
        line: index + 1,
        column: (hit.index ?? 0) + 1,
        text: line.length > LINE_WIDTH ? `${line.slice(0, LINE_WIDTH - 1)}…` : line,
      };
      if ((found += 1) >= limit) return;
    }
}

function files(count: number): string {
  return `${count} ${count === 1 ? "file" : "files"}`;
}

export async function searchFilesTool(
  args: SearchFilesArgs,
  options: SearchFilesOptions,
): Promise<string> {
  const pattern = compileQuery(args);
  const selects = pathFilter(args);
  const limits = resolveLimits(args, options);
  const maxBytes = options.maxFileBytes ?? MAX_FILE_BYTES;
  const matches: Match[] = [];
  let scanned = 0;

  for await (const entry of walk(options.workspaceRoot, args.path, {
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  })) {
    if (!entry.isFile || !selects(entry.relativePath)) continue;
    if (scanned >= limits.maxFiles || matches.length >= limits.maxMatches) break;
    scanned += 1;
    const text = await readText(entry.absolutePath, maxBytes);
    if (text === undefined) continue;
    const room = Math.min(
      limits.perFileMatches,
      limits.maxMatches - matches.length,
    );
    matches.push(...matchesIn(entry.relativePath, text, pattern, room));
  }

  if (matches.length === 0) return `No matches (scanned ${files(scanned)}).`;
  const lines = matches.map(
    (match) => `${match.path}:${match.line}:${match.column}  ${match.text}`,
  );
  if (matches.length >= limits.maxMatches || scanned >= limits.maxFiles)
    lines.push(`…more matches (showed ${matches.length}, scanned ${files(scanned)}).`);
  return lines.join("\n");
}
