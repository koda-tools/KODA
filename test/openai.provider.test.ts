import assert from "node:assert/strict";
import { test } from "node:test";
import OpenAI from "openai";
import { OpenAIProvider } from "../src/providers/index.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("normalizes tools, messages, and returned function calls", async () => {
  let requestBody: unknown;
  const client = new OpenAI({
    apiKey: "test-key",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse({
        id: "chat",
        object: "chat.completion",
        created: 0,
        model: "test",
        choices: [
          {
            index: 0,
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: {
                    name: "readFile",
                    arguments: '{"filePath":"package.json"}',
                  },
                },
              ],
            },
          },
        ],
      });
    },
  });
  const provider = new OpenAIProvider({
    apiKey: "unused",
    model: "test-model",
    client,
  });
  const result = await provider.complete([{ role: "user", content: "read" }], {
    tools: [
      { name: "readFile", description: "Read", parameters: { type: "object" } },
    ],
  });
  assert.deepEqual(result.toolCalls, [
    {
      id: "call-1",
      name: "readFile",
      arguments: '{"filePath":"package.json"}',
    },
  ]);
  assert.deepEqual(requestBody, {
    model: "test-model",
    messages: [{ role: "user", content: "read" }],
    tools: [
      {
        type: "function",
        function: {
          name: "readFile",
          description: "Read",
          parameters: { type: "object" },
        },
      },
    ],
    tool_choice: "auto",
  });
});

test("omits tools for a normal completion", async () => {
  let requestBody: Record<string, unknown> = {};
  const client = new OpenAI({
    apiKey: "test-key",
    fetch: async (_input, init) => {
      const parsed: unknown = JSON.parse(String(init?.body));
      if (typeof parsed === "object" && parsed !== null)
        requestBody = parsed as Record<string, unknown>;
      return jsonResponse({
        id: "chat",
        object: "chat.completion",
        created: 0,
        model: "test",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content: "done" },
          },
        ],
      });
    },
  });
  const result = await new OpenAIProvider({
    apiKey: "unused",
    client,
  }).complete([{ role: "user", content: "hi" }]);
  assert.equal(result.content, "done");
  assert.equal("tools" in requestBody, false);
  assert.equal("tool_choice" in requestBody, false);
});
