import type { ChatMessage, MessageContent } from "../contracts/types.js";

/** Typical size of a token in English text and code. */
const CHARS_PER_TOKEN = 4;
/** Role markers and delimiters each message adds on the wire. */
const MESSAGE_OVERHEAD_TOKENS = 4;
/**
 * Vendors bill images by pixel area, not by the length of their base64
 * encoding, so each image costs a fixed amount near the vendors' maximum.
 */
const IMAGE_TOKENS = 1_600;
/** From here on (CJK, emoji...) a character is roughly one token or more. */
const WIDE_CODE_POINT = 0x2e80;

function textTokens(text: string): number {
  let narrow = 0;
  let wide = 0;
  for (const char of text)
    if ((char.codePointAt(0) ?? 0) >= WIDE_CODE_POINT) wide += 1;
    else narrow += 1;
  return Math.ceil(narrow / CHARS_PER_TOKEN) + wide;
}

function contentTokens(content: MessageContent): number {
  if (typeof content === "string") return textTokens(content);
  let total = 0;
  for (const part of content)
    total += part.type === "text" ? textTokens(part.text) : IMAGE_TOKENS;
  return total;
}

function messageTokens(message: ChatMessage): number {
  let total = MESSAGE_OVERHEAD_TOKENS + contentTokens(message.content);
  for (const call of message.toolCalls ?? [])
    total +=
      textTokens(call.id) + textTokens(call.name) + textTokens(call.arguments);
  if (message.toolCallId !== undefined) total += textTokens(message.toolCallId);
  return total;
}

/**
 * Rough token count for a conversation, without a tokenizer dependency. It
 * only decides whether history fits a budget that already has a margin, so
 * it aims to err on the high side for ordinary text rather than be exact.
 */
export function estimateTokens(messages: readonly ChatMessage[]): number {
  let total = 0;
  for (const message of messages) total += messageTokens(message);
  return total;
}
