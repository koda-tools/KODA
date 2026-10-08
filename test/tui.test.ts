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
import { renderHeader, runInteractive } from "../src/cli/tui/index.js";

class Provider implements ILLMProvider {
  public async complete(
    _messages: readonly ChatMessage[],
    _options?: CompletionOptions,
  ): Promise<ChatResponse> {
    return {
      content: "answer",
      toolCalls: [],
      usage: { inputTokens: 10, outputTokens: 5 },
    };
  }
  public async *stream(
    _messages?: readonly ChatMessage[],
    _options?: CompletionOptions,
  ): AsyncGenerator<StreamEvent, void, unknown> {
    yield { type: "text-delta", text: "answer" };
    yield {
      type: "done",
      response: {
        content: "answer",
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    };
  }
  public supportsTools(): boolean {
    return true;
  }
  public capabilities(): ProviderCapabilities {
    return { tools: true, streaming: true, images: false };
  }
}

test("renders Koda status and unknown cost", () => {
  const header = renderHeader({
    provider: "ollama",
    model: "local",
    usage: { inputTokens: 20 },
  });
  assert.match(header, /KODA/);
  assert.match(header, /20 tokens/);
  assert.match(header, /N\/A/);
});

test("runs an interactive prompt and exits", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-tui-"));
  const inputs = ["hello", "/exit"];
  let output = "";
  let closed = false;
  try {
    await runInteractive({
      agent: new CodeAgent(
        new Provider(),
        new ToolRegistry({ workspaceRoot: root }),
        { identity: { provider: "test", model: "model" } },
      ),
      provider: "test",
      model: "model",
      workspaceRoot: root,
      io: {
        question: async () => inputs.shift(),
        write: (text) => {
          output += text;
        },
        close: () => {
          closed = true;
        },
      },
    });
    assert.match(output, /answer/);
    assert.match(output, /15 tokens/);
    assert.equal(closed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("/model lists models, switches by number, and rejects unknown names", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-model-"));
  const inputs = ["/model", "/model 2", "/model nope", "hello", "/exit"];
  const used: (string | undefined)[] = [];
  let output = "";
  class ModelProvider extends Provider {
    public async listModels(): Promise<readonly string[]> {
      return ["alpha", "beta"];
    }
    public override async *stream(
      _messages: readonly ChatMessage[],
      options?: CompletionOptions,
    ): AsyncGenerator<StreamEvent, void, unknown> {
      used.push(options?.model);
      yield* super.stream();
    }
  }
  try {
    await runInteractive({
      agent: new CodeAgent(
        new ModelProvider(),
        new ToolRegistry({ workspaceRoot: root }),
        { identity: { provider: "test", model: "alpha" } },
      ),
      provider: "test",
      model: "alpha",
      workspaceRoot: root,
      io: {
        question: async () => inputs.shift(),
        write: (text) => {
          output += text;
        },
        close: () => undefined,
      },
    });
    assert.match(output, /\* 1\. alpha/);
    assert.match(output, /Model set to beta\./);
    assert.match(output, /Unknown model 'nope'/);
    assert.deepEqual(used, ["beta"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function runModelSession(
  inputs: string[],
  listModels: () => Promise<readonly string[]>,
): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-model-edge-"));
  let output = "";
  class EdgeProvider extends Provider {
    public listModels = listModels;
  }
  try {
    await runInteractive({
      agent: new CodeAgent(
        new EdgeProvider(),
        new ToolRegistry({ workspaceRoot: root }),
        { identity: { provider: "test", model: "alpha" } },
      ),
      provider: "test",
      model: "alpha",
      workspaceRoot: root,
      io: {
        question: async () => inputs.shift(),
        write: (text) => {
          output += text;
        },
        close: () => undefined,
      },
    });
    return output;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("/model accepts a provider-prefixed name and rejects an out-of-range index", async () => {
  const output = await runModelSession(
    ["/model test/beta", "/model 9", "/exit"],
    async () => ["alpha", "beta"],
  );
  assert.match(output, /Model set to beta\./);
  assert.match(output, /Unknown model '9'/);
});

test("/model reports listing failures and still accepts a name", async () => {
  const output = await runModelSession(
    ["/model", "/model custom", "/exit"],
    async () => {
      throw new Error("offline");
    },
  );
  assert.match(output, /Could not list models: offline/);
  assert.match(output, /Model set to custom\./);
});

test("renders fenced code with line numbers in the transcript", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-code-"));
  const inputs = ["code", "/exit"];
  let output = "";
  class CodeProvider extends Provider {
    public override async *stream(): AsyncGenerator<
      StreamEvent,
      void,
      unknown
    > {
      yield { type: "text-delta", text: "Sure:\n```py\nprint(1)\n" };
      yield { type: "text-delta", text: "print(2)\n```\n" };
      yield {
        type: "done",
        response: { content: "x", toolCalls: [], usage: {} },
      };
    }
  }
  try {
    await runInteractive({
      agent: new CodeAgent(
        new CodeProvider(),
        new ToolRegistry({ workspaceRoot: root }),
        { identity: { provider: "test", model: "model" } },
      ),
      provider: "test",
      model: "model",
      workspaceRoot: root,
      io: {
        question: async () => inputs.shift(),
        write: (text) => {
          output += text;
        },
        close: () => undefined,
      },
    });
    assert.match(output, / {2}1 \| print\(1\)\n {2}2 \| print\(2\)\n/);
    // The block is wrapped in a Card-style frame with a copy hint.
    assert.match(output, /┌─ py .*Copy/);
    assert.match(output, /└─+┘/);
    assert.doesNotMatch(output, /```/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
