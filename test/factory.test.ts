import assert from "node:assert/strict";
import { test } from "node:test";
import { AnthropicProvider } from "../src/providers/adapters/anthropic.provider.js";
import { GeminiProvider } from "../src/providers/adapters/gemini.provider.js";
import { OllamaProvider } from "../src/providers/adapters/ollama.provider.js";
import { OpenAIProvider } from "../src/providers/adapters/openai.provider.js";
import { ProviderFactory } from "../src/providers/factory.js";
import { ProviderError } from "../src/utils/errors.js";

test("creates every supported provider from explicit configuration", () => {
  assert.ok(
    ProviderFactory.create({ provider: "openai", apiKey: "test" }) instanceof
      OpenAIProvider,
  );
  assert.ok(
    ProviderFactory.create({ provider: "anthropic", apiKey: "test" }) instanceof
      AnthropicProvider,
  );
  assert.ok(
    ProviderFactory.create({ provider: "gemini", apiKey: "test" }) instanceof
      GeminiProvider,
  );
  assert.ok(
    ProviderFactory.create({ provider: "ollama" }) instanceof OllamaProvider,
  );
});

test("selects providers from environment with canonical precedence", () => {
  assert.ok(
    ProviderFactory.fromEnvironment({ OPENAI_API_KEY: "test" }) instanceof
      OpenAIProvider,
  );
  assert.ok(
    ProviderFactory.fromEnvironment({
      KODA_PROVIDER: "ollama",
      OPENCODE_PROVIDER: "openai",
    }) instanceof OllamaProvider,
  );
  assert.ok(
    ProviderFactory.fromEnvironment({
      KODA_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test",
    }) instanceof AnthropicProvider,
  );
  assert.ok(
    ProviderFactory.fromEnvironment({
      KODA_PROVIDER: "gemini",
      GEMINI_API_KEY: "test",
    }) instanceof GeminiProvider,
  );
});

test("rejects missing secrets, unknown providers, and invalid Ollama URLs", () => {
  assert.throws(
    () => ProviderFactory.fromEnvironment({ KODA_PROVIDER: "anthropic" }),
    /ANTHROPIC_API_KEY/,
  );
  assert.throws(
    () =>
      ProviderFactory.fromEnvironment({
        KODA_PROVIDER: "other",
        SECRET: "must-not-leak",
      }),
    (error: unknown) =>
      error instanceof ProviderError &&
      !error.message.includes("must-not-leak"),
  );
  assert.throws(
    () =>
      ProviderFactory.create({
        provider: "ollama",
        baseURL: "file:///tmp/model",
      }),
    /HTTP/,
  );
});

test("reports provider capabilities without network requests", () => {
  const providers = [
    ProviderFactory.create({ provider: "openai", apiKey: "test" }),
    ProviderFactory.create({ provider: "anthropic", apiKey: "test" }),
    ProviderFactory.create({ provider: "gemini", apiKey: "test" }),
    ProviderFactory.create({ provider: "ollama", toolSupport: false }),
  ];
  assert.deepEqual(
    providers.map((provider) => provider.capabilities().streaming),
    [true, true, true, true],
  );
  assert.equal(providers[3]?.supportsTools(), false);
});

test("resolves provider identity from one shared defaults table", async () => {
  const { resolveProviderIdentity, DEFAULT_MODELS } = await import(
    "../src/providers/defaults.js"
  );
  assert.deepEqual(resolveProviderIdentity({}), {
    provider: "openai",
    model: DEFAULT_MODELS.openai,
  });
  assert.deepEqual(
    resolveProviderIdentity({
      KODA_PROVIDER: "ollama",
      OLLAMA_MODEL: " qwen3:4b ",
    }),
    { provider: "ollama", model: "qwen3:4b" },
  );
  assert.equal(
    resolveProviderIdentity({ KODA_PROVIDER: "gemini", GEMINI_MODEL: "" })
      .model,
    DEFAULT_MODELS.gemini,
  );
});
