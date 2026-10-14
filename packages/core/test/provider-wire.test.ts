/**
 * Wire-level parity suite. Every scenario runs against all providers and
 * asserts normalized facts about the HTTP request that left the process and
 * the normalized result that came back. It is written against the vendor-SDK
 * adapters and must keep passing, unchanged, on the AI SDK adapter.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  modelLimit,
  providerSpec,
  type ChatMessage,
  type CompletionOptions,
  type ILLMProvider,
  type StreamEvent,
  type ToolDefinition,
} from "../src/providers/index.js";
import { ProviderError } from "../src/utils/errors.js";
import { fakeFetch, type FakeScript } from "./helpers/fake-fetch.js";
import type { RecordedRequest } from "./helpers/fake-fetch.js";
import {
  VENDORS,
  type Vendor,
  type WireRequest,
} from "./helpers/provider-wire.js";

const READ_FILE: ToolDefinition = {
  name: "readFile",
  description: "Read a file",
  parameters: {
    type: "object",
    properties: { filePath: { type: "string" } },
    required: ["filePath"],
  },
};

const CALL = {
  id: "call-1",
  name: "readFile",
  args: { filePath: "package.json" },
} as const;

const USAGE = { input: 11, output: 7 } as const;
const PNG = { data: "aGk=", mediaType: "image/png" } as const;

interface Session {
  readonly provider: ILLMProvider;
  readonly requests: readonly RecordedRequest[];
  read(index?: number): WireRequest;
}

/** Builds the provider on a scripted fetch, restoring the global one after. */
async function session<T>(
  vendor: Vendor,
  script: FakeScript,
  run: (session: Session) => Promise<T>,
  toolSupport?: boolean,
): Promise<T> {
  const fake = fakeFetch(script);
  const original = globalThis.fetch;
  if (vendor.patchesGlobalFetch) globalThis.fetch = fake.fetch;
  try {
    return await run({
      provider: vendor.create(fake.fetch, toolSupport),
      requests: fake.requests,
      read: (index = 0) => {
        const request = fake.requests[index];
        assert.ok(request !== undefined, `no request #${index}`);
        return vendor.read(request);
      },
    });
  } finally {
    globalThis.fetch = original;
  }
}

async function collect(
  stream: AsyncIterable<StreamEvent>,
): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

const deltas = (events: readonly StreamEvent[]): string[] =>
  events.flatMap((event) => (event.type === "text-delta" ? [event.text] : []));

const ask = (prompt: string): ChatMessage[] => [
  { role: "user", content: prompt },
];

function failureOf(error: unknown): string {
  assert.ok(error instanceof ProviderError, `not a ProviderError: ${error}`);
  assert.ok(
    !error.message.includes("wire-key"),
    "the API key must never appear in an error",
  );
  return error.message;
}

