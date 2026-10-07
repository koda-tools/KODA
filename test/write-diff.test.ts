import assert from "node:assert/strict";
import { test } from "node:test";
import { computeFileDiff } from "../src/utils/diff.js";
import { diffSegments } from "../src/cli/tui/diff-view.js";
import {
  createLineWriter,
  parseWriteSummary,
  renderDiff,
} from "../src/cli/tui/output.js";
import type { InteractiveIO } from "../src/cli/tui/io.js";

function styledIO(sink: string[]): InteractiveIO {
  return {
    question: async () => undefined,
    write: (text) => sink.push(text),
    writeStyled: (text) => sink.push(text),
    close: () => undefined,
    isTTY: true,
  };
}

function plainIO(sink: string[]): InteractiveIO {
  return {
    question: async () => undefined,
    write: (text) => sink.push(text),
    close: () => undefined,
  };
}

test("diff segments strip model-supplied escape sequences", () => {
  const diff = computeFileDiff({
    filePath: "a.ts",
    before: "const a = 1;\n",
    after: "const a = \u001b[31mEVIL\u001b[0m;\n",
  });
  const segments = diffSegments(diff, undefined, undefined);
  for (const segment of segments) {
    if (segment.kind !== "code") continue;
    assert.ok(!segment.plain.includes("\u001b[31m"));
    assert.ok(!segment.plain.includes("\u001b[0m"));
  }
  const added = segments
    .filter((segment) => segment.kind === "code")
    .find((segment) => segment.plain.includes("EVIL"));
  assert.ok(added !== undefined);
  assert.ok(!added.plain.includes("\u001b"));
});

test("renders a diff header with the change summary", async () => {
  const sink: string[] = [];
  const diff = computeFileDiff({
    filePath: "src/app.ts",
    before: "a\nb\n",
    after: "a\nB\nc\n",
  });
  await renderDiff(createLineWriter(styledIO(sink)), diff, { animate: false });
  const output = sink.join("");
  assert.match(output, /src\/app\.ts {2}\+2 -1/);
});

test("falls back to plain prefixes without a styled channel", async () => {
  const sink: string[] = [];
  const diff = computeFileDiff({
    filePath: "a.txt",
    before: "one\n",
    after: "two\n",
  });
  await renderDiff(createLineWriter(plainIO(sink)), diff, { animate: false });
  const output = sink.join("");
  assert.ok(!output.includes("\u001b["));
  assert.match(output, /^-.*one/m);
  assert.match(output, /^\+.*two/m);
});

test("recognizes an update summary from the observation text", () => {
  assert.equal(parseWriteSummary("Wrote 10 bytes to a.ts. (+3 -1)"), "+3 -1");
  assert.equal(parseWriteSummary("Wrote 10 bytes to a.ts."), undefined);
});
