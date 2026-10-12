import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CodeAgent } from "../src/core/index.js";
import {
  estimateTokens,
  modelLimit,
  type ChatMessage,
  type ChatResponse,
  type CompletionOptions,
  type ILLMProvider,
  type ProviderCapabilities,
  type StreamEvent,
} from "../src/providers/index.js";
import { ToolRegistry } from "../src/tools/registry.js";
import {
  runInteractive,
  Session,
  type InteractiveIO,
  type LineWriter,
} from "../src/cli/tui/index.js";

function silentWriter(
  write: (text: string) => void = () => undefined,
): LineWriter {
  return {
    ensureNewLine: () => undefined,
    write,
    writeSegment: () => undefined,
  };
}

function newSession(write?: (text: string) => void): Session {
  return new Session(
    { provider: "test", model: "model" },
    {
      question: async () => undefined,
      write: () => undefined,
      close: () => undefined,
    },
    silentWriter(write),
  );
}

class RecordingProvider implements ILLMProvider {
  public readonly seen: ChatMessage[][] = [];
  public async complete(): Promise<ChatResponse> {
    return { content: "answer", toolCalls: [], usage: {} };
  }
  public async *stream(
    messages: readonly ChatMessage[],
    _options?: CompletionOptions,
  ): AsyncGenerator<StreamEvent, void, unknown> {
    this.seen.push([...messages]);
    yield { type: "text-delta", text: "answer" };
    yield {
      type: "done",
      response: { content: "answer", toolCalls: [], usage: {} },
    };
  }
  public supportsTools(): boolean {
    return true;
  }
  public capabilities(): ProviderCapabilities {
    return { tools: true, streaming: true, images: false };
  }
}

