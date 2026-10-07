import assert from "node:assert/strict";
import { mkdir, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { listDirectoryTool } from "../src/index.js";
import { withWorkspace } from "./helpers/workspace.js";

const tree = {
  "package.json": "{}",
  "src/index.ts": "export {};",
  "src/core/agent.ts": "export {};",
  "src/core/deep/nested.ts": "export {};",
};

test("lists entries with directories marked and nesting indented", async () => {
  await withWorkspace(tree, async (root) => {
    const output = await listDirectoryTool({}, { workspaceRoot: root });
    assert.match(output, /^package\.json$/m);
    assert.match(output, /^src\/$/m);
    assert.match(output, /^ {2}index\.ts$/m);
  });
});

test("depth limits how far the walk descends", async () => {
  await withWorkspace(tree, async (root) => {
    const shallow = await listDirectoryTool(
      { depth: 1 },
      { workspaceRoot: root },
    );
    assert.match(shallow, /^src\/$/m);
    assert.doesNotMatch(shallow, /index\.ts/);
    const deep = await listDirectoryTool({ depth: 3 }, { workspaceRoot: root });
    assert.match(deep, /agent\.ts/);
  });
});

test("the registry ceiling caps the requested depth", async () => {
  await withWorkspace(tree, async (root) => {
    const capped = await listDirectoryTool(
      { depth: 3 },
      { workspaceRoot: root, maxDepth: 1 },
    );
    assert.doesNotMatch(capped, /index\.ts/);
    // Without a ceiling the default must not cap the request.
    const uncapped = await listDirectoryTool(
      { depth: 3 },
      { workspaceRoot: root },
    );
    assert.match(uncapped, /agent\.ts/);
  });
});

test("the entry limit truncates and says so", async () => {
  await withWorkspace(tree, async (root) => {
    const output = await listDirectoryTool(
      { limit: 2 },
      { workspaceRoot: root },
    );
    assert.equal(output.split("\n").length, 3);
    assert.match(output, /more entries truncated/);
  });
});

test("honors .gitignore and skips build and sensitive directories", async () => {
  await withWorkspace(
    {
      ".gitignore": "ignored.txt\n",
      "ignored.txt": "x",
      "kept.txt": "x",
      "node_modules/pkg/index.js": "x",
      ".git/config": "x",
      ".env": "SECRET=1",
    },
    async (root) => {
      const output = await listDirectoryTool(
        { includeHidden: true },
        { workspaceRoot: root },
      );
      assert.match(output, /kept\.txt/);
      assert.doesNotMatch(output, /ignored\.txt/);
      assert.doesNotMatch(output, /node_modules/);
      assert.doesNotMatch(output, /\.git\b/);
      assert.doesNotMatch(output, /\.env/);
    },
  );
});

test("hidden entries appear only when requested", async () => {
  await withWorkspace({ ".hidden": "x", "visible.txt": "x" }, async (root) => {
    assert.doesNotMatch(
      await listDirectoryTool({}, { workspaceRoot: root }),
      /\.hidden/,
    );
    assert.match(
      await listDirectoryTool({ includeHidden: true }, { workspaceRoot: root }),
      /\.hidden/,
    );
  });
});

test("skips symlinks that point outside the workspace", async () => {
  await withWorkspace({ "inside.txt": "x" }, async (root) => {
    const outside = await mkdir(path.join(os.tmpdir(), "koda-outside-"), {
      recursive: true,
    });
    const target = outside ?? os.tmpdir();
    await symlink(target, path.join(root, "escape"), "dir").catch(
      () => undefined,
    );
    const output = await listDirectoryTool({}, { workspaceRoot: root });
    assert.match(output, /inside\.txt/);
    assert.doesNotMatch(output, /escape/);
  });
});

test("an empty directory reports it plainly", async () => {
  await withWorkspace({}, async (root) => {
    assert.equal(await listDirectoryTool({}, { workspaceRoot: root }), "(empty)");
  });
});

test("rejects paths outside the workspace", async () => {
  await withWorkspace({ "a.txt": "x" }, async (root) => {
    await assert.rejects(
      listDirectoryTool({ path: "../.." }, { workspaceRoot: root }),
      /outside the project root|relative project paths/,
    );
  });
});
