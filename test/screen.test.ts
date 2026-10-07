import assert from "node:assert/strict";
import { test } from "node:test";
import { Screen } from "../src/cli/tui/screen.js";

function createFakes() {
  let listener: ((chunk: string) => void) | undefined;
  let output = "";
  const input = {
    setRawMode: () => undefined,
    setEncoding: () => undefined,
    resume: () => undefined,
    pause: () => undefined,
    on: (_event: "data", fn: (chunk: string) => void) => {
      listener = fn;
    },
    off: () => {
      listener = undefined;
    },
  };
  const out = {
    columns: 40,
    rows: 14,
    write: (text: string) => {
      output += text;
    },
    on: () => undefined,
    off: () => undefined,
  };
  return {
    input,
    out,
    send: (chunk: string) => listener?.(chunk),
    output: () => output,
    reset: () => {
      output = "";
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 40));

test("screen pins header, scrolls content, and shows a scrollbar", async () => {
  const fake = createFakes();
  const screen = new Screen(fake.input, fake.out);
  screen.start();
  screen.setHeader("HEADER");
  for (let i = 0; i < 40; i += 1) screen.append(`line ${i}\n`);
  await tick();
  assert.match(fake.output(), /HEADER/);
  assert.match(fake.output(), /line 39/);
  assert.match(fake.output(), /█/);
  fake.reset();
  fake.send("\x1b[5~");
  assert.doesNotMatch(fake.output(), /line 39/);
  assert.match(fake.output(), /scroll: PgUp\/PgDn/);
  screen.stop();
});

test("screen answers questions, echoes input, and sanitizes escapes", async () => {
  const fake = createFakes();
  const screen = new Screen(fake.input, fake.out);
  screen.start();
  const answer = screen.question("❯ ");
  fake.send("hi\x7f!\r");
  assert.equal(await answer, "h!");
  screen.append("\x1b[31mred\x1b[0m\n");
  await tick();
  assert.match(fake.output(), /❯ h!/);
  assert.doesNotMatch(fake.output(), /\x1b\[31m/);
  screen.stop();
});

test("ctrl+c resolves a pending question and notifies handlers", async () => {
  const fake = createFakes();
  const screen = new Screen(fake.input, fake.out);
  screen.start();
  let cancelled = 0;
  screen.onCancel(() => {
    cancelled += 1;
  });
  const answer = screen.question("Write? ");
  fake.send("\x03");
  assert.equal(await answer, undefined);
  assert.equal(cancelled, 1);
  screen.stop();
});

test("screen hard-wraps long lines at the content width", async () => {
  const fake = createFakes();
  const screen = new Screen(fake.input, fake.out);
  screen.start();
  screen.append(`${"x".repeat(100)}\n`);
  await tick();
  assert.match(fake.output(), /\[\d+;1Hx{39}\x1b/);
  assert.doesNotMatch(fake.output(), /x{40}/);
  screen.stop();
});

test("screen clamps scrolling and resumes following at the bottom", async () => {
  const fake = createFakes();
  const screen = new Screen(fake.input, fake.out);
  screen.start();
  for (let i = 0; i < 40; i += 1) screen.append(`line ${i}\n`);
  await tick();
  for (let i = 0; i < 20; i += 1) fake.send("\x1b[5~");
  fake.reset();
  fake.send("\x1b[5~");
  assert.match(fake.output(), /line 0/);
  for (let i = 0; i < 20; i += 1) fake.send("\x1b[6~");
  fake.reset();
  fake.send("\x1b[6~");
  assert.match(fake.output(), /line 39/);
  assert.doesNotMatch(fake.output(), /scroll: PgUp/);
  screen.stop();
});

test("screen parses SS3 keys and mouse-wheel sequences", async () => {
  const fake = createFakes();
  const screen = new Screen(fake.input, fake.out);
  screen.start();
  for (let i = 0; i < 40; i += 1) screen.append(`line ${i}\n`);
  await tick();
  fake.reset();
  fake.send("\x1b[<64;1;1M");
  assert.doesNotMatch(fake.output(), /line 39/);
  fake.send("\x1b[<65;1;1M");
  const answer = screen.question("❯ ");
  fake.send("ab\x1bOHc\r");
  assert.equal(await answer, "cab");
  screen.stop();
});

test("ctrl+l clears the conversation but keeps the header and typed input", async () => {
  const fake = createFakes();
  const screen = new Screen(fake.input, fake.out);
  screen.start();
  screen.setHeader("HEADER");
  screen.append("old output\n");
  const answer = screen.question("❯ ");
  fake.send("draft");
  await tick();
  fake.reset();
  fake.send("\x0c");
  assert.match(fake.output(), /HEADER/);
  assert.match(fake.output(), /draft/);
  assert.doesNotMatch(fake.output(), /old output/);
  screen.append("new output\n");
  fake.send("\r");
  assert.equal(await answer, "draft");
  screen.stop();
});

test("select renders a radio block and resolves the chosen index", async () => {
  const fake = createFakes();
  const screen = new Screen(fake.input, fake.out);
  screen.start();
  const choice = screen.select({
    title: "Write  src/app.ts",
    options: ["Allow", "Reject"],
    hint: "←↑↓→ select · enter confirm",
  });
  await tick();
  assert.match(fake.output(), /Write {2}src\/app\.ts/);
  assert.match(fake.output(), /◉ Allow/);
  assert.match(fake.output(), /○ Reject/);
  assert.match(fake.output(), /enter confirm/);
  fake.send("\x1b[B");
  await tick();
  assert.match(fake.output(), /◉ Reject/);
  fake.send("\r");
  assert.equal(await choice, 1);
  screen.stop();
});

test("select wraps with arrows and does not scroll the transcript", async () => {
  const fake = createFakes();
  const screen = new Screen(fake.input, fake.out);
  screen.start();
  for (let i = 0; i < 40; i += 1) screen.append(`line ${i}\n`);
  const choice = screen.select({
    title: "Write  a.ts",
    options: ["Allow", "Reject"],
  });
  await tick();
  fake.reset();
  fake.send("\x1b[A");
  await tick();
  assert.match(fake.output(), /◉ Reject/);
  assert.doesNotMatch(fake.output(), /line 0\b/);
  fake.send("\x1b[A");
  fake.send("\r");
  assert.equal(await choice, 0);
  screen.stop();
});

test("select resolves undefined when cancelled", async () => {
  const fake = createFakes();
  const screen = new Screen(fake.input, fake.out);
  screen.start();
  const choice = screen.select({
    title: "Write  a.ts",
    options: ["Allow", "Reject"],
  });
  await tick();
  fake.send("\x03");
  assert.equal(await choice, undefined);
  screen.stop();
});

test("held status ignores spinner updates until released", async () => {
  const fake = createFakes();
  const screen = new Screen(fake.input, fake.out);
  screen.start();
  screen.holdStatus("Waiting for decision...");
  screen.setStatus("⠹ Writing...");
  await tick();
  assert.match(fake.output(), /Waiting for decision\.\.\./);
  assert.doesNotMatch(fake.output(), /Writing\.\.\./);
  screen.releaseStatus();
  fake.reset();
  screen.setStatus("⠹ Writing...");
  await tick();
  assert.match(fake.output(), /Writing\.\.\./);
  screen.stop();
});
