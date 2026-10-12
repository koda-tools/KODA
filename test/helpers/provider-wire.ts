/**
 * Vendor table for the wire-level provider suite.
 *
 * Each vendor knows how to build its provider with a scripted `fetch`, how to
 * read a recorded request body into normalized wire facts, and how to answer
 * with its own payload shapes. The scenarios in `provider-wire.test.ts` only
 * use these normalized facts, so they stay valid across adapter rewrites.
 */

import {
  AnthropicProvider,
  GeminiProvider,
  OllamaProvider,
  OpenAIProvider,
  providerFromConfig,
  type ILLMProvider,
  type ProviderName,
} from "../../src/providers/index.js";
import { SSE_DONE, sseData, sseEvent, type FakeReply } from "./fake-fetch.js";
import type { RecordedRequest } from "./fake-fetch.js";

export interface WireToolCall {
  readonly id?: string | undefined;
  readonly name: string;
  readonly args: unknown;
}

export interface WireToolResult {
  readonly id?: string | undefined;
  /** Only some vendors name the answered call on the wire. */
  readonly name?: string | undefined;
  readonly text: string;
}

export interface WireImage {
  readonly mediaType?: string | undefined;
  readonly data: string;
}

export interface WireMessage {
  /** `tool` whenever the message carries tool results, whatever the vendor role. */
  readonly role: string;
  readonly text: string;
  readonly toolCalls: readonly WireToolCall[];
  readonly toolResults: readonly WireToolResult[];
  readonly images: readonly WireImage[];
}

export interface WireTool {
  readonly name: string;
  readonly description?: string | undefined;
  readonly properties: unknown;
  readonly required: unknown;
}

export interface WireRequest {
  readonly system: string;
  readonly messages: readonly WireMessage[];
  readonly tools: readonly WireTool[];
  readonly maxTokens?: number | undefined;
  readonly temperature?: number | undefined;
}

export interface Usage {
  readonly input: number;
  readonly output: number;
}

export interface ReplyToolCall {
  readonly id: string;
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
}

export interface VendorReplies {
  /** Non-streaming text answer. */
  text(text: string, usage: Usage): FakeReply;
  /** Non-streaming answer with a single tool call. */
  toolCall(call: ReplyToolCall, usage: Usage): FakeReply;
  /** Streamed text, one chunk per entry, then usage and the finish reason. */
  streamText(chunks: readonly string[], usage: Usage): FakeReply;
  /** Streamed tool call with the arguments split across chunks. */
  streamToolCall(
    call: ReplyToolCall,
    argumentChunks: readonly string[],
  ): FakeReply;
  /** Opens a stream that never finishes, for cancellation. */
  streamHang(): FakeReply;
  /** HTTP failure with the vendor's error envelope. */
  httpError(status: number): FakeReply;
}

