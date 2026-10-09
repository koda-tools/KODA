import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  CodeAgent,
  STEP_LIMIT_PROMPT,
  type ToolExecutor,
} from "../src/core/index.js";
import type {
  ChatMessage,
  ChatResponse,
  CompletionOptions,
  ILLMProvider,
  ProviderCapabilities,
  StreamEvent,
} from "../src/providers/index.js";
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
    { identity: { provider: "openai", model: "test-model" } },
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
      await new CodeAgent(provider, new ToolRegistry({ workspaceRoot: root }), {
        identity: { provider: "openai", model: "test-model" },
      }).run("Read both"),
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
    { identity: { provider: "openai", model: "test-model" } },
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
      { identity: { provider: "openai", model: "test-model" } },
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

test("reports the identity model or the resolved override", async () => {
  const identity = { provider: "openai", model: "base-model" };
  const agent = (provider: ILLMProvider) =>
    new CodeAgent(
      provider,
      new ToolRegistry({ workspaceRoot: process.cwd() }),
      {
        identity,
      },
    );
  const defaulted = await agent(new FakeProvider([direct("a")])).runDetailed(
    "x",
  );
  assert.equal(defaulted.model, "base-model");
  assert.equal(defaulted.provider, "openai");
  const overridden = await agent(new FakeProvider([direct("b")])).runDetailed(
    "y",
    { model: "openai/other-model#fast" },
  );
  assert.equal(overridden.model, "other-model");
});

test("uses the default tool status when a tool declares none", async () => {
  const statuses: (string | undefined)[] = [];
  const tools: ToolExecutor = {
    definitions: [],
    execute: async () => ({ ok: true, content: "ok" }),
    statusLabel: () => undefined,
  };
  await new CodeAgent(
    new FakeProvider([
      {
        content: "",
        toolCalls: [{ id: "t", name: "custom", arguments: "{}" }],
      },
      direct("done"),
    ]),
    tools,
    { identity: { provider: "openai", model: "m" } },
  ).runDetailed("go", {
    observer: { onStatus: (label) => statuses.push(label) },
  });
  assert.deepEqual(statuses, [
    "Thinking...",
    "Using tool...",
    "Thinking...",
    undefined,
  ]);
});

test("stops at the iteration limit", async () => {
  const request: ChatResponse = {
    content: "",
    toolCalls: [{ id: "loop", name: "missing", arguments: "{}" }],
  };
  const agent = new CodeAgent(
    new FakeProvider([request, request]),
    new ToolRegistry({ workspaceRoot: process.cwd() }),
    { identity: { provider: "openai", model: "test-model" }, maxIterations: 2 },
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
    await new CodeAgent(provider, new ToolRegistry({ workspaceRoot: root }), {
      identity: { provider: "openai", model: "test-model" },
    }).runDetailed("go", {
      observer: { onStatus: (label) => statuses.push(label) },
    });
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

test("summarizes instead of failing when the step limit is reached", async () => {
  const loop: ChatResponse = {
    content: "",
    toolCalls: [{ id: "loop", name: "missing", arguments: "{}" }],
  };
  const provider = new FakeProvider([loop, loop, direct("Did A; B remains.")]);
  const result = await new CodeAgent(
    provider,
    new ToolRegistry({ workspaceRoot: process.cwd() }),
    {
      identity: { provider: "openai", model: "test-model" },
      maxIterations: 2,
      onStepLimit: "summarize",
    },
  ).runDetailed("Loop");
  assert.equal(result.content, "Did A; B remains.");
  // The summary request carries the instruction but it is not kept.
  assert.equal(provider.calls[2]?.at(-1)?.content, STEP_LIMIT_PROMPT);
  assert.ok(!result.messages.some((m) => m.content === STEP_LIMIT_PROMPT));
  assert.deepEqual(result.messages.at(-1), {
    role: "assistant",
    content: "Did A; B remains.",
  });
});

test("sends the configured temperature and no tools in the summary call", async () => {
  const seen: (CompletionOptions | undefined)[] = [];
  class OptionsProvider extends FakeProvider {
    public override async complete(
      messages: readonly ChatMessage[],
      options?: CompletionOptions,
    ): Promise<ChatResponse> {
      seen.push(options);
      return super.complete(messages, options);
    }
  }
  const loop: ChatResponse = {
    content: "",
    toolCalls: [{ id: "l", name: "missing", arguments: "{}" }],
  };
  await new CodeAgent(
    new OptionsProvider([loop, direct("summary")]),
    new ToolRegistry({ workspaceRoot: process.cwd() }),
    {
      identity: { provider: "openai", model: "m" },
      maxIterations: 1,
      temperature: 0.1,
      onStepLimit: "summarize",
    },
  ).runDetailed("go");
  assert.equal(seen[0]?.temperature, 0.1);
  assert.ok((seen[0]?.tools?.length ?? 0) > 0);
  assert.equal(seen[1]?.tools, undefined);
});

test("passes the run's abort signal to tool execution", async () => {
  const signals: (AbortSignal | undefined)[] = [];
  const tools: ToolExecutor = {
    definitions: [],
    execute: async (_name, _args, signal) => {
      signals.push(signal);
      return { ok: true, content: "ok" };
    },
    statusLabel: () => undefined,
  };
  const controller = new AbortController();
  await new CodeAgent(
    new FakeProvider([
      { content: "", toolCalls: [{ id: "t", name: "x", arguments: "{}" }] },
      direct("done"),
    ]),
    tools,
    { identity: { provider: "openai", model: "m" } },
  ).runDetailed("go", { signal: controller.signal });
  assert.equal(signals[0], controller.signal);
});
