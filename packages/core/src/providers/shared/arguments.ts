function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses JSON tool-call arguments, falling back to an empty object. */
export function parseToolArguments(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Serializes tool-call arguments, defaulting to an empty object. */
export function stringifyToolArguments(value: unknown): string {
  return JSON.stringify(value ?? {});
}
