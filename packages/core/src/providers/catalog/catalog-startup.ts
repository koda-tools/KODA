import { fetchModelCatalog } from "./catalog-fetch.js";
import { isStale, readCache, writeCache } from "./catalog-cache.js";
import { useCatalogTable } from "./model-catalog.js";
import type { CatalogTable } from "./types.js";

/** A failed fetch yields a table with no models; it must never be used. */
function hasModels(table: CatalogTable): boolean {
  return Object.values(table).some((models) => Object.keys(models).length > 0);
}

/**
 * Installs the best catalog table available without blocking: reads the
 * disk cache synchronously (falling back to the shipped snapshot that
 * `model-catalog.ts` already starts with when there is no usable cache),
 * then, if that cache is missing, empty or older than the TTL, fetches a
 * fresh catalog in the background and writes it for the *next* session.
 *
 * `modelInfo` and `estimateCost` stay synchronous: the table is installed
 * before this returns, and callers are not expected to await the returned
 * promise. It only exists so tests can wait for the background refresh;
 * it never rejects.
 */
export function initCatalog(
  configRoot: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<void> {
  const cache = readCache(configRoot);
  // An empty cache (written by an older build after a failed fetch) counts
  // as no cache, so it is refreshed instead of hiding every price.
  const usable = cache !== undefined && hasModels(cache.table);
  if (usable) useCatalogTable(cache.table);
  if (usable && !isStale(cache, Date.now())) return Promise.resolve();
  return fetchModelCatalog(fetchImpl)
    .then((table) => {
      // An empty table means the fetch failed; keep the old cache, if any.
      if (hasModels(table)) writeCache(configRoot, table);
    })
    .catch(() => {
      // Best-effort background refresh; the session already proceeded
      // on the cache or fallback snapshot.
    });
}
