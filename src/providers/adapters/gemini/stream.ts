import type { GenerateContentResponse } from "@google/genai";
import type { StreamEvent } from "../../contracts/types.js";
import { ResponseAccumulator } from "../../shared/stream.js";
import {
  fromGeminiCall,
  fromGeminiUsage,
  geminiFinishReason,
} from "./mapping.js";

/** Translates Gemini streamed chunks into normalized stream events. */
export class GeminiStreamAccumulator {
  private readonly response = new ResponseAccumulator();
  private callCount = 0;

  public *consume(chunk: GenerateContentResponse): Generator<StreamEvent> {
    yield* this.response.text(chunk.text);
    for (const call of chunk.functionCalls ?? [])
      this.response.toolCall(fromGeminiCall(call, this.callCount++));
    this.response.addUsage(fromGeminiUsage(chunk));
    this.response.finish(geminiFinishReason(chunk));
  }

  public close(): Generator<StreamEvent> {
    return this.response.close();
  }
}
