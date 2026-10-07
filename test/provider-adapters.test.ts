import assert from "node:assert/strict";
import { test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import {
  AnthropicProvider,
  GeminiProvider,
  OllamaProvider,
  describeFailure,
  type StreamEvent,
} from "../src/providers/index.js";
import { ProviderError } from "../src/utils/errors.js";

const tool = {
  name: "readFile",
  description: "Read",
  parameters: { type: "object", properties: { filePath: { type: "string" } } },
} as const;

test("normalizes Anthropic text and tool-use responses", async () => {
  let request: unknown;
  const client = {
    messages: {
      create: async (input: unknown) => {
        request = input;
        return {
          content: [
            { type: "text", text: "reading" },
            {
              type: "tool_use",
              id: "call-a",
              name: "readFile",
              input: { filePath: "package.json" },
            },
          ],
          usage: { input_tokens: 4, output_tokens: 2 },
          stop_reason: "tool_use",
        };
      },
    },
  } as unknown as Anthropic;
  const provider = new AnthropicProvider({ apiKey: "unused", client });
  const response = await provider.complete(
    [
      { role: "system", content: "system" },
      { role: "user", content: "read" },
    ],
    { tools: [tool] },
  );
  assert.equal(response.content, "reading");
  assert.deepEqual(response.toolCalls, [
    {
      id: "call-a",
      name: "readFile",
      arguments: '{"filePath":"package.json"}',
    },
  ]);
  assert.match(JSON.stringify(request), /input_schema/);
});

test("normalizes Gemini calls and generates deterministic missing IDs", async () => {
  let request: unknown;
  const client = {
    models: {
      generateContent: async (input: unknown) => {
        request = input;
        return {
          text: "reading",
          functionCalls: [
            { name: "readFile", args: { filePath: "package.json" } },
          ],
          usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 },
        };
      },
    },
  } as unknown as GoogleGenAI;
  const provider = new GeminiProvider({ apiKey: "unused", client });
  const response = await provider.complete(
    [
      {
        role: "user",
        content: [
          { type: "text", text: "read" },
          { type: "image", data: "AA==", mediaType: "image/png" },
        ],
      },
    ],
    { tools: [tool] },
  );
  assert.equal(response.toolCalls[0]?.id, "gemini-readFile-0");
  assert.match(JSON.stringify(request), /inlineData/);
  assert.match(JSON.stringify(request), /functionDeclarations/);
});

