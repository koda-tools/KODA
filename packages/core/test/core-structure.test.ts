import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve("src/core");
const BARREL = "index.ts";

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const coreFiles = listFiles(ROOT).filter((file) => file.endsWith(".ts"));
const relative = (file: string): string =>
  path.relative(ROOT, file).split(path.sep).join("/");
const source = (file: string): string => readFileSync(file, "utf8");

test("only the barrel lives directly under src/core", () => {
  const topLevel = coreFiles
    .map(relative)
    .filter((file) => !file.includes("/"));
  assert.deepEqual(topLevel, [BARREL]);
});

test("exported core type declarations live in types.ts", () => {
  const offenders = coreFiles
    .filter((file) => path.basename(file) !== "types.ts")
    .filter((file) => /^export (interface |type \w+[^=]*=)/m.test(source(file)))
    .map(relative);
  assert.deepEqual(offenders, []);
});

test("code outside src/core imports it only through the barrel", () => {
  const outside = [
    ...listFiles(path.resolve("src")).filter((file) => !file.startsWith(ROOT)),
    ...listFiles(path.resolve("test")),
  ].filter((file) => file.endsWith(".ts"));
  const coreImport = /core\/[^"]+\.js"/g;
  const offenders = outside.flatMap((file) =>
    [...source(file).matchAll(coreImport)]
      .map((match) => match[0])
      .filter((specifier) => specifier !== 'core/index.js"')
      .map((specifier) => `${path.basename(file)}: ${specifier}`),
  );
  assert.deepEqual(offenders, []);
});

test("the core knows no concrete tools", () => {
  const everything = coreFiles.map(source).join("\n");
  assert.doesNotMatch(everything, /readFile|writeFile|ToolRegistry/);
});

test("duplicated usage helpers and the monolithic agent are gone", () => {
  assert.ok(!existsSync(path.resolve("src/core/agent.ts")));
  const sources = listFiles(path.resolve("src"))
    .filter((file) => file.endsWith(".ts"))
    .map(source)
    .join("\n");
  for (const symbol of ["accumulateUsage", "UsageTotals"])
    assert.ok(!sources.includes(symbol), `${symbol} should be removed`);
});
