import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve("src/cli/tui");
const BARREL = "index.ts";

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const tuiFiles = listFiles(ROOT).filter((file) => file.endsWith(".ts"));
const relative = (file: string): string =>
  path.relative(ROOT, file).split(path.sep).join("/");
const source = (file: string): string => readFileSync(file, "utf8");

test("only the barrel lives directly under src/cli/tui", () => {
  const topLevel = tuiFiles.map(relative).filter((file) => !file.includes("/"));
  assert.deepEqual(topLevel, [BARREL]);
});

test("exported type declarations live in types.ts", () => {
  const offenders = tuiFiles
    .filter((file) => path.basename(file) !== "types.ts")
    .filter((file) => /^export (interface |type \w+\s*=)/m.test(source(file)))
    .map(relative);
  assert.deepEqual(offenders, []);
});

test("shared does not import sibling TUI folders", () => {
  const offenders = tuiFiles
    .filter((file) => relative(file).startsWith("shared/"))
    .filter((file) => /from "\.\.\/[^"]+"/.test(source(file)))
    .map(relative);
  assert.deepEqual(offenders, []);
});

test("code outside the TUI imports it only through the barrel", () => {
  const outside = [
    ...listFiles(path.resolve("src")).filter((file) => !file.startsWith(ROOT)),
    ...listFiles(path.resolve("test")),
  ].filter((file) => file.endsWith(".ts"));
  const deepImport = /cli\/tui\/[^"]+\.js"|\.\/tui\/[^"]+\.js"/g;
  const offenders = outside.flatMap((file) =>
    [...source(file).matchAll(deepImport)]
      .map((match) => match[0])
      .filter((specifier) => !specifier.endsWith("tui/index.js\""))
      .map((specifier) => `${path.basename(file)}: ${specifier}`),
  );
  assert.deepEqual(offenders, []);
});

test("legacy renderer and duplicated approval code are gone", () => {
  const files = tuiFiles.map(relative);
  assert.ok(!files.some((file) => file === "screen.ts"));
  assert.ok(!files.some((file) => file.startsWith("screen/")));
  const everything = tuiFiles.map(source).join("\n");
  for (const symbol of [
    "showApproval",
    "ToolApproval",
    "holdStatus",
    "releaseStatus",
    "ToolCallKind",
  ])
    assert.ok(!everything.includes(symbol), `${symbol} should be removed`);
});
