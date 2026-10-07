import { readFile, stat } from "node:fs/promises";
import { ToolError } from "../../utils/errors.js";
import { resolveSafeExistingPath } from "../../utils/security.js";

export interface ReadFileArgs {
  readonly filePath: string;
  readonly startLine?: number;
  readonly endLine?: number;
}

export interface ReadFileOptions {
  readonly workspaceRoot: string;
  readonly maxBytes?: number;
}

function validateRange(
  startLine: number | undefined,
  endLine: number | undefined,
): void {
  if (startLine !== undefined && (!Number.isInteger(startLine) || startLine < 1))
    throw new ToolError("startLine must be a positive integer.");
  if (endLine !== undefined && (!Number.isInteger(endLine) || endLine < 1))
    throw new ToolError("endLine must be a positive integer.");
  if (
    startLine !== undefined &&
    endLine !== undefined &&
    endLine < startLine
  )
    throw new ToolError("endLine must be greater than or equal to startLine.");
}

function sliceRange(
  content: string,
  filePath: string,
  startLine: number | undefined,
  endLine: number | undefined,
): string {
  if (startLine === undefined && endLine === undefined) return content;
  const lines = content.split("\n");
  const start = Math.max(1, startLine ?? 1);
  const end = Math.min(lines.length, endLine ?? lines.length);
  if (start > lines.length)
    throw new ToolError(
      `startLine ${start} is beyond the file (${lines.length} lines).`,
    );
  const slice = lines.slice(start - 1, end).join("\n");
  return `${filePath} (lines ${start}-${end} of ${lines.length})\n${slice}`;
}

export async function readFileTool(
  args: ReadFileArgs,
  options: ReadFileOptions,
): Promise<string> {
  validateRange(args.startLine, args.endLine);
  const target = await resolveSafeExistingPath(
    options.workspaceRoot,
    args.filePath,
  );
  const metadata = await stat(target);
  const maxBytes = options.maxBytes ?? 1_048_576;
  if (!metadata.isFile())
    throw new ToolError("The requested path is not a file.");
  if (metadata.size > maxBytes)
    throw new ToolError(
      `The requested file exceeds the ${maxBytes} byte limit.`,
    );
  const content = await readFile(target, "utf8");
  return sliceRange(content, args.filePath, args.startLine, args.endLine);
}
