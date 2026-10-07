import { lstat, readFile, stat } from "node:fs/promises";
import { isLikelyBinary } from "../../utils/binary.js";
import { resolveSafeExistingPath } from "../../utils/security.js";

export interface GetFileInfoArgs {
  readonly path: string;
}

export interface GetFileInfoOptions {
  readonly workspaceRoot: string;
  readonly sampleBytes?: number;
}

const DEFAULT_SAMPLE = 8 * 1024;

type EntryKind = "file" | "directory" | "symlink" | "other";

function toKind(stats: {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}): EntryKind {
  if (stats.isSymbolicLink()) return "symlink";
  if (stats.isDirectory()) return "directory";
  if (stats.isFile()) return "file";
  return "other";
}

async function classifyContent(
  path: string,
  sampleBytes: number,
): Promise<"text" | "binary"> {
  const buffer = await readFile(path);
  return isLikelyBinary(buffer.subarray(0, sampleBytes)) ? "binary" : "text";
}

export async function getFileInfoTool(
  args: GetFileInfoArgs,
  options: GetFileInfoOptions,
): Promise<string> {
  const target = await resolveSafeExistingPath(options.workspaceRoot, args.path);
  const link = await lstat(target);
  const metadata = link.isSymbolicLink() ? await stat(target) : link;
  const kind = toKind(link);
  const sampleBytes = options.sampleBytes ?? DEFAULT_SAMPLE;
  const lines = [
    `Path:      ${args.path}`,
    `Kind:      ${kind}`,
    `Size:      ${metadata.size} bytes`,
    `Modified:  ${metadata.mtime.toISOString()}`,
  ];
  if (metadata.isFile()) {
    const contentKind = await classifyContent(target, sampleBytes);
    lines.push(`Content:   ${contentKind}`);
  }
  return lines.join("\n");
}
