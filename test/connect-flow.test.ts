import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runConnect } from "../src/cli/connect/flow.js";
import type { ConnectUI } from "../src/cli/connect/types.js";
import { authFilePath, readAuth, saveApiKey } from "../src/providers/index.js";

async function setup(answers: { choice?: number; key?: string }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-connect-"));
  const authFile = authFilePath(root);
  const env: NodeJS.ProcessEnv = {};
  const output: string[] = [];
  const selects: string[][] = [];
  const ui: ConnectUI = {
    write: (text) => output.push(text),
    select: async (_title, options) => {
      selects.push([...options]);
      return answers.choice;
    },
    secret: async () => answers.key,
  };
  return { authFile, env, output, selects, ui, settings: { authFile, env } };
}

test("saves the key of the chosen provider and updates the environment", async () => {
  const t = await setup({ choice: 1, key: " sk-ant " });
  assert.equal(await runConnect(t.ui, t.settings), true);
  assert.equal(t.env.ANTHROPIC_API_KEY, "sk-ant");
  const auth = await readAuth(t.authFile);
  assert.equal(auth.providers.anthropic?.key, "sk-ant");
  assert.equal(auth.default, "anthropic");
  assert.ok(!t.output.join("").includes("sk-ant"));
  assert.match(t.output.join(""), /default provider/);
});

test("lists connection status next to each provider", async () => {
  const t = await setup({});
  await saveApiKey(t.authFile, "openai", "k");
  t.env.OPENAI_API_KEY = "k";
  t.env.GEMINI_API_KEY = "other";
  await runConnect(t.ui, t.settings);
  const [labels] = t.selects;
  assert.match(labels?.[0] ?? "", /^openai\s+✓ connected$/);
  assert.match(labels?.[1] ?? "", /^anthropic\s+not connected$/);
  assert.match(labels?.[2] ?? "", /^gemini\s+✓ from environment$/);
  assert.equal(labels?.length, 3);
});

test("a second provider is saved but does not replace the default", async () => {
  const t = await setup({ choice: 2, key: "g" });
  await saveApiKey(t.authFile, "openai", "k");
  await runConnect(t.ui, t.settings);
  assert.equal((await readAuth(t.authFile)).default, "openai");
  assert.match(t.output.join(""), /KODA_PROVIDER=gemini/);
});

test("cancelling saves nothing", async () => {
  const none = await setup({});
  assert.equal(await runConnect(none.ui, none.settings), false);
  const blank = await setup({ choice: 0, key: "  " });
  assert.equal(await runConnect(blank.ui, blank.settings), false);
  assert.deepEqual(await readAuth(blank.authFile), { providers: {} });
  assert.match(blank.output.join(""), /Nothing saved/);
});

test("takes the provider from the argument, without listing", async () => {
  const t = await setup({ key: "k" });
  await runConnect(t.ui, t.settings, "Gemini");
  assert.equal(t.selects.length, 0);
  assert.equal(t.env.GEMINI_API_KEY, "k");
});

test("rejects unknown and keyless providers", async () => {
  const t = await setup({ key: "k" });
  assert.equal(await runConnect(t.ui, t.settings, "ollama"), false);
  assert.match(t.output.join(""), /Unknown provider 'ollama'/);
  assert.deepEqual(await readAuth(t.authFile), { providers: {} });
});
