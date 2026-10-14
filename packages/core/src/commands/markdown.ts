import { isMap, isScalar, parseDocument } from "yaml";

import type { CommandSource, CustomCommand } from "./types.js";
import { assertModel } from "./types.js";

const MAX_COMMAND_BYTES = 256 * 1024;
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

const ALLOWED_FIELDS = new Set([
  "description",
  "agent",
  "model",
  "subagent",
] as const);

interface CommandMetadata {
  description?: string;
  agent?: string;
  model?: string;
  subagent?: boolean;
}

type RawMetadata = Record<string, unknown>;

export function parseMarkdownCommand(
  name: string,
  content: string,
  source: CommandSource,
): CustomCommand {
  validateCommandSize(content, source);

  const { body, metadata: rawMetadata } = parseFrontmatter(content, source);

  validateTemplate(body, source);

  const metadata = parseMetadata(rawMetadata, source);

  return {
    name,
    template: body,
    source,
    subagent: metadata.subagent ?? false,
    ...(metadata.description !== undefined && {
      description: metadata.description,
    }),
    ...(metadata.agent !== undefined && {
      agent: metadata.agent,
    }),
    ...(metadata.model !== undefined && {
      model: metadata.model,
    }),
  };
}

function validateCommandSize(content: string, source: CommandSource): void {
  if (Buffer.byteLength(content) > MAX_COMMAND_BYTES) {
    throw new Error(
      `${source.path}: command exceeds ${MAX_COMMAND_BYTES} bytes.`,
    );
  }
}

function parseFrontmatter(
  content: string,
  source: CommandSource,
): {
  body: string;
  metadata: RawMetadata;
} {
  if (!hasFrontmatter(content)) {
    return {
      body: content,
      metadata: {},
    };
  }

  const match = FRONTMATTER_PATTERN.exec(content);

  if (match === null) {
    throw new Error(`${source.path}: malformed frontmatter.`);
  }

  const document = parseDocument(match[1] ?? "", {
    strict: true,
  });

  if (document.errors.length > 0 || !isMap(document.contents)) {
    throw new Error(`${source.path}: invalid frontmatter.`);
  }

  const metadata: RawMetadata = {};

  for (const pair of document.contents.items) {
    if (
      !isScalar(pair.key) ||
      typeof pair.key.value !== "string" ||
      !isScalar(pair.value) ||
      pair.key.tag !== undefined ||
      pair.value.tag !== undefined
    ) {
      throw new Error(`${source.path}: frontmatter values must be scalar.`);
    }

    metadata[pair.key.value] = pair.value.value;
  }

  return {
    body: content.slice(match[0].length),
    metadata,
  };
}

function hasFrontmatter(content: string): boolean {
  return content.startsWith("---\n") || content.startsWith("---\r\n");
}

function validateTemplate(body: string, source: CommandSource): void {
  if (body.trim().length === 0) {
    throw new Error(`${source.path}: command template is empty.`);
  }
}

function parseMetadata(
  metadata: RawMetadata,
  source: CommandSource,
): CommandMetadata {
  validateKnownFields(metadata, source);

  const description = optionalString(metadata, "description", source);
  const agent = optionalString(metadata, "agent", source);
  const model = optionalString(metadata, "model", source);
  const subagent = optionalBoolean(metadata, "subagent", source);

  if (model !== undefined) {
    assertModel(model);
  }

  return {
    ...(description !== undefined && { description }),
    ...(agent !== undefined && { agent }),
    ...(model !== undefined && { model }),
    ...(subagent !== undefined && { subagent }),
  };
}

function validateKnownFields(
  metadata: RawMetadata,
  source: CommandSource,
): void {
  for (const field of Object.keys(metadata)) {
    if (!ALLOWED_FIELDS.has(field as keyof CommandMetadata)) {
      throw new Error(`${source.path}: unknown frontmatter field '${field}'.`);
    }
  }
}

function optionalString(
  metadata: RawMetadata,
  field: "description" | "agent" | "model",
  source: CommandSource,
): string | undefined {
  const value = metadata[field];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${source.path}: ${field} must be a string.`);
  }

  return value;
}

function optionalBoolean(
  metadata: RawMetadata,
  field: "subagent",
  source: CommandSource,
): boolean | undefined {
  const value = metadata[field];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${source.path}: ${field} must be boolean.`);
  }

  return value;
}