test("uses the Ollama OpenAI-compatible transport and enforces capabilities", async () => {
  let url = "";
  const client = new OpenAI({
    apiKey: "ollama",
    baseURL: "http://127.0.0.1:11434/v1",
    fetch: async (input) => {
      url = String(input);
      return new Response(
        JSON.stringify({
          id: "chat",
          object: "chat.completion",
          created: 0,
          model: "local",
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: { role: "assistant", content: "local" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  const provider = new OllamaProvider({ client, model: "local" });
  assert.equal(
    (await provider.complete([{ role: "user", content: "hello" }])).content,
    "local",
  );
  assert.match(url, /127\.0\.0\.1:11434/);
  await assert.rejects(
    new OllamaProvider({ client, toolSupport: false }).complete(
      [{ role: "user", content: "read" }],
      { tools: [tool] },
    ),
    /does not support tools/,
  );
});

async function collect(
  stream: AsyncIterable<StreamEvent>,
): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

async function* emit<T>(items: readonly T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

function anthropicWith(
  create: (input: Record<string, unknown>) => unknown,
): AnthropicProvider {
  return new AnthropicProvider({
    apiKey: "unused",
    client: {
      messages: {
        create: async (input: Record<string, unknown>) => create(input),
      },
    } as unknown as Anthropic,
  });
}

const anthropicMessage = {
  content: [{ type: "text", text: "ok" }],
  usage: { input_tokens: 1, output_tokens: 1 },
  stop_reason: "end_turn",
};

test("streams Anthropic text and tool calls incrementally", async () => {
  let request: Record<string, unknown> = {};
  const provider = anthropicWith((input) => {
    request = input;
    return emit([
      {
        type: "message_start",
        message: { usage: { input_tokens: 3, output_tokens: 0 } },
      },
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hel" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "lo" },
      },
      {
        type: "content_block_start",
        index: 1,
        content_block: {
          type: "tool_use",
          id: "call-1",
          name: "readFile",
          input: {},
        },
      },
      {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: '{"filePath"' },
      },
      {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: ':"a"}' },
      },
      {
        type: "message_delta",
        delta: { stop_reason: "tool_use" },
        usage: { input_tokens: null, output_tokens: 5 },
      },
      { type: "message_stop" },
    ]);
  });
  const events = await collect(
    provider.stream([{ role: "user", content: "hi" }]),
  );
  assert.equal(request.stream, true);
  assert.deepEqual(
    events.flatMap((event) =>
      event.type === "text-delta" ? [event.text] : [],
    ),
    ["Hel", "lo"],
  );
  const call = {
    id: "call-1",
    name: "readFile",
    arguments: '{"filePath":"a"}',
  };
  assert.deepEqual(
    events.find((event) => event.type === "tool-call"),
    { type: "tool-call", call },
  );
  const done = events.at(-1);
  assert.deepEqual(done, {
    type: "done",
    response: {
      content: "Hello",
      toolCalls: [call],
      usage: { inputTokens: 3, outputTokens: 5 },
      finishReason: "tool_use",
    },
  });
});

test("streams Gemini chunks incrementally and forwards the abort signal", async () => {
  let request: { config?: { abortSignal?: AbortSignal } } = {};
  const signal = new AbortController().signal;
  const provider = new GeminiProvider({
    apiKey: "unused",
    client: {
      models: {
        generateContentStream: async (input: typeof request) => {
          request = input;
          return emit([
            { text: "A" },
            {
              text: "B",
              functionCalls: [{ name: "readFile", args: { filePath: "a" } }],
              usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 4 },
              candidates: [{ finishReason: "STOP" }],
            },
          ]);
        },
      },
    } as unknown as GoogleGenAI,
  });
  const events = await collect(
    provider.stream([{ role: "user", content: "hi" }], { signal }),
  );
  assert.equal(request.config?.abortSignal, signal);
  assert.deepEqual(
    events.map((event) => event.type),
    ["text-delta", "text-delta", "tool-call", "usage", "done"],
  );
  assert.deepEqual(events.at(-1), {
    type: "done",
    response: {
      content: "AB",
      toolCalls: [
        {
          id: "gemini-readFile-0",
          name: "readFile",
          arguments: '{"filePath":"a"}',
        },
      ],
      usage: { inputTokens: 2, outputTokens: 4 },
      finishReason: "STOP",
    },
  });
});

test("Gemini answers tool calls with the function name, signal and finish reason (bugs 1-3)", async () => {
  let request: {
    contents?: {
      parts?: { functionResponse?: { id?: string; name?: string } }[];
    }[];
    config?: { abortSignal?: AbortSignal };
  } = {};
  const signal = new AbortController().signal;
  const provider = new GeminiProvider({
    apiKey: "unused",
    client: {
      models: {
        generateContent: async (input: typeof request) => {
          request = input;
          return { text: "done", candidates: [{ finishReason: "STOP" }] };
        },
      },
    } as unknown as GoogleGenAI,
  });
  const response = await provider.complete(
    [
      { role: "user", content: "read" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call-9", name: "readFile", arguments: "{}" }],
      },
      { role: "tool", content: "file", toolCallId: "call-9" },
    ],
    { signal },
  );
  const answer = request.contents?.[2]?.parts?.[0]?.functionResponse;
  assert.equal(answer?.name, "readFile");
  assert.equal(answer?.id, "call-9");
  assert.equal(request.config?.abortSignal, signal);
  assert.equal(response.finishReason, "STOP");
});

test("Anthropic sends images and omits empty text blocks (bugs 4-5)", async () => {
  let request: Record<string, unknown> = {};
  const provider = anthropicWith((input) => {
    request = input;
    return anthropicMessage;
  });
  await provider.complete([
    {
      role: "user",
      content: [
        { type: "text", text: "look" },
        { type: "image", data: "AA==", mediaType: "image/png" },
      ],
    },
    {
      role: "assistant",
      content: "",
      toolCalls: [
        { id: "call-1", name: "readFile", arguments: '{"filePath":"a"}' },
      ],
    },
    { role: "tool", content: "file", toolCallId: "call-1" },
  ]);
  assert.deepEqual(request.messages, [
    {
      role: "user",
      content: [
        { type: "text", text: "look" },
        {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: "AA==" },
        },
      ],
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "call-1",
          name: "readFile",
          input: { filePath: "a" },
        },
      ],
    },
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "call-1", content: "file" },
      ],
    },
  ]);
});

test("adapters keep internal ProviderError messages (bug 6)", async () => {
  const provider = anthropicWith(() => anthropicMessage);
  await assert.rejects(
    provider.complete([{ role: "tool", content: "orphan" }]),
    (error: unknown) =>
      error instanceof ProviderError &&
      error.message === "Tool messages require a toolCallId.",
  );
  const failing = anthropicWith(() => {
    throw new Error("boom");
  });
  await assert.rejects(
    failing.complete([{ role: "user", content: "hi" }]),
    (error: unknown) =>
      error instanceof ProviderError &&
      error.message === "Anthropic completion failed." &&
      error.cause instanceof Error,
  );
});

test("describes provider failures with status hints and no secrets", () => {
  assert.equal(
    describeFailure({ status: 401 }),
    " (HTTP 401: invalid or revoked API key)",
  );
  assert.equal(
    describeFailure({ status: 429 }),
    " (HTTP 429: rate limit or insufficient quota)",
  );
  assert.equal(
    describeFailure({ status: 500 }),
    " (HTTP 500: request rejected)",
  );
  assert.match(describeFailure({ connection: true }), /connection error/);
  assert.equal(describeFailure({}), "");
});
