import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  McpManager,
  formatMcpStatus,
  loadMcpConfig,
  mcpToolName,
  toObservation,
} from "../src/mcp/index.js";

const FIXTURE = path.resolve("test/fixtures/mcp-server.mjs");

async function workspace(files: Record<string, unknown>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-mcp-"));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(content));
  }
  return root;
}

const local = (extra: Record<string, unknown> = {}) => ({
  type: "local",
  command: ["node", FIXTURE],
  ...extra,
});

test("reads local and remote servers, expanding {env:NAME}", async () => {
  const root = await workspace({
    "opencode.json": {
      mcp: {
        fs: local({ environment: { TOKEN: "{env:SECRET}" } }),
        api: {
          type: "remote",
          url: "https://example.com/mcp",
          headers: { Authorization: "Bearer {env:SECRET}" },
          timeout: 1000,
        },
      },
    },
  });
  const config = await loadMcpConfig({
    workspaceRoot: root,
    env: { SECRET: "s3" },
  });
  assert.deepEqual(config.diagnostics, []);
  assert.deepEqual(config.servers.get("fs"), {
    type: "local",
    command: ["node", FIXTURE],
    environment: { TOKEN: "s3" },
    enabled: true,
    timeout: 30000,
  });
  assert.deepEqual(config.servers.get("api"), {
    type: "remote",
    url: "https://example.com/mcp",
    headers: { Authorization: "Bearer s3" },
    enabled: true,
    timeout: 1000,
  });
});

test("koda.json beats opencode.json, and enabled:false switches a server off", async () => {
  const root = await workspace({
    "opencode.json": { mcp: { a: local(), b: local() } },
    ".koda/koda.json": {
      mcp: { a: local({ timeout: 5 }), b: { enabled: false } },
    },
  });
  const { servers } = await loadMcpConfig({ workspaceRoot: root, env: {} });
  assert.equal(servers.get("a")?.timeout, 5);
  assert.equal(servers.get("b")?.enabled, false);
  assert.equal(servers.get("b")?.type, "local");
});

test("invalid entries become diagnostics and the rest still load", async () => {
  const root = await workspace({
    "koda.json": {
      mcp: {
        ok: local(),
        "bad name": local(),
        nocmd: { type: "local", command: [] },
        badurl: { type: "remote", url: "ftp://x" },
        notype: { url: "https://x" },
      },
    },
  });
  const { servers, diagnostics } = await loadMcpConfig({
    workspaceRoot: root,
    env: {},
  });
  const text = diagnostics.join("\n");
  assert.deepEqual([...servers.keys()], ["ok"]);
  assert.equal(diagnostics.length, 4);
  assert.match(text, /invalid server name/);
  assert.match(text, /command must be a non-empty array/);
  assert.match(text, /http or https/);
  assert.match(text, /type must be "local" or "remote"/);
});

test("tool names are provider-safe", () => {
  assert.equal(mcpToolName("git hub", "list.issues"), "git_hub_list_issues");
  assert.equal(mcpToolName("s", "x".repeat(100)).length, 64);
});

test("results become observations", () => {
  assert.deepEqual(
    toObservation({
      content: [
        { type: "text", text: "a" },
        { type: "image", mimeType: "image/png", data: "..." },
        { type: "resource", resource: { uri: "file:///x", text: "body" } },
      ],
    }),
    { ok: true, content: "a\n[image: image/png]\nbody" },
  );
  assert.deepEqual(
    toObservation({ isError: true, content: [{ type: "text", text: "no" }] }),
    { ok: false, content: "Tool error: no" },
  );
  assert.deepEqual(toObservation({ content: [] }), {
    ok: true,
    content: "(no output)",
  });
  const long = toObservation({
    content: [{ type: "text", text: "x".repeat(60_000) }],
  });
  assert.ok(long.content.endsWith("[output truncated]"));
});

test("connects to a real stdio server and calls its tools", async () => {
  const root = await workspace({
    "koda.json": {
      mcp: {
        fx: local({ environment: { FIXTURE_VAR: "hello" } }),
        broken: {
          type: "local",
          command: ["node", "does-not-exist.mjs"],
          timeout: 5000,
        },
        off: local({ enabled: false }),
      },
    },
  });
  const config = await loadMcpConfig({ workspaceRoot: root, env: {} });
  const manager = new McpManager(config, { cwd: root, env: {} });
  try {
    assert.equal(
      manager.status().find((s) => s.name === "fx")?.state,
      "connecting",
    );
    await manager.start();

    const status = Object.fromEntries(manager.status().map((s) => [s.name, s]));
    assert.equal(status.fx?.state, "connected");
    assert.equal(status.fx?.tools, 3);
    assert.equal(status.broken?.state, "failed");
    assert.ok(status.broken?.error);
    assert.equal(status.off?.state, "disabled");

    const tools = new Map(manager.tools().map((t) => [t.definition.name, t]));
    assert.deepEqual([...tools.keys()].sort(), [
      "fx_echo",
      "fx_env",
      "fx_fail",
    ]);
    const echo = tools.get("fx_echo");
    assert.equal(echo?.permission?.key, "mcp");
    assert.match(echo?.definition.description ?? "", /^\[MCP fx\] Echo/);
    assert.deepEqual(await echo?.execute({ text: "hi" }, undefined), {
      ok: true,
      content: "echo: hi",
    });
    assert.deepEqual(await tools.get("fx_fail")?.execute({}, undefined), {
      ok: false,
      content: "Tool error: boom",
    });
    const fromEnv = await tools
      .get("fx_env")
      ?.execute({ name: "FIXTURE_VAR" }, undefined);
    assert.equal(fromEnv?.content, "hello");

    const listing = formatMcpStatus(manager);
    assert.match(listing, /✓ fx\s+local\s+connected\s+3 tools/);
    assert.match(listing, /✗ broken\s+local\s+failed/);
    assert.match(listing, /- off\s+local\s+disabled/);
  } finally {
    await manager.close();
  }
});

test("the session's secrets are not passed to a local server", async () => {
  const root = await workspace({ "koda.json": { mcp: { fx: local() } } });
  process.env.KODA_TEST_SECRET = "leak";
  const manager = new McpManager(
    await loadMcpConfig({ workspaceRoot: root, env: {} }),
    { cwd: root, env: { KODA_TEST_SECRET: "leak" } },
  );
  try {
    await manager.start();
    const tool = manager.tools().find((t) => t.definition.name === "fx_env");
    const result = await tool?.execute({ name: "KODA_TEST_SECRET" }, undefined);
    assert.equal(result?.content, "unset");
  } finally {
    await manager.close();
    delete process.env.KODA_TEST_SECRET;
  }
});

test("with no servers the listing explains how to add one", async () => {
  const manager = new McpManager(
    { servers: new Map(), diagnostics: ["x: bad"] },
    { cwd: ".", env: {} },
  );
  await manager.start();
  assert.match(
    formatMcpStatus(manager),
    /No MCP servers configured[\s\S]*Warning: x: bad/,
  );
});
