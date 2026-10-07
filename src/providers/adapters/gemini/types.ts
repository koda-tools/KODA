import type { GoogleGenAI } from "@google/genai";

export interface GeminiProviderOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly client?: GoogleGenAI;
}