export interface Vendor {
  readonly name: ProviderName;
  readonly host: string;
  /** The old adapters cannot take a `fetch`, so Gemini patches the global one. */
  readonly patchesGlobalFetch: boolean;
  /** Requests sent when every attempt fails with a retryable status. */
  readonly retryableAttempts: number;
  /** Requests sent when the connection fails. */
  readonly networkAttempts: number;
  /** Whether a failed connection is reported with the connection hint. */
  readonly networkHint: boolean;
  /**
   * What cancelling a stream does today: the OpenAI and Anthropic SDKs
   * swallow the abort and the accumulator still closes with the partial text
   * (`done`), while Gemini raises (`throw`).
   */
  readonly onAbort: "done" | "throw";
  create(fetch: typeof globalThis.fetch, toolSupport?: boolean): ILLMProvider;
  read(request: RecordedRequest): WireRequest;
  readonly replies: VendorReplies;
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(record) : [];

const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

const num = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

function json(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Collapses a tool-result payload (string or content blocks) into text. */
function resultText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value
      .map(record)
      .map((block) => text(block.text))
      .join("");
  const object = record(value);
  for (const key of ["content", "result", "value", "text"])
    if (key in object) return resultText(object[key]);
  return JSON.stringify(value);
}

function schemaFacts(
  value: unknown,
): Pick<WireTool, "properties" | "required"> {
  const schema = record(value);
  return { properties: schema.properties, required: schema.required };
}

function fromDataUrl(url: string): WireImage {
  const match = /^data:([^;]+);base64,(.*)$/.exec(url);
  return match === null
    ? { data: url }
    : { mediaType: match[1], data: match[2] ?? "" };
}

function message(
  role: string,
  parts: {
    text?: string;
    toolCalls?: WireToolCall[];
    toolResults?: WireToolResult[];
    images?: WireImage[];
  },
): WireMessage {
  const toolResults = parts.toolResults ?? [];
  return {
    role: toolResults.length > 0 ? "tool" : role,
    text: parts.text ?? "",
    toolCalls: parts.toolCalls ?? [],
    toolResults,
    images: parts.images ?? [],
  };
}

// --- OpenAI and Ollama (chat completions) ----------------------------------

function readOpenAI(request: RecordedRequest): WireRequest {
  const body = record(request.body);
  const system: string[] = [];
  const messages: WireMessage[] = [];
  for (const entry of list(body.messages)) {
    const role = text(entry.role);
    if (role === "system" || role === "developer") {
      system.push(resultText(entry.content));
      continue;
    }
    const parts = list(entry.content);
    const toolCalls = list(entry.tool_calls).map((call) => {
      const fn = record(call.function);
      return {
        id: text(call.id),
        name: text(fn.name),
        args: json(fn.arguments),
      };
    });
    messages.push(
      message(role, {
        text:
          typeof entry.content === "string"
            ? role === "tool"
              ? ""
              : entry.content
            : parts
                .filter((part) => part.type === "text")
                .map((part) => text(part.text))
                .join(""),
        toolCalls,
        toolResults:
          role === "tool"
            ? [
                {
                  id: text(entry.tool_call_id),
                  text: resultText(entry.content),
                },
              ]
            : [],
        images: parts
          .filter((part) => part.type === "image_url")
          .map((part) => fromDataUrl(text(record(part.image_url).url))),
      }),
    );
  }
  return {
    system: system.join("\n"),
    messages,
    tools: list(body.tools).map((tool) => {
      const fn = record(tool.function);
      return {
        name: text(fn.name),
        description: text(fn.description),
        ...schemaFacts(fn.parameters),
      };
    }),
    maxTokens: num(body.max_tokens) ?? num(body.max_completion_tokens),
    temperature: num(body.temperature),
  };
}

const openAIReplies: VendorReplies = {
  text: (content, usage) => ({
    kind: "json",
    body: {
      id: "chat",
      object: "chat.completion",
      created: 0,
      model: "wire",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: { role: "assistant", content },
        },
      ],
      usage: { prompt_tokens: usage.input, completion_tokens: usage.output },
    },
  }),
  toolCall: (call, usage) => ({
    kind: "json",
    body: {
      id: "chat",
      object: "chat.completion",
      created: 0,
      model: "wire",
      choices: [
        {
          index: 0,
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: call.id,
                type: "function",
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.args),
                },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: usage.input, completion_tokens: usage.output },
    },
  }),
  streamText: (chunks, usage) => ({
    kind: "sse",
    frames: [
      ...chunks.map((content) =>
        sseData({
          id: "chat",
          object: "chat.completion.chunk",
          created: 0,
          model: "wire",
          choices: [{ index: 0, delta: { content }, finish_reason: null }],
        }),
      ),
      sseData({
        id: "chat",
        object: "chat.completion.chunk",
        created: 0,
        model: "wire",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: usage.input, completion_tokens: usage.output },
      }),
      SSE_DONE,
    ],
  }),
  streamToolCall: (call, argumentChunks) => ({
    kind: "sse",
    frames: [
      sseData({
        id: "chat",
        object: "chat.completion.chunk",
        created: 0,
        model: "wire",
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: call.id,
                  type: "function",
                  function: { name: call.name, arguments: "" },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
      ...argumentChunks.map((chunk) =>
        sseData({
          id: "chat",
          object: "chat.completion.chunk",
          created: 0,
          model: "wire",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [{ index: 0, function: { arguments: chunk } }],
              },
              finish_reason: null,
            },
          ],
        }),
      ),
      sseData({
        id: "chat",
        object: "chat.completion.chunk",
        created: 0,
        model: "wire",
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      SSE_DONE,
    ],
  }),
  streamHang: () => ({
    kind: "sse",
    frames: [
      sseData({
        id: "chat",
        object: "chat.completion.chunk",
        created: 0,
        model: "wire",
        choices: [
          { index: 0, delta: { content: "start" }, finish_reason: null },
        ],
      }),
    ],
    hang: true,
  }),
  httpError: (status) => ({
    kind: "json",
    status,
    headers: { "retry-after-ms": "1" },
    body: { error: { message: "wire failure", type: "invalid_request_error" } },
  }),
};

// --- Anthropic -------------------------------------------------------------

