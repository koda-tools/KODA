import type { Dirent } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parse, type ParseError } from "jsonc-parser";

import { AGENT_NAME, parseAgentFields } from "./agent-file.js";
import { BUILTIN_AGENTS } from "./builtins.js";
import { isRecord, splitFrontmatter } from "./frontmatter.js";
import { MAX_SKILL_BYTES, parseSkillFile } from "./skill-file.js";
import type {
  AgentCatalog,
  AgentDefinition,
  AgentFields,
  CatalogOptions,
  SkillDefinition,
} from "./types.js";

const MAX_AGENT_BYTES = 64 * 1024;
const MAX_CONFIG_BYTES = 256 * 1024;
const MAX_CUSTOM_AGENTS = 64;
const MAX_SKILLS = 100;
const FILE_PROMPT = /^\{file:(.+)\}$/;
const AGENT_FOLDERS = ["agents", "agent"] as const;
const SKILL_FOLDERS = [".koda", ".opencode", ".claude", ".agents"] as const;

/** An agent definition found in one file, before merging. */
interface FoundAgent {
  readonly name: string;
  readonly fields: AgentFields;
  readonly source: string;
}

type AgentSource =
  | { readonly type: "directory"; readonly path: string }
  | { readonly type: "config"; readonly path: string };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

function byName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name);
}

/** Directory entries, or none when the folder does not exist. */
async function listEntries(
  directory: string,
  diagnostics: string[],
): Promise<Dirent[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.sort(byName);
  } catch (error) {
    if (!isMissing(error))
      diagnostics.push(`${directory}: ${messageOf(error)}`);
    return [];
  }
}

/** File content, or undefined when missing. Symlinks are never followed. */
async function readTextFile(
  file: string,
  maxBytes: number,
): Promise<string | undefined> {
  let stats;
  try {
    stats = await lstat(file);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  if (stats.isSymbolicLink() || !stats.isFile()) return undefined;
  if (stats.size > maxBytes)
    throw new Error(`${file}: file exceeds ${maxBytes} bytes.`);
  return readFile(file, "utf8");
}

function expandHome(target: string, homeDir: string): string {
  return target === "~" || target.startsWith("~/") || target.startsWith("~\\")
    ? path.join(homeDir, target.slice(1))
    : target;
}

/** `prompt: "{file:./review.md}"` reads the file next to the config. */
async function resolvePrompt(
  value: unknown,
  configFile: string,
  source: string,
  homeDir: string,
): Promise<string | undefined> {
  if (value === undefined) return undefined;
  if (typeof value !== "string")
    throw new Error(`${source}: prompt must be a string.`);
  const match = FILE_PROMPT.exec(value.trim());
  if (match === null) return value;
  const target = path.resolve(
    path.dirname(configFile),
    expandHome((match[1] ?? "").trim(), homeDir),
  );
  const content = await readTextFile(target, MAX_AGENT_BYTES);
  if (content === undefined)
    throw new Error(`${source}: prompt file '${target}' was not found.`);
  return content;
}

async function agentsFromDirectory(
  directory: string,
  diagnostics: string[],
): Promise<FoundAgent[]> {
  const found: FoundAgent[] = [];
  for (const entry of await listEntries(directory, diagnostics)) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
    const file = path.join(directory, entry.name);
    const name = entry.name.slice(0, -".md".length);
    try {
      if (!AGENT_NAME.test(name))
        throw new Error(`${file}: invalid agent name '${name}'.`);
      const content = await readTextFile(file, MAX_AGENT_BYTES);
      if (content === undefined) continue;
      const { data, body } = splitFrontmatter(content, file, MAX_AGENT_BYTES);
      found.push({
        name,
        fields: parseAgentFields(data, file, body),
        source: file,
      });
    } catch (error) {
      diagnostics.push(messageOf(error));
    }
  }
  return found;
}

function parseConfig(content: string, file: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const config: unknown = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0 || !isRecord(config))
    throw new Error(`${file}: invalid JSON/JSONC configuration.`);
  return config;
}

