import type { FileDiff } from "../../utils/diff.js";
import { diffSegments } from "./diff-view.js";
import type { CodeHighlighter } from "./highlight.js";
import type { InteractiveIO } from "./io.js";
import { MarkdownStream, type Segment } from "./markdown-stream.js";

const TYPING_DELAY_MS = 25;

function languageFromPath(filePath: string): string {
  return filePath.includes(".") ? (filePath.split(".").pop() ?? "") : "";
}

export interface LineWriter {
  readonly ensureNewLine: () => void;
  readonly write: (text: string) => void;
  readonly writeSegment: (segment: Segment) => void;
}

export interface WriteArguments {
  readonly filePath: string;
  readonly content: string;
}

export function createLineWriter(io: InteractiveIO): LineWriter {
  let atLineStart = true;
  const write = (text: string): void => {
    io.write(text);
    atLineStart = text.endsWith("\n");
  };
  return {
    ensureNewLine: () => {
      if (atLineStart) return;
      io.write("\n");
      atLineStart = true;
    },
    write,
    writeSegment: (segment) => {
      if (segment.kind === "text") return write(segment.text);
      if (io.writeStyled === undefined) return write(segment.plain);
      io.writeStyled(segment.ansi);
      atLineStart = true;
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function renderFile(
  writer: LineWriter,
  file: WriteArguments,
  options: { highlighter?: CodeHighlighter | undefined; animate: boolean },
): Promise<void> {
  const language = languageFromPath(file.filePath);
  const stream = new MarkdownStream(options.highlighter);
  const segments = [
    ...(await stream.push(`\`\`\`${language}\n${file.content}\n\`\`\`\n`)),
    ...(await stream.flush()),
  ];
  for (const segment of segments) {
    writer.writeSegment(segment);
    if (options.animate) await sleep(TYPING_DELAY_MS);
  }
  writer.ensureNewLine();
}

export async function renderDiff(
  writer: LineWriter,
  diff: FileDiff,
  options: { highlighter?: CodeHighlighter | undefined; animate: boolean },
): Promise<void> {
  const name = languageFromPath(diff.filePath);
  const language =
    name === "" ? undefined : await options.highlighter?.resolveLanguage(name);
  const segments = diffSegments(diff, language, options.highlighter);
  for (const segment of segments) {
    writer.writeSegment(segment);
    if (options.animate) await sleep(TYPING_DELAY_MS);
  }
  writer.ensureNewLine();
}

const WRITE_SUMMARY = /\((\+\d+ -\d+)\)\s*$/;

export function parseWriteSummary(content: string): string | undefined {
  const match = WRITE_SUMMARY.exec(content);
  return match?.[1];
}

export function parseWriteArguments(
  serializedArguments: string,
): WriteArguments | undefined {
  try {
    const parsed: unknown = JSON.parse(serializedArguments);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const { filePath, content } = parsed as Record<string, unknown>;
    return typeof filePath === "string" && typeof content === "string"
      ? { filePath, content }
      : undefined;
  } catch {
    return undefined;
  }
}