function readAnthropic(request: RecordedRequest): WireRequest {
  const body = record(request.body);
  const messages = list(body.messages).map((entry) => {
    const role = text(entry.role);
    const blocks = list(entry.content);
    return message(role, {
      text:
        typeof entry.content === "string"
          ? entry.content
          : blocks
              .filter((block) => block.type === "text")
              .map((block) => text(block.text))
              .join(""),
      toolCalls: blocks
        .filter((block) => block.type === "tool_use")
        .map((block) => ({
          id: text(block.id),
          name: text(block.name),
          args: block.input,
        })),
      toolResults: blocks
        .filter((block) => block.type === "tool_result")
        .map((block) => ({
          id: text(block.tool_use_id),
          text: resultText(block.content),
        })),
      images: blocks
        .filter((block) => block.type === "image")
        .map((block) => {
          const source = record(block.source);
          return {
            mediaType: text(source.media_type),
            data: text(source.data),
          };
        }),
    });
  });
  return {
    system: resultText(body.system),
    messages,
    tools: list(body.tools).map((tool) => ({
      name: text(tool.name),
      description: text(tool.description),
      ...schemaFacts(tool.input_schema),
    })),
    maxTokens: num(body.max_tokens),
    temperature: num(body.temperature),
  };
}

const anthropicMessage = (
  content: readonly unknown[],
  usage: Usage,
  stopReason: string,
): FakeReply => ({
  kind: "json",
  body: {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "wire",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: usage.input, output_tokens: usage.output },
  },
});

const anthropicReplies: VendorReplies = {
  text: (content, usage) =>
    anthropicMessage([{ type: "text", text: content }], usage, "end_turn"),
  toolCall: (call, usage) =>
    anthropicMessage(
      [{ type: "tool_use", id: call.id, name: call.name, input: call.args }],
      usage,
      "tool_use",
    ),
  streamText: (chunks, usage) => ({
    kind: "sse",
    frames: [
      sseEvent("message_start", {
        type: "message_start",
        message: {
          id: "msg",
          type: "message",
          role: "assistant",
          model: "wire",
          content: [],
          stop_reason: null,
          usage: { input_tokens: usage.input, output_tokens: 0 },
        },
      }),
      sseEvent("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }),
      ...chunks.map((chunk) =>
        sseEvent("content_block_delta", {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: chunk },
        }),
      ),
      sseEvent("content_block_stop", { type: "content_block_stop", index: 0 }),
      sseEvent("message_delta", {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: usage.output },
      }),
      sseEvent("message_stop", { type: "message_stop" }),
    ],
  }),
  streamToolCall: (call, argumentChunks) => ({
    kind: "sse",
    frames: [
      sseEvent("message_start", {
        type: "message_start",
        message: {
          id: "msg",
          type: "message",
          role: "assistant",
          model: "wire",
          content: [],
          stop_reason: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      }),
      sseEvent("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: {},
        },
      }),
      ...argumentChunks.map((chunk) =>
        sseEvent("content_block_delta", {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: chunk },
        }),
      ),
      sseEvent("content_block_stop", { type: "content_block_stop", index: 0 }),
      sseEvent("message_delta", {
        type: "message_delta",
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 1 },
      }),
      sseEvent("message_stop", { type: "message_stop" }),
    ],
  }),
  streamHang: () => ({
    kind: "sse",
    frames: [
      sseEvent("message_start", {
        type: "message_start",
        message: {
          id: "msg",
          type: "message",
          role: "assistant",
          model: "wire",
          content: [],
          stop_reason: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      }),
      sseEvent("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }),
      sseEvent("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "start" },
      }),
    ],
    hang: true,
  }),
  httpError: (status) => ({
    kind: "json",
    status,
    headers: { "retry-after-ms": "1" },
    body: {
      type: "error",
      error: { type: "api_error", message: "wire failure" },
    },
  }),
};

// --- Gemini ----------------------------------------------------------------

function geminiParts(entry: Record<string, unknown>): WireMessage {
  const parts = list(entry.parts);
  const calls = parts.flatMap((part) =>
    part.functionCall === undefined ? [] : [record(part.functionCall)],
  );
  const results = parts.flatMap((part) =>
    part.functionResponse === undefined ? [] : [record(part.functionResponse)],
  );
  return message(text(entry.role) === "model" ? "assistant" : "user", {
    text: parts
      .filter((part) => typeof part.text === "string")
      .map((part) => text(part.text))
      .join(""),
    toolCalls: calls.map((call) => ({
      id: typeof call.id === "string" ? call.id : undefined,
      name: text(call.name),
      args: call.args,
    })),
    toolResults: results.map((result) => ({
      id: typeof result.id === "string" ? result.id : undefined,
      name: typeof result.name === "string" ? result.name : undefined,
      text: resultText(result.response),
    })),
    images: parts.flatMap((part) => {
      if (part.inlineData === undefined) return [];
      const data = record(part.inlineData);
      return [{ mediaType: text(data.mimeType), data: text(data.data) }];
    }),
  });
}

