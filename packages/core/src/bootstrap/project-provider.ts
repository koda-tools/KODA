import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import { isProviderName, type ProviderName } from "../providers/index.js";

const MAX_CONFIG_BYTES = 256 * 1024;

export function projectConfigPath(cwd: string): string {
  return path.join(cwd, ".koda", "koda.json");
}

async function readConfig(file: string): Promise<string | undefined> {
  try {
    const source = await readFile(file, "utf8");
    if (Buffer.byteLength(source) > MAX_CONFIG_BYTES)
      throw new Error(`${file}: configuration is too large.`);
    return source;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function parseConfig(source: string, file: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const value: unknown = parse(source, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (
    errors.length > 0 ||
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  )
    throw new Error(`${file}: invalid JSON/JSONC configuration.`);
  return value as Record<string, unknown>;
}

export async function readProjectProvider(
  cwd: string,
): Promise<ProviderName | undefined> {
  const file = projectConfigPath(cwd);
  const source = await readConfig(file);
  if (source === undefined) return undefined;
  const value = parseConfig(source, file).provider;
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !isProviderName(value))
    throw new Error(`${file}: unsupported provider.`);
  return value;
}

/** Preserve existing commands and comments when setting the project preference. */
export async function saveProjectProvider(
  cwd: string,
  provider: ProviderName,
): Promise<string> {
  const file = projectConfigPath(cwd);
  const source = (await readConfig(file)) ?? "{}\n";
  parseConfig(source, file);
  const edits = modify(source, ["provider"], provider, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
  });
  await writeFile(file, applyEdits(source, edits), "utf8");
  return file;
}
