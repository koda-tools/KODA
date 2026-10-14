import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  CACHE_TTL_MS,
  cacheFilePath,
  isStale,
  readCache,
  writeCache,
  type CatalogCache,
  type CatalogTable,
} from "../src/providers/index.js";

async function tempConfigRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-catalog-cache-"));
  return path.join(root, "nested", "koda");
}

const SAMPLE_TABLE: CatalogTable = {
  openai: {
    "gpt-4.1-mini": {
      toolCall: true,
      cost: { input: 0.4, output: 1.6 },
      limit: { context: 1_047_576, output: 32_768 },
    },
  },
  anthropic: {},
  gemini: {},
  ollama: {},
};

void test("readCache returns undefined when the file does not exist", () => {
  assert.equal(readCache("/path/does/not/exist-koda-cache"), undefined);
});

void test("writeCache then readCache round-trips the table", async () => {
  const configRoot = await tempConfigRoot();
  writeCache(configRoot, SAMPLE_TABLE);
  const cache = readCache(configRoot);
  assert.ok(cache !== undefined);
  assert.deepEqual(cache.table, SAMPLE_TABLE);
  assert.equal(typeof cache.fetchedAt, "number");
});

void test("readCache rejects corrupt JSON", async () => {
  const configRoot = await tempConfigRoot();
  mkdirSync(configRoot, { recursive: true });
  writeFileSync(cacheFilePath(configRoot), "{not json", "utf8");
  assert.equal(readCache(configRoot), undefined);
});

void test("readCache rejects a shape that does not match the schema", async () => {
  const configRoot = await tempConfigRoot();
  mkdirSync(configRoot, { recursive: true });
  writeFileSync(
    cacheFilePath(configRoot),
    JSON.stringify({
      fetchedAt: Date.now(),
      table: { openai: "not-an-object" },
    }),
    "utf8",
  );
  assert.equal(readCache(configRoot), undefined);
});

void test("readCache rejects a table missing a known provider", async () => {
  const configRoot = await tempConfigRoot();
  mkdirSync(configRoot, { recursive: true });
  writeFileSync(
    cacheFilePath(configRoot),
    JSON.stringify({
      fetchedAt: Date.now(),
      table: { openai: {}, anthropic: {}, gemini: {} }, // missing ollama
    }),
    "utf8",
  );
  assert.equal(readCache(configRoot), undefined);
});

void test("readCache rejects a model entry missing toolCall", async () => {
  const configRoot = await tempConfigRoot();
  mkdirSync(configRoot, { recursive: true });
  writeFileSync(
    cacheFilePath(configRoot),
    JSON.stringify({
      fetchedAt: Date.now(),
      table: {
        openai: { "gpt-4.1-mini": { cost: { input: 1, output: 2 } } },
        anthropic: {},
        gemini: {},
        ollama: {},
      },
    }),
    "utf8",
  );
  assert.equal(readCache(configRoot), undefined);
});

void test("writeCache does not throw when the path cannot be created", () => {
  // A config root nested under a file (not a directory) cannot be created.
  assert.doesNotThrow(() => {
    writeCache(
      path.join(
        "C:\\Windows\\System32\\drivers\\etc\\hosts",
        "impossible-koda-cache",
      ),
      SAMPLE_TABLE,
    );
  });
});

void test("isStale is false just under the TTL and true just over it", () => {
  const cache: CatalogCache = { fetchedAt: 1_000_000, table: SAMPLE_TABLE };
  assert.equal(isStale(cache, 1_000_000 + CACHE_TTL_MS - 1), false);
  assert.equal(isStale(cache, 1_000_000 + CACHE_TTL_MS + 1), true);
});
