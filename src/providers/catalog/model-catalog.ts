import {
  CATALOG_GENERATED_AT,
  CATALOG_SOURCE,
  MODEL_CATALOG,
} from "./model-catalog.generated.js";
import type {
  BuiltInProvider,
  CatalogTable,
  ModelInfo,
  ProviderName,
} from "./types.js";

export { CATALOG_SOURCE, CATALOG_GENERATED_AT };

/** Local inference has no API spend. */
const OLLAMA_INFO: ModelInfo = {
  toolCall: true,
  cost: { input: 0, output: 0 },
};

/**
 * The in-memory catalog table `modelInfo` reads. Starts as the shipped
 * fallback snapshot so every caller works before startup has had a chance
 * to install a runtime-loaded table (and in every test that does not touch
 * startup). `useCatalogTable` replaces it once, synchronously, with
 * whatever the disk cache or a fresh fetch produced.
 */
let activeCatalog: CatalogTable = MODEL_CATALOG;

/**
 * Installs the catalog table `modelInfo` resolves against. Called once at
 * CLI startup after the disk cache (or a background fetch) resolves a
 * table; never called with a partial or unvalidated table.
 */
export function useCatalogTable(table: CatalogTable): void {
  activeCatalog = table;
}

/**
 * Looks up model facts by exact id against the currently installed catalog
 * table. No alias resolution: an id the catalog does not carry (for example
 * a vendor `-latest` alias) returns `undefined` rather than a guess,
 * because a wrong guess bills at the wrong rate.
 */
export function modelInfo(
  provider: ProviderName,
  model: string,
): ModelInfo | undefined {
  if (provider === "ollama") return OLLAMA_INFO;
  // The priced table only covers the four built-in providers; a
  // catalog-only provider has no priced models yet.
  if (!(provider in MODEL_CATALOG)) return undefined;
  const key = provider as BuiltInProvider;
  // A runtime cache only adds or updates models: anything it lacks (an
  // empty or partial cache) still resolves from the shipped snapshot.
  const shipped: CatalogTable = MODEL_CATALOG;
  return activeCatalog[key][model] ?? shipped[key][model];
}
