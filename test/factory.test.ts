import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AnthropicProvider,
  GeminiProvider,
  OllamaProvider,
  OpenAIProvider,
  PROVIDERS,
  ProviderFactory,
  configFromEnvironment,
  estimateCost,
  resolveProviderIdentity,
  type ILLMProvider,
  type ProviderConfig,
  type ProviderName,
} from "../src/providers/index.js";
import { ProviderError } from "../src/utils/errors.js";

type ProviderClass = abstract new (...args: never[]) => ILLMProvider;

interface ProviderCase {
  readonly type: ProviderClass;
  readonly config: ProviderConfig;
  readonly env: NodeJS.ProcessEnv;
}

/** `satisfies Record<ProviderName, …>` forces a case for every provider. */
const CASES = {
  openai: {
    type: OpenAIProvider,
    config: { provider: "openai", apiKey: "test" },
    env: { OPENAI_API_KEY: "test" },
  },
  anthropic: {
    type: AnthropicProvider,
    config: { provider: "anthropic", apiKey: "test" },
    env: { KODA_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test" },
  },
  gemini: {
    type: GeminiProvider,
    config: { provider: "gemini", apiKey: "test" },
    env: { KODA_PROVIDER: "gemini", GEMINI_API_KEY: "test" },
  },
  ollama: {
    type: OllamaProvider,
    config: { provider: "ollama" },
    env: { KODA_PROVIDER: "ollama", OPENCODE_PROVIDER: "openai" },
  },
} as const satisfies Record<ProviderName, ProviderCase>;

const entries = Object.values(CASES);

function isProviderError(pattern: RegExp) {
  return (error: unknown): boolean =>
    error instanceof ProviderError && pattern.test(error.message);
}

test("creates every supported provider from explicit configuration", () => {
  for (const { type, config } of entries)
    assert.ok(ProviderFactory.create(config) instanceof type, config.provider);
});

test("selects providers from environment with canonical precedence", () => {
  for (const { type, env } of entries)
    assert.ok(ProviderFactory.fromEnvironment(env) instanceof type, type.name);
});

test("rejects missing secrets, unknown providers, and invalid Ollama URLs", () => {
  assert.throws(
    () => ProviderFactory.fromEnvironment({ KODA_PROVIDER: "anthropic" }),
    isProviderError(/ANTHROPIC_API_KEY/),
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
    isProviderError(/HTTP/),
  );
});

test("reports provider capabilities without network requests", () => {
  for (const { config } of entries)
    assert.equal(
      ProviderFactory.create(config).capabilities().streaming,
      true,
      config.provider,
    );
  const local = ProviderFactory.create({
    provider: "ollama",
    toolSupport: false,
  });
  assert.equal(local.supportsTools(), false);
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

test("rejects unknown providers in identity resolution like the factory (bug 7)", () => {
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

test("estimates cost from catalog prices", () => {
  const million = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
  assert.equal(estimateCost("openai", "gpt-4o-mini", million), 0.75);
  assert.equal(
    estimateCost("openai", "unknown", { inputTokens: 1 }),
    undefined,
  );
});
