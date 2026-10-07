import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { loadIgnores } from "../src/utils/gitignore.js";
import { withWorkspace } from "./helpers/workspace.js";

test("ignores comments and blank lines", async () => {
  await withWorkspace({ ".gitignore": "# a comment\n\n*.log\n" }, async (root) => {
    const ignore = await loadIgnores(root, root);
    assert.equal(ignore.isIgnored("debug.log", false), true);
    assert.equal(ignore.isIgnored("debug.txt", false), false);
  });
});

test("negation reintroduces a previously ignored path", async () => {
  await withWorkspace(
    { ".gitignore": "*.log\n!keep.log\n" },
    async (root) => {
      const ignore = await loadIgnores(root, root);
      assert.equal(ignore.isIgnored("drop.log", false), true);
      assert.equal(ignore.isIgnored("keep.log", false), false);
    },
  );
});

test("a trailing slash matches directories only", async () => {
  await withWorkspace({ ".gitignore": "build/\n" }, async (root) => {
    const ignore = await loadIgnores(root, root);
    assert.equal(ignore.isIgnored("build", true), true);
    assert.equal(ignore.isIgnored("build", false), false);
  });
});

test("a leading slash anchors to the gitignore directory", async () => {
  await withWorkspace({ ".gitignore": "/root.txt\n" }, async (root) => {
    const ignore = await loadIgnores(root, root);
    assert.equal(ignore.isIgnored("root.txt", false), true);
    assert.equal(ignore.isIgnored("nested/root.txt", false), false);
  });
});

test("double star matches across directories", async () => {
  await withWorkspace({ ".gitignore": "**/generated/*.ts\n" }, async (root) => {
    const ignore = await loadIgnores(root, root);
    assert.equal(ignore.isIgnored("generated/a.ts", false), true);
    assert.equal(ignore.isIgnored("src/generated/a.ts", false), true);
    assert.equal(ignore.isIgnored("src/a.ts", false), false);
  });
});

test("a nested gitignore overrides the parent", async () => {
  await withWorkspace(
    {
      ".gitignore": "*.log\n",
      "src/.gitignore": "!important.log\n",
      "src/important.log": "",
    },
    async (root) => {
      const ignore = await loadIgnores(root, path.join(root, "src"));
      assert.equal(ignore.isIgnored("src/important.log", false), false);
      assert.equal(ignore.isIgnored("src/other.log", false), true);
    },
  );
});

test("no gitignore ignores nothing", async () => {
  await withWorkspace({ "a.txt": "" }, async (root) => {
    const ignore = await loadIgnores(root, root);
    assert.equal(ignore.isIgnored("a.txt", false), false);
  });
});
