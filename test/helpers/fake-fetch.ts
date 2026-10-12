/**
 * A scripted `fetch` for wire-level provider tests. It records every request
 * (URL, method, lower-cased headers and the JSON body) and answers from a
 * script: JSON, server-sent events, an HTTP error or a network failure.
 */

export interface RecordedRequest {
  readonly url: URL;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export type FakeReply =
  | {
      readonly kind: "json";
      readonly body: unknown;
      readonly status?: number;
      readonly headers?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "sse";
      /** Raw SSE frames, already terminated by a blank line. */
      readonly frames: readonly string[];
      /** Keep the stream open after the frames until the request aborts. */
      readonly hang?: boolean;
    }
  | { readonly kind: "network-error" };

export type FakeScript =
  | FakeReply
  | ((request: RecordedRequest, index: number) => FakeReply);

export interface FakeFetch {
  readonly fetch: typeof globalThis.fetch;
  readonly requests: RecordedRequest[];
}

const encoder = new TextEncoder();

/** `data: <json>` frame (OpenAI, Gemini). */
export const sseData = (payload: unknown): string =>
  `data: ${JSON.stringify(payload)}\n\n`;

/** `event: <name>` + `data: <json>` frame (Anthropic). */
export const sseEvent = (name: string, payload: unknown): string =>
  `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;

export const SSE_DONE = "data: [DONE]\n\n";

function abortError(): DOMException {
  return new DOMException("This operation was aborted", "AbortError");
}

function requestUrl(input: string | URL | Request): URL {
  if (input instanceof URL) return input;
  return new URL(typeof input === "string" ? input : input.url);
}

function parseBody(body: unknown): unknown {
  if (typeof body !== "string" || body === "") return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function record(
  input: string | URL | Request,
  init: RequestInit | undefined,
): RecordedRequest {
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, key) => {
    headers[key] = value;
  });
  return {
    url: requestUrl(input),
    method: init?.method ?? "GET",
    headers,
    body: parseBody(init?.body),
  };
}

function sseStream(
  reply: Extract<FakeReply, { kind: "sse" }>,
  signal: AbortSignal | null | undefined,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of reply.frames)
        controller.enqueue(encoder.encode(frame));
      if (reply.hang !== true) {
        controller.close();
        return;
      }
      const fail = (): void => controller.error(abortError());
      if (signal?.aborted === true) fail();
      else signal?.addEventListener("abort", fail, { once: true });
    },
  });
}

function respond(
  reply: FakeReply,
  signal: AbortSignal | null | undefined,
): Response {
  switch (reply.kind) {
    case "json":
      return new Response(JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: { "content-type": "application/json", ...reply.headers },
      });
    case "sse":
      return new Response(sseStream(reply, signal), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    case "network-error":
      throw new TypeError("fetch failed");
  }
}

export function fakeFetch(script: FakeScript): FakeFetch {
  const requests: RecordedRequest[] = [];
  const fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = record(input, init);
    requests.push(request);
    if (init?.signal?.aborted === true) throw abortError();
    const reply =
      typeof script === "function"
        ? script(request, requests.length - 1)
        : script;
    return respond(reply, init?.signal);
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}
