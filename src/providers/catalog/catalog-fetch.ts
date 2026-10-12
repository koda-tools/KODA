import { CATALOG_SOURCE } from "./model-catalog.generated.js";
import type { CatalogTable, ModelInfo } from "./types.js";

/** KODA provider id -> upstream models.dev provider id. */
const UPSTREAM_PROVIDER: Readonly<Record<string, string>> = {
  openai: "openai",
  anthropic: "anthropic",
  gemini: "google",
  // ollama has no models.dev entry; it resolves to an empty table.
};

const KODA_PROVIDERS = ["openai", "anthropic", "gemini", "ollama"] as const;

interface UpstreamCost {
  readonly input?: unknown;
  readonly output?: unknown;
}

interface UpstreamLimit {
  readonly context?: unknown;
  readonly output?: unknown;
}

interface UpstreamModel {
  readonly tool_call?: unknown;
  readonly temperature?: unknown;
  readonly status?: unknown;
  readonly release_date?: unknown;
  readonly cost?: UpstreamCost;
  readonly limit?: UpstreamLimit;
  readonly modalities?: { readonly output?: readonly unknown[] };
}

interface UpstreamProvider {
  readonly models?: Readonly<Record<string, UpstreamModel>>;
}

type UpstreamCatalog = Readonly<Record<string, UpstreamProvider>>;

/**
 * A coding agent needs tool calling and text output on a non-deprecated
 * model. It also needs `temperature` to reach the request: KODA's agent
 * loop and custom agent files (`temperature:` front matter) pass an
 * explicit `temperature`, and reasoning-only models (several current
 * OpenAI `gpt-5`/`gpt-6` and Anthropic Claude "5" generation entries)
 * reject it outright, silently dropping a user-facing setting. Excluding
 * `temperature === false` keeps those out of the pool KODA picks defaults
 * from and lists for `/model`.
 */
function isUsable(model: UpstreamModel): boolean {
  if (model.tool_call !== true) return false;
  if (model.temperature === false) return false;
  if (model.status === "deprecated") return false;
  const outputs = model.modalities?.output ?? [];
  return outputs.includes("text");
}

function toModelInfo(model: UpstreamModel): ModelInfo {
  const info: {
    cost?: { input: number; output: number };
    limit?: { context: number; output: number };
    toolCall: boolean;
    releaseDate?: string;
  } = { toolCall: true };
  const cost = model.cost;
  if (
    cost !== undefined &&
    typeof cost.input === "number" &&
    typeof cost.output === "number"
  ) {
    info.cost = { input: cost.input, output: cost.output };
  }
  const limit = model.limit;
  if (
    limit !== undefined &&
    typeof limit.context === "number" &&
    typeof limit.output === "number"
  ) {
    info.limit = { context: limit.context, output: limit.output };
  }
  if (typeof model.release_date === "string")
    info.releaseDate = model.release_date;
  return info;
}

function buildTable(upstream: UpstreamCatalog): CatalogTable {
  const result: Record<string, Record<string, ModelInfo>> = {};
  for (const provider of KODA_PROVIDERS) {
    const upstreamId = UPSTREAM_PROVIDER[provider];
    const models: Record<string, ModelInfo> = {};
    const providerData =
      upstreamId === undefined ? undefined : upstream[upstreamId];
    for (const [modelId, model] of Object.entries(providerData?.models ?? {}))
      if (isUsable(model)) models[modelId] = toModelInfo(model);
    result[provider] = models;
  }
  return result as CatalogTable;
}

/** An empty table for every provider, used when a fetch fails or returns garbage. */
function emptyTable(): CatalogTable {
  const result: Record<string, Record<string, ModelInfo>> = {};
  for (const provider of KODA_PROVIDERS) result[provider] = {};
  return result as CatalogTable;
}

/**
 * Fetches and filters the models.dev catalog into KODA's `CatalogTable`
 * shape. Accepts an injected `fetch` so tests never hit the real network.
 * Never throws: a transport failure or a response that is not the expected
 * shape resolves to an empty table, which `modelInfo` already treats the
 * same as "unpriced."
 */
export async function fetchModelCatalog(
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<CatalogTable> {
  try {
    const response = await fetchImpl(CATALOG_SOURCE);
    if (!response.ok) return emptyTable();
    const body: unknown = await response.json();
    if (body === null || typeof body !== "object") return emptyTable();
    return buildTable(body as UpstreamCatalog);
  } catch {
    return emptyTable();
  }
}
