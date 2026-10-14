import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as core from "@koda-tools/core";
import * as koda from "../src/index.js";

const PACKAGE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

test("the main entry re-exports everything the core package exports", () => {
  const missing = Object.keys(core).filter((name) => !(name in koda));
  assert.deepEqual(missing, []);
  for (const name of Object.keys(core))
    assert.equal(
      (koda as Record<string, unknown>)[name],
      (core as Record<string, unknown>)[name],
      name,
    );
});

test("the main entry has no terminal UI and the source is only a re-export", () => {
  for (const name of ["runInteractive", "renderHeader"])
    assert.equal(name in koda, false, name);
  const source = readFileSync(path.join(PACKAGE, "src", "index.ts"), "utf8");
  assert.equal(source.trim(), 'export * from "@koda-tools/core";');
});

test("the terminal UI stays on the ./tui export", async () => {
  const pkg = readJson(path.join(PACKAGE, "package.json"));
  const exports = pkg["exports"] as Record<string, string>;
  assert.equal(exports["."], "./dist/src/index.js");
  assert.equal(exports["./tui"], "./dist/src/cli/tui/index.js");
  const tui = await import("../src/cli/tui/index.js");
  assert.equal(typeof tui.runInteractive, "function");
  assert.equal(typeof tui.renderHeader, "function");
});

test("the CLI package pins the core version and owns the terminal dependencies", () => {
  const pkg = readJson(path.join(PACKAGE, "package.json"));
  const corePkg = readJson(path.join(PACKAGE, "..", "core", "package.json"));
  const deps = pkg["dependencies"] as Record<string, string>;
  assert.equal(deps["@koda-tools/core"], corePkg["version"]);
  assert.equal(pkg["version"], corePkg["version"]);
  assert.ok(deps["@termuijs/widgets"]);
  assert.ok(deps["shiki"]);
  assert.deepEqual(pkg["bin"], { koda: "bin/koda.js" });
});
