import { isProviderName } from "../providers/index.js";
import { isRecord } from "./frontmatter.js";
import type {
  AgentFields,
  AgentMode,
  PermissionAction,
  PermissionKey,
  PermissionRule,
  Permissions,
} from "./types.js";

export const AGENT_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const MODES: readonly AgentMode[] = ["primary", "subagent", "all"];
const ACTIONS: readonly PermissionAction[] = ["allow", "ask", "deny"];
const PERMISSION_KEYS: readonly PermissionKey[] = [
  "read",
  "edit",
  "list",
  "glob",
  "grep",
  "bash",
  "task",
  "skill",
];
/** Legacy `tools:` names → the permission key they map to. */
const LEGACY_TOOLS: Readonly<Record<string, PermissionKey>> = {
  read: "read",
  write: "edit",
  edit: "edit",
  patch: "edit",
  list: "list",
  glob: "glob",
  grep: "grep",
  bash: "bash",
  task: "task",
  skill: "skill",
};
const COLOR =
  /^(#[0-9a-f]{6}|primary|secondary|accent|success|warning|error|info)$/i;
const MAX_DESCRIPTION = 1024;
const MAX_STEPS = 200;

function fail(source: string, message: string): never {
  throw new Error(`${source}: ${message}`);
}

function optionalString(
  data: Record<string, unknown>,
  field: string,
  source: string,
): string | undefined {
  const value = data[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail(source, `${field} must be a string.`);
  return value;
}

function optionalBoolean(
  data: Record<string, unknown>,
  field: string,
  source: string,
): boolean | undefined {
  const value = data[field];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") fail(source, `${field} must be boolean.`);
  return value;
}

function parseAction(value: unknown, where: string, source: string) {
  if (typeof value === "string" && ACTIONS.includes(value as PermissionAction))
    return value as PermissionAction;
  return fail(source, `${where} must be allow, ask or deny.`);
}

function parseRule(
  value: unknown,
  key: string,
  source: string,
): PermissionRule {
  if (!isRecord(value)) return parseAction(value, `permission.${key}`, source);
  const rules: Record<string, PermissionAction> = {};
  for (const [pattern, action] of Object.entries(value))
    rules[pattern] = parseAction(
      action,
      `permission.${key}.${pattern}`,
      source,
    );
  return rules;
}

/** OpenCode keys without a KODA tool (webfetch, lsp…) are accepted and ignored. */
function parsePermissions(value: unknown, source: string): Permissions {
  if (value === undefined) return {};
  if (typeof value === "string")
    return Object.fromEntries(
      PERMISSION_KEYS.map((key) => [
        key,
        parseAction(value, "permission", source),
      ]),
    );
  if (!isRecord(value)) fail(source, "permission must be a mapping.");
  const result: Partial<Record<PermissionKey, PermissionRule>> = {};
  for (const [key, rule] of Object.entries(value))
    if (PERMISSION_KEYS.includes(key as PermissionKey))
      result[key as PermissionKey] = parseRule(rule, key, source);
  return result;
}

/**
 * Deprecated `tools: { write: false }`. `false` denies; `true` keeps the
 * default (KODA never turns a legacy `true` into a silent allow).
 */
function legacyTools(value: unknown, source: string): Permissions {
  if (value === undefined) return {};
  if (!isRecord(value)) fail(source, "tools must be a mapping.");
  const result: Partial<Record<PermissionKey, PermissionRule>> = {};
  for (const [tool, enabled] of Object.entries(value)) {
    if (typeof enabled !== "boolean")
      fail(source, `tools.${tool} must be boolean.`);
    const keys = tool === "*" ? PERMISSION_KEYS : [LEGACY_TOOLS[tool]];
    for (const key of keys)
      if (key !== undefined && !enabled) result[key] = "deny";
  }
  return result;
}

function parseModel(value: string | undefined, source: string) {
  if (value === undefined) return undefined;
  const slash = value.indexOf("/");
  if (value.trim() === "" || /\s/.test(value))
    fail(source, "model must look like provider/model.");
  if (slash > 0 && !isProviderName(value.slice(0, slash)))
    fail(source, `unknown provider in model '${value}'.`);
  return value;
}

function parseNumber(
  data: Record<string, unknown>,
  field: "temperature" | "steps",
  source: string,
): number | undefined {
  const value = data[field];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value))
    fail(source, `${field} must be a number.`);
  if (field === "temperature" && (value < 0 || value > 2))
    fail(source, "temperature must be between 0 and 2.");
  if (
    field === "steps" &&
    (!Number.isInteger(value) || value < 1 || value > MAX_STEPS)
  )
    fail(source, `steps must be an integer from 1 to ${MAX_STEPS}.`);
  return value;
}

function parseMode(value: string | undefined, source: string) {
  if (value === undefined) return undefined;
  if (!MODES.includes(value as AgentMode))
    fail(source, "mode must be primary, subagent or all.");
  return value as AgentMode;
}

/**
 * Validate OpenCode agent fields (frontmatter or a JSON `agent` entry).
 * Unknown fields are ignored, like OpenCode's provider pass-through options.
 */
export function parseAgentFields(
  data: Record<string, unknown>,
  source: string,
  prompt: string | undefined,
): AgentFields {
  const description = optionalString(data, "description", source);
  if (
    description !== undefined &&
    (description.trim() === "" || description.length > MAX_DESCRIPTION)
  )
    fail(source, `description must have 1 to ${MAX_DESCRIPTION} characters.`);
  const color = optionalString(data, "color", source);
  if (color !== undefined && !COLOR.test(color))
    fail(source, "color must be a hex color or a theme color.");
  const permission = {
    ...legacyTools(data.tools, source),
    ...parsePermissions(data.permission, source),
  };
  const fields: Record<string, unknown> = {
    description: description?.trim(),
    mode: parseMode(optionalString(data, "mode", source), source),
    model: parseModel(optionalString(data, "model", source), source),
    temperature: parseNumber(data, "temperature", source),
    steps: parseNumber(data, "steps", source),
    hidden: optionalBoolean(data, "hidden", source),
    disable: optionalBoolean(data, "disable", source),
    color,
    prompt:
      prompt === undefined || prompt.trim() === "" ? undefined : prompt.trim(),
    permission: Object.keys(permission).length === 0 ? undefined : permission,
  };
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as AgentFields;
}
