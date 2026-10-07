import assert from "node:assert/strict";
import { test } from "node:test";
import { expandShellBlocks } from "../src/cli/commands/shell.js";

const source = { path: "command.md", level: 1, kind: "markdown" as const };

test("denies shell blocks by default and executes approved output", async () => {
  await assert.rejects(
    expandShellBlocks("Result !`echo hello`", process.cwd(), source),
    /denied/,
  );
  const output = await expandShellBlocks(
    "Result !`echo hello`",
    process.cwd(),
    source,
    { approve: async () => true },
  );
  assert.match(output, /Result hello/);
});

test("does not execute when approval rejects", async () => {
  let approvals = 0;
  await assert.rejects(
    expandShellBlocks("!`echo no`", process.cwd(), source, {
      approve: async () => {
        approvals += 1;
        return false;
      },
    }),
  );
  assert.equal(approvals, 1);
});
