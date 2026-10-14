import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PROVIDERS,
  PROVIDER_NAMES,
  ProviderFactory,
  configFromEnvironment,
  estimateCost,
  providerSpec,
  resolveProviderIdentity,
} from "../src/providers/index.js";
import { ProviderError } from "../src/utils/errors.js";

function isProviderError(pattern: RegExp) {
  return (error: unknown): boolean =>
    error instanceof ProviderError && pattern.test(error.message);
}

/** An env that satisfies one provider: its key when the catalog needs one. */
function envFor(provider: string): NodeJS.ProcessEnv {
  const spec = providerSpec(provider);
  const env: NodeJS.ProcessEnv = { KODA_PROVIDER: provider };
  if (spec.apiKeyRequired) env[spec.apiKeyEnv] = "test-key";
  return env;
}

test("creates and streams every catalog provider from the environment", () => {
  for (const provider of PROVIDER_NAMES) {
    const built = ProviderFactory.fromEnvironment(envFor(provider));
    assert.equal(built.capabilities().streaming, true, provider);
  }
});

test("every provider that needs a key fails with its declared variable", () => {
  for (const provider of PROVIDER_NAMES) {
    const spec = providerSpec(provider);
    if (!spec.apiKeyRequired) continue;
    assert.throws(
      () => ProviderFactory.fromEnvironment({ KODA_PROVIDER: provider }),
      isProviderError(new RegExp(spec.apiKeyEnv)),
      provider,
    );
  }
});

test("local providers need no key", () => {
  for (const provider of PROVIDER_NAMES) {
    if (providerSpec(provider).apiKeyRequired) continue;
    assert.doesNotThrow(
      () => ProviderFactory.fromEnvironment({ KODA_PROVIDER: provider }),
      provider,
    );
  }
});

test("rejects unknown providers and invalid base URLs", () => {
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
    isProviderError(/HTTP/),
  );
});

test("resolves provider identity from the shared catalog", () => {
  assert.deepEqual(resolveProviderIdentity({}), {
    provider: "openai",
    model: PROVIDERS.openai.defaultModel,
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
    PROVIDERS.gemini.defaultModel,
  );
});

test("rejects unknown providers in identity resolution like the factory", () => {
  assert.throws(
    () => resolveProviderIdentity({ KODA_PROVIDER: "other" }),
    isProviderError(/Unsupported provider 'other'/),
  );
  assert.equal(
    resolveProviderIdentity({ KODA_PROVIDER: " anthropic " }).provider,
    "anthropic",
  );
});

test("derives environment variable names from the catalog", () => {
  const anthropic = PROVIDERS.anthropic;
  assert.deepEqual(
    configFromEnvironment({
      KODA_PROVIDER: "anthropic",
      [anthropic.apiKeyEnv]: "key",
      [anthropic.modelEnv]: "claude-x",
    }),
    { provider: "anthropic", apiKey: "key", model: "claude-x" },
  );
  const ollama = PROVIDERS.ollama;
  assert.deepEqual(
    configFromEnvironment({
      KODA_PROVIDER: "ollama",
      [ollama.baseURLEnv]: "http://host:1/v1",
      [ollama.toolSupportEnv]: "TRUE",
    }),
    { provider: "ollama", baseURL: "http://host:1/v1", toolSupport: true },
  );
});

test("builds a catalog-only OpenAI-compatible provider with no dedicated class", () => {
  const built = ProviderFactory.fromEnvironment({
    KODA_PROVIDER: "groq",
    GROQ_API_KEY: "test-key",
  });
  assert.equal(built.capabilities().streaming, true);
});

test("estimates cost from catalog prices", () => {
  const million = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
  assert.equal(estimateCost("openai", "gpt-4o-mini", million), 0.75);
  assert.equal(
    estimateCost("openai", "unknown", { inputTokens: 1 }),
    undefined,
  );
});
