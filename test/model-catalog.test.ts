import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PROVIDERS,
  estimateCost,
  modelInfo,
  modelLimit,
  providerSpec,
  type ProviderName,
} from "../src/providers/index.js";

/**
 * This is the staleness guard: every hosted provider's default model must
 * resolve to catalog facts with a price, a context limit, and tool support.
 * A default that fails this fails the build instead of silently showing no
 * cost at runtime. The local provider has no upstream catalog source, so it
 * is checked separately for tool support and zero cost only.
 */
const HOSTED_PROVIDERS: readonly ProviderName[] = [
  "openai",
  "anthropic",
  "gemini",
];

void test("every hosted provider default model is priced, limited and tool-capable", () => {
  for (const provider of HOSTED_PROVIDERS) {
    const spec = providerSpec(provider);
    const info = modelInfo(provider, spec.defaultModel);
    assert.ok(
      info !== undefined,
      `${provider}/${spec.defaultModel} is missing from the catalog`,
    );
    assert.equal(
      info.toolCall,
      true,
      `${provider}/${spec.defaultModel} does not support tool calling`,
    );
    assert.ok(
      info.cost !== undefined,
      `${provider}/${spec.defaultModel} has no price`,
    );
    assert.ok(
      info.limit !== undefined,
      `${provider}/${spec.defaultModel} has no context limit`,
    );
  }
});

/**
 * Reasoning-only models reject the `temperature` parameter outright. KODA's
 * agent loop and custom agent files pass an explicit `temperature`, so a
 * default that cannot accept it silently defeats a user-facing setting.
 *
 * Two layers can mark a model reasoning-only, and models.dev's `temperature`
 * field only catches the first one:
 *  - The vendor API itself rejects it (Claude's "5" generation; several
 *    `gpt-6` entries). models.dev reports `temperature: false` for these,
 *    and `catalog-fetch.ts`'s `isUsable` filter already excludes them from
 *    the pool.
 *  - The AI SDK's own OpenAI client overrides models.dev: any `gpt-5` or
 *    later model whose variant does not literally start with "chat" is
 *    treated as reasoning-only by `getOpenAILanguageModelCapabilities`
 *    (node_modules/@ai-sdk/openai/dist/internal/index.js), which strips
 *    `temperature` from the request regardless of what models.dev says for
 *    that exact id. `gpt-5.4-nano` reports `temperature: true` upstream and
 *    still loses it this way; the wire-parity suite caught this during
 *    development. `@ai-sdk/anthropic` has no equivalent override.
 *
 * This test pins both layers by id, so a future catalog refresh cannot
 * reintroduce one of them as a default without failing here, even where
 * models.dev's own flag would not catch it.
 */
void test("default models are not from the reasoning-only families that reject temperature", () => {
  const reasoningOnly = new Set([
    // Vendor-level: rejected by the API itself, and already excluded from
    // the generated catalog by `isUsable`.
    "gpt-6-luna",
    "gpt-6-sol",
    "gpt-6.1-sol",
    "gpt-5-mini",
    "claude-sonnet-5",
    "claude-sonnet-5-5",
    "claude-opus-5",
    "claude-opus-5-5",
    "claude-haiku-5-5",
    "claude-fable-5",
    "claude-fable-5-1",
    // SDK-level only: models.dev reports `temperature: true`, but the AI
    // SDK's OpenAI client strips it anyway because the id matches its own
    // `gpt-5+`, non-"chat"-variant heuristic.
    "gpt-5.4-nano",
    "gpt-5.4-mini",
    "gpt-5.4",
    "gpt-5.1",
  ]);
  for (const provider of HOSTED_PROVIDERS) {
    const model = providerSpec(provider).defaultModel;
    assert.ok(
      !reasoningOnly.has(model),
      `${provider}/${model} is a reasoning-only model that rejects temperature`,
    );
  }
});

void test("the ollama default model reports tool support and zero cost", () => {
  const spec = PROVIDERS.ollama;
  const info = modelInfo("ollama", spec.defaultModel);
  assert.ok(info !== undefined);
  assert.equal(info.toolCall, true);
  assert.deepEqual(info.cost, { input: 0, output: 0 });
});

void test("ollama reports zero cost regardless of model id", () => {
  const info = modelInfo("ollama", "whatever-local-model");
  assert.ok(info !== undefined);
  assert.deepEqual(info.cost, { input: 0, output: 0 });
});

void test("an unknown model returns no information", () => {
  assert.equal(modelInfo("openai", "not-a-real-model"), undefined);
  assert.equal(modelInfo("anthropic", "claude-3-5-sonnet-latest"), undefined);
});

void test("estimateCost resolves a price for the default model of each hosted provider", () => {
  for (const provider of HOSTED_PROVIDERS) {
    const spec = providerSpec(provider);
    const cost = estimateCost(provider, spec.defaultModel, {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    assert.ok(
      cost !== undefined,
      `${provider}/${spec.defaultModel} did not produce a cost estimate`,
    );
    assert.ok(cost > 0);
  }
});

void test("estimateCost returns undefined for an unpriced model", () => {
  assert.equal(
    estimateCost("openai", "not-a-real-model", {
      inputTokens: 100,
      outputTokens: 100,
    }),
    undefined,
  );
});

void test("estimateCost returns undefined for an unknown provider string", () => {
  assert.equal(
    estimateCost("not-a-provider", "gpt-6-luna", {
      inputTokens: 100,
      outputTokens: 100,
    }),
    undefined,
  );
});

void test("modelLimit uses the catalog entry and caps the output at 32k", () => {
  assert.deepEqual(modelLimit("openai", "gpt-4.1-mini"), {
    context: 1_047_576,
    output: 32_768,
  });
  // The catalog says 65,536 output tokens; KODA reserves at most 32,768.
  assert.deepEqual(modelLimit("gemini", "gemini-3.8-flash"), {
    context: 1_048_576,
    output: 32_768,
  });
});

void test("modelLimit falls back to the provider default for uncatalogued models", () => {
  for (const provider of HOSTED_PROVIDERS)
    assert.deepEqual(
      modelLimit(provider, "not-a-real-model"),
      providerSpec(provider).defaultLimit,
      provider,
    );
});

void test("modelLimit keeps the local provider and unknown providers small", () => {
  assert.deepEqual(modelLimit("ollama", "llama3.2"), {
    context: 8_192,
    output: 2_048,
  });
  assert.deepEqual(modelLimit("not-a-provider", "any"), {
    context: 8_192,
    output: 2_048,
  });
});

void test("every hosted default model has catalog limits, not the fallback", () => {
  for (const provider of HOSTED_PROVIDERS) {
    const spec = providerSpec(provider);
    const limit = modelLimit(provider, spec.defaultModel);
    assert.notDeepEqual(limit, spec.defaultLimit, provider);
    assert.ok(limit.output > 4_096, `${provider} would still truncate early`);
  }
});
