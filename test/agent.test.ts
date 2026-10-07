import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CodeAgent } from "../src/core/agent.js";
import type {
  ChatMessage,
  ChatResponse,
  CompletionOptions,
  ILLMProvider,
  ProviderCapabilities,
  StreamEvent,
} from "../src/providers/base.provider.js";
import { ToolRegistry } from "../src/tools/registry.js";
import { AgentError } from "../src/utils/errors.js";

class FakeProvider implements ILLMProvider {
  public readonly calls: ChatMessage[][] = [];
  public constructor(private readonly responses: ChatResponse[]) {}
  public async complete(
    messages: readonly ChatMessage[],
    _options?: CompletionOptions,
  ): Promise<ChatResponse> {
    this.calls.push([...messages]);
    const response = this.responses.shift();
    if (response === undefined) throw new Error("No fake response configured.");
    return response;
  }
  public async *stream(): AsyncGenerator<StreamEvent, void, unknown> {}
  public supportsTools(): boolean {
    return true;
  }
  public capabilities(): ProviderCapabilities {
    return { tools: true, streaming: true, images: false };
  }
}

const direct = (content: string): ChatResponse => ({ content, toolCalls: [] });

test("returns direct answers without tools", async () => {
  const provider = new FakeProvider([direct("hello")]);
  const answer = await new CodeAgent(
    provider,
    new ToolRegistry({ workspaceRoot: process.cwd() }),
  ).run("Hi");
  assert.equal(answer, "hello");
  assert.equal(provider.calls.length, 1);
});

test("feeds multiple tool observations back with their IDs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-agent-"));
  try {
    await writeFile(path.join(root, "a.txt"), "A");
    await writeFile(path.join(root, "b.txt"), "B");
    const provider = new FakeProvider([
      {
        content: "",
        toolCalls: [
          { id: "one", name: "readFile", arguments: '{"filePath":"a.txt"}' },
          { id: "two", name: "readFile", arguments: '{"filePath":"b.txt"}' },
        ],
      },
      direct("A and B"),
    ]);
    assert.equal(
      await new CodeAgent(
        provider,
        new ToolRegistry({ workspaceRoot: root }),
      ).run("Read both"),
      "A and B",
    );
    assert.deepEqual(provider.calls[1]?.slice(-2), [
      { role: "tool", toolCallId: "one", content: "A" },
      { role: "tool", toolCallId: "two", content: "B" },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("includes prior history and returns the turn's new messages", async () => {
  const provider = new FakeProvider([direct("second")]);
  const history: ChatMessage[] = [
    { role: "user", content: "first" },
    { role: "assistant", content: "answer one" },
  ];
  const result = await new CodeAgent(
    provider,
    new ToolRegistry({ workspaceRoot: process.cwd() }),
  ).runDetailed("again", { history });
  assert.deepEqual(provider.calls[0], [
    { role: "system", content: provider.calls[0]?.[0]?.content },
    { role: "user", content: "first" },
    { role: "assistant", content: "answer one" },
    { role: "user", content: "again" },
  ]);
  assert.deepEqual(result.messages, [
    { role: "user", content: "again" },
    { role: "assistant", content: "second" },
  ]);
});

test("the turn's new messages include tool exchanges in order", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-agent-hist-"));
  try {
    await writeFile(path.join(root, "a.txt"), "A");
    const provider = new FakeProvider([
      {
        content: "",
        toolCalls: [
          { id: "one", name: "readFile", arguments: '{"filePath":"a.txt"}' },
        ],
      },
      direct("done"),
    ]);
    const result = await new CodeAgent(
      provider,
      new ToolRegistry({ workspaceRoot: root }),
    ).runDetailed("read it");
    assert.deepEqual(result.messages, [
      { role: "user", content: "read it" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "one", name: "readFile", arguments: '{"filePath":"a.txt"}' },
        ],
      },
      { role: "tool", toolCallId: "one", content: "A" },
      { role: "assistant", content: "done" },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stops at the iteration limit", async () => {
  const request: ChatResponse = {
    content: "",
    toolCalls: [{ id: "loop", name: "missing", arguments: "{}" }],
  };
  const agent = new CodeAgent(
    new FakeProvider([request, request]),
    new ToolRegistry({ workspaceRoot: process.cwd() }),
    { maxIterations: 2 },
  );
  await assert.rejects(agent.run("Loop"), AgentError);
});

test("reports status labels in execution order and clears them at the end", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-status-"));
  try {
    await writeFile(path.join(root, "a.txt"), "A");
    const provider = new FakeProvider([
      {
        content: "",
        toolCalls: [
          { id: "r", name: "readFile", arguments: '{"filePath":"a.txt"}' },
          {
            id: "w",
            name: "writeFile",
            arguments: '{"filePath":"b.txt","content":"B"}',
          },
          { id: "x", name: "other", arguments: "{}" },
        ],
      },
      direct("done"),
    ]);
    const statuses: (string | undefined)[] = [];
    await new CodeAgent(
      provider,
      new ToolRegistry({ workspaceRoot: root }),
    ).runDetailed("go", { onStatus: (label) => statuses.push(label) });
    assert.deepEqual(statuses, [
      "Thinking...",
      "Reading...",
      "Writing...",
      "Using tool...",
      "Thinking...",
      undefined,
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
