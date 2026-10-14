import { ProviderError } from "../../utils/errors.js";
import { contentToText } from "../contracts/content.js";
import type { ChatMessage } from "../contracts/types.js";
import type { SystemSplit } from "./types.js";

/** Separates system instructions from the rest of the conversation. */
export function splitSystem(
  messages: readonly ChatMessage[],
): SystemSplit<ChatMessage> {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => contentToText(message.content))
    .join("\n");
  const conversation = messages.filter((message) => message.role !== "system");
  return { system, conversation };
}

export function requireToolCallId(message: ChatMessage): string {
  if (message.toolCallId === undefined)
    throw new ProviderError("Tool messages require a toolCallId.");
  return message.toolCallId;
}

/** Finds the function name of the assistant call answered by a tool message. */
export function toolNameFor(
  messages: readonly ChatMessage[],
  toolCallId: string,
): string | undefined {
  for (const message of messages)
    for (const call of message.toolCalls ?? [])
      if (call.id === toolCallId) return call.name;
  return undefined;
}
