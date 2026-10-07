import type {
  ChatMessage,
  ChatResponse,
  CompletionOptions,
  ILLMProvider,
} from "../../providers/index.js";
import { AgentError } from "../../utils/errors.js";

async function streamToResponse(
  provider: ILLMProvider,
  messages: readonly ChatMessage[],
  options: CompletionOptions,
  onTextDelta: (text: string) => void,
): Promise<ChatResponse> {
  let response: ChatResponse | undefined;
  for await (const event of provider.stream(messages, options)) {
    if (event.type === "text-delta") onTextDelta(event.text);
    else if (event.type === "done") response = event.response;
  }
  if (response === undefined)
    throw new AgentError("The provider stream ended without a response.");
  return response;
}

/** Streams when someone listens to text deltas, otherwise completes at once. */
export function requestResponse(
  provider: ILLMProvider,
  messages: readonly ChatMessage[],
  options: CompletionOptions,
  onTextDelta: ((text: string) => void) | undefined,
): Promise<ChatResponse> {
  return onTextDelta === undefined
    ? provider.complete(messages, options)
    : streamToResponse(provider, messages, options, onTextDelta);
}
