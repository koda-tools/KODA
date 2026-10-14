import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchModelCatalog } from "../src/providers/index.js";
import { fakeFetch } from "./helpers/fake-fetch.js";

/** Minimal models.dev-shaped fixture covering the fields isUsable() reads. */
function upstream(overrides: Record<string, unknown> = {}): unknown {
  return {
    openai: {
      models: {
        "gpt-4.1-mini": {
          tool_call: true,
          temperature: true,
          status: undefined,
          release_date: "2025-04-14",
          cost: { input: 0.4, output: 1.6 },
          limit: { context: 1_047_576, output: 32_768 },
          modalities: { output: ["text"] },
        },
        "gpt-5-reasoning": {
          tool_call: true,
          temperature: false,
          cost: { input: 1, output: 2 },
          limit: { context: 100_000, output: 10_000 },
          modalities: { output: ["text"] },
        },
        "gpt-old-deprecated": {
          tool_call: true,
          temperature: true,
          status: "deprecated",
          cost: { input: 1, output: 2 },
          limit: { context: 100_000, output: 10_000 },
          modalities: { output: ["text"] },
        },
        "gpt-no-tools": {
          tool_call: false,
          temperature: true,
          cost: { input: 1, output: 2 },
          limit: { context: 100_000, output: 10_000 },
          modalities: { output: ["text"] },
        },
        "gpt-image-only": {
          tool_call: true,
          temperature: true,
          cost: { input: 1, output: 2 },
          limit: { context: 100_000, output: 10_000 },
          modalities: { output: ["image"] },
        },
        "gpt-no-cost-no-limit": {
          tool_call: true,
          temperature: true,
          modalities: { output: ["text"] },
        },
      },
    },
    google: {
      models: {
        "gemini-3.8-flash": {
          tool_call: true,
          temperature: true,
          cost: { input: 0.75, output: 3.75 },
          limit: { context: 1_048_576, output: 65_536 },
          modalities: { output: ["text"] },
        },
      },
    },
    ...overrides,
  };
}

void test("fetchModelCatalog keeps only usable models and maps gemini to google", async () => {
  const fake = fakeFetch({ kind: "json", body: upstream() });
  const table = await fetchModelCatalog(fake.fetch);

  assert.deepEqual(Object.keys(table.openai).sort(), [
    "gpt-4.1-mini",
    "gpt-no-cost-no-limit",
  ]);
  assert.deepEqual(Object.keys(table.gemini), ["gemini-3.8-flash"]);
  assert.deepEqual(table.anthropic, {});
  assert.deepEqual(table.ollama, {});

  const info = table.openai["gpt-4.1-mini"];
  assert.ok(info !== undefined);
  assert.equal(info.toolCall, true);
  assert.deepEqual(info.cost, { input: 0.4, output: 1.6 });
  assert.deepEqual(info.limit, { context: 1_047_576, output: 32_768 });
  assert.equal(info.releaseDate, "2025-04-14");
});

void test("fetchModelCatalog excludes temperature:false, deprecated, non-tool and non-text models", async () => {
  const fake = fakeFetch({ kind: "json", body: upstream() });
  const table = await fetchModelCatalog(fake.fetch);

  assert.equal(table.openai["gpt-5-reasoning"], undefined);
  assert.equal(table.openai["gpt-old-deprecated"], undefined);
  assert.equal(table.openai["gpt-no-tools"], undefined);
  assert.equal(table.openai["gpt-image-only"], undefined);
});

void test("fetchModelCatalog omits cost and limit when the upstream model has none", async () => {
  const fake = fakeFetch({ kind: "json", body: upstream() });
  const table = await fetchModelCatalog(fake.fetch);

  const info = table.openai["gpt-no-cost-no-limit"];
  assert.ok(info !== undefined);
  assert.equal(info.toolCall, true);
  assert.equal(info.cost, undefined);
  assert.equal(info.limit, undefined);
});

void test("fetchModelCatalog requests the documented models.dev endpoint", async () => {
  const fake = fakeFetch({ kind: "json", body: upstream() });
  await fetchModelCatalog(fake.fetch);

  assert.equal(fake.requests.length, 1);
  assert.equal(fake.requests[0]?.url.toString(), "https://models.dev/api.json");
  assert.equal(fake.requests[0]?.method, "GET");
});

void test("fetchModelCatalog returns an empty table on an HTTP error", async () => {
  const fake = fakeFetch({
    kind: "json",
    body: { error: "nope" },
    status: 500,
  });
  const table = await fetchModelCatalog(fake.fetch);

  assert.deepEqual(table.openai, {});
  assert.deepEqual(table.anthropic, {});
  assert.deepEqual(table.gemini, {});
  assert.deepEqual(table.ollama, {});
});

void test("fetchModelCatalog returns an empty table on a network failure", async () => {
  const fake = fakeFetch({ kind: "network-error" });
  const table = await fetchModelCatalog(fake.fetch);

  assert.deepEqual(table.openai, {});
  assert.deepEqual(table.anthropic, {});
});

void test("fetchModelCatalog returns an empty table when the response is not an object", async () => {
  const fake = fakeFetch({ kind: "json", body: "not an object" });
  const table = await fetchModelCatalog(fake.fetch);

  assert.deepEqual(table.openai, {});
});

void test("fetchModelCatalog returns an empty table when a provider is missing upstream", async () => {
  const fake = fakeFetch({ kind: "json", body: {} });
  const table = await fetchModelCatalog(fake.fetch);

  assert.deepEqual(table.openai, {});
  assert.deepEqual(table.anthropic, {});
  assert.deepEqual(table.gemini, {});
  assert.deepEqual(table.ollama, {});
});
