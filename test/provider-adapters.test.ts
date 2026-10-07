import assert from "node:assert/strict";
import { test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { AnthropicProvider } from "../src/providers/adapters/anthropic.provider.js";
import { GeminiProvider } from "../src/providers/adapters/gemini.provider.js";
import { OllamaProvider } from "../src/providers/adapters/ollama.provider.js";

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

test("all provider streams expose normalized completion events", async () => {
  const anthropic = new AnthropicProvider({
    apiKey: "unused",
    client: {
      messages: {
        create: async () => ({
          content: [{ type: "text", text: "A" }],
          usage: { input_tokens: 1, output_tokens: 1 },
          stop_reason: "end_turn",
        }),
      },
    } as unknown as Anthropic,
  });
  const events = [];
  for await (const event of anthropic.stream([
    { role: "user", content: "hello" },
  ]))
    events.push(event.type);
  assert.deepEqual(events, ["text-delta", "usage", "done"]);
});

test("describes provider failures with status hints and no secrets", async () => {
  const { describeFailure } = await import(
    "../src/providers/adapters/error-description.js"
  );
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