async function drive(
  provider: RecordingProvider,
  inputs: string[],
  io: Partial<InteractiveIO> = {},
): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-ctx-"));
  let output = "";
  const queue = [...inputs];
  try {
    await runInteractive({
      agent: new CodeAgent(
        provider,
        new ToolRegistry({ workspaceRoot: root }),
        { identity: { provider: "test", model: "model" } },
      ),
      provider: "test",
      model: "model",
      workspaceRoot: root,
      io: {
        question: async () => queue.shift(),
        write: (text) => {
          output += text;
        },
        close: () => undefined,
        ...io,
      },
    });
    return output;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("conversation context persists across turns", async () => {
  const provider = new RecordingProvider();
  await drive(provider, ["first", "second", "/exit"]);
  const secondRequest = provider.seen[1] ?? [];
  assert.ok(
    secondRequest.some(
      (message) => message.role === "user" && message.content === "first",
    ),
  );
  assert.ok(
    secondRequest.some(
      (message) => message.role === "assistant" && message.content === "answer",
    ),
  );
  assert.equal(secondRequest.at(-1)?.content, "second");
});

test("/clear discards the conversation context once confirmed", async () => {
  const provider = new RecordingProvider();
  // "y" answers the confirmation prompt.
  const output = await drive(provider, [
    "first",
    "/clear",
    "y",
    "second",
    "/exit",
  ]);
  assert.match(output, /Conversation context cleared\./);
  const afterClear = provider.seen[1] ?? [];
  assert.ok(
    !afterClear.some((message) => message.content === "first"),
    "history before /clear must not reach the model",
  );
  assert.equal(afterClear.at(-1)?.content, "second");
  assert.equal(afterClear[0]?.role, "system");
});

test("/clear keeps the context when the confirmation is refused", async () => {
  const provider = new RecordingProvider();
  const output = await drive(provider, [
    "first",
    "/clear",
    "n",
    "second",
    "/exit",
  ]);
  assert.match(output, /Conversation context kept\./);
  const afterRefusal = provider.seen[1] ?? [];
  assert.ok(
    afterRefusal.some((message) => message.content === "first"),
    "a refused /clear must preserve the history",
  );
});

test("/reset is an alias that discards the context", async () => {
  const provider = new RecordingProvider();
  const output = await drive(provider, [
    "first",
    "/reset",
    "y",
    "second",
    "/exit",
  ]);
  assert.match(output, /Conversation context cleared\./);
  const afterReset = provider.seen[1] ?? [];
  assert.ok(!afterReset.some((message) => message.content === "first"));
});

test("/clear wipes the visible output and resets the usage totals", async () => {
  const provider = new RecordingProvider();
  let cleared = 0;
  const headers: string[] = [];
  await drive(provider, ["first", "/clear", "y", "/exit"], {
    clearTranscript: () => {
      cleared += 1;
    },
    setHeader: (text) => headers.push(text),
  });
  assert.equal(cleared, 1, "the output area must be wiped once");
  assert.match(headers.at(-1) ?? "", /0 tokens/);
});

test("session memory survives screen activity until explicitly cleared", () => {
  const session = newSession();
  session.appendTurn([
    { role: "user", content: "remember this" },
    { role: "assistant", content: "noted" },
  ]);
  assert.equal(session.conversation().length, 2);
  session.clearConversation();
  assert.deepEqual(session.conversation(), []);
});

/**
 * Mirrors `historyBudget` in session.ts: context minus output minus a 10%
 * reserve (at least 1024). `newSession` uses an unknown provider, which
 * gets the small 8192/2048 fallback, so the budget is 5120 tokens.
 */
function budgetFor(provider: string, model: string): number {
  const { context, output } = modelLimit(provider, model);
  return context - output - Math.max(1_024, Math.ceil(context * 0.1));
}

/** A tool-using turn whose file read weighs about `tokens` tokens. */
function toolTurn(turn: number, tokens: number): ChatMessage[] {
  return [
    { role: "user", content: `u${turn}` },
    {
      role: "assistant",
      content: "",
      toolCalls: [{ id: `t${turn}`, name: "readFile", arguments: "{}" }],
    },
    { role: "tool", toolCallId: `t${turn}`, content: "x".repeat(tokens * 4) },
    { role: "assistant", content: `a${turn}` },
  ];
}

test("history is compacted to the token budget at a turn boundary", () => {
  const session = newSession();
  let dropped = 0;
  for (let turn = 0; turn < 30; turn += 1)
    dropped += session.appendTurn(toolTurn(turn, 1_000)).dropped;
  const history = session.conversation();
  assert.ok(dropped > 0, "30k tokens of history cannot fit 5k");
  assert.ok(estimateTokens(history) <= budgetFor("test", "model"));
  assert.equal(history[0]?.role, "user");
  assert.equal(history.at(-1)?.content, "a29", "the newest turn is kept");
  for (let index = 0; index < history.length; index += 1) {
    if (history[index]?.role !== "tool") continue;
    assert.equal(history[index - 1]?.role, "assistant", "no orphan tool");
  }
});

test("a single turn over the budget is kept whole", () => {
  const session = newSession();
  const turn = toolTurn(0, 20_000);
  assert.equal(session.appendTurn(turn).dropped, 0);
  assert.equal(session.conversation().length, turn.length);
});

test("small conversations are never trimmed and show no notice", () => {
  const written: string[] = [];
  const session = newSession((text) => written.push(text));
  for (let turn = 0; turn < 30; turn += 1)
    assert.equal(session.appendTurn(toolTurn(turn, 10)).dropped, 0);
  assert.equal(session.conversation().length, 120);
  assert.ok(!written.some((text) => text.includes("Context trimmed")));
});

test("dropping messages tells the user how many were dropped", () => {
  const written: string[] = [];
  const session = newSession((text) => written.push(text));
  session.appendTurn(toolTurn(0, 3_000));
  const { dropped } = session.appendTurn(toolTurn(1, 3_000));
  assert.equal(dropped, 4);
  assert.ok(
    written.some((text) =>
      text.includes("Context trimmed: 4 older messages dropped"),
    ),
  );
});

test("switching to a smaller window compacts the existing history", () => {
  const session = new Session(
    { provider: "openai", model: "gpt-4.1-mini" },
    {
      question: async () => undefined,
      write: () => undefined,
      close: () => undefined,
    },
    silentWriter(),
  );
  // About 150k tokens: fits the ~1M window of gpt-4.1-mini.
  for (let turn = 0; turn < 10; turn += 1)
    session.appendTurn(toolTurn(turn, 15_000));
  assert.equal(session.conversation().length, 40);
  // An uncatalogued model falls back to 128k / 16k: the budget is ~99k.
  session.selectModel("not-a-real-model");
  const history = session.conversation();
  assert.ok(history.length < 40);
  assert.ok(estimateTokens(history) <= budgetFor("openai", "not-a-real-model"));
  assert.equal(history[0]?.role, "user");
});
