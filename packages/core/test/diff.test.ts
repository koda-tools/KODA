import assert from "node:assert/strict";
import { test } from "node:test";
import { computeFileDiff, type DiffLine } from "../src/utils/diff.js";

function flat(filePath: string, before: string, after: string): DiffLine[] {
  return computeFileDiff({ filePath, before, after }).hunks.flatMap(
    (hunk) => hunk.lines,
  );
}

test("new file produces only additions", () => {
  const diff = computeFileDiff({
    filePath: "a.txt",
    before: "",
    after: "one\ntwo\n",
  });
  assert.equal(diff.removed, 0);
  assert.equal(diff.added, 2);
  const kinds = diff.hunks.flatMap((hunk) =>
    hunk.lines.map((line) => line.kind),
  );
  assert.ok(!kinds.includes("remove"));
});

test("identical content yields no changes", () => {
  const diff = computeFileDiff({
    filePath: "a.txt",
    before: "same\ncontent\n",
    after: "same\ncontent\n",
  });
  assert.equal(diff.added, 0);
  assert.equal(diff.removed, 0);
  assert.deepEqual(diff.hunks, []);
  assert.equal(diff.truncated, false);
});

test("changed line counts one add and one remove", () => {
  const diff = computeFileDiff({
    filePath: "a.txt",
    before: "alpha\nbeta\ngamma\n",
    after: "alpha\nBETA\ngamma\n",
  });
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 1);
  const removed = flat("a.txt", "alpha\nbeta\ngamma\n", "alpha\nBETA\ngamma\n")
    .filter((line) => line.kind === "remove")
    .at(0);
  const added = flat("a.txt", "alpha\nbeta\ngamma\n", "alpha\nBETA\ngamma\n")
    .filter((line) => line.kind === "add")
    .at(0);
  assert.equal(removed?.oldLine, 2);
  assert.equal(removed?.newLine, undefined);
  assert.equal(added?.newLine, 2);
  assert.equal(added?.oldLine, undefined);
});

test("added line keeps context line numbers", () => {
  const diff = computeFileDiff({
    filePath: "a.txt",
    before: "one\ntwo\n",
    after: "one\ninserted\ntwo\n",
  });
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 0);
  const context = diff.hunks
    .flatMap((hunk) => hunk.lines)
    .filter((line) => line.kind === "context");
  for (const line of context)
    assert.equal(
      line.oldLine !== undefined && line.newLine !== undefined,
      true,
    );
});

test("removed line is reported", () => {
  const diff = computeFileDiff({
    filePath: "a.txt",
    before: "one\ntwo\nthree\n",
    after: "one\nthree\n",
  });
  assert.equal(diff.removed, 1);
  assert.equal(diff.added, 0);
  const removed = diff.hunks
    .flatMap((hunk) => hunk.lines)
    .find((line) => line.kind === "remove");
  assert.equal(removed?.text, "two");
  assert.equal(removed?.oldLine, 2);
});

test("distant edits produce multiple hunks", () => {
  const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
  const after = before
    .replace("line 2", "LINE 2")
    .replace("line 37", "LINE 37");
  const diff = computeFileDiff({ filePath: "a.txt", before, after });
  assert.ok(diff.hunks.length >= 2);
  assert.equal(diff.added, 2);
  assert.equal(diff.removed, 2);
});

test("large diff is truncated with an omission line", () => {
  const after = Array.from({ length: 300 }, (_, i) => `added ${i}`).join("\n");
  const diff = computeFileDiff({ filePath: "a.txt", before: "", after });
  assert.equal(diff.truncated, true);
  const lines = diff.hunks.flatMap((hunk) => hunk.lines);
  assert.ok(lines.length <= 201);
  const last = lines.at(-1);
  assert.match(last?.text ?? "", /^\.\.\. \d+ linhas omitidas$/);
});