for (const vendor of VENDORS) {
  const name = vendor.name;

  test(`${name}: completes text and reports usage`, async () => {
    await session(vendor, vendor.replies.text("hello", USAGE), async (s) => {
      const response = await s.provider.complete(ask("hi"));
      assert.equal(response.content, "hello");
      assert.deepEqual(response.usage, {
        inputTokens: USAGE.input,
        outputTokens: USAGE.output,
      });
      assert.equal(s.requests.length, 1);
      assert.equal(s.requests[0]?.url.hostname, vendor.host);
      assert.deepEqual(s.read().messages, [
        {
          role: "user",
          text: "hi",
          toolCalls: [],
          toolResults: [],
          images: [],
        },
      ]);
    });
  });

  test(`${name}: sends the system instruction apart from the conversation`, async () => {
    await session(vendor, vendor.replies.text("ok", USAGE), async (s) => {
      await s.provider.complete([
        { role: "system", content: "be brief" },
        { role: "user", content: "hi" },
      ]);
      const request = s.read();
      assert.equal(request.system, "be brief");
      assert.deepEqual(
        request.messages.map((message) => message.role),
        ["user"],
      );
    });
  });

  test(`${name}: sends tool definitions and omits them when there are none`, async () => {
    await session(vendor, vendor.replies.text("ok", USAGE), async (s) => {
      await s.provider.complete(ask("read"), { tools: [READ_FILE] });
      await s.provider.complete(ask("hi"));
      assert.deepEqual(s.read(0).tools, [
        {
          name: "readFile",
          description: "Read a file",
          properties: { filePath: { type: "string" } },
          required: ["filePath"],
        },
      ]);
      assert.deepEqual(s.read(1).tools, []);
    });
  });

  test(`${name}: normalizes a returned tool call`, async () => {
    await session(vendor, vendor.replies.toolCall(CALL, USAGE), async (s) => {
      const response = await s.provider.complete(ask("read"), {
        tools: [READ_FILE],
      });
      assert.equal(response.toolCalls.length, 1);
      const call = response.toolCalls[0];
      assert.equal(call?.name, CALL.name);
      assert.deepEqual(JSON.parse(call?.arguments ?? "{}"), CALL.args);
      assert.ok((call?.id ?? "") !== "", "a tool call needs an id");
    });
  });

  test(`${name}: sends a tool result that answers the previous call`, async () => {
    await session(vendor, vendor.replies.text("done", USAGE), async (s) => {
      await s.provider.complete(
        [
          { role: "user", content: "read" },
          {
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: CALL.id,
                name: CALL.name,
                arguments: JSON.stringify(CALL.args),
              },
            ],
          },
          { role: "tool", content: "file body", toolCallId: CALL.id },
        ],
        { tools: [READ_FILE] },
      );
      const messages = s.read().messages;
      const assistant = messages.find((entry) => entry.role === "assistant");
      assert.equal(assistant?.text, "", "no empty text block may be sent");
      assert.deepEqual(assistant?.toolCalls, [
        { id: CALL.id, name: CALL.name, args: CALL.args },
      ]);
      const result = messages.find((entry) => entry.role === "tool");
      assert.equal(result?.toolResults[0]?.text, "file body");
      assert.equal(result?.toolResults[0]?.id, CALL.id);
      const answered = result?.toolResults[0]?.name;
      if (answered !== undefined) assert.equal(answered, CALL.name);
    });
  });

  test(`${name}: streams text deltas before the final response`, async () => {
    const chunks = ["He", "llo", " there"];
    await session(
      vendor,
      vendor.replies.streamText(chunks, USAGE),
      async (s) => {
        const events = await collect(s.provider.stream(ask("hi")));
        assert.deepEqual(deltas(events), chunks);
        const last = events.at(-1);
        assert.equal(last?.type, "done");
        if (last?.type !== "done") return;
        assert.equal(last.response.content, chunks.join(""));
        assert.deepEqual(last.response.usage, {
          inputTokens: USAGE.input,
          outputTokens: USAGE.output,
        });
      },
    );
  });

  test(`${name}: streams a tool call and repeats it in the final response`, async () => {
    await session(
      vendor,
      vendor.replies.streamToolCall(CALL, ['{"filePath":', '"package.json"}']),
      async (s) => {
        const events = await collect(
          s.provider.stream(ask("read"), { tools: [READ_FILE] }),
        );
        const call = events.flatMap((event) =>
          event.type === "tool-call" ? [event.call] : [],
        );
        assert.equal(call.length, 1);
        assert.equal(call[0]?.name, CALL.name);
        assert.deepEqual(JSON.parse(call[0]?.arguments ?? "{}"), CALL.args);
        const last = events.at(-1);
        assert.equal(last?.type, "done");
        if (last?.type === "done")
          assert.deepEqual(last.response.toolCalls, call);
      },
    );
  });

  test(`${name}: ends a cancelled stream right after the abort`, async () => {
    await session(vendor, vendor.replies.streamHang(), async (s) => {
      const controller = new AbortController();
      const options: CompletionOptions = { signal: controller.signal };
      const events: StreamEvent[] = [];
      let raised = false;
      try {
        for await (const event of s.provider.stream(ask("hi"), options)) {
          events.push(event);
          if (events.length === 1) controller.abort();
        }
      } catch {
        raised = true;
      }
      assert.deepEqual(deltas(events), ["start"]);
      assert.equal(s.requests.length, 1, "a cancelled request is not retried");
      assert.equal(
        raised ? "throw" : "done",
        vendor.onAbort,
        "cancellation outcome",
      );
      if (!raised)
        assert.equal(
          events.at(-1)?.type,
          "done",
          "a stream that does not raise must still close",
        );
    });
  });

  test(`${name}: reports an invalid key without leaking it`, async () => {
    await session(vendor, vendor.replies.httpError(401), async (s) => {
      const error = await s.provider.complete(ask("hi")).then(
        () => undefined,
        (reason: unknown) => reason,
      );
      assert.match(failureOf(error), /HTTP 401/);
      assert.equal(s.requests.length, 1, "401 must not be retried");
    });
  });

  test(`${name}: retries a rate limit at most twice`, async () => {
    await session(vendor, vendor.replies.httpError(429), async (s) => {
      const error = await s.provider.complete(ask("hi")).then(
        () => undefined,
        (reason: unknown) => reason,
      );
      assert.match(failureOf(error), /HTTP 429/);
      assert.equal(s.requests.length, vendor.retryableAttempts);
    });
  });

  test(`${name}: reports a failed connection`, async () => {
    await session(vendor, { kind: "network-error" }, async (s) => {
      const error = await s.provider.complete(ask("hi")).then(
        () => undefined,
        (reason: unknown) => reason,
      );
      const message = failureOf(error);
      assert.equal(s.requests.length, vendor.networkAttempts);
      if (vendor.networkHint) assert.match(message, /connection error/);
    });
  });
}

