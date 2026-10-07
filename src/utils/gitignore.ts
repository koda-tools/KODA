import { readFile } from "node:fs/promises";
import path from "node:path";

const COMMENT_OR_EMPTY = /^\s*(#.*)?$/;

interface Rule {
  readonly matcher: RegExp;
  readonly negated: boolean;
  readonly dirOnly: boolean;
  readonly anchored: boolean;
}

interface Layer {
  readonly directory: string; // posix path relative to the workspace root
  readonly rules: readonly Rule[];
}

/**
 * Matches a workspace-relative POSIX path against a stack of `.gitignore`
 * files. Supports comments, blank lines, negation (`!`), leading `/`,
 * trailing `/`, `*`, `?`, `[...]` and `**`. Does not read
 * `.git/info/exclude` or `core.excludesFile`.
 */
export interface IgnoreMatcher {
  isIgnored(relativePath: string, isDirectory: boolean): boolean;
}

function escapeRegex(char: string): string {
  return "^$.|+(){}\\".includes(char) ? `\\${char}` : char;
}

/** Translates a gitignore pattern into a regular expression source. */
function patternToRegex(pattern: string): string {
  let regex = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index] ?? "";
    const next = pattern[index + 1];
    if (char === "*" && next === "*") {
      index += 1;
      const after = pattern[index + 1];
      if (after === "/") {
        regex += "(?:.*/)?";
        index += 1;
      } else {
        regex += ".*";
      }
    } else if (char === "*") {
      regex += "[^/]*";
    } else if (char === "?") {
      regex += "[^/]";
    } else if (char === "[") {
      const end = pattern.indexOf("]", index);
      if (end === -1) {
        regex += "\\[";
      } else {
        regex += pattern.slice(index, end + 1);
        index = end;
      }
    } else {
      regex += escapeRegex(char);
    }
  }
  return regex;
}

function parseRule(line: string): Rule | undefined {
  const trimmed = line.trim();
  if (COMMENT_OR_EMPTY.test(trimmed)) return undefined;
  const negated = trimmed.startsWith("!");
  let body = negated ? trimmed.slice(1) : trimmed;
  const dirOnly = body.endsWith("/");
  if (dirOnly) body = body.slice(0, -1);
  const anchored = body.startsWith("/") || body.includes("/");
  if (body.startsWith("/")) body = body.slice(1);
  const source = anchored
    ? `^${patternToRegex(body)}$`
    : `(^|/)${patternToRegex(body)}$`;
  return { matcher: new RegExp(source), negated, dirOnly, anchored };
}

function parseGitignore(content: string): Rule[] {
  return content
    .split(/\r?\n/)
    .map(parseRule)
    .filter((rule): rule is Rule => rule !== undefined);
}

async function readIgnoreFile(absolute: string): Promise<string | undefined> {
  try {
    return await readFile(absolute, "utf8");
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT") return undefined;
    throw error;
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function matchLayer(
  layer: Layer,
  relativePath: string,
  isDirectory: boolean,
): boolean | undefined {
  if (layer.directory !== "" && !relativePath.startsWith(`${layer.directory}/`))
    return undefined;
  const localPath =
    layer.directory === ""
      ? relativePath
      : relativePath.slice(layer.directory.length + 1);
  let state: boolean | undefined;
  for (const rule of layer.rules) {
    if (rule.dirOnly && !isDirectory) continue;
    if (rule.matcher.test(localPath)) state = !rule.negated;
  }
  return state;
}

class LayeredMatcher implements IgnoreMatcher {
  public constructor(private readonly layers: readonly Layer[]) {}

  public isIgnored(relativePath: string, isDirectory: boolean): boolean {
    const normalized = toPosix(relativePath).replace(/^\/+|\/+$/g, "");
    if (normalized === "") return false;
    let ignored = false;
    for (const layer of this.layers) {
      const result = matchLayer(layer, normalized, isDirectory);
      if (result !== undefined) ignored = result;
    }
    return ignored;
  }
}

/**
 * Reads every `.gitignore` from the workspace root down to `directory` and
 * builds a matcher. More-specific layers override earlier ones.
 */
export async function loadIgnores(
  workspaceRoot: string,
  directory: string,
): Promise<IgnoreMatcher> {
  const relative = toPosix(path.relative(workspaceRoot, directory));
  const segments = relative === "" ? [] : relative.split("/").filter(Boolean);
  const layers: Layer[] = [];
  let current = workspaceRoot;
  for (let depth = 0; depth <= segments.length; depth += 1) {
    const file = path.join(current, ".gitignore");
    const content = await readIgnoreFile(file);
    if (content !== undefined) {
      const directoryRelative = toPosix(
        path.relative(workspaceRoot, current),
      );
      layers.push({ directory: directoryRelative, rules: parseGitignore(content) });
    }
    if (depth < segments.length) {
      const segment = segments[depth] as string;
      current = path.join(current, segment);
    }
  }
  return new LayeredMatcher(layers);
}
