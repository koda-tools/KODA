import assert from "node:assert/strict";
import { test } from "node:test";
import { createLazyHighlighter, parseAnsiLine } from "../src/cli/tui/index.js";

test("turns truecolor SGR into TermUI fg styles", () => {
  const spans = parseAnsiLine("\x1b[38;2;255;0;10mconst\x1b[0m x");
  assert.deepEqual(spans, [
    { text: "const", style: { fg: { type: "rgb", r: 255, g: 0, b: 10 } } },
    { text: " x", style: {} },
  ]);
});

test("keeps background, bold and dim, and resets them", () => {
  const spans = parseAnsiLine("\x1b[48;2;20;60;30m\x1b[2m+ 1 \x1b[0m\x1b[1mok");
  assert.deepEqual(spans, [
    {
      text: "+ 1 ",
      style: { bg: { type: "rgb", r: 20, g: 60, b: 30 }, dim: true },
    },
    { text: "ok", style: { bold: true } },
  ]);
});

test("plain lines become a single unstyled span", () => {
  assert.deepEqual(parseAnsiLine("hello"), [{ text: "hello", style: {} }]);
});

test("Shiki output parses into colored spans", async () => {
  const highlighter = createLazyHighlighter();
  const language = await highlighter.resolveLanguage("ts");
  assert.ok(language !== undefined, "Shiki should resolve the ts grammar");
  const { ansi } = highlighter.highlightLine("const a = 1;", language);
  const colored = parseAnsiLine(ansi).filter(
    (span) => span.style.fg?.type === "rgb",
  );
  assert.ok(colored.length > 0, "expected at least one colored token");
  assert.equal(
    parseAnsiLine(ansi)
      .map((span) => span.text)
      .join(""),
    "const a = 1;",
  );
});
