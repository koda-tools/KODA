import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import type { AgentContext, SessionUpdate } from "@agentclientprotocol/sdk";
import { AcpEventSink } from "../src/adapters/events.js";

test("ACP events preserve text and tool order without sending tool output", async () => {
  const updates: SessionUpdate[] = [];
  const client = {
    notify: async (_method: unknown, params: { update: SessionUpdate }) => {
      updates.push(params.update);
    },
  } as unknown as AgentContext;
  const root = resolve("workspace");
  const sink = new AcpEventSink(
    client,
    "session-1",
    root,
    new AbortController().signal,
  );
  const call = {
    id: "tool-1",
    name: "writeFile",
    arguments: JSON.stringify({ filePath: "example.txt", secret: "private" }),
  };

  await sink.text("hello");
  await sink.observer().onToolStart?.(call);
  await sink.observer().onToolResult?.(call, {
    ok: true,
    content: "private tool output",
  });

  assert.deepEqual(
    updates.map((update) => update.sessionUpdate),
    ["agent_message_chunk", "tool_call", "tool_call_update"],
  );
  assert.equal(sink.sentText, true);
  assert.doesNotMatch(JSON.stringify(updates), /private|tool output/);
  const last = updates.at(-1);
  assert.equal(last?.sessionUpdate, "tool_call_update");
  if (last?.sessionUpdate === "tool_call_update")
    assert.equal(last.locations?.[0]?.path, resolve(root, "example.txt"));
});

test("ACP text updates are bounded and stop on cancellation", async () => {
  const updates: SessionUpdate[] = [];
  const client = {
    notify: async (_method: unknown, params: { update: SessionUpdate }) => {
      updates.push(params.update);
    },
  } as unknown as AgentContext;
  const cancellation = new AbortController();
  const sink = new AcpEventSink(
    client,
    "session-1",
    process.cwd(),
    cancellation.signal,
  );

  await sink.text("x".repeat(40_000));
  assert.equal(updates.length, 3);
  for (const update of updates) {
    if (
      update.sessionUpdate === "agent_message_chunk" &&
      update.content.type === "text"
    )
      assert.ok(update.content.text.length <= 16_384);
  }
  cancellation.abort();
  await sink.text("ignored");
  assert.equal(updates.length, 3);
});
