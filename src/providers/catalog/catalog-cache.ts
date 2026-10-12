import { mkdirSync, readFileSync, writeFileSync, type Mode } from "node:fs";
import path from "node:path";

import type {
  CatalogCache,
  CatalogTable,
  ModelInfo,
  ProviderName,
} from "./types.js";

const CACHE_FILE = "catalog-cache.json";
const CACHE_FILE_MODE: Mode = 0o600;
const CACHE_DIR_MODE: Mode = 0o700;

/** How long a cached catalog is trusted before a background refresh is due. */
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function cacheFilePath(configRoot: string): string {
  return path.join(configRoot, CACHE_FILE);
}

const KODA_PROVIDERS: readonly ProviderName[] = [
  "openai",
  "anthropic",
  "gemini",
  "ollama",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseModelInfo(value: unknown): ModelInfo | undefined {
  if (!isRecord(value) || typeof value.toolCall !== "boolean") return undefined;
  const info: {
    cost?: { input: number; output: number };
    limit?: { context: number; output: number };
    toolCall: boolean;
    releaseDate?: string;
  } = { toolCall: value.toolCall };
  if (
    isRecord(value.cost) &&
    typeof value.cost.input === "number" &&
    typeof value.cost.output === "number"
  ) {
    info.cost = { input: value.cost.input, output: value.cost.output };
  }
  if (
    isRecord(value.limit) &&
    typeof value.limit.context === "number" &&
    typeof value.limit.output === "number"
  ) {
    info.limit = { context: value.limit.context, output: value.limit.output };
  }
  if (typeof value.releaseDate === "string")
    info.releaseDate = value.releaseDate;
  return info;
}

function parseTable(value: unknown): CatalogTable | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, Record<string, ModelInfo>> = {};
  for (const provider of KODA_PROVIDERS) {
    const providerValue = value[provider];
    if (!isRecord(providerValue)) return undefined;
    const models: Record<string, ModelInfo> = {};
    for (const [modelId, modelValue] of Object.entries(providerValue)) {
      const info = parseModelInfo(modelValue);
      if (info === undefined) return undefined;
      models[modelId] = info;
    }
    result[provider] = models;
  }
  return result as CatalogTable;
}

/**
 * Reads and validates the cached catalog. Any failure — missing file,
 * invalid JSON, a shape that does not match the current schema — is
 * treated as "no cache," never as a crash, so a corrupt or
 * future-versioned cache file falls back to the shipped snapshot instead
 * of breaking startup.
 */
export function readCache(configRoot: string): CatalogCache | undefined {
  try {
    const raw = JSON.parse(
      readFileSync(cacheFilePath(configRoot), "utf8"),
    ) as unknown;
    if (!isRecord(raw) || typeof raw.fetchedAt !== "number") return undefined;
    const table = parseTable(raw.table);
    if (table === undefined) return undefined;
    return { fetchedAt: raw.fetchedAt, table };
  } catch {
    return undefined;
  }
}

/**
 * Writes the catalog cache. Failures (read-only filesystem, missing
 * permissions) are swallowed rather than thrown: a session that cannot
 * write its cache should continue exactly as if the write succeeded and
 * simply try again next time.
 */
export function writeCache(configRoot: string, table: CatalogTable): void {
  try {
    mkdirSync(configRoot, { recursive: true, mode: CACHE_DIR_MODE });
    const cache: CatalogCache = { fetchedAt: Date.now(), table };
    writeFileSync(cacheFilePath(configRoot), JSON.stringify(cache), {
      mode: CACHE_FILE_MODE,
    });
  } catch {
    // Best-effort: the next session simply tries again if still stale.
  }
}

export function isStale(cache: CatalogCache, now: number): boolean {
  return now - cache.fetchedAt > CACHE_TTL_MS;
}
