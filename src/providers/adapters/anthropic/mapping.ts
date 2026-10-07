import type {
  Base64ImageSource,
  ContentBlockParam,
  Message,
  MessageParam,
  TextBlockParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { ProviderError } from "../../../utils/errors.js";
import { contentToText } from "../../contracts/content.js";
import type {
  ChatMessage,
  ChatResponse,
  ContentPart,
  ToolCall,
  ToolDefinition,
} from "../../contracts/types.js";
import {
  parseToolArguments,
  stringifyToolArguments,
} from "../../shared/arguments.js";
import { requireToolCallId } from "../../shared/messages.js";
import { optional } from "../../shared/request.js";
import { toUsage } from "../../shared/usage.js";

type ImageMediaType = Base64ImageSource["media_type"];

const IMAGE_MEDIA_TYPES: readonly ImageMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

function isImageMediaType(value: string): value is ImageMediaType {
  return IMAGE_MEDIA_TYPES.some((type) => type === value);
}

function toContentBlock(part: ContentPart): ContentBlockParam {
  if (part.type === "text") return { type: "text", text: part.text };
  if (!isImageMediaType(part.mediaType))
    throw new ProviderError(
      `Anthropic does not support image type '${part.mediaType}'.`,
    );
  return {
    type: "image",
    source: { type: "base64", media_type: part.mediaType, data: part.data },
  };
}

function textBlocks(text: string): TextBlockParam[] {
  return text === "" ? [] : [{ type: "text", text }];
}

function toAnthropicMessage(message: ChatMessage): MessageParam {
  switch (message.role) {
    case "tool":
      return {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: requireToolCallId(message),
            content: contentToText(message.content),
          },
        ],
      };
    case "assistant":
      if (message.toolCalls === undefined || message.toolCalls.length === 0)
        return { role: "assistant", content: contentToText(message.content) };
      return {
        role: "assistant",
        content: [
          ...textBlocks(contentToText(message.content)),
          ...message.toolCalls.map((call) => ({
            type: "tool_use" as const,
            id: call.id,
            name: call.name,
            input: parseToolArguments(call.arguments),
          })),
        ],
      };
    default:
      return typeof message.content === "string"
        ? { role: "user", content: message.content }
        : { role: "user", content: message.content.map(toContentBlock) };
  }
}

/** Maps a conversation without system messages to Anthropic messages. */
export function toAnthropicMessages(
  conversation: readonly ChatMessage[],
): MessageParam[] {
  return conversation.map(toAnthropicMessage);
}

export function toAnthropicTools(tools: readonly ToolDefinition[]): Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: { type: "object", ...tool.parameters },
  }));
}

export function fromAnthropicMessage(response: Message): ChatResponse {
  const toolCalls: ToolCall[] = response.content.flatMap((block) =>
    block.type === "tool_use"
      ? [
          {
            id: block.id,
            name: block.name,
            arguments: stringifyToolArguments(block.input),
          },
        ]
      : [],
  );
  const content = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
  return {
    content,
    toolCalls,
    ...optional(
      "usage",
      toUsage(response.usage.input_tokens, response.usage.output_tokens),
    ),
    ...optional("finishReason", response.stop_reason),
  };
}
