import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve("src/providers");
const BARREL = "index.ts";
const SDK_FREE_FOLDERS = ["shared/", "contracts/", "catalog/", "config/"];
const VENDOR_IMPORT =
  /from\s+["'](?:openai|@anthropic-ai\/sdk|@google\/genai)(?:\/[^"']*)?["']/;

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const providerFiles = listFiles(ROOT).filter((file) => file.endsWith(".ts"));
const relative = (file: string): string =>
  path.relative(ROOT, file).split(path.sep).join("/");
const source = (file: string): string => readFileSync(file, "utf8");

test("only the barrel lives directly under src/providers", () => {
  const topLevel = providerFiles
    .map(relative)
    .filter((file) => !file.includes("/"));
  assert.deepEqual(topLevel, [BARREL]);
});

test("exported provider type declarations live in types.ts", () => {
  const offenders = providerFiles
    .filter((file) => path.basename(file) !== "types.ts")
    .filter((file) => /^export (interface |type \w+[^=]*=)/m.test(source(file)))
    .map(relative);
  assert.deepEqual(offenders, []);
});

test("SDK-free folders import no vendor SDK and no adapter", () => {
  const offenders = providerFiles
    .filter((file) =>
      SDK_FREE_FOLDERS.some((folder) => relative(file).startsWith(folder)),
    )
    .filter(
      (file) =>
        VENDOR_IMPORT.test(source(file)) ||
        /from "[^"]*adapters\//.test(source(file)),
    )
    .map(relative);
  assert.deepEqual(offenders, []);
});

test("code outside src/providers imports it only through the barrel", () => {
  const outside = [
    ...listFiles(path.resolve("src")).filter((file) => !file.startsWith(ROOT)),
    ...listFiles(path.resolve("test")),
  ].filter((file) => file.endsWith(".ts"));
  const providerImport = /providers\/[^"]+\.js"/g;
  const offenders = outside.flatMap((file) =>
    [...source(file).matchAll(providerImport)]
      .map((match) => match[0])
      .filter((specifier) => specifier !== 'providers/index.js"')
      .map((specifier) => `${path.basename(file)}: ${specifier}`),
  );
  assert.deepEqual(offenders, []);
});

test("legacy provider modules and TUI pricing are gone", () => {
  for (const legacy of [
    "src/providers/base.provider.ts",
    "src/providers/defaults.ts",
    "src/providers/factory.ts",
    "src/providers/openai.provider.ts",
    "src/providers/adapters/error-description.ts",
    "src/cli/tui/session/pricing.ts",
  ])
    assert.ok(!existsSync(path.resolve(legacy)), `${legacy} should be removed`);
});
