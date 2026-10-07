import assert from "node:assert/strict";
import { test } from "node:test";
import { computeLayout, Screen } from "@termuijs/core";
import {
  createPrompt,
  PROMPT_TITLE,
  type Prompt,
} from "../src/cli/tui/index.js";

const COLS = 40;
const ROWS = 6;

/** Lays out and renders the prompt headlessly, returning the screen rows. */
function render(prompt: Prompt): string[] {
  const screen = new Screen(COLS, ROWS);
  const node = prompt.widget.getLayoutNode();
  computeLayout(node, COLS, ROWS);
  prompt.widget.syncLayout();
  prompt.widget.render(screen);
  return Array.from({ length: ROWS }, (_, row) => screen.getLine(row));
}

test("draws the label inside the prompt top border", async () => {
  const top = render(await createPrompt())[0] ?? "";
  assert.ok(
    top.includes(PROMPT_TITLE),
    `expected "${PROMPT_TITLE}" in the top border, got: ${top}`,
  );
  // The label sits between the corner and the trailing dashes.
  assert.match(top, /^┌─+Message─+┐$/u);
});

test("keeps the rest of the border intact", async () => {
  const lines = render(await createPrompt());
  assert.match(lines[1] ?? "", /^│.*│$/u);
  const bottom = lines.findIndex((line) => /^└─+┘$/u.test(line));
  assert.ok(bottom > 0, `expected a bottom border row, got: ${lines.join("|")}`);
});
