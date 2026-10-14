import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve("src/providers");
const BARREL = "index.ts";
const SDK_FREE_FOLDERS = [
  "shared/",
  "contracts/",
  "catalog/",
  "config/",
  "auth/",
];
const VENDOR_IMPORT = /from\s+["'](?:ai|@ai-sdk\/[^"']+)["']/;

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
    "src/providers/adapters/openai",
    "src/providers/adapters/anthropic",
    "src/providers/adapters/gemini",
    "src/providers/adapters/ollama",
  ])
    assert.ok(!existsSync(path.resolve(legacy)), `${legacy} should be removed`);
});

test("the AI SDK is the only model transport", () => {
  const manifest: unknown = JSON.parse(readFileSync("package.json", "utf8"));
  const { dependencies, engines } = manifest as {
    dependencies: Record<string, string>;
    engines: Record<string, string>;
  };
  for (const removed of ["openai", "@anthropic-ai/sdk", "@google/genai"])
    assert.ok(!(removed in dependencies), `${removed} should be removed`);
  for (const required of [
    "ai",
    "@ai-sdk/openai",
    "@ai-sdk/anthropic",
    "@ai-sdk/google",
    "@ai-sdk/openai-compatible",
    "zod",
  ]) {
    const version = dependencies[required];
    assert.ok(version !== undefined, `${required} should be a dependency`);
    assert.match(version ?? "", /^\d+\.\d+\.\d+$/, `${required} must be exact`);
  }
  // The AI SDK packages require Node 22.
  assert.equal(engines.node, ">=22.0.0");
});
