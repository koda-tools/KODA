import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  bootstrapKoda,
  globalRoots,
  loadConnection,
  type BootstrapPolicies,
} from "../src/bootstrap/index.js";
import { ProviderError } from "../src/utils/errors.js";
import { saveApiKey } from "../src/providers/index.js";
import { initWorkspace } from "../src/init/index.js";
import { saveProjectProvider } from "../src/bootstrap/project-provider.js";

const offlineFetch = (async () => {
  throw new TypeError("fetch failed");
}) as typeof globalThis.fetch;

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "koda-bootstrap-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Collects anything written to the process terminal while `run` is going. */
async function captureTerminal(run: () => Promise<void>): Promise<string> {
  let written = "";
  const out = process.stdout.write;
  const err = process.stderr.write;
  const spy = ((chunk: string | Uint8Array) => {
    written += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  process.stdout.write = spy;
  process.stderr.write = spy;
  try {
    await run();
  } finally {
    process.stdout.write = out;
    process.stderr.write = err;
  }
  return written;
}

test("globalRoots honors a config root and defaults to ~/.config", () => {
  assert.equal(globalRoots("/tmp/x").globalKodaRoot, "/tmp/x");
  assert.equal(
    globalRoots().globalKodaRoot,
    path.join(os.homedir(), ".config", "koda"),
  );
});

test("loadConnection merges stored credentials; real variables win", async () => {
  await withTempDir(async (config) => {
    const first = await loadConnection({ env: {}, configRoot: config });
    await saveApiKey(first.authFile, "openai", "sk-saved");
    const saved = await loadConnection({ env: {}, configRoot: config });
    assert.equal(saved.env["OPENAI_API_KEY"], "sk-saved");
    const real = await loadConnection({
      env: { OPENAI_API_KEY: "sk-real" },
      configRoot: config,
    });
    assert.equal(real.env["OPENAI_API_KEY"], "sk-real");
  });
});

test("project provider overrides stored default but not an explicit environment choice", async () => {
  await withTempDir(async (config) => {
    await initWorkspace(config);
    await saveProjectProvider(config, "anthropic");
    const first = await loadConnection({ env: {}, configRoot: config });
    await saveApiKey(first.authFile, "openai", "sk-openai");
    await saveApiKey(first.authFile, "anthropic", "sk-anthropic");
    const project = await bootstrapKoda({
      cwd: config,
      connection: await loadConnection({ env: {}, configRoot: config }),
      configRoot: config,
      fetch: offlineFetch,
    });
    assert.equal(project.identity.provider, "anthropic");
    await project.close();
    const explicit = await bootstrapKoda({
      cwd: config,
      connection: await loadConnection({
        env: { KODA_PROVIDER: "openai" },
        configRoot: config,
      }),
      configRoot: config,
      fetch: offlineFetch,
    });
    assert.equal(explicit.identity.provider, "openai");
    await explicit.close();
    const opencode = await bootstrapKoda({
      cwd: config,
      connection: await loadConnection({
        env: { OPENCODE_PROVIDER: "anthropic" },
        configRoot: config,
      }),
      configRoot: config,
      fetch: offlineFetch,
    });
    assert.equal(opencode.identity.provider, "anthropic");
    await opencode.close();
  });
});

test("a missing key fails before the policy factory runs", async () => {
  await withTempDir(async (config) => {
    let called = false;
    const connection = await loadConnection({ env: {}, configRoot: config });
    await assert.rejects(
      bootstrapKoda({
        cwd: config,
        connection,
        configRoot: config,
        fetch: offlineFetch,
        policies: () => {
          called = true;
          return {};
        },
      }),
      (error: unknown) =>
        error instanceof ProviderError && /OPENAI_API_KEY/.test(error.message),
    );
    assert.equal(called, false);
  });
});

test("bootstrap builds the runtime without touching the terminal", async () => {
  await withTempDir(async (config) => {
    const connection = await loadConnection({
      env: { OPENAI_API_KEY: "sk-test" },
      configRoot: config,
    });
    let calls = 0;
    const policies: BootstrapPolicies = {
      approve: async () => true,
    };
    const written = await captureTerminal(async () => {
      const koda = await bootstrapKoda({
        cwd: config,
        connection,
        configRoot: config,
        fetch: offlineFetch,
        policies: async () => {
          calls += 1;
          return policies;
        },
      });
      assert.equal(koda.identity.provider, "openai");
      assert.ok(koda.agents.defaultAgent().name.length > 0);
      assert.deepEqual(koda.catalog.diagnostics, []);
      assert.ok(koda.createAgent());
      assert.equal(koda.roots.globalKodaRoot, config);
      await koda.close();
    });
    assert.equal(calls, 1);
    assert.equal(written, "");
  });
});

test("policies can be passed as a plain object", async () => {
  await withTempDir(async (config) => {
    const connection = await loadConnection({
      env: { OPENAI_API_KEY: "sk-test" },
      configRoot: config,
    });
    const koda = await bootstrapKoda({
      cwd: config,
      connection,
      configRoot: config,
      fetch: offlineFetch,
      policies: { approve: async () => false },
    });
    assert.ok(koda.agents);
    await koda.close();
  });
});
