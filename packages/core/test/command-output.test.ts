import assert from "node:assert/strict";
import { test } from "node:test";
import { formatResult, truncate } from "../src/tools/command/output.js";
import type { CommandResult } from "../src/tools/command/types.js";

function result(over: Partial<CommandResult>): CommandResult {
  return {
    stdout: "",
    stderr: "",
    exitCode: 0,
    durationMs: 1000,
    timedOut: false,
    cancelled: false,
    ...over,
  };
}

test("short text is returned whole", () => {
  const { text, omitted } = truncate("hello\nworld\n", 1024);
  assert.equal(text, "hello\nworld\n");
  assert.equal(omitted, 0);
});

test("long text keeps head and tail with an omission note", () => {
  const body = Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n");
  const { text, omitted } = truncate(body, 512);
  assert.ok(omitted > 0);
  assert.match(text, /omitted/);
  assert.ok(text.startsWith("line 0"));
  assert.match(text, /line 499$/);
  assert.ok(Buffer.byteLength(text, "utf8") < Buffer.byteLength(body, "utf8"));
});

test("formats status, command and both streams", () => {
  const output = formatResult(
    "npm test",
    result({ stdout: "ok\n", stderr: "warn\n", exitCode: 0, durationMs: 2400 }),
  );
  assert.match(output, /^\$ npm test$/m);
  assert.match(output, /^exit 0 · 2\.4s$/m);
  assert.match(output, /--- stdout/);
  assert.match(output, /--- stderr/);
});

test("omits an empty stream section", () => {
  const output = formatResult("ls", result({ stdout: "a\n", stderr: "" }));
  assert.match(output, /--- stdout/);
  assert.doesNotMatch(output, /stderr/);
});

test("reports timeout and cancellation instead of an exit code", () => {
  assert.match(
    formatResult("sleep 10", result({ timedOut: true, durationMs: 120000 })),
    /timed out after 120\.0s/,
  );
  assert.match(
    formatResult("sleep 10", result({ cancelled: true })),
    /cancelled after/,
  );
});
