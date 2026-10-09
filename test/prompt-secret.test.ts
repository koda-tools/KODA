import assert from "node:assert/strict";
import { test } from "node:test";
import { createKeyEvent } from "@termuijs/core";
import { createPrompt } from "../src/cli/tui/index.js";

function typed(text: string) {
  return createKeyEvent({
    key: text,
    raw: Buffer.from(text),
    ctrl: false,
    alt: false,
    shift: false,
  });
}

function named(key: string, raw = "") {
  return createKeyEvent({
    key,
    raw: Buffer.from(raw),
    ctrl: false,
    alt: false,
    shift: false,
  });
}

test("secret mode shows only masks and returns the real text", async () => {
  const prompt = await createPrompt();
  prompt.beginSecret();
  for (const char of "sk-12") prompt.handleKey(typed(char));
  prompt.handleKey(named("left", "\u001b[D"));
  assert.equal(prompt.widget.value, "•••••");
  assert.equal(prompt.take(), "sk-12");
  assert.equal(prompt.widget.value, "");
});

test("secret mode handles backspace and pasted text", async () => {
  const prompt = await createPrompt();
  prompt.beginSecret();
  prompt.handleKey(typed("abc"));
  prompt.handleKey(named("backspace", "\u007f"));
  assert.equal(prompt.widget.value, "••");
  assert.equal(prompt.take(), "ab");
});

test("leaving secret mode restores normal typing", async () => {
  const prompt = await createPrompt();
  prompt.beginSecret();
  prompt.handleKey(typed("x"));
  prompt.endSecret();
  prompt.handleKey(typed("h"));
  assert.equal(prompt.widget.value, "h");
  assert.equal(prompt.take(), "h");
});
