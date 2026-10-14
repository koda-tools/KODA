import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse, type ParseError } from "jsonc-parser";

import type { McpConfig, McpConfigOptions, McpServerConfig } from "./types.js";

const MAX_CONFIG_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const SERVER_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const ENV_PLACEHOLDER = /\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g;

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Config files, lowest precedence first (later ones override earlier). */
function configFiles(options: McpConfigOptions): string[] {
  const workspace = options.workspaceRoot;
  const roots: [string, string][] = [
    ...(options.globalOpenCodeRoot === undefined
      ? []
      : ([[options.globalOpenCodeRoot, "opencode"]] as [string, string][])),
    ...(options.globalKodaRoot === undefined
      ? []
      : ([[options.globalKodaRoot, "koda"]] as [string, string][])),
    [workspace, "opencode"],
    [path.join(workspace, ".opencode"), "opencode"],
    [workspace, "koda"],
    [path.join(workspace, ".koda"), "koda"],
  ];
  return roots.flatMap(([root, base]) => [
    path.join(root, `${base}.json`),
    path.join(root, `${base}.jsonc`),
  ]);
}

function expand(text: string, env: NodeJS.ProcessEnv): string {
  return text.replace(
    ENV_PLACEHOLDER,
    (_match, name: string) => env[name] ?? "",
  );
}

function stringMap(
  value: unknown,
  label: string,
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string")
      throw new Error(`${label}.${key} must be a string.`);
    result[key] = expand(entry, env);
  }
  return result;
}

function parseEnabled(value: unknown, label: string): boolean {
  if (value === undefined) return true;
  if (typeof value !== "boolean")
    throw new Error(`${label}.enabled must be a boolean.`);
  return value;
}

function parseTimeout(value: unknown, label: string): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1)
    throw new Error(`${label}.timeout must be a positive integer (ms).`);
  return value;
}

function parseCommand(value: unknown, label: string, env: NodeJS.ProcessEnv) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((part) => typeof part !== "string" || part === "")
  )
    throw new Error(`${label}.command must be a non-empty array of strings.`);
  return (value as string[]).map((part) => expand(part, env));
}

function parseUrl(
  value: unknown,
  label: string,
  env: NodeJS.ProcessEnv,
): string {
  if (typeof value !== "string")
    throw new Error(`${label}.url must be a string.`);
  const url = expand(value, env);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label}.url is not a valid URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error(`${label}.url must use http or https.`);
  return url;
}

function parseServer(
  entry: Json,
  label: string,
  env: NodeJS.ProcessEnv,
): McpServerConfig {
  const base = {
    enabled: parseEnabled(entry.enabled, label),
    timeout: parseTimeout(entry.timeout, label),
  };
  if (entry.type === "local")
    return {
      type: "local",
      ...base,
      command: parseCommand(entry.command, label, env),
      environment: stringMap(entry.environment, `${label}.environment`, env),
    };
  if (entry.type === "remote")
    return {
      type: "remote",
      ...base,
      url: parseUrl(entry.url, label, env),
      headers: stringMap(entry.headers, `${label}.headers`, env),
    };
  throw new Error(`${label}.type must be "local" or "remote".`);
}

/** Applies one file's `mcp` section on top of what earlier files defined. */
function applySection(
  section: Json,
  file: string,
  servers: Map<string, McpServerConfig>,
  diagnostics: string[],
  env: NodeJS.ProcessEnv,
): void {
  for (const [name, entry] of Object.entries(section)) {
    const label = `${file} (mcp.${name})`;
    try {
      if (!SERVER_NAME.test(name))
        throw new Error(`${label}: invalid server name.`);
      if (!isRecord(entry)) throw new Error(`${label}: must be an object.`);
      const inherited = servers.get(name);
      // `{ "enabled": false }` alone switches off a server defined elsewhere.
      if (entry.type === undefined && inherited !== undefined) {
        servers.set(name, {
          ...inherited,
          enabled: parseEnabled(entry.enabled, label),
        });
        continue;
      }
      servers.set(name, parseServer(entry, label, env));
    } catch (error) {
      diagnostics.push(error instanceof Error ? error.message : String(error));
    }
  }
}

async function readSection(
  file: string,
  diagnostics: string[],
): Promise<Json | undefined> {
  let content: string;
  try {
    content = await readFile(file, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    diagnostics.push(
      `${file}: ${error instanceof Error ? error.message : "unreadable"}.`,
    );
    return undefined;
  }
  if (Buffer.byteLength(content) > MAX_CONFIG_BYTES) {
    diagnostics.push(
      `${file}: configuration exceeds ${MAX_CONFIG_BYTES} bytes.`,
    );
    return undefined;
  }
  const errors: ParseError[] = [];
  const config: unknown = parse(content, errors, { allowTrailingComma: true });
  if (errors.length > 0 || !isRecord(config)) {
    diagnostics.push(`${file}: invalid JSON/JSONC configuration.`);
    return undefined;
  }
  if (config.mcp === undefined) return undefined;
  if (!isRecord(config.mcp)) {
    diagnostics.push(`${file}: mcp must be an object.`);
    return undefined;
  }
  return config.mcp;
}

/**
 * The `mcp` section of `koda.json` / `opencode.json`, in the same places and
 * precedence as agents and commands. A server defined in a higher-precedence
 * file replaces the lower one as a whole.
 */
export async function loadMcpConfig(
  options: McpConfigOptions,
): Promise<McpConfig> {
  const servers = new Map<string, McpServerConfig>();
  const diagnostics: string[] = [];
  for (const file of configFiles(options)) {
    const section = await readSection(file, diagnostics);
    if (section !== undefined)
      applySection(section, file, servers, diagnostics, options.env);
  }
  return { servers, diagnostics };
}
