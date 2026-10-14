import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  PROVIDERS,
  PROVIDER_NAMES,
  isProviderName,
  providerSpec,
  resolveProviderIdentity,
} from "../src/providers/index.js";

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/**
 * The catalog is an open registry: adding a provider is a data entry, so
 * the factory, config and catalog must dispatch on data (the SDK kind),
 * never branch on a specific provider name. This guard fails if a
 * `=== "openai"`-style conditional creeps back in.
 */
test("factory, config and catalog never branch on a provider name", () => {
  const roots = ["factory", "config", "catalog"].map((dir) =>
    path.resolve("src", "providers", dir),
  );
  const names = PROVIDER_NAMES.map((n) => n.toLowerCase());
  const branch = (name: string): RegExp =>
    new RegExp(`(===|!==)\\s*["']${name}["']|case\\s+["']${name}["']`);
  for (const file of roots.flatMap(listFiles)) {
    if (!file.endsWith(".ts")) continue;
    if (file.endsWith("catalog.ts")) continue; // the registry itself
    const source = readFileSync(file, "utf8");
    for (const name of names)
      assert.doesNotMatch(source, branch(name), `${file} branches on ${name}`);
  }
});

test("isProviderName accepts every catalog entry and rejects the rest", () => {
  for (const name of PROVIDER_NAMES) assert.ok(isProviderName(name), name);
  assert.ok(!isProviderName("not-a-provider"));
});

test("a hosted catalog provider resolves an identity with its default model", () => {
  // openrouter is catalog-only: no dedicated code anywhere.
  const identity = resolveProviderIdentity({ KODA_PROVIDER: "openrouter" });
  assert.equal(identity.provider, "openrouter");
  assert.equal(identity.model, PROVIDERS.openrouter.defaultModel);
  assert.equal(providerSpec("openrouter").sdk, "openai-compatible");
});
