/**
 * Model discovery for Anthropic and Gemini: header placement, the
 * lifecycle/generateContent filters, prefix stripping, pagination and the
 * error path. OpenAI/Ollama listing is unchanged and already covered by
 * `test/provider-boundary.test.ts` and friends; this file only adds the two
 * vendors that previously had no `listModels` at all.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { AnthropicProvider, GeminiProvider } from "../src/providers/index.js";
import { ProviderError } from "../src/utils/errors.js";
import { fakeFetch, type FakeReply } from "./helpers/fake-fetch.js";

const json = (body: unknown, status = 200): FakeReply => ({
  kind: "json",
  body,
  status,
});

void test("listAnthropicModels sends the key and version in headers, not the URL", async () => {
  const fake = fakeFetch(
    json({ data: [{ id: "claude-sonnet-4-6" }], has_more: false }),
  );
  const provider = new AnthropicProvider({
    apiKey: "sk-ant",
    fetch: fake.fetch,
  });
  await provider.listModels?.();

  assert.equal(fake.requests.length, 1);
  const request = fake.requests[0];
  assert.ok(request !== undefined);
  assert.equal(request.headers["x-api-key"], "sk-ant");
  assert.equal(request.headers["anthropic-version"], "2023-06-01");
  assert.equal(request.url.searchParams.get("key"), null);
  assert.ok(!request.url.toString().includes("sk-ant"));
});

void test("listAnthropicModels asks for active models only", async () => {
  const fake = fakeFetch(json({ data: [], has_more: false }));
  const provider = new AnthropicProvider({
    apiKey: "sk-ant",
    fetch: fake.fetch,
  });
  await provider.listModels?.();

  const request = fake.requests[0];
  assert.ok(request !== undefined);
  assert.equal(request.url.searchParams.get("lifecycle"), "active");
});

void test("listAnthropicModels follows has_more via after_id", async () => {
  const fake = fakeFetch((_request, index) =>
    index === 0
      ? json({
          data: [{ id: "claude-opus-4-6" }],
          has_more: true,
          last_id: "claude-opus-4-6",
        })
      : json({ data: [{ id: "claude-sonnet-4-6" }], has_more: false }),
  );
  const provider = new AnthropicProvider({
    apiKey: "sk-ant",
    fetch: fake.fetch,
  });
  const ids = await provider.listModels?.();

  assert.equal(fake.requests.length, 2);
  assert.equal(
    fake.requests[1]?.url.searchParams.get("after_id"),
    "claude-opus-4-6",
  );
  assert.deepEqual([...(ids ?? [])].sort(), [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
  ]);
});

void test("listAnthropicModels stops pagination once has_more is false", async () => {
  const fake = fakeFetch(
    json({
      data: [{ id: "claude-sonnet-4-6" }],
      has_more: false,
      last_id: "x",
    }),
  );
  const provider = new AnthropicProvider({
    apiKey: "sk-ant",
    fetch: fake.fetch,
  });
  await provider.listModels?.();

  assert.equal(fake.requests.length, 1);
});

void test("listAnthropicModels surfaces an HTTP failure as a ProviderError", async () => {
  const fake = fakeFetch(json({ error: "nope" }, 401));
  const provider = new AnthropicProvider({
    apiKey: "bad-key",
    fetch: fake.fetch,
  });
  await assert.rejects(
    () => provider.listModels?.() ?? Promise.resolve([]),
    ProviderError,
  );
});

void test("listGeminiModels sends the key in a header, not the URL", async () => {
  const fake = fakeFetch(
    json({
      models: [
        {
          name: "models/gemini-3.8-flash",
          supportedGenerationMethods: ["generateContent"],
        },
      ],
    }),
  );
  const provider = new GeminiProvider({
    apiKey: "goog-key",
    fetch: fake.fetch,
  });
  await provider.listModels?.();

  const request = fake.requests[0];
  assert.ok(request !== undefined);
  assert.equal(request.headers["x-goog-api-key"], "goog-key");
  assert.equal(request.url.searchParams.get("key"), null);
  assert.ok(!request.url.toString().includes("goog-key"));
});

void test("listGeminiModels strips the models/ prefix and keeps only generateContent models", async () => {
  const fake = fakeFetch(
    json({
      models: [
        {
          name: "models/gemini-3.8-flash",
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/text-embedding-004",
          supportedGenerationMethods: ["embedContent"],
        },
      ],
    }),
  );
  const provider = new GeminiProvider({
    apiKey: "goog-key",
    fetch: fake.fetch,
  });
  const ids = await provider.listModels?.();

  assert.deepEqual([...(ids ?? [])], ["gemini-3.8-flash"]);
});

void test("listGeminiModels follows nextPageToken", async () => {
  const fake = fakeFetch((_request, index) =>
    index === 0
      ? json({
          models: [
            {
              name: "models/gemini-3.5-flash-lite",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
          nextPageToken: "page-2",
        })
      : json({
          models: [
            {
              name: "models/gemini-3.8-flash",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }),
  );
  const provider = new GeminiProvider({
    apiKey: "goog-key",
    fetch: fake.fetch,
  });
  const ids = await provider.listModels?.();

  assert.equal(fake.requests.length, 2);
  assert.equal(fake.requests[1]?.url.searchParams.get("pageToken"), "page-2");
  assert.deepEqual([...(ids ?? [])].sort(), [
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
  ]);
});

void test("listGeminiModels surfaces an HTTP failure as a ProviderError", async () => {
  const fake = fakeFetch(json({ error: "nope" }, 403));
  const provider = new GeminiProvider({ apiKey: "bad-key", fetch: fake.fetch });
  await assert.rejects(
    () => provider.listModels?.() ?? Promise.resolve([]),
    ProviderError,
  );
});
