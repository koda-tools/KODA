import type {
  ChatCompletion,
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { ProviderError } from "../../../utils/errors.js";
import { contentToText } from "../../contracts/content.js";
import type {
  ChatMessage,
  ChatResponse,
  CompletionOptions,
  ContentPart,
  ToolCall,
} from "../../contracts/types.js";
import { requireToolCallId } from "../../shared/messages.js";
import { optional, optionalNonEmpty } from "../../shared/request.js";
import { toUsage } from "../../shared/usage.js";
import type { OpenAIRequestOptions } from "./types.js";

function toContentPart(part: ContentPart): ChatCompletionContentPart {
  return part.type === "text"
    ? { type: "text", text: part.text }
    : {
        type: "image_url",
        image_url: { url: `data:${part.mediaType};base64,${part.data}` },
      };
}

export function toOpenAIMessage(
  message: ChatMessage,
): ChatCompletionMessageParam {
  switch (message.role) {
    case "tool":
      return {
        role: "tool",
        tool_call_id: requireToolCallId(message),
        content: contentToText(message.content),
      };
    case "assistant":
      return {
        role: "assistant",
        content: contentToText(message.content),
        ...optional(
          "tool_calls",
          message.toolCalls?.map((call) => ({
            id: call.id,
            type: "function" as const,
            function: { name: call.name, arguments: call.arguments },
          })),
        ),
      };
    case "user":
      return typeof message.content === "string"
        ? { role: "user", content: message.content }
        : { role: "user", content: message.content.map(toContentPart) };
    case "system":
      return { role: "system", content: contentToText(message.content) };
  }
}

export function toOpenAIRequestOptions(
  options: CompletionOptions,
): OpenAIRequestOptions {
  const tools = (options.tools ?? []).map<ChatCompletionTool>((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
  return {
    ...optionalNonEmpty("tools", tools),
    ...(tools.length === 0 ? {} : { tool_choice: "auto" as const }),
    ...optional("temperature", options.temperature),
    ...optional("max_tokens", options.maxTokens),
  };
}

export function fromOpenAICompletion(response: ChatCompletion): ChatResponse {
  const choice = response.choices[0];
  if (choice === undefined)
    throw new ProviderError("OpenAI returned no completion choice.");
  const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).flatMap(
    (call) =>
      call.type === "function"
        ? [
            {
              id: call.id,
              name: call.function.name,
              arguments: call.function.arguments,
            },
          ]
        : [],
  );
  return {
    content: choice.message.content ?? "",
    toolCalls,
    ...optional(
      "usage",
      toUsage(response.usage?.prompt_tokens, response.usage?.completion_tokens),
    ),
    ...optional("finishReason", choice.finish_reason),
  };
}
