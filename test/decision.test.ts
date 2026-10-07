import assert from "node:assert/strict";
import { test } from "node:test";
import { decide } from "../src/cli/tui/decision.js";
import type { InteractiveIO, SelectRequest } from "../src/cli/tui/io.js";

function baseIO(overrides: Partial<InteractiveIO>): InteractiveIO {
  return {
    question: async () => undefined,
    write: () => undefined,
    close: () => undefined,
    ...overrides,
  };
}

test("selector choice Allow resolves to true and holds the waiting status", async () => {
  const held: string[] = [];
  let released = 0;
  let seen: SelectRequest | undefined;
  const io = baseIO({
    holdStatus: (text) => held.push(text),
    releaseStatus: () => {
      released += 1;
    },
    setStatus: () => assert.fail("setStatus must not be used when hold exists"),
    select: async (request) => {
      seen = request;
      return 0;
    },
  });
  const result = await decide(io, "Write  a.ts", "fallback [y/N] ");
  assert.equal(result, true);
  assert.deepEqual(seen?.options, ["Allow", "Reject"]);
  assert.equal(seen?.title, "Write  a.ts");
  assert.match(seen?.hint ?? "", /enter confirm/);
  assert.deepEqual(held, ["Waiting for decision..."]);
  assert.equal(released, 1);
});

test("falls back to setStatus when the hold API is unavailable", async () => {
  const statuses: (string | undefined)[] = [];
  const io = baseIO({
    setStatus: (text) => statuses.push(text),
    select: async () => 1,
  });
  const result = await decide(io, "t", "f [y/N] ");
  assert.equal(result, false);
  assert.equal(statuses[0], "Waiting for decision...");
  assert.equal(statuses.at(-1), undefined);
});

test("selector choice Reject resolves to false", async () => {
  const io = baseIO({ select: async () => 1 });
  assert.equal(await decide(io, "t", "f [y/N] "), false);
});

test("selector cancellation resolves to false", async () => {
  const io = baseIO({ select: async () => undefined });
  assert.equal(await decide(io, "t", "f [y/N] "), false);
});

test("falls back to a line prompt when selection is unavailable", async () => {
  const asked: string[] = [];
  const io = baseIO({
    question: async (prompt) => {
      asked.push(prompt);
      return "y";
    },
  });
  const result = await decide(io, "t", "Write file? [y/N] ");
  assert.equal(result, true);
  assert.deepEqual(asked, ["Write file? [y/N] "]);
});

test("line fallback treats anything but y as rejection", async () => {
  const io = baseIO({ question: async () => "n" });
  assert.equal(await decide(io, "t", "f [y/N] "), false);
});

test("clears the waiting status even when selection throws", async () => {
  const statuses: (string | undefined)[] = [];
  const io = baseIO({
    setStatus: (text) => statuses.push(text),
    select: async () => {
      throw new Error("boom");
    },
  });
  await assert.rejects(decide(io, "t", "f [y/N] "));
  assert.equal(statuses.at(-1), undefined);
});
