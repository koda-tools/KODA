import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blockIndent,
  CodeBlock,
  createLineWriter,
  parseInline,
  statusLine,
  TextBlock,
  userMessage,
  wrapCells,
  writeStatus,
  type InteractiveIO,
  type StyledCell,
} from "../src/cli/tui/index.js";

const STYLE = {};
const cells = (text: string): StyledCell[] =>
  Array.from(text).map((char) => ({ text: char, width: 1, style: STYLE }));
const rowsText = (rows: readonly StyledCell[][]): string[] =>
  rows.map((row) => row.map((cell) => cell.text).join(""));

test("user messages render as a cyan TEXT · USER block, verbatim", () => {
  const lines = userMessage("Quero um exemplo\n  **sem markdown**\n");
  assert.deepEqual(
    lines.map((line) => line.plain),
    ["▌ TEXT · USER", "▌ Quero um exemplo", "▌   **sem markdown**"],
  );
  assert.match(lines[0]?.ansi ?? "", /\x1b\[38;2;51;227;250m▌/);
});

test("KODA text blocks have a green border and render Markdown", () => {
  const block = new TextBlock("assistant");
  assert.equal(block.header().plain, "▌ TEXT · KODA");
  assert.match(block.header().ansi, /\x1b\[38;2;63;185;80m▌/);
  assert.equal(block.markdown("## Título").plain, "▌ Título");
  assert.match(block.markdown("## Título").ansi, /\x1b\[1m/);
  assert.equal(block.markdown("- item").plain, "▌ • item");
  assert.equal(block.markdown("  * nested").plain, "▌   • nested");
  assert.equal(block.markdown("1. first").plain, "▌ 1. first");
  assert.equal(block.markdown("> quote").plain, "▌ ┊ quote");
  assert.equal(
    block.markdown("see [docs](https://x.dev)").plain,
    "▌ see docs (https://x.dev)",
  );
  const styled = block.markdown("**bold** and `code`").ansi;
  assert.match(styled, /\x1b\[1mbold/);
  assert.match(styled, /\x1b\[38;2;255;166;87mcode/);
  assert.equal(
    block.markdown("keep snake_case_name").plain,
    "▌ keep snake_case_name",
  );
  assert.equal(block.blank().plain, "▌");
});

test("inline parsing leaves unclosed markers literal while streaming", () => {
  assert.deepEqual(parseInline("half **bold"), [{ text: "half **bold" }]);
  assert.deepEqual(parseInline("*it* x"), [
    { italic: true, text: "it" },
    { text: " x" },
  ]);
});

test("code blocks have a blue border and a file/language header", () => {
  const named = new CodeBlock({ language: "typescript", filename: "app.ts" });
  assert.equal(named.header().plain, "▌ CODE · app.ts · typescript");
  assert.match(named.header().ansi, /\x1b\[38;2;88;166;255m▌/);
  assert.equal(new CodeBlock({ language: "" }).header().plain, "▌ CODE");
  assert.equal(named.line("  return [];").plain, "▌   return [];");
  assert.equal(named.line("").plain, "▌");
  assert.equal(named.spacer().plain, "▌");
});

test("block indent covers the border and list markers", () => {
  assert.equal(blockIndent("▌ text"), 2);
  assert.equal(blockIndent("▌ • item"), 4);
  assert.equal(blockIndent("▌   12. item"), 8);
  assert.equal(blockIndent("plain line"), 0);
});

test("wrapping keeps the block border on every row", () => {
  const rows = wrapCells(cells("▌ hello world foo"), 10, 2);
  assert.deepEqual(rowsText(rows), ["▌ hello", "▌ world", "▌ foo"]);
});

test("wrapping hard-breaks words longer than the row", () => {
  const rows = wrapCells(cells("▌ abcdefghijkl"), 6, 2);
  assert.deepEqual(rowsText(rows), ["▌ abcd", "▌ efgh", "▌ ijkl"]);
});

test("wrapped list items stay aligned under their text", () => {
  const rows = wrapCells(cells("▌ • aaa bbb"), 7, blockIndent("▌ • aaa bbb"));
  assert.deepEqual(rowsText(rows), ["▌ • aaa", "▌   bbb"]);
});

test("lines that fit are not wrapped", () => {
  assert.deepEqual(rowsText(wrapCells(cells("▌ short"), 20, 2)), ["▌ short"]);
  assert.deepEqual(rowsText(wrapCells(cells("no width"), 0, 0)), ["no width"]);
});

const BACKGROUND = "\x1b[48;2;40;44;52m";

test("blocks sit on a dark gray background that survives inline resets", () => {
  for (const line of [
    new TextBlock("assistant").markdown("**bold** and `code` text"),
    new TextBlock("user").header(),
    new CodeBlock({ language: "ts" }).line("x", "\x1b[38;2;1;2;3mx\x1b[0m"),
  ]) {
    assert.ok(line.ansi.startsWith(BACKGROUND), line.ansi);
    const resets = line.ansi.split("\x1b[0m");
    // Every reset but the final one is followed by the background again.
    for (const part of resets.slice(1, -1))
      assert.ok(part.startsWith(BACKGROUND), `lost background: ${line.ansi}`);
  }
});

test("wrapped rows keep the block background in their prefix", () => {
  const fill = { bg: { type: "rgb", r: 40, g: 44, b: 52 } } as const;
  const row = Array.from("▌ aaa bbb").map((text) => ({
    text,
    width: 1,
    style: fill,
  }));
  const [, second] = wrapCells(row, 5, 2);
  assert.deepEqual(
    second?.slice(0, 2).map((cell) => cell.style),
    [fill, fill],
  );
});

test("tool and approval lines render inside a KODA block", () => {
  const line = statusLine("✓ writeFile tmp/main.ts");
  assert.equal(line.plain, "▌ ✓ writeFile tmp/main.ts");
  assert.match(line.ansi, /\x1b\[38;2;63;185;80m▌/);
  let output = "";
  const writer = createLineWriter({
    question: async () => undefined,
    write: (text) => {
      output += text;
    },
    close: () => undefined,
  });
  writer.write("partial");
  writeStatus(writer, "new file tmp/main.ts\n");
  assert.equal(output, "partial\n▌ new file tmp/main.ts\n");
});

test("the writer replaces live previews instead of appending them", () => {
  const lines = [""];
  const io: InteractiveIO = {
    question: async () => undefined,
    write: (text) => {
      const [first = "", ...rest] = text.split("\n");
      lines[lines.length - 1] = `${lines.at(-1) ?? ""}${first}`;
      lines.push(...rest);
    },
    close: () => undefined,
    setLiveLine: (text) => {
      lines[lines.length - 1] = text;
    },
  };
  const writer = createLineWriter(io);
  writer.writeSegment({ kind: "live", plain: "▌ a", ansi: "▌ a" });
  writer.writeSegment({ kind: "live", plain: "▌ ab", ansi: "▌ ab" });
  writer.writeSegment({ kind: "line", plain: "▌ abc", ansi: "▌ abc" });
  writer.writeSegment({ kind: "live", plain: "▌ d", ansi: "▌ d" });
  writer.ensureNewLine();
  assert.deepEqual(lines, ["▌ abc", "▌ d", ""]);
});

test("without live support only finished lines are written", () => {
  let output = "";
  const writer = createLineWriter({
    question: async () => undefined,
    write: (text) => {
      output += text;
    },
    close: () => undefined,
  });
  writer.writeSegment({ kind: "live", plain: "▌ a", ansi: "▌ a" });
  writer.writeSegment({ kind: "line", plain: "▌ abc", ansi: "\x1b[1m▌ abc" });
  assert.equal(output, "▌ abc\n");
});
