import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { optional } from "../../shared/request.js";
import type { AISDKOptions } from "./types.js";

/**
 * AI SDK warnings (unsupported settings, deprecations) go to stderr through
 * `process.emitWarning`, which would corrupt the terminal UI. Silence them
 * unless the host already chose a logger.
 */
export function silenceSdkWarnings(): void {
  if (globalThis.AI_SDK_LOG_WARNINGS === undefined)
    globalThis.AI_SDK_LOG_WARNINGS = false;
}

/**
 * Builds the language model from the catalog entry. Provider instances are
 * always explicit, so a request can never be routed to the AI SDK gateway.
 */
export function createModel(
  options: AISDKOptions,
  modelId: string,
): LanguageModel {
  const settings = {
    apiKey: options.apiKey,
    ...optional("baseURL", options.baseURL),
    ...optional("fetch", options.fetch),
  };
  switch (options.spec.sdk) {
    case "openai":
      // `.chat()` keeps the Chat Completions API; the callable provider
      // would use the Responses API instead.
      return createOpenAI(settings).chat(modelId);
    case "anthropic":
      return createAnthropic(settings).languageModel(modelId);
    case "google":
      return createGoogleGenerativeAI(settings).languageModel(modelId);
    case "openai-compatible":
      return createOpenAICompatible({
        ...settings,
        name: options.label,
        baseURL: options.baseURL ?? options.spec.defaultBaseURL ?? "",
        includeUsage: true,
      }).chatModel(modelId);
  }
}

/** Only the OpenAI-shaped APIs send `tool_choice`, as before the migration. */
export function sendsToolChoice(options: AISDKOptions): boolean {
  return (
    options.spec.sdk === "openai" || options.spec.sdk === "openai-compatible"
  );
}
