/**
 * `initCatalog` installs the disk cache (or keeps the shipped snapshot) and
 * refreshes a missing or stale cache in the background. Every case injects
 * `fetch`, so nothing here reaches models.dev. This file runs in its own
 * process, so the catalog table it installs does not leak into other tests.
 */
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  CACHE_TTL_MS,
  cacheFilePath,
  initCatalog,
  modelInfo,
  readCache,
  type CatalogTable,
} from "../src/providers/index.js";
import { fakeFetch } from "./helpers/fake-fetch.js";

async function tempConfigRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "koda-catalog-startup-"));
}

const CACHED: CatalogTable = {
  openai: {
    "cached-only-model": { toolCall: true, cost: { input: 9, output: 9 } },
  },
  anthropic: {},
  gemini: {},
  ollama: {},
};

const UPSTREAM = {
  openai: {
    models: {
      "fetched-model": {
        tool_call: true,
        temperature: true,
        cost: { input: 1, output: 2 },
        limit: { context: 1000, output: 100 },
        modalities: { output: ["text"] },
      },
    },
  },
};

function seedCache(configRoot: string, fetchedAt: number): void {
  mkdirSync(configRoot, { recursive: true });
  writeFileSync(
    cacheFilePath(configRoot),
    JSON.stringify({ fetchedAt, table: CACHED }),
    "utf8",
  );
}

void test("a fresh cache is installed and no request is made", async () => {
  const configRoot = await tempConfigRoot();
  seedCache(configRoot, Date.now());
  const fake = fakeFetch({ kind: "json", body: UPSTREAM });

  await initCatalog(configRoot, fake.fetch);

  assert.equal(fake.requests.length, 0);
  assert.deepEqual(modelInfo("openai", "cached-only-model")?.cost, {
    input: 9,
    output: 9,
  });
});

void test("a stale cache is installed now and refreshed for the next session", async () => {
  const configRoot = await tempConfigRoot();
  seedCache(configRoot, Date.now() - CACHE_TTL_MS - 1);
  const fake = fakeFetch({ kind: "json", body: UPSTREAM });

  await initCatalog(configRoot, fake.fetch);

  assert.equal(fake.requests.length, 1);
  // This session keeps the table it started with...
  assert.ok(modelInfo("openai", "cached-only-model") !== undefined);
  // ...and the next one reads the refreshed cache.
  const next = readCache(configRoot);
  assert.ok(next?.table.openai["fetched-model"] !== undefined);
});

void test("with no cache, a refresh runs and writes one", async () => {
  const configRoot = await tempConfigRoot();
  const fake = fakeFetch({ kind: "json", body: UPSTREAM });

  await initCatalog(configRoot, fake.fetch);

  assert.equal(fake.requests.length, 1);
  assert.ok(existsSync(cacheFilePath(configRoot)));
});

void test("a failed refresh writes nothing and never throws", async () => {
  const configRoot = await tempConfigRoot();
  const fake = fakeFetch({ kind: "network-error" });

  await assert.doesNotReject(() => initCatalog(configRoot, fake.fetch));

  assert.equal(existsSync(cacheFilePath(configRoot)), false);
});
