import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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

test("the root is a private workspace hosting packages/core and packages/koda", () => {
  const root = readJson(path.join(ROOT, "package.json"));
  assert.equal(root["private"], true);
  assert.deepEqual(root["workspaces"], ["packages/*"]);
  assert.ok(existsSync(path.join(ROOT, "packages", "core", "package.json")));
  const pkg = readJson(path.join(PACKAGE, "package.json"));
  assert.equal(pkg["name"], "@koda-tools/koda");
  assert.deepEqual(pkg["bin"], { koda: "bin/koda.js" });
  assert.deepEqual(pkg["files"], ["bin", "dist/src"]);
});

test("the packed workspace ships bin, README and LICENSE", () => {
  const output = execSync("npm pack -w @koda-tools/koda --dry-run --json", {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const [info] = JSON.parse(output.slice(output.indexOf("["))) as {
    name: string;
    files: { path: string }[];
  }[];
  assert.equal(info?.name, "@koda-tools/koda");
  const packed = (info?.files ?? []).map((file) => file.path);
  for (const expected of ["bin/koda.js", "README.md", "LICENSE"])
    assert.ok(packed.includes(expected), `${expected} is missing`);
});

test("bin/koda.js keeps LF endings and a Git attribute forces them", () => {
  const bin = readFileSync(path.join(PACKAGE, "bin", "koda.js"));
  assert.equal(bin.includes(0x0d), false, "bin/koda.js contains CR");
  const attr = execSync("git check-attr eol -- packages/koda/bin/koda.js", {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.match(attr, /eol: lf/);
});

test("spec verify commands run from the package that holds the test", () => {
  const verify = /^[> ]*verify: /;
  const testFile = /test\/[A-Za-z0-9_.-]+\.test\.ts/g;
  const offenders: string[] = [];
  for (const base of ["specs", "changes"])
    for (const file of listFiles(path.join(ROOT, "agentic-fy", base)))
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        if (!verify.test(line)) continue;
        let current: string | undefined;
        for (const segment of line.split("&&")) {
          const cd = /cd (?:packages\/|\.\.\/)(core|koda)\b/.exec(segment);
          if (cd) current = cd[1];
          for (const token of segment.match(testFile) ?? [])
            if (
              current === undefined ||
              !existsSync(path.join(ROOT, "packages", current, token))
            )
              offenders.push(
                `${path.relative(ROOT, file)}: ${token} is not in ${current ?? "any package"}`,
              );
        }
      }
  assert.deepEqual(offenders, []);
});
