import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPTY_USAGE,
  parseModelRef,
  resolveModel,
  sumUsage,
} from "../src/core/index.js";
import { AgentError } from "../src/utils/errors.js";

const identity = { provider: "openai", model: "gpt-4o-mini" } as const;

test("parses bare, prefixed and variant model references", () => {
  assert.deepEqual(parseModelRef("gpt-4o"), { model: "gpt-4o" });
  assert.deepEqual(parseModelRef("openai/gpt-4o"), {
    provider: "openai",
    model: "gpt-4o",
  });
  assert.deepEqual(parseModelRef("openai/gpt-4o#variant"), {
    provider: "openai",
    model: "gpt-4o",
  });
});

test("resolves the model against the agent identity", () => {
  assert.equal(resolveModel(undefined, identity), "gpt-4o-mini");
  assert.equal(resolveModel("gpt-4o", identity), "gpt-4o");
  assert.equal(resolveModel("openai/gpt-4o#variant", identity), "gpt-4o");
  assert.throws(
    () => resolveModel("anthropic/claude", identity),
    (error: unknown) =>
      error instanceof AgentError &&
      error.message ===
        "Model provider 'anthropic' does not match selected provider 'openai'.",
  );
});

test("sums usage treating missing counts as zero", () => {
  assert.deepEqual(sumUsage(EMPTY_USAGE, undefined), EMPTY_USAGE);
  assert.deepEqual(sumUsage({ inputTokens: 2 }, { outputTokens: 3 }), {
    inputTokens: 2,
    outputTokens: 3,
  });
  assert.deepEqual(
    sumUsage(
      { inputTokens: 1, outputTokens: 1 },
      { inputTokens: 4, outputTokens: 5 },
    ),
    { inputTokens: 5, outputTokens: 6 },
  );
});