async function agentsFromConfig(
  file: string,
  diagnostics: string[],
  homeDir: string,
): Promise<FoundAgent[]> {
  let agents: unknown;
  try {
    const content = await readTextFile(file, MAX_CONFIG_BYTES);
    if (content === undefined) return [];
    agents = parseConfig(content, file).agent;
    if (agents === undefined) return [];
    if (!isRecord(agents)) throw new Error(`${file}: agent must be an object.`);
  } catch (error) {
    diagnostics.push(messageOf(error));
    return [];
  }
  const found: FoundAgent[] = [];
  for (const [name, entry] of Object.entries(agents).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const source = `${file} (agent.${name})`;
    try {
      if (!AGENT_NAME.test(name))
        throw new Error(`${source}: invalid agent name.`);
      if (!isRecord(entry)) throw new Error(`${source}: must be an object.`);
      const prompt = await resolvePrompt(entry.prompt, file, source, homeDir);
      found.push({
        name,
        fields: parseAgentFields(entry, source, prompt),
        source,
      });
    } catch (error) {
      diagnostics.push(messageOf(error));
    }
  }
  return found;
}

function directorySources(root: string): AgentSource[] {
  return AGENT_FOLDERS.map((folder) => ({
    type: "directory",
    path: path.join(root, folder),
  }));
}

function configSources(root: string, baseName: string): AgentSource[] {
  return [".jsonc", ".json"].map((extension) => ({
    type: "config",
    path: path.join(root, `${baseName}${extension}`),
  }));
}

function globalSources(root: string | undefined, baseName: string) {
  return root === undefined
    ? []
    : [...directorySources(root), ...configSources(root, baseName)];
}

/** Precedence levels, highest first (same order as custom commands). */
function agentLevels(options: CatalogOptions): AgentSource[][] {
  const workspace = path.resolve(options.workspaceRoot);
  const koda = path.join(workspace, ".koda");
  const openCode = path.join(workspace, ".opencode");
  return [
    directorySources(koda),
    configSources(koda, "koda"),
    configSources(workspace, "koda"),
    directorySources(openCode),
    configSources(openCode, "opencode"),
    configSources(workspace, "opencode"),
    globalSources(options.globalKodaRoot, "koda"),
    globalSources(options.globalOpenCodeRoot, "opencode"),
  ];
}

async function loadLevel(
  sources: readonly AgentSource[],
  diagnostics: string[],
  homeDir: string,
): Promise<FoundAgent[]> {
  const found: FoundAgent[] = [];
  for (const source of sources)
    found.push(
      ...(source.type === "directory"
        ? await agentsFromDirectory(source.path, diagnostics)
        : await agentsFromConfig(source.path, diagnostics, homeDir)),
    );
  return found;
}

/** The first definition of a name wins; a repeat in the same level is reported. */
function selectByPrecedence(
  levels: readonly FoundAgent[][],
  diagnostics: string[],
): Map<string, FoundAgent> {
  const chosen = new Map<string, FoundAgent>();
  for (const level of levels) {
    const seen = new Map<string, string>();
    for (const agent of level) {
      const first = seen.get(agent.name);
      if (first !== undefined) {
        diagnostics.push(
          `${agent.source}: agent '${agent.name}' is already defined by ${first}; ignored.`,
        );
        continue;
      }
      seen.set(agent.name, agent.source);
      if (!chosen.has(agent.name)) chosen.set(agent.name, agent);
    }
  }
  return chosen;
}

/** A file's fields over the base; permission keys merge one by one. */
function merge(base: AgentDefinition, found: FoundAgent): AgentDefinition {
  return {
    ...base,
    ...found.fields,
    permission: { ...base.permission, ...found.fields.permission },
    name: base.name,
    source: found.source,
  };
}

function customBase(name: string, description: string): AgentDefinition {
  return {
    name,
    description,
    mode: "all",
    prompt: "",
    permission: {},
    hidden: false,
    disable: false,
    source: "",
  };
}

function isPrimary(agent: AgentDefinition): boolean {
  return agent.mode !== "subagent";
}

