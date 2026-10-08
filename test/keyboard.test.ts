import assert from "node:assert/strict";
import { test } from "node:test";
import { createKeyEvent, type KeyEvent } from "@termuijs/core";
import { createKeyHandler } from "../src/cli/tui/index.js";

type Targets = Parameters<typeof createKeyHandler>[0];

function key(name: string, modifiers: Partial<KeyEvent> = {}): KeyEvent {
  return createKeyEvent({
    key: name,
    raw: Buffer.alloc(0),
    ctrl: false,
    alt: false,
    shift: false,
    ...modifiers,
  });
}

/** Fake widgets that record which actions a key triggered. */
function setup(options: { promptText?: string; modalOpen?: boolean } = {}) {
  const calls: string[] = [];
  const prompt = {
    text: options.promptText ?? "",
    get isEmpty(): boolean {
      return this.text === "";
    },
    isSingleLine: true,
    handleKey: (event: KeyEvent) => calls.push(`prompt:${event.key}`),
    insertNewline: () => calls.push("prompt:newline"),
    take: () => "",
  };
  const targets = {
    choices: {
      isOpen: options.modalOpen ?? false,
      consumeConfirmKey: () => false,
      close: () => calls.push("choices:close"),
    },
    suggestions: { handleKey: () => false },
    prompt,
    transcript: { scrollBy: () => undefined, pageSize: () => 10 },
    isBusy: () => false,
    cancel: () => calls.push("cancel"),
    clearTranscript: () => calls.push("clear"),
    copyLastCodeBlock: () => calls.push("copy"),
    newSession: () => calls.push("newSession"),
    openSessionPicker: () => calls.push("openSessionPicker"),
    toggleSidebar: () => calls.push("toggleSidebar"),
    submit: () => calls.push("submit"),
    requestRender: () => undefined,
  } as unknown as Targets;
  return { calls, handle: createKeyHandler(targets) };
}

test("Ctrl+N creates a new session", () => {
  const { calls, handle } = setup();
  handle(key("n", { ctrl: true }));
  assert.deepEqual(calls, ["newSession"]);
});

test("Tab with an empty prompt opens the session picker", () => {
  const { calls, handle } = setup();
  handle(key("tab"));
  assert.deepEqual(calls, ["openSessionPicker"]);
});

test("Tab with text in the prompt is a normal insert, not the picker", () => {
  const { calls, handle } = setup({ promptText: "hello" });
  handle(key("tab"));
  assert.deepEqual(calls, ["prompt:tab"]);
});

test("Ctrl+B toggles the sidebar", () => {
  const { calls, handle } = setup();
  handle(key("b", { ctrl: true }));
  assert.deepEqual(calls, ["toggleSidebar"]);
});

test("session shortcuts do not fire while a modal is open", () => {
  const { calls, handle } = setup({ modalOpen: true });
  handle(key("tab"));
  handle(key("n", { ctrl: true }));
  handle(key("b", { ctrl: true }));
  // Tab must not reopen the picker (it used to discard the pending choice).
  assert.deepEqual(calls, []);
});
