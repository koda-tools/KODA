import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runKoda } from "../src/cli/entry.js";
import { loadConnection, readProjectProvider } from "@koda-tools/core";

class Sink {
  value = "";
  write(chunk: string): boolean {
    this.value += chunk;
    return true;
  }
}

test("version and help do not load the agent", async () => {
  for (const option of ["--version", "--help"]) {
    const stdout = new Sink();
    const stderr = new Sink();
    const code = await runKoda({
      argv: [option],
      env: {},
      cwd: process.cwd(),
      stdout,
      stderr,
    });
    assert.equal(code, 0, stderr.value);
    assert.notEqual(stdout.value, "");
  }
});

test("init selects a project provider without overwriting commands", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "koda-structured-"));
  try {
    const stdout = new Sink();
    const stderr = new Sink();
    const base = { cwd: dir, env: {}, stdout, stderr };
    assert.equal(
      await runKoda({ ...base, argv: ["init", "--provider=openai"] }),
      0,
      stderr.value,
    );
    const file = path.join(dir, ".koda", "koda.json");
    await writeFile(
      file,
      '{\n  // keep this\n  "commands": {"review": {"template": "Review"}}\n}\n',
    );
    assert.equal(
      await runKoda({ ...base, argv: ["init", "--provider=anthropic"] }),
      0,
      stderr.value,
    );
    assert.equal(await readProjectProvider(dir), "anthropic");
    assert.match(await readFile(file, "utf8"), /keep this/);
    assert.match(await readFile(file, "utf8"), /review/);
    assert.equal(
      await runKoda({ ...base, argv: ["init", "--provider=invalid"] }),
      2,
    );
    assert.equal(await readProjectProvider(dir), "anthropic");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("connect --token-stdin saves credentials without printing the secret", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "koda-structured-"));
  try {
    const stdout = new Sink();
    const stderr = new Sink();
    const secret = "test-secret-never-print";
    const code = await runKoda({
      argv: ["connect", "openai", "--token-stdin"],
      cwd: dir,
      configRoot: dir,
      env: {},
      stdout,
      stderr,
      stdin: Readable.from([`${secret}\n`]),
    });
    assert.equal(code, 0, stderr.value);
    assert.doesNotMatch(stdout.value + stderr.value, /test-secret-never-print/);
    const connection = await loadConnection({ env: {}, configRoot: dir });
    assert.equal(connection.env.OPENAI_API_KEY, secret);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
