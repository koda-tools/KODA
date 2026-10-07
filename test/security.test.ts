import assert from "node:assert/strict";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileTool } from "../src/tools/file-system/read-file.tool.js";
import { writeFileTool } from "../src/tools/file-system/write-file.tool.js";
import { SecurityError, ToolError } from "../src/utils/errors.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-"));
  roots.push(root);
  return root;
}

test("reads an allowed file", async () => {
  const root = await temporaryRoot();
  await writeFile(path.join(root, "hello.txt"), "hello");
  assert.equal(
    await readFileTool({ filePath: "hello.txt" }, { workspaceRoot: root }),
    "hello",
  );
});

test("denies traversal, absolute, and sensitive paths", async () => {
  const root = await temporaryRoot();
  await writeFile(path.join(root, ".env"), "SECRET=yes");
  await assert.rejects(
    readFileTool({ filePath: "../outside.txt" }, { workspaceRoot: root }),
    SecurityError,
  );
  await assert.rejects(
    readFileTool(
      { filePath: path.resolve(root, "file.txt") },
      { workspaceRoot: root },
    ),
    SecurityError,
  );
  await assert.rejects(
    readFileTool({ filePath: ".env" }, { workspaceRoot: root }),
    SecurityError,
  );
});

test("denies symlinks escaping the workspace", async (context) => {
  const root = await temporaryRoot();
  const outside = await temporaryRoot();
  await writeFile(path.join(outside, "secret.txt"), "secret");
  try {
    await symlink(
      path.join(outside, "secret.txt"),
      path.join(root, "link.txt"),
      "file",
    );
  } catch (error: unknown) {
    context.skip(
      `Symlink creation unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return;
  }
  await assert.rejects(
    readFileTool({ filePath: "link.txt" }, { workspaceRoot: root }),
    SecurityError,
  );
});

test("denies oversized files and directories", async () => {
  const root = await temporaryRoot();
  await writeFile(path.join(root, "large.txt"), "12345");
  await mkdir(path.join(root, "folder"));
  await assert.rejects(
    readFileTool(
      { filePath: "large.txt" },
      { workspaceRoot: root, maxBytes: 4 },
    ),
    ToolError,
  );
  await assert.rejects(
    readFileTool({ filePath: "folder" }, { workspaceRoot: root }),
    ToolError,
  );
});

test("writes an allowed file and creates nested directories", async () => {
  const root = await temporaryRoot();
  const result = await writeFileTool(
    { filePath: "src/hello.py", content: "print('hello')" },
    { workspaceRoot: root },
  );
  assert.match(result, /Wrote/);
  const fileContent = await readFile(
    path.join(root, "src", "hello.py"),
    "utf8",
  );
  assert.equal(fileContent, "print('hello')");
});

test("denies writing to sensitive or traversal paths", async () => {
  const root = await temporaryRoot();
  await assert.rejects(
    writeFileTool(
      { filePath: "../outside.txt", content: "x" },
      { workspaceRoot: root },
    ),
    SecurityError,
  );
  await assert.rejects(
    writeFileTool({ filePath: ".env", content: "x" }, { workspaceRoot: root }),
    SecurityError,
  );
  await assert.rejects(
    writeFileTool(
      { filePath: path.resolve(root, "file.txt"), content: "x" },
      { workspaceRoot: root },
    ),
    SecurityError,
  );
});

test("denies overwriting directories with files", async () => {
  const root = await temporaryRoot();
  await mkdir(path.join(root, "folder"));
  await assert.rejects(
    writeFileTool(
      { filePath: "folder", content: "x" },
      { workspaceRoot: root },
    ),
    SecurityError,
  );
});

test("denies content larger than maxBytes", async () => {
  const root = await temporaryRoot();
  await assert.rejects(
    writeFileTool(
      { filePath: "big.txt", content: "12345" },
      { workspaceRoot: root, maxBytes: 4 },
    ),
    ToolError,
  );
});
