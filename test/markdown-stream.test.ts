import assert from "node:assert/strict";
import { test } from "node:test";
import { createLazyHighlighter } from "../src/cli/tui/highlight.js";
import {
  MarkdownStream,
  type Segment,
} from "../src/cli/tui/markdown-stream.js";
import { Screen } from "../src/cli/tui/screen.js";
import {
  sanitizeStyled,
  TextBuffer,
} from "../src/cli/tui/screen/text-buffer.js";

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

test("numbers fenced code lines and keeps prose untouched", async () => {
  const segments = await render([
    "Here:\n```ts\nconst a = 1;\n\nconsole.log(a);\n```\nDone.\n",
  ]);
  assert.equal(
    plain(segments),
    "Here:\n  1 | const a = 1;\n  2 | \n  3 | console.log(a);\nDone.\n",
  );
});

test("handles fences and lines split across arbitrary stream deltas", async () => {
  const text = "Intro `x` text\n```python\nprint('hi')\n```\nEnd";
  const whole = plain(await render([text]));
  const split = plain(await render(Array.from(text)));
  assert.equal(split, whole);
  assert.equal(whole, "Intro `x` text\n  1 | print('hi')\nEnd");
});

test("streams prose immediately but holds a possible fence line", async () => {
  const stream = new MarkdownStream();
  assert.equal(plain(await stream.push("Hello wor")), "Hello wor");
  assert.equal(plain(await stream.push("ld\n``")), "ld\n");
  assert.equal(plain(await stream.push("`js\nlet a;\n")), "  1 | let a;\n");
  assert.equal(plain(await stream.push("```\n")), "");
});

test("flushes an unterminated block and restarts numbering per block", async () => {
  const segments = await render(["```\na\n```\n```\nb\nc"]);
  assert.equal(plain(segments), "  1 | a\n  1 | b\n  2 | c\n");
});

test("strips terminal escapes from model code", async () => {
  const segments = await render(["```\n\x1b[31mred\x1b]0;x\x07\n```\n"]);
  const code = segments[0];
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
  assert.equal(segments.length, 3);
  const [first, , third] = segments;
  assert.match(first?.kind === "code" ? first.ansi : "", /\x1b\[38;2;/);
  assert.equal(
    plain(segments),
    "  1 | const a = 1;\n  2 | /* open\n  3 | comment */\n",
  );
  assert.match(third?.kind === "code" ? third.ansi : "", /\x1b\[38;2;/);
});

test("falls back to plain numbered code for unknown languages", async () => {
  const stream = new MarkdownStream(createLazyHighlighter());
  const segments = await render(["```notalanguage\nx\n```\n"], stream);
  assert.equal(plain(segments), "  1 | x\n");
  const [code] = segments;
  assert.doesNotMatch(code?.kind === "code" ? code.ansi : "", /\x1b\[38;2;/);
});

test("styled text keeps only SGR escapes", () => {
  assert.equal(
    sanitizeStyled("\x1b[31mok\x1b[0m\x1b[2J\x1b]0;t\x07x"),
    "\x1b[31mok\x1b[0m]0;tx",
  );
});

test("wraps styled lines by visible width and carries colors over", () => {
  const buffer = new TextBuffer();
  buffer.append("\x1b[31mabcdef\x1b[0mgh\n", true);
  assert.deepEqual(buffer.wrap(4), [
    "\x1b[31mabcd\x1b[0m",
    "\x1b[31mef\x1b[0mgh",
    "",
  ]);
});

test("screen renders trusted styled text but sanitizes plain appends", async () => {
  let output = "";
  let listener: ((chunk: string) => void) | undefined;
  const screen = new Screen(
    {
      setRawMode: () => undefined,
      setEncoding: () => undefined,
      resume: () => undefined,
      pause: () => undefined,
      on: (_event, fn) => {
        listener = fn;
      },
      off: () => undefined,
    },
    {
      columns: 40,
      rows: 12,
      write: (text) => {
        output += text;
      },
      on: () => undefined,
      off: () => undefined,
    },
  );
  screen.start();
  screen.append("\x1b[31mevil\x1b[0m\n");
  screen.append("\x1b[32mgood\x1b[0m\n", true);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.doesNotMatch(output, /\x1b\[31m/);
  assert.match(output, /\x1b\[32mgood/);
  assert.equal(listener === undefined, false);
  screen.stop();
});
