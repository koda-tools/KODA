import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runCli } from "../src/cli/index.js";
import { formatInitResult } from "../src/cli/init/format.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "koda-init-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const isDir = async (target: string): Promise<boolean> =>
  (await stat(target).catch(() => undefined))?.isDirectory() === true;

test("formatInitResult lists created and existing folders", () => {
  const fresh = formatInitResult({
    root: "/p",
    created: [".koda/commands", ".koda/skills"],
    existing: [".koda/agents"],
  });
  assert.match(fresh, /Created  \.koda\/skills/);
  assert.match(fresh, /Exists   \.koda\/agents/);
  const again = formatInitResult({
    root: "/p",
    created: [],
    existing: [".koda/commands", ".koda/skills", ".koda/agents"],
  });
  assert.match(again, /Nothing to do/);
});

test("koda init runs without credentials or a terminal", async () => {
  await withTempDir(async (dir) => {
    let out = "";
    let err = "";
    const code = await runCli({
      argv: ["init"],
      cwd: dir,
      env: {},
      stdout: { write: (text: string) => ((out += text), true) },
      stderr: { write: (text: string) => ((err += text), true) },
    } as unknown as Parameters<typeof runCli>[0]);
    assert.equal(code, 0, err);
    assert.match(out, /Created  \.koda\/commands/);
    assert.ok(await isDir(path.join(dir, ".koda", "agents")));
  });
});

test("koda init exits non-zero when .koda is a file", async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, ".koda"), "x");
    let err = "";
    const code = await runCli({
      argv: ["init"],
      cwd: dir,
      env: {},
      stdout: { write: () => true },
      stderr: { write: (text: string) => ((err += text), true) },
    } as unknown as Parameters<typeof runCli>[0]);
    assert.notEqual(code, 0);
    assert.match(err, /not a directory/);
  });
});
