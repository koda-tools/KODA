import type { MessageContent, TextContentPart } from "./types.js";

export function contentToText(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content
    .filter((part): part is TextContentPart => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}
