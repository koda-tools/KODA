import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createLazyHighlighter,
  frameBottom,
  frameTop,
  MarkdownStream,
  sanitize,
  sanitizeStyled,
  type Segment,
} from "../src/cli/tui/index.js";

async function render(
  chunks: readonly string[],
  stream = new MarkdownStream(),
): Promise<Segment[]> {
  const segments: Segment[] = [];
  for (const chunk of chunks) segments.push(...(await stream.push(chunk)));
  segments.push(...(await stream.flush()));
  return segments;
}

const plain = (segments: readonly Segment[]): string =>
  segments.map((s) => (s.kind === "text" ? s.text : s.plain)).join("");

/** The frame drawn around a code block, as it appears in `plain(...)`. */
const top = (label: string): string => `${frameTop(label)}\n`;
const bottom = (): string => `${frameBottom()}\n`;

/** Code segments only (drops the frame borders, which are also `code`). */
const codeOnly = (segments: readonly Segment[]): Segment[] =>
  segments.filter(
    (s) =>
      s.kind === "code" && !s.plain.startsWith("┌") && !s.plain.startsWith("└"),
  );

test("frames fenced code, numbers lines, and keeps prose untouched", async () => {
  const segments = await render([
    "Here:\n```ts\nconst a = 1;\n\nconsole.log(a);\n```\nDone.\n",
  ]);
  assert.equal(
    plain(segments),
    `Here:\n${top("ts")}  1 | const a = 1;\n  2 | \n  3 | console.log(a);\n${bottom()}Done.\n`,
  );
});

test("handles fences and lines split across arbitrary stream deltas", async () => {
  const text = "Intro `x` text\n```python\nprint('hi')\n```\nEnd";
  const whole = plain(await render([text]));
  const split = plain(await render(Array.from(text)));
  assert.equal(split, whole);
  assert.equal(
    whole,
    `Intro \`x\` text\n${top("python")}  1 | print('hi')\n${bottom()}End`,
  );
});

test("streams prose immediately but holds a possible fence line", async () => {
  const stream = new MarkdownStream();
  assert.equal(plain(await stream.push("Hello wor")), "Hello wor");
  assert.equal(plain(await stream.push("ld\n``")), "ld\n");
  assert.equal(
    plain(await stream.push("`js\nlet a;\n")),
    `${top("js")}  1 | let a;\n`,
  );
  assert.equal(plain(await stream.push("```\n")), bottom());
});

test("flushes an unterminated block and restarts numbering per block", async () => {
  const segments = await render(["```\na\n```\n```\nb\nc"]);
  assert.equal(
    plain(segments),
    `${top("")}  1 | a\n${bottom()}${top("")}  1 | b\n  2 | c\n${bottom()}`,
  );
});

test("strips terminal escapes from model code", async () => {
  const segments = await render(["```\n\x1b[31mred\x1b]0;x\x07\n```\n"]);
  const [code] = codeOnly(segments);
  assert.equal(code?.kind, "code");
  assert.doesNotMatch(
    code?.kind === "code" ? code.ansi : "",
    /\x1b\[31m|\x1b\]/,
  );
});

test("highlights code with Shiki using ANSI colors across lines", async () => {
  const stream = new MarkdownStream(createLazyHighlighter());
  const segments = await render(
    ["```ts\nconst a = 1;\n/* open\ncomment */\n```\n"],
    stream,
  );
  const code = codeOnly(segments);
  assert.equal(code.length, 3);
  const [first, , third] = code;
  assert.match(first?.kind === "code" ? first.ansi : "", /\x1b\[38;2;/);
  assert.equal(
    plain(code),
    "  1 | const a = 1;\n  2 | /* open\n  3 | comment */\n",
  );
  assert.match(third?.kind === "code" ? third.ansi : "", /\x1b\[38;2;/);
});

test("falls back to plain numbered code for unknown languages", async () => {
  const stream = new MarkdownStream(createLazyHighlighter());
  const segments = await render(["```notalanguage\nx\n```\n"], stream);
  const code = codeOnly(segments);
  assert.equal(plain(code), "  1 | x\n");
  const [first] = code;
  assert.doesNotMatch(first?.kind === "code" ? first.ansi : "", /\x1b\[38;2;/);
});

test("reports the raw text of each code block for copying", async () => {
  const blocks: string[] = [];
  const stream = new MarkdownStream(undefined, (code) => blocks.push(code));
  await render(["```ts\nconst a = 1;\nconst b = 2;\n```\n"], stream);
  assert.deepEqual(blocks, ["const a = 1;\nconst b = 2;"]);
});

test("styled text keeps only SGR escapes", () => {
  assert.equal(
    sanitizeStyled("\x1b[31mok\x1b[0m\x1b[2J\x1b]0;t\x07x"),
    "\x1b[31mok\x1b[0m]0;tx",
  );
});

test("plain text loses every escape, including colors", () => {
  assert.equal(sanitize("\x1b[31mevil\x1b[0m\tx\r\n"), "evil  x\n");
});
