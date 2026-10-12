import { ProviderError } from "../../../utils/errors.js";
import { describeFailure } from "../../shared/errors.js";
import { toProviderError } from "./errors.js";
import type { FetchLike } from "./types.js";

/** Hard cap on pagination so a misbehaving endpoint cannot spin forever. */
const MAX_PAGES = 20;

interface RequestOptions {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly fetch?: FetchLike | undefined;
  readonly action: string;
}

/**
 * GETs one page of a model-listing endpoint and returns its parsed JSON
 * body, normalizing transport and HTTP failures the same way every vendor
 * reader needs.
 */
async function getJson<T>(options: RequestOptions): Promise<T> {
  const call = options.fetch ?? globalThis.fetch;
  try {
    const response = await call(options.url, { headers: options.headers });
    if (!response.ok)
      throw new ProviderError(
        `${options.action} failed${describeFailure({ status: response.status })}.`,
      );
    return (await response.json()) as T;
  } catch (error: unknown) {
    throw toProviderError(options.action, error);
  }
}

interface OpenAIModelList {
  readonly data?: readonly { readonly id?: unknown }[];
}

/**
 * Lists chat model ids from an OpenAI-shaped `GET /models` endpoint. The AI
 * SDK has no cross-vendor model discovery, so this stays a plain request.
 */
export async function listChatModels(options: {
  readonly baseURL: string;
  readonly apiKey?: string | undefined;
  readonly fetch?: FetchLike | undefined;
  readonly accept: (id: string) => boolean;
  readonly action: string;
}): Promise<readonly string[]> {
  const headers: Record<string, string> = {};
  if (options.apiKey !== undefined)
    headers.authorization = `Bearer ${options.apiKey}`;
  const body = await getJson<OpenAIModelList>({
    url: `${options.baseURL}/models`,
    headers,
    fetch: options.fetch,
    action: options.action,
  });
  return (body.data ?? [])
    .map((model) => model.id)
    .filter((id): id is string => typeof id === "string")
    .filter(options.accept)
    .sort();
}

const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicModelList {
  readonly data?: readonly { readonly id?: unknown }[];
  readonly has_more?: boolean;
  readonly last_id?: string | null;
}

/**
 * Lists Claude model ids from `GET /v1/models`. `lifecycle=active` is
 * explicit: Anthropic's default also returns deprecated models, which the
 * picker should not offer. Credentials go in headers, never in the URL.
 */
export async function listAnthropicModels(options: {
  readonly apiKey: string;
  readonly fetch?: FetchLike | undefined;
  readonly baseURL?: string | undefined;
}): Promise<readonly string[]> {
  const baseURL = options.baseURL ?? ANTHROPIC_BASE_URL;
  const headers: Record<string, string> = {
    "x-api-key": options.apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
  const action = "Listing Anthropic models";
  const ids: string[] = [];
  let afterId: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`${baseURL}/models`);
    url.searchParams.set("lifecycle", "active");
    url.searchParams.set("limit", "1000");
    if (afterId !== undefined) url.searchParams.set("after_id", afterId);
    const body = await getJson<AnthropicModelList>({
      url: url.toString(),
      headers,
      fetch: options.fetch,
      action,
    });
    for (const model of body.data ?? [])
      if (typeof model.id === "string") ids.push(model.id);
    if (body.has_more !== true || body.last_id == null) break;
    afterId = body.last_id;
  }
  return ids.sort();
}

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_NAME_PREFIX = "models/";

interface GeminiModelList {
  readonly models?: readonly {
    readonly name?: unknown;
    readonly supportedGenerationMethods?: readonly unknown[];
  }[];
  readonly nextPageToken?: string;
}

function bareModelId(name: string): string {
  return name.startsWith(MODEL_NAME_PREFIX)
    ? name.slice(MODEL_NAME_PREFIX.length)
    : name;
}

/**
 * Lists Gemini model ids from `GET /v1beta/models`, keeping only models that
 * support `generateContent` (chat), which excludes embedding, TTS and
 * image-only entries. The resource-name prefix is stripped so the returned
 * ids match what a completion request expects.
 */
export async function listGeminiModels(options: {
  readonly apiKey: string;
  readonly fetch?: FetchLike | undefined;
  readonly baseURL?: string | undefined;
}): Promise<readonly string[]> {
  const baseURL = options.baseURL ?? GEMINI_BASE_URL;
  const headers: Record<string, string> = { "x-goog-api-key": options.apiKey };
  const action = "Listing Gemini models";
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`${baseURL}/models`);
    if (pageToken !== undefined) url.searchParams.set("pageToken", pageToken);
    const body = await getJson<GeminiModelList>({
      url: url.toString(),
      headers,
      fetch: options.fetch,
      action,
    });
    for (const model of body.models ?? []) {
      const supportsChat = (model.supportedGenerationMethods ?? []).includes(
        "generateContent",
      );
      if (supportsChat && typeof model.name === "string")
        ids.push(bareModelId(model.name));
    }
    if (body.nextPageToken === undefined) break;
    pageToken = body.nextPageToken;
  }
  return ids.sort();
}
