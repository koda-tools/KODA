import { readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { ToolError } from "../../utils/errors.js";
import { loadIgnores, type IgnoreMatcher } from "../../utils/gitignore.js";
import { resolveSafeExistingPath } from "../../utils/security.js";

const SENSITIVE_NAMES = new Set([
  ".env",
  ".npmrc",
  ".pypirc",
  "credentials",
  "credentials.json",
  "id_rsa",
  "id_ed25519",
]);
const SENSITIVE_DIRECTORIES = new Set([
  ".git",
  ".ssh",
  ".aws",
  ".azure",
  ".gnupg",
]);
const BUILD_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
  ".cache",
]);

export interface WalkEntry {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly depth: number;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
}

export interface WalkOptions {
  readonly maxDepth?: number;
  readonly includeHidden?: boolean;
  readonly signal?: AbortSignal;
}

interface Context {
  readonly root: string;
  readonly ignore: IgnoreMatcher;
  readonly maxDepth: number;
  readonly includeHidden: boolean;
  readonly signal: AbortSignal | undefined;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new ToolError("Cancelled by user.");
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function isSensitive(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    SENSITIVE_DIRECTORIES.has(lower) ||
    SENSITIVE_NAMES.has(lower) ||
    lower.startsWith(".env.")
  );
}

function isHidden(name: string): boolean {
  return name.startsWith(".");
}

async function resolveRoot(
  workspaceRoot: string,
  requested: string | undefined,
): Promise<string> {
  if (requested === undefined || requested === "")
    return realpath(workspaceRoot);
  return resolveSafeExistingPath(workspaceRoot, requested);
}

async function* traverse(
  directory: string,
  depth: number,
  context: Context,
): AsyncGenerator<WalkEntry> {
  throwIfAborted(context.signal);
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    throwIfAborted(context.signal);
    if (isSensitive(entry.name)) continue;
    if (!context.includeHidden && isHidden(entry.name)) continue;
    if (entry.isDirectory() && BUILD_DIRECTORIES.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const relative = toPosix(path.relative(context.root, absolute));
    const isDirectory = entry.isDirectory();
    const isFile = entry.isFile();
    if (!isDirectory && !isFile) continue;
    if (context.ignore.isIgnored(relative, isDirectory)) continue;
    if (entry.isSymbolicLink()) {
      let real: string;
      try {
        real = await realpath(absolute);
      } catch {
        continue;
      }
      const inside = path.relative(context.root, real);
      if (inside.startsWith("..") || path.isAbsolute(inside)) continue;
    }
    yield { absolutePath: absolute, relativePath: relative, depth, isDirectory, isFile };
    if (isDirectory && depth < context.maxDepth)
      yield* traverse(absolute, depth + 1, context);
  }
}

/**
 * Walks the workspace under `startPath`, honoring `.gitignore`, skipping
 * sensitive and build directories, respecting `AbortSignal` and never
 * leaving the sandbox. Yields entries in lexical order.
 */
export async function* walk(
  workspaceRoot: string,
  startPath: string | undefined,
  options: WalkOptions = {},
): AsyncGenerator<WalkEntry> {
  const root = await resolveRoot(workspaceRoot, startPath);
  const ignore = await loadIgnores(workspaceRoot, root);
  const context: Context = {
    root,
    ignore,
    maxDepth: options.maxDepth ?? Number.POSITIVE_INFINITY,
    includeHidden: options.includeHidden ?? false,
    signal: options.signal,
  };
  yield* traverse(root, 1, context);
}
