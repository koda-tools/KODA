import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CodeAgent } from "../src/core/index.js";
import type {
  ChatMessage,
  ChatResponse,
  CompletionOptions,
  ILLMProvider,
  ProviderCapabilities,
  StreamEvent,
} from "../src/providers/index.js";
import { ToolRegistry } from "../src/tools/registry.js";
import {
  runInteractive,
  Session,
  type InteractiveIO,
  type LineWriter,
} from "../src/cli/tui/index.js";

function silentWriter(): LineWriter {
  return {
    ensureNewLine: () => undefined,
    write: () => undefined,
    writeSegment: () => undefined,
  };
}

function newSession(): Session {
  return new Session(
    { provider: "test", model: "model" },
    {
      question: async () => undefined,
      write: () => undefined,
      close: () => undefined,
    },
    silentWriter(),
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

test("history window trims at a turn boundary without orphan tool messages", () => {
  const session = newSession();
  for (let turn = 0; turn < 30; turn += 1) {
    session.appendTurn([
      { role: "user", content: `u${turn}` },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: `t${turn}`, name: "readFile", arguments: "{}" }],
      },
      { role: "tool", toolCallId: `t${turn}`, content: "data" },
      { role: "assistant", content: `a${turn}` },
    ]);
  }
  const history = session.conversation();
  assert.ok(history.length <= 40);
  assert.equal(history[0]?.role, "user");
  for (let index = 0; index < history.length; index += 1) {
    if (history[index]?.role !== "tool") continue;
    assert.equal(history[index - 1]?.role, "assistant");
  }
});
