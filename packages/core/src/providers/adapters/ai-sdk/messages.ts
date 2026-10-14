import type {
  AssistantContent,
  ModelMessage,
  ToolContent,
  UserContent,
} from "ai";
import { ProviderError } from "../../../utils/errors.js";
import { contentToText } from "../../contracts/content.js";
import type { ChatMessage, ContentPart } from "../../contracts/types.js";
import { parseToolArguments } from "../../shared/arguments.js";
import {
  requireToolCallId,
  splitSystem,
  toolNameFor,
} from "../../shared/messages.js";
import type { AISDKOptions } from "./types.js";

function imagePart(
  part: Extract<ContentPart, { type: "image" }>,
  options: AISDKOptions,
) {
  const accepted = options.imageMediaTypes;
  if (accepted !== undefined && !accepted.includes(part.mediaType))
    throw new ProviderError(
      `${options.label} does not support image type '${part.mediaType}'.`,
    );
  return { type: "file" as const, mediaType: part.mediaType, data: part.data };
}

function userContent(message: ChatMessage, options: AISDKOptions): UserContent {
  if (typeof message.content === "string") return message.content;
  return message.content.map((part) =>
    part.type === "text"
      ? { type: "text" as const, text: part.text }
      : imagePart(part, options),
  );
}

function assistantContent(message: ChatMessage): AssistantContent {
  const calls = message.toolCalls ?? [];
  if (calls.length === 0) return contentToText(message.content);
  const text = contentToText(message.content);
  return [
    // An empty text block is never sent, as the vendors reject it.
    ...(text === "" ? [] : [{ type: "text" as const, text }]),
    ...calls.map((call) => ({
      type: "tool-call" as const,
      toolCallId: call.id,
      toolName: call.name,
      input: parseToolArguments(call.arguments),
    })),
  ];
}

function toolContent(
  message: ChatMessage,
  history: readonly ChatMessage[],
): ToolContent {
  const toolCallId = requireToolCallId(message);
  return [
    {
      type: "tool-result",
      toolCallId,
      // The answered call names the tool; the id is the fallback.
      toolName: toolNameFor(history, toolCallId) ?? toolCallId,
      output: { type: "text", value: contentToText(message.content) },
    },
  ];
}

/** Splits the conversation into AI SDK instructions plus model messages. */
export function toModelMessages(
  messages: readonly ChatMessage[],
  options: AISDKOptions,
): { instructions: string; messages: ModelMessage[] } {
  const { system, conversation } = splitSystem(messages);
  return {
    instructions: system,
    messages: conversation.map((message) => {
      switch (message.role) {
        case "tool":
          return { role: "tool", content: toolContent(message, conversation) };
        case "assistant":
          return { role: "assistant", content: assistantContent(message) };
        default:
          return { role: "user", content: userContent(message, options) };
      }
    }),
  };
}
