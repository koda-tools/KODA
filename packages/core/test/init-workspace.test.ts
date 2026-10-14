import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { initWorkspace } from "../src/init/index.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "koda-init-core-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const isDir = async (target: string): Promise<boolean> =>
  (await stat(target).catch(() => undefined))?.isDirectory() === true;

test("initWorkspace creates the three .koda folders in a fresh project", async () => {
  await withTempDir(async (dir) => {
    const result = await initWorkspace(dir);
    assert.equal(result.root, dir);
    assert.deepEqual(result.created, [
      ".koda/commands",
      ".koda/skills",
      ".koda/agents",
    ]);
    assert.deepEqual(result.existing, []);
    for (const name of ["commands", "skills", "agents"])
      assert.ok(await isDir(path.join(dir, ".koda", name)), name);
  });
});

test("initWorkspace is idempotent and never touches existing files", async () => {
  await withTempDir(async (dir) => {
    const skills = path.join(dir, ".koda", "skills");
    await mkdir(skills, { recursive: true });
    const file = path.join(skills, "keep.md");
    await writeFile(file, "mine");
    const result = await initWorkspace(dir);
    assert.deepEqual(result.existing, [".koda/skills"]);
    assert.deepEqual(result.created, [".koda/commands", ".koda/agents"]);
    assert.equal(await readFile(file, "utf8"), "mine");
    const again = await initWorkspace(dir);
    assert.deepEqual(again.created, []);
    assert.equal(again.existing.length, 3);
  });
});

test("initWorkspace fails clearly when .koda is a file", async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, ".koda"), "x");
    await assert.rejects(initWorkspace(dir), /not a directory/);
    assert.equal(await isDir(path.join(dir, ".koda")), false);
  });
});
