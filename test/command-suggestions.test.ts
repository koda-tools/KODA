import assert from "node:assert/strict";
import { test } from "node:test";
import { createKeyEvent, type KeyEvent } from "@termuijs/core";
import { CommandRegistry } from "../src/cli/commands/discovery.js";
import type { CustomCommand } from "../src/cli/commands/types.js";
import {
  BUILT_IN_SUGGESTIONS,
  commandSuggestions,
  completion,
  createCommandSuggestions,
  matchSuggestions,
  slashQuery,
} from "../src/cli/tui/index.js";

function custom(name: string, description?: string): CustomCommand {
  return {
    name,
    template: "do it",
    ...(description === undefined ? {} : { description }),
    subagent: false,
    source: { path: `${name}.md`, level: 1, kind: "markdown" },
  };
}

function key(name: string, modifiers: Partial<KeyEvent> = {}): KeyEvent {
  return createKeyEvent({
    key: name,
    raw: Buffer.alloc(0),
    ctrl: modifiers.ctrl ?? false,
    alt: modifiers.alt ?? false,
    shift: modifiers.shift ?? false,
  });
}

class FakePrompt {
  public value = "";
  public replace(text: string): void {
    this.value = text;
  }
}

const registry = new CommandRegistry([
  custom("comand-a", "First"),
  custom("comand-x"),
  custom("help", "Shadowed built-in"),
]);
const items = commandSuggestions(registry);

test("combines built-ins and custom commands without duplicates", () => {
  assert.deepEqual(
    items.map((item) => item.name),
    [...BUILT_IN_SUGGESTIONS.map((item) => item.name), "comand-a", "comand-x"],
  );
  assert.equal(items.find((item) => item.name === "comand-a")?.description, "First");
});

test("only single-line slash text without arguments is a query", () => {
  assert.equal(slashQuery("/"), "");
  assert.equal(slashQuery("/Co"), "Co");
  assert.equal(slashQuery("hello"), undefined);
  assert.equal(slashQuery("/model gpt"), undefined);
  assert.equal(slashQuery("/a\nb"), undefined);
});

test("matches command names by case-insensitive prefix", () => {
  assert.deepEqual(
    matchSuggestions(items, "CO").map((item) => item.name),
    ["commands", "comand-a", "comand-x"],
  );
  assert.deepEqual(matchSuggestions(items, "zzz"), []);
  assert.equal(completion({ name: "model" }), "/model ");
});

test("opens above the prompt on '/' and collapses when nothing matches", async () => {
  const suggestions = await createCommandSuggestions();
  suggestions.setItems(items);
  suggestions.update("/");
  assert.equal(suggestions.isOpen, true);
  assert.notEqual(suggestions.widget.style.height, 0);
  suggestions.update("/zzz");
  assert.equal(suggestions.isOpen, false);
  assert.equal(suggestions.widget.style.height, 0);
  suggestions.update("/model gpt");
  assert.equal(suggestions.isOpen, false);
});

test("arrows select and Tab completes the prompt", async () => {
  const suggestions = await createCommandSuggestions();
  suggestions.setItems(items);
  const prompt = new FakePrompt();
  suggestions.update("/co");
  assert.equal(suggestions.handleKey(key("down"), prompt), true);
  assert.equal(suggestions.handleKey(key("down"), prompt), true);
  assert.equal(suggestions.handleKey(key("up"), prompt), true);
  assert.equal(suggestions.selected()?.name, "commands");
  assert.equal(suggestions.handleKey(key("tab"), prompt), true);
  assert.equal(prompt.value, "/commands ");
  assert.equal(suggestions.isOpen, false);
});

test("Tab without a selection completes the first match", async () => {
  const suggestions = await createCommandSuggestions();
  suggestions.setItems(items);
  const prompt = new FakePrompt();
  suggestions.update("/mo");
  assert.equal(suggestions.handleKey(key("tab"), prompt), true);
  assert.equal(prompt.value, "/model ");
});

test("Enter completes a selection and otherwise submits", async () => {
  const suggestions = await createCommandSuggestions();
  suggestions.setItems(items);
  const prompt = new FakePrompt();
  suggestions.update("/comand");
  assert.equal(suggestions.handleKey(key("enter"), prompt), false);
  assert.equal(prompt.value, "");
  suggestions.handleKey(key("up"), prompt);
  assert.equal(suggestions.handleKey(key("enter"), prompt), true);
  assert.equal(prompt.value, "/comand-x ");
});

test("Escape only closes the list; other keys go to the prompt", async () => {
  const suggestions = await createCommandSuggestions();
  suggestions.setItems(items);
  const prompt = new FakePrompt();
  suggestions.update("/h");
  assert.equal(suggestions.handleKey(key("x"), prompt), false);
  assert.equal(suggestions.handleKey(key("enter", { alt: true }), prompt), false);
  assert.equal(suggestions.handleKey(key("escape"), prompt), true);
  assert.equal(suggestions.isOpen, false);
  assert.equal(suggestions.handleKey(key("escape"), prompt), false);
});
