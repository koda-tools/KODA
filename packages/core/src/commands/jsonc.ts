import { parse, type ParseError } from "jsonc-parser";

import type { CommandSource, CustomCommand } from "./types.js";
import { assertCommandName, assertModel } from "./types.js";

const MAX_CONFIG_BYTES = 256 * 1024;

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const OPTIONAL_STRING_FIELDS = ["description", "agent", "model"] as const;

type JsonObject = Record<string, unknown>;

export function parseJsonCommands(
  content: string,
  source: CommandSource,
): CustomCommand[] {
  assertConfigSize(content, source);

  const config = parseConfig(content, source);
  const commands = config.commands;

  if (commands === undefined) {
    return [];
  }

  assertObject(commands, `${source.path}: commands must be an object.`);

  return Object.entries(commands)
    .map(([name, definition]) => parseCommand(name, definition, source))
    .sort(compareCommandsByName);
}

function parseConfig(content: string, source: CommandSource): JsonObject {
  const errors: ParseError[] = [];

  const parsed: unknown = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  if (errors.length > 0 || !isObject(parsed)) {
    throw new Error(`${source.path}: invalid JSON/JSONC configuration.`);
  }

  return parsed;
}

function parseCommand(
  name: string,
  definition: unknown,
  source: CommandSource,
): CustomCommand {
  assertCommandName(name);
  assertSafeCommandName(name, source);

  assertObject(
    definition,
    `${source.path}: command '${name}' must be an object.`,
  );

  assertSafeDefinition(definition, name, source);
  assertTemplate(definition.template, name, source);
  assertOptionalStringFields(definition, name, source);
  assertOptionalBooleanField(definition, "subagent", name, source);

  const { template, description, agent, model, subagent } = definition;

  if (typeof model === "string") {
    assertModel(model);
  }

  return {
    name,
    template,
    source,
    subagent: subagent === true,
    ...optionalString("description", description),
    ...optionalString("agent", agent),
    ...optionalString("model", model),
  };
}

function assertConfigSize(content: string, source: CommandSource): void {
  const size = Buffer.byteLength(content);

  if (size > MAX_CONFIG_BYTES) {
    throw new Error(
      `${source.path}: configuration exceeds ${MAX_CONFIG_BYTES} bytes.`,
    );
  }
}

function assertTemplate(
  value: unknown,
  commandName: string,
  source: CommandSource,
): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${source.path}: command '${commandName}' requires a template.`,
    );
  }
}

function assertOptionalStringFields(
  definition: JsonObject,
  commandName: string,
  source: CommandSource,
): void {
  for (const field of OPTIONAL_STRING_FIELDS) {
    const value = definition[field];

    if (value !== undefined && typeof value !== "string") {
      throw new Error(
        `${source.path}: ${commandName}.${field} must be a string.`,
      );
    }
  }
}

function assertOptionalBooleanField(
  definition: JsonObject,
  field: string,
  commandName: string,
  source: CommandSource,
): void {
  const value = definition[field];

  if (value !== undefined && typeof value !== "boolean") {
    throw new Error(`${source.path}: ${commandName}.${field} must be boolean.`);
  }
}

function assertSafeCommandName(name: string, source: CommandSource): void {
  if (isForbiddenKey(name)) {
    throw new Error(`${source.path}: unsafe command definition '${name}'.`);
  }
}

function assertSafeDefinition(
  definition: JsonObject,
  commandName: string,
  source: CommandSource,
): void {
  const unsafeKey = Object.keys(definition).find(isForbiddenKey);

  if (unsafeKey !== undefined) {
    throw new Error(
      `${source.path}: unsafe key '${unsafeKey}' in command '${commandName}'.`,
    );
  }
}

function assertObject(
  value: unknown,
  message: string,
): asserts value is JsonObject {
  if (!isObject(value)) {
    throw new Error(message);
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_KEYS.has(key);
}

function optionalString<K extends string>(
  key: K,
  value: unknown,
): Partial<Record<K, string>> {
  if (typeof value !== "string") {
    return {};
  }

  return {
    [key]: value,
  } as Record<K, string>;
}

function compareCommandsByName(
  left: CustomCommand,
  right: CustomCommand,
): number {
  return left.name.localeCompare(right.name);
}
