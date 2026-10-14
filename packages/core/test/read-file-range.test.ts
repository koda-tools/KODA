import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileTool } from "../src/index.js";
import { withWorkspace } from "./helpers/workspace.js";

const content = "one\ntwo\nthree\nfour\nfive\n";

test("without a range the content is returned unchanged", async () => {
  await withWorkspace({ "a.txt": content }, async (root) => {
    assert.equal(
      await readFileTool({ filePath: "a.txt" }, { workspaceRoot: root }),
      content,
    );
  });
});

test("a range returns only those lines behind a header", async () => {
  await withWorkspace({ "a.txt": content }, async (root) => {
    const output = await readFileTool(
      { filePath: "a.txt", startLine: 2, endLine: 4 },
      { workspaceRoot: root },
    );
    assert.equal(output, "a.txt (lines 2-4 of 6)\ntwo\nthree\nfour");
  });
});

test("each bound defaults to the start or the end of the file", async () => {
  await withWorkspace({ "a.txt": content }, async (root) => {
    const fromThird = await readFileTool(
      { filePath: "a.txt", startLine: 3 },
      { workspaceRoot: root },
    );
    assert.match(fromThird, /^a\.txt \(lines 3-6 of 6\)\nthree\n/);
    const untilSecond = await readFileTool(
      { filePath: "a.txt", endLine: 2 },
      { workspaceRoot: root },
    );
    assert.equal(untilSecond, "a.txt (lines 1-2 of 6)\none\ntwo");
  });
});

test("an endLine past the file is clamped", async () => {
  await withWorkspace({ "a.txt": content }, async (root) => {
    assert.match(
      await readFileTool(
        { filePath: "a.txt", startLine: 5, endLine: 999 },
        { workspaceRoot: root },
      ),
      /^a\.txt \(lines 5-6 of 6\)/,
    );
  });
});

test("invalid ranges are rejected", async () => {
  await withWorkspace({ "a.txt": content }, async (root) => {
    const options = { workspaceRoot: root };
    await assert.rejects(
      readFileTool({ filePath: "a.txt", startLine: 0 }, options),
      /startLine must be a positive integer/,
    );
    await assert.rejects(
      readFileTool({ filePath: "a.txt", startLine: 1.5 }, options),
      /startLine must be a positive integer/,
    );
    await assert.rejects(
      readFileTool({ filePath: "a.txt", startLine: 4, endLine: 2 }, options),
      /endLine must be greater than or equal to startLine/,
    );
    await assert.rejects(
      readFileTool({ filePath: "a.txt", startLine: 99 }, options),
      /beyond the file/,
    );
  });
});
