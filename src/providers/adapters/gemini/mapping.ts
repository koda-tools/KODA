import type {
  Content,
  FunctionCall,
  GenerateContentConfig,
  GenerateContentResponse,
  Part,
  Tool,
} from "@google/genai";
import { contentToText } from "../../contracts/content.js";
import type {
  ChatMessage,
  ChatResponse,
  CompletionOptions,
  ContentPart,
  ToolCall,
  ToolDefinition,
  Usage,
} from "../../contracts/types.js";
import {
  parseToolArguments,
  stringifyToolArguments,
} from "../../shared/arguments.js";
import { requireToolCallId, toolNameFor } from "../../shared/messages.js";
import { optional, optionalNonEmpty } from "../../shared/request.js";
import { toUsage } from "../../shared/usage.js";

const UNKNOWN_FUNCTION = "unknown";

function toPart(part: ContentPart): Part {
  return part.type === "text"
    ? { text: part.text }
    : { inlineData: { mimeType: part.mediaType, data: part.data } };
}

function toolResponsePart(
  message: ChatMessage,
  history: readonly ChatMessage[],
): Part {
  const id = requireToolCallId(message);
  return {
    functionResponse: {
      id,
      name: toolNameFor(history, id) ?? id,
      response: { result: contentToText(message.content) },
    },
  };
}

function toParts(
  message: ChatMessage,
  history: readonly ChatMessage[],
): Part[] {
  if (message.role === "tool") return [toolResponsePart(message, history)];
  const parts: Part[] =
    typeof message.content === "string"
      ? message.content === ""
        ? []
        : [{ text: message.content }]
      : message.content.map(toPart);
  for (const call of message.toolCalls ?? [])
    parts.push({
      functionCall: {
        id: call.id,
        name: call.name,
        args: parseToolArguments(call.arguments),
      },
    });
  return parts;
}

/** Maps a conversation without system messages to Gemini contents. */
export function toGeminiContents(
  conversation: readonly ChatMessage[],
): Content[] {
  return conversation.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: toParts(message, conversation),
  }));
}

export function toGeminiTools(tools: readonly ToolDefinition[]): Tool[] {
  return tools.length === 0
    ? []
    : [
        {
          functionDeclarations: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parametersJsonSchema: tool.parameters,
          })),
        },
      ];
}

export function toGeminiConfig(
  system: string,
  options: CompletionOptions,
): GenerateContentConfig {
  return {
    ...optionalNonEmpty("systemInstruction", system),
    ...optional("temperature", options.temperature),
    ...optional("maxOutputTokens", options.maxTokens),
    ...optionalNonEmpty("tools", toGeminiTools(options.tools ?? [])),
    ...optional("abortSignal", options.signal),
  };
}

export function geminiCallId(name: string, index: number): string {
  return `gemini-${name}-${index}`;
}

export function fromGeminiCall(call: FunctionCall, index: number): ToolCall {
  const name = call.name ?? UNKNOWN_FUNCTION;
  return {
    id: call.id ?? geminiCallId(name, index),
    name,
    arguments: stringifyToolArguments(call.args),
  };
}

export function fromGeminiUsage(
  response: GenerateContentResponse,
): Usage | undefined {
  const metadata = response.usageMetadata;
  return toUsage(metadata?.promptTokenCount, metadata?.candidatesTokenCount);
}

export function geminiFinishReason(
  response: GenerateContentResponse,
): string | undefined {
  return response.candidates?.[0]?.finishReason;
}

export function fromGeminiResponse(
  response: GenerateContentResponse,
): ChatResponse {
  return {
    content: response.text ?? "",
    toolCalls: (response.functionCalls ?? []).map(fromGeminiCall),
    ...optional("usage", fromGeminiUsage(response)),
    ...optional("finishReason", geminiFinishReason(response)),
  };
}
