import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Session,
  SessionController,
  type InteractiveIO,
  type LineWriter,
  type SessionSummaryView,
} from "../src/cli/tui/index.js";

const writer: LineWriter = {
  ensureNewLine: () => undefined,
  write: () => undefined,
  writeSegment: () => undefined,
};

/** A minimal IO that records the transcript swap and session summaries. */
class FakeIO {
  public transcript: string[] = [""];
  public sessions: readonly SessionSummaryView[] = [];
  public readonly io: InteractiveIO;

  public constructor() {
    this.io = {
      question: () => Promise.resolve(undefined),
      write: () => undefined,
      close: () => undefined,
      getTranscript: () => this.transcript,
      setTranscript: (lines) => {
        this.transcript = lines.length === 0 ? [""] : [...lines];
      },
      setSessions: (sessions) => {
        this.sessions = sessions;
      },
    };
  }
}

function controller(fake: FakeIO): SessionController {
  return new SessionController(
    fake.io,
    () => new Session({ provider: "openai", model: "gpt-5" }, fake.io, writer),
  );
}

test("starts with a single active session summary", () => {
  const fake = new FakeIO();
  controller(fake);
  assert.equal(fake.sessions.length, 1);
  assert.equal(fake.sessions[0]?.active, true);
  assert.equal(fake.sessions[0]?.model, "gpt-5");
});

test("new session becomes active and shows an empty transcript", () => {
  const fake = new FakeIO();
  const sessions = controller(fake);
  fake.transcript = ["session 1 output"];

  sessions.newSession();
  // The new (second) session is active and its transcript starts empty.
  assert.equal(fake.sessions.length, 2);
  assert.equal(fake.sessions[1]?.active, true);
  assert.equal(fake.sessions[0]?.active, false);
  assert.deepEqual(fake.transcript, [""]);
});

test("switching preserves and restores each transcript", () => {
  const fake = new FakeIO();
  const sessions = controller(fake);
  fake.transcript = ["first session line"];

  sessions.newSession(); // now on session 2, empty
  fake.transcript = ["second session line"];

  sessions.switchTo(0); // back to session 1
  assert.deepEqual(fake.transcript, ["first session line"]);

  sessions.switchTo(1); // forward to session 2
  assert.deepEqual(fake.transcript, ["second session line"]);
});

test("summaries reflect the active session's model and tokens", () => {
  const fake = new FakeIO();
  const sessions = controller(fake);
  sessions.active().selectModel("gpt-4o");
  sessions.active().completeRequest({ inputTokens: 100, outputTokens: 150 });
  sessions.pushSummaries();

  const current = fake.sessions.find((s) => s.active);
  assert.equal(current?.model, "gpt-4o");
  assert.equal(current?.tokens, 250);
});

test("picker items mark the active session", () => {
  const fake = new FakeIO();
  const sessions = controller(fake);
  sessions.newSession();
  const items = sessions.pickerItems();
  assert.equal(items.length, 2);
  assert.equal(items[0]?.active, false);
  assert.equal(items[1]?.active, true);
});
