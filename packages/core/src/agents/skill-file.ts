import { isRecord, splitFrontmatter } from "./frontmatter.js";
import type { SkillDefinition } from "./types.js";

/** Same rules as OpenCode: 1–64 chars, lowercase, single hyphens. */
export const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;
export const MAX_SKILL_BYTES = 128 * 1024;

function requiredText(
  data: Record<string, unknown>,
  field: "name" | "description",
  max: number,
  source: string,
): string {
  const value = data[field];
  if (typeof value !== "string" || value.trim() === "" || value.length > max)
    throw new Error(`${source}: ${field} must have 1 to ${max} characters.`);
  return value.trim();
}

function optionalText(data: Record<string, unknown>, field: string) {
  const value = data[field];
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function metadataOf(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

/**
 * Parse `<folder>/SKILL.md`. `name` must match the folder; unknown
 * frontmatter fields are ignored, as in OpenCode.
 */
export function parseSkillFile(
  folderName: string,
  content: string,
  source: string,
  directory: string,
): SkillDefinition {
  const { data, body } = splitFrontmatter(content, source, MAX_SKILL_BYTES);
  const name = requiredText(data, "name", MAX_NAME, source);
  if (!SKILL_NAME.test(name))
    throw new Error(
      `${source}: name '${name}' must be lowercase words joined by single hyphens.`,
    );
  if (name !== folderName)
    throw new Error(
      `${source}: name '${name}' must match its folder '${folderName}'.`,
    );
  if (body === "") throw new Error(`${source}: skill has no instructions.`);
  return {
    name,
    description: requiredText(data, "description", MAX_DESCRIPTION, source),
    body,
    directory,
    source,
    license: optionalText(data, "license"),
    compatibility: optionalText(data, "compatibility"),
    metadata: metadataOf(data.metadata),
  };
}
