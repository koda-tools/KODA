import assert from "node:assert/strict";
import { test } from "node:test";
import { runCli } from "../src/cli/index.js";

class Sink {
  public value = "";
  public write(chunk: string | Uint8Array): boolean {
    this.value += chunk.toString();
    return true;
  }
}

test("rejects a missing prompt", async () => {
  const stdout = new Sink();
  const stderr = new Sink();
  const code = await runCli({
    argv: [],
    env: {},
    cwd: process.cwd(),
    stdout,
    stderr,
  });
  assert.equal(code, 2);
  assert.match(stderr.value, /Usage/);
});

test("rejects a missing API key without exposing credentials", async () => {
  const stdout = new Sink();
  const stderr = new Sink();
  const code = await runCli({
    argv: ["read package.json"],
    env: {},
    cwd: process.cwd(),
    stdout,
    stderr,
  });
  assert.equal(code, 2);
  assert.match(stderr.value, /OPENAI_API_KEY/);
  assert.equal(stdout.value, "");
});
