import { readFile, stat } from "node:fs/promises";
import { ToolError } from "../../utils/errors.js";
import { resolveSafeExistingPath } from "../../utils/security.js";

export interface ReadFileArgs {
  readonly filePath: string;
}

export interface ReadFileOptions {
  readonly workspaceRoot: string;
  readonly maxBytes?: number;
}

export async function readFileTool(
  args: ReadFileArgs,
  options: ReadFileOptions,
): Promise<string> {
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
  return readFile(target, "utf8");
}