// --- Provider-specific wire rules ------------------------------------------

const vendorNamed = (name: string): Vendor => {
  const vendor = VENDORS.find((entry) => entry.name === name);
  assert.ok(vendor !== undefined, `unknown vendor ${name}`);
  return vendor;
};

test("every provider sends base64 image parts", async () => {
  for (const vendor of VENDORS) {
    if (vendor.name === "ollama") continue; // declares images: false
    await session(vendor, vendor.replies.text("ok", USAGE), async (s) => {
      await s.provider.complete([
        {
          role: "user",
          content: [
            { type: "text", text: "what is this" },
            { type: "image", data: PNG.data, mediaType: PNG.mediaType },
          ],
        },
      ]);
      assert.deepEqual(
        s.read().messages[0]?.images,
        [{ mediaType: PNG.mediaType, data: PNG.data }],
        vendor.name,
      );
    });
  }
});

test("every provider sends the catalog output limit when none is given", async () => {
  for (const vendor of VENDORS) {
    await session(vendor, vendor.replies.text("ok", USAGE), async (s) => {
      await s.provider.complete(ask("hi"));
      const model = providerSpec(vendor.name).defaultModel;
      assert.equal(
        s.read().maxTokens,
        modelLimit(vendor.name, model).output,
        vendor.name,
      );
    });
  }
});

test("the output limit follows a per-request model override", async () => {
  const vendor = vendorNamed("openai");
  await session(vendor, vendor.replies.text("ok", USAGE), async (s) => {
    await s.provider.complete(ask("hi"), { model: "gpt-4o-mini" });
    assert.equal(
      s.read().maxTokens,
      modelLimit("openai", "gpt-4o-mini").output,
    );
  });
});

test("anthropic rejects unsupported images", async () => {
  const vendor = vendorNamed("anthropic");
  await session(vendor, vendor.replies.text("ok", USAGE), async (s) => {
    await assert.rejects(
      s.provider.complete([
        {
          role: "user",
          content: [{ type: "image", data: "x", mediaType: "image/bmp" }],
        },
      ]),
      /image/,
    );
  });
});

test("ollama talks to the local server and enforces tool support", async () => {
  const vendor = vendorNamed("ollama");
  await session(vendor, vendor.replies.text("local", USAGE), async (s) => {
    assert.equal((await s.provider.complete(ask("hi"))).content, "local");
    assert.match(String(s.requests[0]?.url), /127\.0\.0\.1:11434/);
  });
  await session(
    vendor,
    vendor.replies.text("unused", USAGE),
    async (s) => {
      await assert.rejects(
        s.provider.complete(ask("read"), { tools: [READ_FILE] }),
        /does not support tools/,
      );
      assert.equal(s.requests.length, 0, "no request may be sent");
    },
    false,
  );
});

test("temperature and maxTokens reach every provider", async () => {
  for (const vendor of VENDORS) {
    await session(vendor, vendor.replies.text("ok", USAGE), async (s) => {
      await s.provider.complete(ask("hi"), {
        temperature: 0.25,
        maxTokens: 123,
      });
      const request = s.read();
      assert.equal(request.temperature, 0.25, vendor.name);
      assert.equal(request.maxTokens, 123, vendor.name);
    });
  }
});
