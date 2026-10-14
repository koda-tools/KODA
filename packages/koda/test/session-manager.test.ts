import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Session,
  SessionManager,
  type InteractiveIO,
  type LineWriter,
} from "../src/cli/tui/index.js";

const io: InteractiveIO = {
  question: () => Promise.resolve(undefined),
  write: () => undefined,
  close: () => undefined,
};

const writer: LineWriter = {
  ensureNewLine: () => undefined,
  write: () => undefined,
  writeSegment: () => undefined,
};

function manager(): SessionManager {
  return new SessionManager(
    () => new Session({ provider: "openai", model: "gpt-5" }, io, writer),
  );
}

test("starts with exactly one active session", () => {
  const m = manager();
  assert.equal(m.count(), 1);
  assert.equal(m.activeIndex(), 0);
  assert.equal(m.activeSession().session.model, "gpt-5");
});

test("create adds a session, makes it active, and keeps the others", () => {
  const m = manager();
  const first = m.activeSession();
  first.session.selectModel("gpt-4o");

  const second = m.create();
  assert.equal(m.count(), 2);
  assert.equal(m.activeIndex(), 1);
  assert.notEqual(second.id, first.id);
  // The previous session is untouched.
  assert.equal(m.list()[0]?.session.model, "gpt-4o");
});

test("switchTo changes the active session without altering history", () => {
  const m = manager();
  m.activeSession().session.appendTurn([{ role: "user", content: "hi" }]);
  m.create();
  assert.equal(m.activeIndex(), 1);

  const back = m.switchTo(0);
  assert.equal(m.activeIndex(), 0);
  assert.equal(back?.session.conversation().length, 1);
  // Out-of-range switch is a no-op returning undefined.
  assert.equal(m.switchTo(5), undefined);
  assert.equal(m.activeIndex(), 0);
});

test("each session keeps an independent transcript buffer", () => {
  const m = manager();
  m.activeSession().transcript = ["first session line"];
  m.create();
  m.activeSession().transcript = ["second session line"];

  assert.deepEqual(m.list()[0]?.transcript, ["first session line"]);
  assert.deepEqual(m.list()[1]?.transcript, ["second session line"]);
});

test("remove drops a session but never the last one", () => {
  const m = manager();
  assert.equal(m.remove(0), false); // only one left

  m.create(); // index 1 active
  m.create(); // index 2 active
  assert.equal(m.count(), 3);
  assert.equal(m.activeIndex(), 2);

  assert.equal(m.remove(0), true);
  assert.equal(m.count(), 2);
  // Active followed the removal (was 2, one earlier removed → 1).
  assert.equal(m.activeIndex(), 1);
});
