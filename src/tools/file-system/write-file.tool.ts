import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveSafeWritePath } from "../../utils/security.js";
import { ToolError } from "../../utils/errors.js";
import { computeFileDiff } from "../../utils/diff.js";

export interface WriteFileArgs {
  readonly filePath: string;
  readonly content: string;
}

export interface WriteFileOptions {
  readonly workspaceRoot: string;
  readonly maxBytes?: number;
  readonly previousContent?: string | undefined;
}

export type SkippedReason = "binary" | "too-large" | "unreadable";

export interface PreviousContent {
  readonly before: string | undefined;
  readonly skipped?: SkippedReason;
}

const DEFAULT_MAX_BYTES = 1_048_576;

function hasNullByte(buffer: Buffer): boolean {
  return buffer.includes(0);
}

export async function readPreviousContent(
  options: WriteFileOptions,
  filePath: string,
): Promise<PreviousContent> {
  const target = await resolveSafeWritePath(options.workspaceRoot, filePath);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  try {
    const metadata = await stat(target);
    if (!metadata.isFile()) return { before: undefined };
    if (metadata.size > maxBytes)
      return { before: undefined, skipped: "too-large" };
    const buffer = await readFile(target);
    if (hasNullByte(buffer)) return { before: undefined, skipped: "binary" };
    return { before: buffer.toString("utf8") };
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT") return { before: undefined };
    return { before: undefined, skipped: "unreadable" };
  }
}

function summarize(filePath: string, before: string, content: string): string {
  const diff = computeFileDiff({ filePath, before, after: content });
  return ` (+${diff.added} -${diff.removed})`;
}

export async function writeFileTool(
  args: WriteFileArgs,
  options: WriteFileOptions,
): Promise<string> {
  const target = await resolveSafeWritePath(
    options.workspaceRoot,
    args.filePath,
  );
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const byteLength = Buffer.byteLength(args.content, "utf8");
  if (byteLength > maxBytes) {
    throw new ToolError(
      `The content exceeds the ${maxBytes} byte limit (${byteLength} bytes).`,
    );
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, args.content, "utf8");
  const summary =
    options.previousContent === undefined
      ? ""
      : summarize(args.filePath, options.previousContent, args.content);
  return `Wrote ${byteLength} bytes to ${args.filePath}.${summary}`;
}
