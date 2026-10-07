import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  READ_FILE_DEFINITION,
  WRITE_FILE_DEFINITION,
  ToolRegistry,
  type WriteConfirmation,
} from "../src/tools/registry.js";

test("publishes and executes readFile", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-registry-"));
  try {
    await writeFile(path.join(root, "project.txt"), "Koda");
    const registry = new ToolRegistry({ workspaceRoot: root });
    assert.equal(registry.definitions[0], READ_FILE_DEFINITION);
    assert.deepEqual(
      await registry.execute("readFile", '{"filePath":"project.txt"}'),
      { ok: true, content: "Koda" },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("returns sanitized observations for invalid calls", async () => {
  const registry = new ToolRegistry({ workspaceRoot: process.cwd() });
  assert.equal((await registry.execute("missing", "{}")).ok, false);
  assert.match(
    (await registry.execute("readFile", "{oops")).content,
    /^Tool error:/,
  );
  assert.match(
    (await registry.execute("readFile", '{"filePath":"","extra":true}'))
      .content,
    /^Tool error:/,
  );
});

test("publishes readFile and writeFile definitions", () => {
  const registry = new ToolRegistry({ workspaceRoot: process.cwd() });
  assert.equal(registry.definitions[0], READ_FILE_DEFINITION);
  assert.equal(registry.definitions[1], WRITE_FILE_DEFINITION);
});

test("executes writeFile when approved", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-registry-"));
  try {
    const registry = new ToolRegistry({
      workspaceRoot: root,
      writePolicy: { confirm: async () => true },
    });
    const result = await registry.execute(
      "writeFile",
      '{"filePath":"hello.py","content":"print(1)"}',
    );
    assert.equal(result.ok, true);
    assert.match(result.content, /Wrote/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("supplies the previous content to confirmation before writing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-registry-"));
  try {
    await writeFile(path.join(root, "app.ts"), "const a = 1;\n");
    const seen: WriteConfirmation[] = [];
    const registry = new ToolRegistry({
      workspaceRoot: root,
      writePolicy: {
        confirm: async (request) => {
          seen.push(request);
          return true;
        },
      },
    });
    const result = await registry.execute(
      "writeFile",
      '{"filePath":"app.ts","content":"const a = 2;\\n"}',
    );
    assert.equal(result.ok, true);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.before, "const a = 1;\n");
    assert.equal(seen[0]?.after, "const a = 2;\n");
    assert.equal(seen[0]?.skipped, undefined);
    assert.match(result.content, /\(\+1 -1\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("marks a new file with an undefined previous content", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-registry-"));
  try {
    const seen: WriteConfirmation[] = [];
    const registry = new ToolRegistry({
      workspaceRoot: root,
      writePolicy: {
        confirm: async (request) => {
          seen.push(request);
          return true;
        },
      },
    });
    const result = await registry.execute(
      "writeFile",
      '{"filePath":"fresh.ts","content":"export const x = 1;\\n"}',
    );
    assert.equal(result.ok, true);
    assert.equal(seen[0]?.before, undefined);
    assert.doesNotMatch(result.content, /\(\+/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("skips the diff for an oversized previous file", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-registry-"));
  try {
    await writeFile(path.join(root, "big.txt"), "0123456789");
    const seen: WriteConfirmation[] = [];
    const registry = new ToolRegistry({
      workspaceRoot: root,
      maxFileBytes: 4,
      writePolicy: {
        confirm: async (request) => {
          seen.push(request);
          return false;
        },
      },
    });
    const result = await registry.execute(
      "writeFile",
      '{"filePath":"big.txt","content":"new"}',
    );
    assert.equal(result.ok, false);
    assert.equal(seen[0]?.before, undefined);
    assert.equal(seen[0]?.skipped, "too-large");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("denies writeFile without altering the file when rejected", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-registry-"));
  try {
    await writeFile(path.join(root, "keep.txt"), "original\n");
    const registry = new ToolRegistry({
      workspaceRoot: root,
      writePolicy: { confirm: async () => false },
    });
    const denied = await registry.execute(
      "writeFile",
      '{"filePath":"keep.txt","content":"changed\\n"}',
    );
    assert.equal(denied.ok, false);
    assert.match(denied.content, /denied by user/);
    assert.equal(
      await readFile(path.join(root, "keep.txt"), "utf8"),
      "original\n",
    );

    const unconfigured = new ToolRegistry({ workspaceRoot: root });
    const noPolicy = await unconfigured.execute(
      "writeFile",
      '{"filePath":"keep.txt","content":"print(1)"}',
    );
    assert.equal(noPolicy.ok, false);
    assert.match(noPolicy.content, /approval policy/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("never reads blocked paths for the diff", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-registry-"));
  try {
    let called = false;
    const registry = new ToolRegistry({
      workspaceRoot: root,
      writePolicy: {
        confirm: async () => {
          called = true;
          return true;
        },
      },
    });
    for (const filePath of ["../escape.txt", ".env", ".git/config"]) {
      const result = await registry.execute(
        "writeFile",
        JSON.stringify({ filePath, content: "x" }),
      );
      assert.equal(result.ok, false);
      assert.match(result.content, /Tool error:/);
    }
    assert.equal(called, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
