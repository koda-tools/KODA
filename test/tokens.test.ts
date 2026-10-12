import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateTokens, type ChatMessage } from "../src/providers/index.js";

const user = (content: ChatMessage["content"]): ChatMessage => ({
  role: "user",
  content,
});

void test("an empty conversation costs nothing", () => {
  assert.equal(estimateTokens([]), 0);
});

void test("plain text is not underestimated", () => {
  // "hello world" is 2 tokens in the OpenAI tokenizers.
  assert.ok(estimateTokens([user("hello world")]) >= 2);
  // 400 ASCII characters: at least one token per 4 characters.
  assert.ok(estimateTokens([user("abcd".repeat(100))]) >= 100);
});

void test("every message adds a fixed overhead, even when empty", () => {
  assert.ok(estimateTokens([user("")]) > 0);
});

void test("tool call names and arguments count as text", () => {
  const bare: ChatMessage = { role: "assistant", content: "" };
  const withCall: ChatMessage = {
    ...bare,
    toolCalls: [
      {
        id: "call-1",
        name: "readFile",
        arguments: JSON.stringify({ filePath: "x".repeat(400) }),
      },
    ],
  };
  assert.ok(estimateTokens([withCall]) >= estimateTokens([bare]) + 100);
});

void test("an image costs a fixed amount, whatever its base64 size", () => {
  const image = (data: string): ChatMessage =>
    user([{ type: "image", data, mediaType: "image/png" }]);
  assert.equal(
    estimateTokens([image("aGk=")]),
    estimateTokens([image("A".repeat(200_000))]),
  );
});

void test("CJK text counts about one token per character", () => {
  const cjk = "你好世界".repeat(25); // 100 characters
  assert.ok(estimateTokens([user(cjk)]) >= 100);
});

void test("minified code is estimated from its length", () => {
  const minified = "a=b+c;".repeat(200); // 1200 characters, no spaces
  assert.ok(estimateTokens([user(minified)]) >= 300);
});
