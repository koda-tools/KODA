import test from "node:test";
import assert from "node:assert/strict";
import { boundedContext } from "../src/adapters/workspace.js";
import { canonicalWorkspaceUri, sessionKey } from "../src/adapters/identity.js";
import { parseParticipantRequest } from "../src/chat/participant.js";
import { writeKodaEvent } from "../src/chat/stream.js";
import { SessionRegistry } from "../src/adapters/sessions.js";
import type { KodaChatRuntime } from "../src/contracts.js";

function runtime(): KodaChatRuntime {
  return { execute: async () => { throw new Error("not used"); }, dispose: async () => undefined };
}

test("participant parsing defaults to build and accepts plan", () => {
  assert.equal(parseParticipantRequest({ prompt: "build it", workspaceUri: "FILE:///WS/", conversationKey: "c" }).mode, "build");
  assert.equal(parseParticipantRequest({ prompt: "/plan inspect auth", workspaceUri: "file:///ws", conversationKey: "c" }).mode, "plan");
  assert.throws(() => parseParticipantRequest({ prompt: "/plan", workspaceUri: "file:///ws", conversationKey: "c" }));
});

test("workspace identity prevents empty and cross-workspace keys", () => {
  assert.equal(canonicalWorkspaceUri("FILE:///WS/"), "file:///ws");
  assert.equal(sessionKey("file:///a", "c"), "file:///a::c");
  assert.notEqual(sessionKey("file:///a", "c"), sessionKey("file:///b", "c"));
});

test("context is bounded and does not enumerate workspace contents", () => {
  const context = boundedContext("file:///ws", { selection: "x".repeat(20_000), diagnostics: Array(30).fill("warning") });
  assert.equal(context.selection?.length, 8_000);
  assert.equal(context.diagnostics?.length, 20);
  assert.equal(context.activeFile, undefined);
});

test("session registry disposes all independent runtimes", async () => {
  let disposed = 0;
  const registry = new SessionRegistry();
  const make = (workspaceUri: string, conversationKey: string) => registry.set({
    key: sessionKey(workspaceUri, conversationKey), workspaceUri, conversationKey,
    runtime: { ...runtime(), dispose: async () => { disposed += 1; } }, history: [],
  });
  make("file:///one", "a"); make("file:///two", "a");
  await registry.dispose();
  assert.equal(disposed, 2);
});

test("event fallback never exposes tool arguments", () => {
  const output: string[] = [];
  writeKodaEvent({ markdown: (value) => output.push(String(value)), progress: () => undefined }, { type: "tool.started", call: { id: "1", name: "writeFile", arguments: "secret-token" } });
  assert.deepEqual(output, []);
});
