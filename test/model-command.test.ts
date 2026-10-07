import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseWriteArguments,
  runModelCommand,
} from "../src/cli/tui/index.js";

const base = {
  current: "alpha",
  provider: "test",
  listModels: async () => ["alpha", "beta"] as readonly string[],
};

test("lists models and marks the current one", async () => {
  const result = await runModelCommand({ ...base, name: undefined });
  assert.equal(result.selected, undefined);
  assert.match(result.text, /\* 1\. alpha/);
  assert.match(result.text, / {2}2\. beta/);
});

test("selects by number, by name, and by provider prefix", async () => {
  assert.equal(
    (await runModelCommand({ ...base, name: "2" })).selected,
    "beta",
  );
  assert.equal(
    (await runModelCommand({ ...base, name: "alpha" })).selected,
    "alpha",
  );
  assert.equal(
    (await runModelCommand({ ...base, name: "test/beta" })).selected,
    "beta",
  );
});

test("rejects unknown names and out-of-range numbers", async () => {
  for (const name of ["nope", "9", "0"]) {
    const result = await runModelCommand({ ...base, name });
    assert.equal(result.selected, undefined);
    assert.match(result.text, /Unknown model/);
  }
});

test("accepts any name when the provider cannot list models", async () => {
  const result = await runModelCommand({
    ...base,
    listModels: async () => undefined,
    name: "custom",
  });
  assert.equal(result.selected, "custom");
  assert.match(
    (
      await runModelCommand({
        ...base,
        listModels: async () => undefined,
        name: undefined,
      })
    ).text,
    /Use \/model <name> to switch\./,
  );
});

test("reports listing failures without blocking selection", async () => {
  const result = await runModelCommand({
    ...base,
    listModels: async () => {
      throw new Error("offline");
    },
    name: "custom",
  });
  assert.match(result.text, /Could not list models: offline/);
  assert.equal(result.selected, "custom");
});

test("parseWriteArguments extracts path and content and tolerates bad input", () => {
  assert.deepEqual(parseWriteArguments('{"filePath":"a.ts","content":"x"}'), {
    filePath: "a.ts",
    content: "x",
  });
  assert.equal(parseWriteArguments('{"filePath":"a"}'), undefined);
  assert.equal(parseWriteArguments("not json"), undefined);
  assert.equal(parseWriteArguments("null"), undefined);
});
