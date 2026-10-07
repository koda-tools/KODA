import assert from "node:assert/strict";
import { test } from "node:test";
import { ToolRegistry } from "../src/index.js";
import { withWorkspace } from "./helpers/workspace.js";

const files = {
  "src/a.ts": "export const name = 'alpha';\nconst second = 2;\n",
  "docs/readme.md": "docs\n",
};

function registry(root: string): ToolRegistry {
  return new ToolRegistry({ workspaceRoot: root });
}

test("exposes every exploration tool with a status label", () => {
  const tools = registry("/tmp");
  assert.deepEqual(
    tools.definitions.map((definition) => definition.name),
    [
      "readFile",
      "writeFile",
      "listDirectory",
      "searchFiles",
      "getFileInfo",
      "runCommand",
    ],
  );
  assert.equal(tools.statusLabel("listDirectory"), "Listing...");
  assert.equal(tools.statusLabel("searchFiles"), "Searching...");
  assert.equal(tools.statusLabel("getFileInfo"), "Inspecting...");
  assert.equal(tools.statusLabel("runCommand"), "Running...");
  assert.equal(tools.statusLabel("unknown"), undefined);
});

test("runs the exploration tools end to end", async () => {
  await withWorkspace(files, async (root) => {
    const tools = registry(root);
    const listed = await tools.execute("listDirectory", "{}");
    assert.equal(listed.ok, true);
    assert.match(listed.content, /src\//);

    const found = await tools.execute(
      "searchFiles",
      JSON.stringify({ query: "alpha" }),
    );
    assert.equal(found.ok, true);
    assert.match(found.content, /src\/a\.ts:1:/);

    const info = await tools.execute(
      "getFileInfo",
      JSON.stringify({ path: "src/a.ts" }),
    );
    assert.equal(info.ok, true);
    assert.match(info.content, /Kind: {6}file/);

    const ranged = await tools.execute(
      "searchFiles",
      JSON.stringify({ query: "second", include: "**/*.ts" }),
    );
    assert.match(ranged.content, /a\.ts:2:/);
  });
});

test("readFile accepts a line range through the registry", async () => {
  await withWorkspace({ "a.txt": "one\ntwo\nthree\n" }, async (root) => {
    const result = await registry(root).execute(
      "readFile",
      JSON.stringify({ filePath: "a.txt", startLine: 2, endLine: 2 }),
    );
    assert.equal(result.ok, true);
    assert.equal(result.content, "a.txt (lines 2-2 of 4)\ntwo");
  });
});

test("malformed arguments become failed observations", async () => {
  await withWorkspace(files, async (root) => {
    const tools = registry(root);
    for (const [name, args, pattern] of [
      ["listDirectory", "{", /Tool error:/],
      ["listDirectory", JSON.stringify({ depth: 0 }), /positive integer/],
      ["listDirectory", JSON.stringify({ includeHidden: "yes" }), /boolean/],
      ["searchFiles", "{}", /non-empty query/],
      ["getFileInfo", JSON.stringify({ path: "" }), /non-empty path/],
      ["readFile", JSON.stringify({ filePath: "a.ts", startLine: 0 }), /positive integer/],
    ] as const) {
      const result = await tools.execute(name, args);
      assert.equal(result.ok, false, `${name} ${args}`);
      assert.match(result.content, pattern);
    }
  });
});

test("an unknown tool is reported without throwing", async () => {
  const result = await registry("/tmp").execute("nope", "{}");
  assert.equal(result.ok, false);
  assert.match(result.content, /Unknown tool 'nope'/);
});

test("runCommand refuses when no command policy is configured", async () => {
  const result = await registry("/tmp").execute(
    "runCommand",
    JSON.stringify({ command: "echo hi" }),
  );
  assert.equal(result.ok, false);
  assert.match(result.content, /no approval policy is configured/);
});

test("sandbox violations surface as failed observations", async () => {
  await withWorkspace({ ".env": "SECRET=1" }, async (root) => {
    const tools = registry(root);
    const sensitive = await tools.execute(
      "getFileInfo",
      JSON.stringify({ path: ".env" }),
    );
    assert.equal(sensitive.ok, false);
    assert.match(sensitive.content, /sensitive/);
    assert.ok(!sensitive.content.includes("SECRET"));

    const escape = await tools.execute(
      "listDirectory",
      JSON.stringify({ path: "../.." }),
    );
    assert.equal(escape.ok, false);
  });
});

test("cancellation reaches the exploration tools", async () => {
  await withWorkspace(files, async (root) => {
    const controller = new AbortController();
    controller.abort();
    const result = await registry(root).execute(
      "searchFiles",
      JSON.stringify({ query: "alpha" }),
      controller.signal,
    );
    assert.equal(result.ok, false);
    assert.match(result.content, /Cancelled by user/);
  });
});
