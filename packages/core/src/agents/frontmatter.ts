import { parse } from "yaml";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Split a Markdown file into its YAML frontmatter (nested maps allowed, as
 * in OpenCode's `permission`) and its trimmed body.
 */
export function splitFrontmatter(
  content: string,
  source: string,
  maxBytes: number,
): { readonly data: Record<string, unknown>; readonly body: string } {
  if (Buffer.byteLength(content) > maxBytes)
    throw new Error(`${source}: file exceeds ${maxBytes} bytes.`);
  const text = content.replace(/^\uFEFF/, "");
  const match = FRONTMATTER.exec(text);
  if (match === null) return { data: {}, body: text.trim() };
  let data: unknown;
  try {
    data = parse(match[1] ?? "");
  } catch {
    throw new Error(`${source}: invalid YAML frontmatter.`);
  }
  if (data === null || data === undefined) data = {};
  if (!isRecord(data))
    throw new Error(`${source}: frontmatter must be a mapping.`);
  return { data, body: text.slice(match[0].length).trim() };
}
