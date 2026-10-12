/**
 * GENERATED FALLBACK SNAPSHOT. Do not edit by hand.
 *
 * This is the catalog KODA ships with and falls back to before any runtime
 * cache exists (see `catalog-fetch.ts` and `catalog-cache.ts`, which fetch
 * and cache fresh data from https://models.dev/api.json at runtime). This
 * file is reviewed and refreshed as part of preparing a release; it is not
 * fetched or modified while KODA is running.
 */
import type { ModelInfo, ProviderName } from "./types.js";

export const CATALOG_SOURCE = "https://models.dev/api.json";
export const CATALOG_GENERATED_AT = "2026-10-12";

export const MODEL_CATALOG = {
  openai: {
    "gpt-4.1": {
      toolCall: true,
      cost: { input: 2, output: 8 },
      limit: { context: 1047576, output: 32768 },
      releaseDate: "2025-04-14",
    },
    "gpt-4.1-mini": {
      toolCall: true,
      cost: { input: 0.4, output: 1.6 },
      limit: { context: 1047576, output: 32768 },
      releaseDate: "2025-04-14",
    },
    "gpt-4o": {
      toolCall: true,
      cost: { input: 2.5, output: 10 },
      limit: { context: 128000, output: 16384 },
      releaseDate: "2024-05-13",
    },
    "gpt-4o-2024-08-06": {
      toolCall: true,
      cost: { input: 2.5, output: 10 },
      limit: { context: 128000, output: 16384 },
      releaseDate: "2024-08-06",
    },
    "gpt-4o-2024-11-20": {
      toolCall: true,
      cost: { input: 2.5, output: 10 },
      limit: { context: 128000, output: 16384 },
      releaseDate: "2024-11-20",
    },
    "gpt-4o-mini": {
      toolCall: true,
      cost: { input: 0.15, output: 0.6 },
      limit: { context: 128000, output: 16384 },
      releaseDate: "2024-07-18",
    },
    "gpt-5.1": {
      toolCall: true,
      cost: { input: 1.25, output: 10 },
      limit: { context: 400000, output: 128000 },
      releaseDate: "2025-11-13",
    },
    "gpt-5.2": {
      toolCall: true,
      cost: { input: 1.75, output: 14 },
      limit: { context: 400000, output: 128000 },
      releaseDate: "2025-12-11",
    },
    "gpt-5.3-codex": {
      toolCall: true,
      cost: { input: 1.75, output: 14 },
      limit: { context: 400000, output: 128000 },
      releaseDate: "2026-02-05",
    },
    "gpt-5.4": {
      toolCall: true,
      cost: { input: 2.5, output: 15 },
      limit: { context: 1050000, output: 128000 },
      releaseDate: "2026-03-05",
    },
    "gpt-5.4-mini": {
      toolCall: true,
      cost: { input: 0.75, output: 4.5 },
      limit: { context: 400000, output: 128000 },
      releaseDate: "2026-03-17",
    },
    "gpt-5.4-nano": {
      toolCall: true,
      cost: { input: 0.2, output: 1.25 },
      limit: { context: 400000, output: 128000 },
      releaseDate: "2026-03-17",
    },
  },
  anthropic: {
    "claude-haiku-4-5": {
      toolCall: true,
      cost: { input: 1, output: 5 },
      limit: { context: 200000, output: 64000 },
      releaseDate: "2025-10-15",
    },
    "claude-haiku-4-5-20251001": {
      toolCall: true,
      cost: { input: 1, output: 5 },
      limit: { context: 200000, output: 64000 },
      releaseDate: "2025-10-15",
    },
    "claude-opus-4-5": {
      toolCall: true,
      cost: { input: 5, output: 25 },
      limit: { context: 200000, output: 64000 },
      releaseDate: "2025-11-24",
    },
    "claude-opus-4-5-20251101": {
      toolCall: true,
      cost: { input: 5, output: 25 },
      limit: { context: 200000, output: 64000 },
      releaseDate: "2025-11-24",
    },
    "claude-opus-4-6": {
      toolCall: true,
      cost: { input: 5, output: 25 },
      limit: { context: 1000000, output: 128000 },
      releaseDate: "2026-02-04",
    },
    "claude-sonnet-4-5": {
      toolCall: true,
      cost: { input: 3, output: 15 },
      limit: { context: 200000, output: 64000 },
      releaseDate: "2025-09-29",
    },
    "claude-sonnet-4-5-20250929": {
      toolCall: true,
      cost: { input: 3, output: 15 },
      limit: { context: 200000, output: 64000 },
      releaseDate: "2025-09-29",
    },
    "claude-sonnet-4-6": {
      toolCall: true,
      cost: { input: 3, output: 15 },
      limit: { context: 1000000, output: 128000 },
      releaseDate: "2026-02-17",
    },
  },
  gemini: {
    "deep-research-max-preview-04-2026": {
      toolCall: true,
      cost: { input: 2, output: 12 },
      limit: { context: 131072, output: 65536 },
      releaseDate: "2026-04-21",
    },
    "deep-research-preview-04-2026": {
      toolCall: true,
      cost: { input: 2, output: 12 },
      limit: { context: 131072, output: 65536 },
      releaseDate: "2026-04-21",
    },
    "gemini-2.5-computer-use-preview-10-2025": {
      toolCall: true,
      cost: { input: 1.25, output: 10 },
      limit: { context: 128000, output: 64000 },
      releaseDate: "2025-10-07",
    },
    "gemini-2.5-flash": {
      toolCall: true,
      cost: { input: 0.3, output: 2.5 },
      limit: { context: 1048576, output: 65536 },
      releaseDate: "2025-06-17",
    },
    "gemini-2.5-flash-lite": {
      toolCall: true,
      cost: { input: 0.1, output: 0.4 },
      limit: { context: 1048576, output: 65536 },
      releaseDate: "2025-06-17",
    },
    "gemini-2.5-pro": {
      toolCall: true,
      cost: { input: 1.25, output: 10 },
      limit: { context: 1048576, output: 65536 },
      releaseDate: "2025-06-17",
    },
    "gemini-3-flash-preview": {
      toolCall: true,
      cost: { input: 0.5, output: 3 },
      limit: { context: 1048576, output: 65536 },
      releaseDate: "2025-12-17",
    },
    "gemini-3.1-flash-lite": {
      toolCall: true,
      cost: { input: 0.25, output: 1.5 },
      limit: { context: 1048576, output: 65536 },
      releaseDate: "2026-05-07",
    },
    "gemini-3.1-flash-lite-image": {
      toolCall: true,
      cost: { input: 0.25, output: 30 },
      limit: { context: 65536, output: 4096 },
      releaseDate: "2026-06-30",
    },
    "gemini-3.1-flash-live-preview": {
      toolCall: true,
      cost: { input: 0.75, output: 4.5 },
      limit: { context: 131072, output: 65536 },
      releaseDate: "2026-03-26",
    },
    "gemini-3.1-pro-preview": {
      toolCall: true,
      cost: { input: 2, output: 12 },
      limit: { context: 1048576, output: 65536 },
      releaseDate: "2026-02-19",
    },
    "gemini-3.1-pro-preview-customtools": {
      toolCall: true,
      cost: { input: 2, output: 12 },
      limit: { context: 1048576, output: 65536 },
      releaseDate: "2026-02-19",
    },
    "gemini-3.5-flash": {
      toolCall: true,
      cost: { input: 1.5, output: 9 },
      limit: { context: 1048576, output: 65536 },
      releaseDate: "2026-05-19",
    },
    "gemini-3.5-flash-lite": {
      toolCall: true,
      cost: { input: 0.3, output: 2.5 },
      limit: { context: 1048576, output: 65536 },
      releaseDate: "2026-07-21",
    },
    "gemini-3.6-flash": {
      toolCall: true,
      cost: { input: 0.75, output: 3.75 },
      limit: { context: 1048576, output: 65536 },
      releaseDate: "2026-07-21",
    },
    "gemini-3.7-flash": {
      toolCall: true,
      cost: { input: 0.75, output: 3.75 },
      limit: { context: 1048576, output: 65536 },
      releaseDate: "2026-08-13",
    },
    "gemini-3.8-flash": {
      toolCall: true,
      cost: { input: 0.75, output: 3.75 },
      limit: { context: 1048576, output: 65536 },
      releaseDate: "2026-09-02",
    },
    "gemini-flash-latest": {
      toolCall: true,
      cost: { input: 0.75, output: 3.75 },
      limit: { context: 1048576, output: 65536 },
      releaseDate: "2026-08-13",
    },
    "gemini-flash-lite-latest": {
      toolCall: true,
      cost: { input: 0.3, output: 2.5 },
      limit: { context: 1048576, output: 65536 },
      releaseDate: "2026-07-21",
    },
    "gemma-4-26b-a4b-it": {
      toolCall: true,
      limit: { context: 262144, output: 32768 },
      releaseDate: "2026-04-02",
    },
    "gemma-4-31b-it": {
      toolCall: true,
      limit: { context: 262144, output: 32768 },
      releaseDate: "2026-04-02",
    },
  },
  ollama: {},
} as const satisfies Readonly<
  Record<ProviderName, Readonly<Record<string, ModelInfo>>>
>;
