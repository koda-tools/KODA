import assert from "node:assert/strict";
import { test } from "node:test";
import { searchFilesTool } from "../src/index.js";
import { withWorkspace } from "./helpers/workspace.js";

const files = {
  "src/a.ts": "export const name = 'alpha';\nconst other = 1;\n",
  "src/b.ts": "export const name = 'beta';\n",
  "docs/readme.md": "The name is documented.\n",
};

test("finds literal text with path, line and column", async () => {
  await withWorkspace(files, async (root) => {
    const output = await searchFilesTool(
      { query: "name" },
      { workspaceRoot: root },
    );
    assert.match(output, /src\/a\.ts:1:14 {2}export const name/);
    assert.match(output, /src\/b\.ts:1:14/);
    assert.match(output, /docs\/readme\.md:1:5/);
  });
});

test("matches a regular expression and reports invalid ones", async () => {
  await withWorkspace(files, async (root) => {
    const output = await searchFilesTool(
      { query: "'(alpha|beta)'", regex: true },
      { workspaceRoot: root },
    );
    assert.match(output, /src\/a\.ts/);
    assert.match(output, /src\/b\.ts/);
    await assert.rejects(
      searchFilesTool({ query: "([", regex: true }, { workspaceRoot: root }),
      /Invalid regular expression/,
    );
  });
});

test("case sensitivity is opt-in", async () => {
  await withWorkspace({ "a.txt": "Name\nname\n" }, async (root) => {
    const insensitive = await searchFilesTool(
      { query: "name" },
      { workspaceRoot: root },
    );
    assert.equal(insensitive.split("\n").length, 2);
    const sensitive = await searchFilesTool(
      { query: "name", caseSensitive: true },
      { workspaceRoot: root },
    );
    assert.match(sensitive, /a\.txt:2:1/);
    assert.equal(sensitive.split("\n").length, 1);
  });
});

test("include and exclude globs filter the files searched", async () => {
  await withWorkspace(files, async (root) => {
    const onlyTs = await searchFilesTool(
      { query: "name", include: "**/*.ts" },
      { workspaceRoot: root },
    );
    assert.match(onlyTs, /src\/a\.ts/);
    assert.doesNotMatch(onlyTs, /readme\.md/);
    const noDocs = await searchFilesTool(
      { query: "name", exclude: "docs/**" },
      { workspaceRoot: root },
    );
    assert.doesNotMatch(noDocs, /readme\.md/);
  });
});

test("reports no matches with the number of files scanned", async () => {
  await withWorkspace(files, async (root) => {
    const output = await searchFilesTool(
      { query: "nothing-here" },
      { workspaceRoot: root },
    );
    assert.match(output, /^No matches \(scanned 3 files\)\.$/);
  });
});

test("limits cap the matches and add a truncation notice", async () => {
  const many = Object.fromEntries(
    Array.from({ length: 6 }, (_, index) => [`f${index}.txt`, "hit\nhit\nhit\n"]),
  );
  await withWorkspace(many, async (root) => {
    const limited = await searchFilesTool(
      { query: "hit", maxMatches: 4 },
      { workspaceRoot: root },
    );
    const lines = limited.split("\n");
    assert.equal(lines.length, 5);
    assert.match(lines.at(-1) ?? "", /more matches/);
    const perFile = await searchFilesTool(
      { query: "hit", perFileMatches: 1 },
      { workspaceRoot: root },
    );
    assert.equal(
      perFile.split("\n").filter((line) => line.startsWith("f0.txt")).length,
      1,
    );
  });
});

test("binary files are skipped", async () => {
  await withWorkspace(
    {
      "text.txt": "needle\n",
      "blob.bin": Buffer.from([0x6e, 0x00, 0x65, 0x65, 0x64, 0x6c, 0x65]),
    },
    async (root) => {
      const output = await searchFilesTool(
        { query: "needle" },
        { workspaceRoot: root },
      );
      assert.match(output, /text\.txt/);
      assert.doesNotMatch(output, /blob\.bin/);
    },
  );
});

test("long lines are truncated", async () => {
  await withWorkspace({ "long.txt": `${"a".repeat(400)}needle\n` }, async (root) => {
    const output = await searchFilesTool(
      { query: "needle" },
      { workspaceRoot: root },
    );
    assert.match(output, /…$/);
  });
});

test("an empty query is rejected", async () => {
  await withWorkspace(files, async (root) => {
    await assert.rejects(
      searchFilesTool({ query: "   " }, { workspaceRoot: root }),
      /query is required/,
    );
  });
});

test("an aborted signal cancels the walk", async () => {
  await withWorkspace(files, async (root) => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      searchFilesTool(
        { query: "name" },
        { workspaceRoot: root, signal: controller.signal },
      ),
      /Cancelled by user/,
    );
  });
});
