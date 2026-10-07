import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { parseJsonCommands } from "./jsonc.js";
import { parseMarkdownCommand } from "./markdown.js";
import type { CustomCommand } from "./types.js";
import { assertCommandName } from "./types.js";

export interface DiscoveryOptions {
  readonly workspaceRoot: string;
  readonly globalKodaRoot?: string;
  readonly globalOpenCodeRoot?: string;
}

type SourceType = "directory" | "config";

interface SourceSpec {
  readonly path: string;
  readonly level: number;
  readonly type: SourceType;
}

const MARKDOWN_EXTENSION = ".md";
const MAX_SUGGESTIONS = 3;

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function findMarkdownFiles(root: string): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }

    throw error;
  }

  const results = await Promise.all(
    entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (entry): Promise<string[]> => {
        const target = path.join(root, entry.name);

        if (entry.isSymbolicLink()) {
          return [];
        }

        if (entry.isDirectory()) {
          return findMarkdownFiles(target);
        }

        if (entry.isFile() && isMarkdownFile(entry.name)) {
          return [target];
        }

        return [];
      }),
  );

  return results.flat();
}

function isMarkdownFile(filename: string): boolean {
  return filename.toLowerCase().endsWith(MARKDOWN_EXTENSION);
}

async function loadConfigCommands(spec: SourceSpec): Promise<CustomCommand[]> {
  try {
    const stats = await lstat(spec.path);

    if (stats.isSymbolicLink()) {
      return [];
    }

    const content = await readFile(spec.path, "utf8");
    const kind = spec.path.endsWith(".jsonc") ? "jsonc" : "json";

    return parseJsonCommands(content, {
      path: spec.path,
      level: spec.level,
      kind,
    });
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }

    throw error;
  }
}

async function loadMarkdownCommands(
  spec: SourceSpec,
): Promise<CustomCommand[]> {
  const filePaths = await findMarkdownFiles(spec.path);

  return Promise.all(
    filePaths.map(async (filePath) => {
      const name = commandNameFromPath(spec.path, filePath);

      assertCommandName(name);

      const content = await readFile(filePath, "utf8");

      return parseMarkdownCommand(name, content, {
        path: filePath,
        level: spec.level,
        kind: "markdown",
      });
    }),
  );
}

function commandNameFromPath(root: string, filePath: string): string {
  return path
    .relative(root, filePath)
    .replace(/\.md$/i, "")
    .split(path.sep)
    .join("/");
}

function createDirectorySpec(root: string, level: number): SourceSpec {
  return {
    path: path.join(root, "commands"),
    level,
    type: "directory",
  };
}

function createConfigSpecs(
  root: string,
  baseName: string,
  level: number,
): SourceSpec[] {
  return [
    {
      path: path.join(root, `${baseName}.jsonc`),
      level,
      type: "config",
    },
    {
      path: path.join(root, `${baseName}.json`),
      level,
      type: "config",
    },
  ];
}

function createGlobalSpecs(
  root: string | undefined,
  baseName: string,
  level: number,
): SourceSpec[] {
  if (!root) {
    return [];
  }

  return [
    createDirectorySpec(root, level),
    {
      path: path.join(root, `${baseName}.jsonc`),
      level,
      type: "config",
    },
  ];
}

function createSourceSpecs(options: DiscoveryOptions): SourceSpec[] {
  const workspace = options.workspaceRoot;
  const kodaRoot = path.join(workspace, ".koda");
  const openCodeRoot = path.join(workspace, ".opencode");

  return [
    createDirectorySpec(kodaRoot, 1),
    ...createConfigSpecs(kodaRoot, "koda", 2),
    ...createConfigSpecs(workspace, "koda", 3),

    createDirectorySpec(openCodeRoot, 4),
    ...createConfigSpecs(openCodeRoot, "opencode", 5),
    ...createConfigSpecs(workspace, "opencode", 6),

    ...createGlobalSpecs(options.globalKodaRoot, "koda", 7),
    ...createGlobalSpecs(options.globalOpenCodeRoot, "opencode", 8),
  ];
}

function compareCommands(left: CustomCommand, right: CustomCommand): number {
  return (
    left.source.level - right.source.level ||
    left.name.localeCompare(right.name) ||
    left.source.path.localeCompare(right.source.path)
  );
}

function selectByPrecedence(
  commands: readonly CustomCommand[],
): CustomCommand[] {
  const selected = new Map<string, CustomCommand>();
  const ordered = [...commands].sort(compareCommands);

  for (const command of ordered) {
    const existing = selected.get(command.name);

    if (existing?.source.level === command.source.level) {
      throw new Error(
        `Duplicate command '/${command.name}' at precedence level ${command.source.level}.`,
      );
    }

    if (!existing) {
      selected.set(command.name, command);
    }
  }

  return [...selected.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function loadCommands(spec: SourceSpec): Promise<CustomCommand[]> {
  return spec.type === "config"
    ? loadConfigCommands(spec)
    : loadMarkdownCommands(spec);
}

export async function discoverCommands(
  options: DiscoveryOptions,
): Promise<CustomCommand[]> {
  const specs = createSourceSpecs(options);
  const commands = await Promise.all(specs.map(loadCommands));

  return selectByPrecedence(commands.flat());
}

export class CommandRegistry {
  private readonly commands: ReadonlyMap<string, CustomCommand>;
  private readonly orderedCommands: readonly CustomCommand[];

  public constructor(commands: readonly CustomCommand[]) {
    this.orderedCommands = [...commands].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    this.commands = new Map(
      this.orderedCommands.map((command) => [command.name, command]),
    );
  }

  public get(name: string): CustomCommand | undefined {
    return this.commands.get(name);
  }

  public list(): readonly CustomCommand[] {
    return this.orderedCommands;
  }

  public suggest(name: string): readonly string[] {
    return this.orderedCommands
      .map((command) => command.name)
      .filter((candidate) => isSimilarCommand(candidate, name))
      .slice(0, MAX_SUGGESTIONS);
  }
}

function isSimilarCommand(candidate: string, input: string): boolean {
  return candidate.includes(input) || input.includes(candidate);
}
