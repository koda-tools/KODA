import type {
  PermissionAction,
  PermissionCheck,
  PermissionKey,
  PermissionRule,
  Permissions,
} from "./types.js";

/** Safe defaults when a key is absent: changes to the project ask first. */
export const DEFAULT_PERMISSIONS: Readonly<
  Record<PermissionKey, PermissionAction>
> = {
  read: "allow",
  edit: "ask",
  list: "allow",
  glob: "allow",
  grep: "allow",
  bash: "ask",
  task: "allow",
  skill: "allow",
};

const SEVERITY: Readonly<Record<PermissionAction, number>> = {
  allow: 0,
  ask: 1,
  deny: 2,
};

/** Each tool, the permission keys it needs and the argument they match. */
const TOOL_PERMISSIONS: Readonly<
  Record<string, readonly { key: PermissionKey; field: string }[]>
> = {
  readFile: [{ key: "read", field: "filePath" }],
  getFileInfo: [{ key: "read", field: "path" }],
  writeFile: [{ key: "edit", field: "filePath" }],
  listDirectory: [{ key: "list", field: "path" }],
  searchFiles: [
    { key: "grep", field: "query" },
    { key: "glob", field: "include" },
  ],
  runCommand: [{ key: "bash", field: "command" }],
  skill: [{ key: "skill", field: "name" }],
  task: [{ key: "task", field: "agent" }],
};

const PATH_FIELDS = new Set(["filePath", "path", "include"]);

/** deny > ask > allow; an empty list allows. */
export function mostRestrictive(
  actions: readonly PermissionAction[],
): PermissionAction {
  return actions.reduce<PermissionAction>(
    (worst, action) => (SEVERITY[action] > SEVERITY[worst] ? action : worst),
    "allow",
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

/**
 * OpenCode wildcards: `*` is any text, `?` one character, and a trailing
 * ` *` also matches the bare command (`git *` matches `git`).
 */
export function matchesPattern(subject: string, pattern: string): boolean {
  const optionalTail = pattern.endsWith(" *");
  const head = optionalTail ? pattern.slice(0, -2) : pattern;
  const source = head
    .split("")
    .map((char) =>
      char === "*" ? ".*" : char === "?" ? "." : escapeRegExp(char),
    )
    .join("");
  return new RegExp(`^${source}${optionalTail ? "( .*)?" : ""}$`, "s").test(
    subject,
  );
}

/** The action of one rule for a subject; undefined when no pattern matches. */
export function resolveRule(
  rule: PermissionRule | undefined,
  subject: string,
): PermissionAction | undefined {
  if (rule === undefined) return undefined;
  if (typeof rule === "string") return rule;
  let action: PermissionAction | undefined;
  for (const [pattern, value] of Object.entries(rule))
    if (matchesPattern(subject, pattern)) action = value;
  return action;
}

/**
 * Each layer resolves on its own (falling back to the defaults) and the most
 * restrictive answer wins, so a subagent never exceeds its parent.
 */
export function resolvePermission(
  layers: readonly Permissions[],
  key: PermissionKey,
  subject = "",
): PermissionAction {
  if (layers.length === 0) return DEFAULT_PERMISSIONS[key];
  return mostRestrictive(
    layers.map(
      (layer) => resolveRule(layer[key], subject) ?? DEFAULT_PERMISSIONS[key],
    ),
  );
}

/** True when some layer denies the whole key (not just some patterns). */
export function isKeyDenied(
  layers: readonly Permissions[],
  key: PermissionKey,
): boolean {
  return layers.some((layer) => layer[key] === "deny");
}

/** Tools whose key is fully denied are not offered to the model. */
export function isToolHidden(
  layers: readonly Permissions[],
  tool: string,
): boolean {
  return (TOOL_PERMISSIONS[tool] ?? []).some(({ key }) =>
    isKeyDenied(layers, key),
  );
}

function subjectOf(field: string, args: Readonly<Record<string, unknown>>) {
  const value = args[field];
  if (typeof value !== "string") return "";
  if (!PATH_FIELDS.has(field)) return value.trim();
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "");
}

/**
 * The permission a call needs: the most restrictive of the tool's keys.
 * Undefined for tools without a permission key (handled by the executor).
 */
export function checkToolCall(
  layers: readonly Permissions[],
  tool: string,
  args: Readonly<Record<string, unknown>>,
): PermissionCheck | undefined {
  let result: PermissionCheck | undefined;
  for (const { key, field } of TOOL_PERMISSIONS[tool] ?? []) {
    const subject = subjectOf(field, args);
    const action = resolvePermission(layers, key, subject);
    if (result === undefined || SEVERITY[action] > SEVERITY[result.action])
      result = { key, subject, action };
  }
  return result;
}
