import type { WriteArguments } from "./types.js";

const WRITE_SUMMARY = /\((\+\d+ -\d+)\)\s*$/;

/** Extract "+N -M" from a writeFile observation, if present. */
export function parseWriteSummary(content: string): string | undefined {
  return WRITE_SUMMARY.exec(content)?.[1];
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