function readGemini(request: RecordedRequest): WireRequest {
  const body = record(request.body);
  const config = record(body.generationConfig);
  const tools = Array.isArray(body.tools)
    ? list(body.tools)
    : [record(body.tools)];
  return {
    system: resultText(record(body.systemInstruction).parts),
    messages: list(body.contents).map(geminiParts),
    tools: tools.flatMap((group) =>
      list(group.functionDeclarations).map((tool) => ({
        name: text(tool.name),
        description: text(tool.description),
        ...schemaFacts(tool.parametersJsonSchema ?? tool.parameters),
      })),
    ),
    maxTokens: num(config.maxOutputTokens) ?? num(body.maxOutputTokens),
    temperature: num(config.temperature) ?? num(body.temperature),
  };
}

const geminiCandidate = (
  parts: readonly unknown[],
  usage: Usage,
  finishReason: string,
): unknown => ({
  candidates: [{ content: { role: "model", parts }, finishReason, index: 0 }],
  usageMetadata: {
    promptTokenCount: usage.input,
    candidatesTokenCount: usage.output,
    totalTokenCount: usage.input + usage.output,
  },
  modelVersion: "wire",
});

const geminiReplies: VendorReplies = {
  text: (content, usage) => ({
    kind: "json",
    body: geminiCandidate([{ text: content }], usage, "STOP"),
  }),
  toolCall: (call, usage) => ({
    kind: "json",
    body: geminiCandidate(
      [{ functionCall: { id: call.id, name: call.name, args: call.args } }],
      usage,
      "STOP",
    ),
  }),
  streamText: (chunks, usage) => ({
    kind: "sse",
    frames: [
      ...chunks.map((chunk, index) =>
        sseData(
          geminiCandidate(
            [{ text: chunk }],
            index === chunks.length - 1 ? usage : { input: 0, output: 0 },
            index === chunks.length - 1 ? "STOP" : "",
          ),
        ),
      ),
    ],
  }),
  streamToolCall: (call, argumentChunks) => ({
    kind: "sse",
    frames: [
      sseData(
        geminiCandidate(
          [
            {
              functionCall: {
                id: call.id,
                name: call.name,
                args: json(argumentChunks.join("")),
              },
            },
          ],
          { input: 1, output: 1 },
          "STOP",
        ),
      ),
    ],
  }),
  streamHang: () => ({
    kind: "sse",
    frames: [
      sseData(
        geminiCandidate([{ text: "start" }], { input: 1, output: 0 }, ""),
      ),
    ],
    hang: true,
  }),
  httpError: (status) => ({
    kind: "json",
    status,
    headers: { "retry-after-ms": "1" },
    body: {
      error: { code: status, message: "wire failure", status: "INVALID" },
    },
  }),
};

// --- Vendor table ----------------------------------------------------------

export const VENDORS: readonly Vendor[] = [
  {
    name: "openai",
    host: "api.openai.com",
    patchesGlobalFetch: false,
    retryableAttempts: 3,
    networkAttempts: 1,
    networkHint: true,
    onAbort: "throw",
    create: (fetch, toolSupport) =>
      new OpenAIProvider({
        apiKey: "wire-key",
        fetch,
        ...(toolSupport === undefined ? {} : { toolSupport }),
      }),
    read: readOpenAI,
    replies: openAIReplies,
  },
  {
    name: "anthropic",
    host: "api.anthropic.com",
    patchesGlobalFetch: false,
    retryableAttempts: 3,
    networkAttempts: 1,
    networkHint: true,
    onAbort: "throw",
    create: (fetch) => new AnthropicProvider({ apiKey: "wire-key", fetch }),
    read: readAnthropic,
    replies: anthropicReplies,
  },
  {
    name: "gemini",
    host: "generativelanguage.googleapis.com",
    patchesGlobalFetch: false,
    retryableAttempts: 3,
    networkAttempts: 1,
    networkHint: true,
    onAbort: "throw",
    create: (fetch) => new GeminiProvider({ apiKey: "wire-key", fetch }),
    read: readGemini,
    replies: geminiReplies,
  },
  {
    name: "ollama",
    host: "127.0.0.1",
    patchesGlobalFetch: false,
    retryableAttempts: 3,
    networkAttempts: 1,
    networkHint: true,
    onAbort: "throw",
    create: (fetch, toolSupport) =>
      new OllamaProvider({
        fetch,
        ...(toolSupport === undefined ? {} : { toolSupport }),
      }),
    read: readOpenAI,
    replies: openAIReplies,
  },
  {
    // A catalog-only OpenAI-compatible provider: no dedicated class, built
    // straight from the catalog entry. Proves a new provider is just data.
    name: "groq",
    host: "api.groq.com",
    patchesGlobalFetch: false,
    retryableAttempts: 3,
    networkAttempts: 1,
    networkHint: true,
    onAbort: "throw",
    create: (fetch, toolSupport) =>
      providerFromConfig(
        {
          provider: "groq",
          apiKey: "wire-key",
          ...(toolSupport === undefined ? {} : { toolSupport }),
        },
        fetch,
      ),
    read: readOpenAI,
    replies: openAIReplies,
  },
];
