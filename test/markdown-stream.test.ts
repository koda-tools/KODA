import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createLazyHighlighter,
  createLineWriter,
  MarkdownStream,
  parseFenceInfo,
  sanitize,
  sanitizeStyled,
  type InteractiveIO,
  type Segment,
} from "../src/cli/tui/index.js";

const SGR = /\x1b\[[0-9;]*m/g;
const strip = (text: string): string => text.replace(SGR, "");

async function render(
  chunks: readonly string[],
  stream = new MarkdownStream(),
): Promise<Segment[]> {
  const segments: Segment[] = [];
  for (const chunk of chunks) segments.push(...(await stream.push(chunk)));
  segments.push(...(await stream.flush()));
  return segments;
}

/** Finished output only: live previews are transient and skipped. */
const plain = (segments: readonly Segment[]): string =>
  segments
    .map((s) => {
      if (s.kind === "text") return s.text;
      if (s.kind === "line") return `${s.plain}\n`;
      return s.kind === "code" ? s.plain : "";
    })
    .join("");

/** A transcript like the TUI's; `live` enables line-replacing previews. */
function transcriptIO(live: boolean): { io: InteractiveIO; lines: string[] } {
  const lines = [""];
  const append = (text: string): void => {
    const [first = "", ...rest] = text.split("\n");
    lines[lines.length - 1] = `${lines.at(-1) ?? ""}${first}`;
    lines.push(...rest);
  };
  const io: InteractiveIO = {
    question: async () => undefined,
    write: append,
    close: () => undefined,
    ...(live
      ? {
          writeStyled: (text: string) => append(strip(text)),
          setLiveLine: (text: string) => {
            lines[lines.length - 1] = strip(text);
          },
        }
      : {}),
  };
  return { io, lines };
}

async function streamInto(
  chunks: readonly string[],
  live: boolean,
): Promise<string> {
  const { io, lines } = transcriptIO(live);
  const writer = createLineWriter(io);
  for (const segment of await render(chunks)) writer.writeSegment(segment);
  return lines.join("\n");
}

test("splits mixed Markdown into TEXT and CODE blocks", async () => {
  const segments = await render(["Here:\n```ts\nconst a = 1;\n```\nDone.\n"]);
  assert.equal(
    plain(segments),
    [
      "▌ TEXT · KODA",
      "▌ Here:",
      "",
      "▌ CODE · ts",
      "▌",
      "▌ const a = 1;",
      "",
      "▌ TEXT · KODA",
      "▌ Done.",
      "",
      "",
    ].join("\n"),
  );
});

test("streaming in arbitrary deltas never duplicates content", async () => {
  const text = "Intro `x` **bold** text\n```python\nprint('hi')\n```\nEnd";
  const whole = await streamInto([text], false);
  assert.equal(await streamInto(Array.from(text), true), whole);
  assert.equal(await streamInto(Array.from(text), false), whole);
  const threes = text.match(/[\s\S]{1,3}/g) ?? [];
  assert.equal(await streamInto(threes, true), whole);
  assert.match(whole, /▌ Intro x bold text\n/);
  assert.match(whole, /▌ CODE · python\n▌\n▌ print\('hi'\)\n/);
});

test("previews the unfinished line and replaces it when it ends", async () => {
  const stream = new MarkdownStream();
  const first = await stream.push("Hel");
  assert.deepEqual(
    first.map((s) => s.kind),
    ["line", "live"],
  );
  assert.equal(first[1]?.kind === "live" ? first[1].plain : "", "▌ Hel");
  const second = await stream.push("lo\n");
  assert.deepEqual(
    second.map((s) => (s.kind === "line" ? s.plain : s.kind)),
    ["▌ Hello"],
  );
  // A partial line that may become a fence is held, not previewed.
  assert.deepEqual(await stream.push("``"), []);
});

test("keeps paragraph breaks inside a block but drops trailing blanks", async () => {
  const segments = await render(["a\n\nb\n\n\n```\nx\n```\n"]);
  assert.equal(
    plain(segments),
    ["▌ TEXT · KODA", "▌ a", "▌", "▌ b", "", "▌ CODE", "▌", "▌ x", "", ""].join(
      "\n",
    ),
  );
});

test("names the file in the code block header when it is known", async () => {
  const segments = await render(['```ts title="app.controller.ts"\nx\n```\n']);
  assert.match(plain(segments), /^▌ CODE · app\.controller\.ts · ts\n/);
  assert.deepEqual(parseFenceInfo("ts:src/a.ts"), {
    language: "ts",
    filename: "src/a.ts",
  });
  assert.deepEqual(parseFenceInfo("ts src/a.ts"), {
    language: "ts",
    filename: "src/a.ts",
  });
  assert.deepEqual(parseFenceInfo("python"), {
    language: "python",
    filename: undefined,
  });
});

test("closes an unterminated code block on flush and reports it", async () => {
  const blocks: string[] = [];
  const stream = new MarkdownStream(undefined, (code) => blocks.push(code));
  const segments = await render(["```\n  a\nb"], stream);
  assert.equal(plain(segments), "▌ CODE\n▌\n▌   a\n▌ b\n\n");
  assert.deepEqual(blocks, ["  a\nb"]);
});

test("strips terminal escapes from model text and code", async () => {
  const segments = await render([
    "\x1b]0;x\x07hi\x1b[31m\n```\n\x1b[31mred\x1b]0;x\x07\n```\n",
  ]);
  for (const segment of segments) {
    if (segment.kind !== "line") continue;
    assert.doesNotMatch(segment.ansi, /\x1b\[31m|\x1b\]/);
  }
  assert.match(plain(segments), /hi\n/);
  assert.doesNotMatch(plain(segments), /\x1b/);
});

test("highlights code with Shiki using ANSI colors across lines", async () => {
  const stream = new MarkdownStream(createLazyHighlighter());
  const segments = await render(
    ["```ts\nconst a = 1;\n/* open\ncomment */\n```\n"],
    stream,
  );
  const code = segments.filter(
    (s) =>
      s.kind === "line" && /^▌ \S/.test(s.plain) && !s.plain.includes("CODE"),
  );
  assert.deepEqual(
    code.map((s) => (s.kind === "line" ? s.plain : "")),
    ["▌ const a = 1;", "▌ /* open", "▌ comment */"],
  );
  for (const line of code) {
    const body = line.kind === "line" ? (line.ansi.split("▌")[1] ?? "") : "";
    assert.match(body, /\x1b\[38;2;/);
  }
  // Shiki keeps the alias as written (`ts`) and still highlights it.
  assert.match(plain(segments), /▌ CODE · ts\n/);
});

test("falls back to uncolored code for unknown languages", async () => {
  const stream = new MarkdownStream(createLazyHighlighter());
  const segments = await render(["```notalanguage\nx\n```\n"], stream);
  const line = segments.find((s) => s.kind === "line" && s.plain === "▌ x");
  const body = line?.kind === "line" ? (line.ansi.split("▌")[1] ?? "") : "";
  assert.doesNotMatch(body, /\x1b\[38;2;/);
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
