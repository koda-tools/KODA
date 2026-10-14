import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const PACKAGE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const ROOT = path.resolve(PACKAGE, "..", "..");

const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const TERMINAL = ["@termuijs/", "shiki", "@koda-tools/koda"];
const isTerminal = (name: string): boolean =>
  TERMINAL.some((prefix) => name === prefix || name.startsWith(prefix));

test("the core manifest declares no terminal dependency", () => {
  const pkg = readJson(path.join(PACKAGE, "package.json"));
  assert.equal(pkg["name"], "@koda-tools/core");
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    const names = Object.keys((pkg[field] ?? {}) as Record<string, string>);
    assert.deepEqual(names.filter(isTerminal), [], field);
  }
});

test("core sources never import the terminal UI or the CLI package", () => {
  const import_ =
    /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)["']([^"'.][^"']*)["']/g;
  const offenders: string[] = [];
  for (const file of listFiles(path.join(PACKAGE, "src")))
    if (file.endsWith(".ts"))
      for (const match of readFileSync(file, "utf8").matchAll(import_))
        if (isTerminal(match[1] ?? ""))
          offenders.push(`${path.relative(PACKAGE, file)}: ${match[1]}`);
  assert.deepEqual(offenders, []);
});

test("core exposes a development condition and built entry points", () => {
  const pkg = readJson(path.join(PACKAGE, "package.json"));
  const exports = pkg["exports"] as Record<string, Record<string, string>>;
  assert.deepEqual(exports["."], {
    development: "./src/index.ts",
    types: "./dist/src/index.d.ts",
    default: "./dist/src/index.js",
  });
  assert.deepEqual(pkg["files"], ["dist/src"]);
});

test("the packed core ships README and LICENSE", () => {
  const output = execSync("npm pack -w @koda-tools/core --dry-run --json", {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const [info] = JSON.parse(output.slice(output.indexOf("["))) as {
    name: string;
    files: { path: string }[];
  }[];
  assert.equal(info?.name, "@koda-tools/core");
  const packed = (info?.files ?? []).map((file) => file.path);
  for (const expected of ["README.md", "LICENSE", "package.json"])
    assert.ok(packed.includes(expected), `${expected} is missing`);
  assert.equal(
    packed.some((file) => file.startsWith("src/")),
    false,
    "sources must not be published",
  );
});
