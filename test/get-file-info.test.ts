import assert from "node:assert/strict";
import { test } from "node:test";
import { getFileInfoTool } from "../src/index.js";
import { withWorkspace } from "./helpers/workspace.js";

test("reports kind, size, modified time and text content", async () => {
  await withWorkspace({ "src/a.ts": "export {};\n" }, async (root) => {
    const output = await getFileInfoTool(
      { path: "src/a.ts" },
      { workspaceRoot: root },
    );
    assert.match(output, /^Path: {6}src\/a\.ts$/m);
    assert.match(output, /^Kind: {6}file$/m);
    assert.match(output, /^Size: {6}11 bytes$/m);
    assert.match(output, /^Modified: {2}\d{4}-\d{2}-\d{2}T/m);
    assert.match(output, /^Content: {3}text$/m);
  });
});

test("classifies binary content", async () => {
  await withWorkspace(
    { "blob.bin": Buffer.from([0x00, 0x01, 0x02, 0x03]) },
    async (root) => {
      assert.match(
        await getFileInfoTool({ path: "blob.bin" }, { workspaceRoot: root }),
        /^Content: {3}binary$/m,
      );
    },
  );
});

test("a directory has no content classification", async () => {
  await withWorkspace({ "src/a.ts": "x" }, async (root) => {
    const output = await getFileInfoTool(
      { path: "src" },
      { workspaceRoot: root },
    );
    assert.match(output, /^Kind: {6}directory$/m);
    assert.doesNotMatch(output, /Content:/);
  });
});

test("a missing path fails", async () => {
  await withWorkspace({ "a.txt": "x" }, async (root) => {
    await assert.rejects(
      getFileInfoTool({ path: "nope.txt" }, { workspaceRoot: root }),
      /ENOENT|no such file/i,
    );
  });
});

test("sensitive files and escapes are denied", async () => {
  await withWorkspace({ ".env": "SECRET=1", "a.txt": "x" }, async (root) => {
    await assert.rejects(
      getFileInfoTool({ path: ".env" }, { workspaceRoot: root }),
      /sensitive/,
    );
    await assert.rejects(
      getFileInfoTool({ path: "../outside" }, { workspaceRoot: root }),
      /outside the project root|relative project paths/,
    );
  });
});