function buildAgents(
  chosen: ReadonlyMap<string, FoundAgent>,
  diagnostics: string[],
): AgentDefinition[] {
  const agents: AgentDefinition[] = [];
  const builtinNames = new Set(BUILTIN_AGENTS.map((agent) => agent.name));
  for (const builtin of BUILTIN_AGENTS) {
    const found = chosen.get(builtin.name);
    const agent = found === undefined ? builtin : merge(builtin, found);
    if (!agent.disable) agents.push(agent);
  }
  let custom = 0;
  const customs = [...chosen.values()]
    .filter((found) => !builtinNames.has(found.name))
    .sort(byName);
  for (const found of customs) {
    const description = found.fields.description;
    if (description === undefined) {
      diagnostics.push(`${found.source}: description is required.`);
      continue;
    }
    const agent = merge(customBase(found.name, description), found);
    if (agent.disable) continue;
    if (custom >= MAX_CUSTOM_AGENTS) {
      diagnostics.push(
        `${found.source}: more than ${MAX_CUSTOM_AGENTS} agents; ignored.`,
      );
      continue;
    }
    custom += 1;
    agents.push(agent);
  }
  if (!agents.some(isPrimary)) {
    const build = BUILTIN_AGENTS[0];
    if (build !== undefined) {
      diagnostics.push(
        "No primary agent is enabled; using the built-in 'build' agent.",
      );
      agents.unshift(build);
    }
  }
  return agents;
}

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch {
    return false;
  }
}

/** The workspace and its parents up to the git root (or just the workspace). */
async function projectDirectories(workspaceRoot: string): Promise<string[]> {
  const start = path.resolve(workspaceRoot);
  const directories: string[] = [];
  let current = start;
  for (;;) {
    directories.push(current);
    if (await exists(path.join(current, ".git"))) return directories;
    const parent = path.dirname(current);
    if (parent === current) return [start];
    current = parent;
  }
}

async function skillRoots(options: CatalogOptions): Promise<string[]> {
  const homeDir = options.homeDir ?? os.homedir();
  const roots: string[] = [];
  for (const directory of await projectDirectories(options.workspaceRoot))
    for (const folder of SKILL_FOLDERS)
      roots.push(path.join(directory, folder, "skills"));
  for (const root of [options.globalKodaRoot, options.globalOpenCodeRoot])
    if (root !== undefined) roots.push(path.join(root, "skills"));
  roots.push(
    path.join(homeDir, ".claude", "skills"),
    path.join(homeDir, ".agents", "skills"),
  );
  return [...new Set(roots.map((root) => path.resolve(root)))];
}

async function loadSkills(
  roots: readonly string[],
  diagnostics: string[],
): Promise<SkillDefinition[]> {
  const chosen = new Map<string, SkillDefinition>();
  for (const root of roots) {
    for (const entry of await listEntries(root, diagnostics)) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(root, entry.name);
      const file = path.join(directory, "SKILL.md");
      try {
        const content = await readTextFile(file, MAX_SKILL_BYTES);
        if (content === undefined) continue;
        const skill = parseSkillFile(entry.name, content, file, directory);
        const existing = chosen.get(skill.name);
        if (existing !== undefined) {
          diagnostics.push(
            `${file}: skill '${skill.name}' is already defined by ${existing.source}; ignored.`,
          );
        } else if (chosen.size >= MAX_SKILLS) {
          diagnostics.push(`${file}: more than ${MAX_SKILLS} skills; ignored.`);
        } else {
          chosen.set(skill.name, skill);
        }
      } catch (error) {
        diagnostics.push(messageOf(error));
      }
    }
  }
  return [...chosen.values()].sort(byName);
}

/**
 * Load agents and skills. `.koda` wins over `.opencode`, project wins over
 * global. Invalid files become diagnostics instead of failing the CLI.
 */
export async function loadCatalog(
  options: CatalogOptions,
): Promise<AgentCatalog> {
  const diagnostics: string[] = [];
  const homeDir = options.homeDir ?? os.homedir();
  const levels: FoundAgent[][] = [];
  for (const sources of agentLevels(options))
    levels.push(await loadLevel(sources, diagnostics, homeDir));
  const agents = buildAgents(
    selectByPrecedence(levels, diagnostics),
    diagnostics,
  );
  const skills = await loadSkills(await skillRoots(options), diagnostics);
  return { agents, skills, diagnostics };
}
