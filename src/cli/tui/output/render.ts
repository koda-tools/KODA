import type { FileDiff } from "../../../utils/diff.js";
import { diffSegments } from "../diff/diff-segments.js";
import { MarkdownStream } from "../markdown/markdown-stream.js";
import type { LineWriter, Segment } from "../shared/types.js";
import type { RenderOptions, WriteArguments } from "./types.js";

const TYPING_DELAY_MS = 25;

function extensionOf(filePath: string): string {
  return filePath.includes(".") ? (filePath.split(".").pop() ?? "") : "";
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function writeSegments(
  writer: LineWriter,
  segments: readonly Segment[],
  animate: boolean,
): Promise<void> {
  for (const segment of segments) {
    writer.writeSegment(segment);
    if (animate) await sleep(TYPING_DELAY_MS);
  }
  writer.ensureNewLine();
}

/** Fence info naming the file, so the code block header shows it. */
function fenceInfo(filePath: string): string {
  const title = filePath.includes('"') ? "" : ` title="${filePath}"`;
  return `${extensionOf(filePath)}${title}`;
}

/** Show a written file as a highlighted `CODE · <file>` block. */
export async function renderFile(
  writer: LineWriter,
  file: WriteArguments,
  options: RenderOptions,
): Promise<void> {
  const fence = "```";
  const stream = new MarkdownStream(options.highlighter, options.onCodeBlock);
  const segments = [
    ...(await stream.push(
      `${fence}${fenceInfo(file.filePath)}\n${file.content}\n${fence}\n`,
    )),
    ...(await stream.flush()),
  ];
  await writeSegments(writer, segments, options.animate);
}

export async function renderDiff(
  writer: LineWriter,
  diff: FileDiff,
  options: RenderOptions,
): Promise<void> {
  const extension = extensionOf(diff.filePath);
  const language =
    extension === ""
      ? undefined
      : await options.highlighter?.resolveLanguage(extension);
  await writeSegments(
    writer,
    diffSegments(diff, language, options.highlighter),
    options.animate,
  );
}
