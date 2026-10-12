import assert from "node:assert/strict";
import { test } from "node:test";
import { computeLayout, Screen } from "@termuijs/core";
import {
  createPrompt,
  PROMPT_PLACEHOLDER,
  PROMPT_SEND_HINT,
  type Prompt,
} from "../src/cli/tui/index.js";

const COLS = 50;

/**
 * Lays out and renders the prompt headlessly in a screen of `rows` rows
 * (the root fills it, so pass the height the box is expected to have).
 */
function render(prompt: Prompt, rows: number): string[] {
  const screen = new Screen(COLS, rows);
  const node = prompt.widget.getLayoutNode();
  computeLayout(node, COLS, rows);
  prompt.widget.syncLayout();
  prompt.widget.render(screen);
  return Array.from({ length: rows }, (_, row) => screen.getLine(row));
}

const BAR_ROW = /^│ ▌ +│$/u;

test("draws the message box: bar, placeholder and footer", async () => {
  const prompt = await createPrompt();
  prompt.focused = true;
  prompt.setInfo("build · gpt-4o-mini");
  const rows = render(prompt, 7);

  assert.match(rows[0] ?? "", /^┌─+┐$/u);
  assert.match(rows[1] ?? "", BAR_ROW);
  assert.match(rows[2] ?? "", /^│ ▌ +Digite sua mensagem\.\.\. +│$/u);
  assert.match(rows[3] ?? "", BAR_ROW);
  assert.match(rows[4] ?? "", /^│ +│$/u);
  assert.match(rows[5] ?? "", /^│ +build · gpt-4o-mini +Enter ↵ enviar +│$/u);
  assert.match(rows[6] ?? "", /^└─+┘$/u);
  assert.ok(PROMPT_PLACEHOLDER.length > 0 && PROMPT_SEND_HINT.length > 0);
});

test("typed text replaces the placeholder and the footer stays", async () => {
  const prompt = await createPrompt();
  prompt.focused = true;
  for (const char of "olá") prompt.widget.insertChar(char);
  const rows = render(prompt, 7);
  assert.match(rows[2] ?? "", /^│ ▌ +olá +│$/u);
  assert.ok(!rows.join("\n").includes("Digite"));
  assert.match(rows[5] ?? "", /Enter ↵ enviar/u);
});

test("the box grows with each line and keeps the footer at the bottom", async () => {
  const prompt = await createPrompt();
  prompt.focused = true;
  prompt.replace("one");
  prompt.insertNewline();
  prompt.widget.insertChar("t");
  prompt.insertNewline();
  prompt.widget.insertChar("x");
  const rows = render(prompt, 9);

  // 3 text rows: border + padding + 3 + spacing, blank, footer, border.
  assert.match(rows[0] ?? "", /^┌─+┐$/u);
  assert.match(rows[2] ?? "", /^│ ▌ +one +│$/u);
  assert.match(rows[3] ?? "", /^│ ▌ +t +│$/u);
  assert.match(rows[4] ?? "", /^│ ▌ +x/u);
  assert.match(rows[5] ?? "", BAR_ROW);
  assert.match(rows[6] ?? "", /^│ +│$/u);
  assert.match(rows[7] ?? "", /Enter ↵ enviar/u);
  assert.match(rows[8] ?? "", /^└─+┘$/u);
});

test("a long agent/model label is clipped instead of overlapping the hint", async () => {
  const prompt = await createPrompt();
  prompt.setInfo("x".repeat(200));
  const footer = render(prompt, 7)[5] ?? "";
  assert.match(footer, /…\s+Enter ↵ enviar\s+│$/u);
});
