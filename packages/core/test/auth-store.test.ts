import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  authFilePath,
  credentialSource,
  readAuth,
  removeApiKey,
  saveApiKey,
  withStoredCredentials,
} from "../src/providers/index.js";

async function tempFile(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-auth-"));
  return authFilePath(path.join(root, "nested", "koda"));
}

test("a missing auth file means no credentials", async () => {
  assert.deepEqual(await readAuth(await tempFile()), { providers: {} });
});

test("saves keys, creating folders, and the first one becomes the default", async () => {
  const file = await tempFile();
  await saveApiKey(file, "anthropic", "  sk-ant  ");
  const auth = await saveApiKey(file, "openai", "sk-oa");
  assert.equal(auth.default, "anthropic");
  assert.deepEqual(await readAuth(file), {
    default: "anthropic",
    providers: {
      anthropic: { type: "api", key: "sk-ant" },
      openai: { type: "api", key: "sk-oa" },
    },
  });
  if (process.platform !== "win32")
    assert.equal((await stat(file)).mode & 0o777, 0o600);
});

test("rejects an empty key", async () => {
  await assert.rejects(saveApiKey(await tempFile(), "openai", "   "), /empty/);
});

test("removing the default provider clears the default", async () => {
  const file = await tempFile();
  await saveApiKey(file, "openai", "a");
  await saveApiKey(file, "gemini", "b");
  assert.deepEqual(await removeApiKey(file, "openai"), {
    providers: { gemini: { type: "api", key: "b" } },
  });
});

test("ignores unknown providers and blank keys, rejects broken JSON", async () => {
  const file = await tempFile();
  await saveApiKey(file, "openai", "x");
  await writeFile(
    file,
    JSON.stringify({
      default: "nope",
      providers: {
        other: { type: "api", key: "k" },
        gemini: { type: "api", key: " " },
        anthropic: { type: "api", key: "ok" },
      },
    }),
  );
  assert.deepEqual(await readAuth(file), {
    providers: { anthropic: { type: "api", key: "ok" } },
  });
  await writeFile(file, "{");
  await assert.rejects(readAuth(file), /not valid JSON/);
});

test("the saved file never leaks into other fields", async () => {
  const file = await tempFile();
  await saveApiKey(file, "openai", "secret-key");
  const raw = await readFile(file, "utf8");
  assert.equal(raw.match(/secret-key/g)?.length, 1);
});

test("real environment variables win over stored credentials", () => {
  const auth = {
    default: "anthropic",
    providers: {
      openai: { type: "api", key: "stored-oa" },
      anthropic: { type: "api", key: "stored-ant" },
    },
  } as const;
  const env = withStoredCredentials(
    { OPENAI_API_KEY: "env-oa", ANTHROPIC_API_KEY: "  " },
    auth,
  );
  assert.equal(env.OPENAI_API_KEY, "env-oa");
  assert.equal(env.ANTHROPIC_API_KEY, "stored-ant");
  assert.equal(env.KODA_PROVIDER, "anthropic");
  assert.equal(
    withStoredCredentials({ KODA_PROVIDER: "gemini" }, auth).KODA_PROVIDER,
    "gemini",
  );
  assert.equal(credentialSource("openai", env, auth), "environment");
  assert.equal(credentialSource("anthropic", env, auth), "saved");
  assert.equal(credentialSource("gemini", env, auth), "none");
});
