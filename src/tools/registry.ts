import type { ToolExecutor, ToolObservation } from "../core/index.js";
import type { ToolDefinition } from "../providers/index.js";
import { runCommandTool } from "./command/run-command.tool.js";
import type { CommandPolicy, RunCommandArgs } from "./command/types.js";
import {
  getFileInfoTool,
  type GetFileInfoArgs,
} from "./file-system/get-file-info.tool.js";
import {
  listDirectoryTool,
  type ListDirectoryArgs,
} from "./file-system/list-directory.tool.js";
import {
  readFileTool,
  type ReadFileArgs,
} from "./file-system/read-file.tool.js";
import {
  searchFilesTool,
  type SearchFilesArgs,
} from "./file-system/search-files.tool.js";
import {
  readPreviousContent,
  writeFileTool,
  type SkippedReason,
  type WriteFileArgs,
} from "./file-system/write-file.tool.js";

export interface WriteConfirmation {
  readonly filePath: string;
  readonly before: string | undefined;
  readonly after: string;
  readonly skipped?: SkippedReason;
}

export interface WritePolicy {
  readonly confirm: (request: WriteConfirmation) => Promise<boolean>;
}

export interface ListDirectoryLimits {
  readonly maxDepth?: number;
  readonly maxEntries?: number;
}

export interface SearchFilesLimits {
  readonly maxFiles?: number;
  readonly maxMatches?: number;
  readonly perFileMatches?: number;
}

export interface ToolRegistryOptions {
  readonly workspaceRoot: string;
  readonly maxFileBytes?: number;
  readonly writePolicy?: WritePolicy;
  readonly commandPolicy?: CommandPolicy;
  readonly listDirectory?: ListDirectoryLimits;
  readonly searchFiles?: SearchFilesLimits;
}

const RELATIVE_PATH = {
  type: "string",
  minLength: 1,
  description: "Relative path inside the workspace",
} as const;

export const READ_FILE_DEFINITION: ToolDefinition = {
  name: "readFile",
  description:
    "Read the UTF-8 contents of a non-sensitive file inside the project workspace. Use startLine and endLine to read only part of a large file.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      filePath: RELATIVE_PATH,
      startLine: {
        type: "integer",
        minimum: 1,
        description: "First line to read (1-indexed, inclusive)",
      },
      endLine: {
        type: "integer",
        minimum: 1,
        description: "Last line to read (1-indexed, inclusive)",
      },
    },
    required: ["filePath"],
  },
};

export const WRITE_FILE_DEFINITION: ToolDefinition = {
  name: "writeFile",
  description:
    "Write UTF-8 content to a file inside the project workspace. Requires explicit approval.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      filePath: RELATIVE_PATH,
      content: { type: "string", description: "UTF-8 content to write" },
    },
    required: ["filePath", "content"],
  },
};

export const LIST_DIRECTORY_DEFINITION: ToolDefinition = {
  name: "listDirectory",
  description:
    "List the entries of a directory inside the project workspace. Honors .gitignore and skips build and sensitive directories.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      path: {
        type: "string",
        description: "Relative directory path; defaults to the workspace root",
      },
      depth: {
        type: "integer",
        minimum: 1,
        description: "How many levels to descend (default 2)",
      },
      limit: {
        type: "integer",
        minimum: 1,
        description: "Maximum number of entries to return (default 200)",
      },
      includeHidden: {
        type: "boolean",
        description: "Include dot-files and dot-directories (default false)",
      },
    },
    required: [],
  },
};

export const SEARCH_FILES_DEFINITION: ToolDefinition = {
  name: "searchFiles",
  description:
    "Search the project workspace for literal text or a regular expression. Returns path, line and column for each match.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string", minLength: 1, description: "Text or pattern" },
      path: {
        type: "string",
        description: "Relative directory to search; defaults to the workspace root",
      },
      regex: {
        type: "boolean",
        description: "Treat query as a regular expression (default false)",
      },
      caseSensitive: {
        type: "boolean",
        description: "Match case exactly (default false)",
      },
      include: {
        type: "string",
        description: "Glob of files to include, e.g. **/*.ts",
      },
      exclude: { type: "string", description: "Glob of files to skip" },
      maxFiles: { type: "integer", minimum: 1 },
      maxMatches: { type: "integer", minimum: 1 },
      perFileMatches: { type: "integer", minimum: 1 },
    },
    required: ["query"],
  },
};

export const GET_FILE_INFO_DEFINITION: ToolDefinition = {
  name: "getFileInfo",
  description:
    "Inspect metadata of a workspace entry: kind, size, modified time and whether a file is text or binary.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: { path: RELATIVE_PATH },
    required: ["path"],
  },
};

export const RUN_COMMAND_DEFINITION: ToolDefinition = {
  name: "runCommand",
  description:
    "Run a shell command in the project workspace to build, test, lint or inspect. Dangerous commands are refused and others require user approval.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      command: { type: "string", minLength: 1, description: "Command line" },
      cwd: {
        type: "string",
        description: "Relative directory to run in; defaults to the workspace root",
      },
      timeoutMs: {
        type: "integer",
        minimum: 1,
        description: "Timeout in milliseconds (default 120000)",
      },
    },
    required: ["command"],
  },
};

/** Progress label each tool shows while it runs. */
const STATUS_LABELS: Readonly<Record<string, string>> = {
  [READ_FILE_DEFINITION.name]: "Reading...",
  [WRITE_FILE_DEFINITION.name]: "Writing...",
  [LIST_DIRECTORY_DEFINITION.name]: "Listing...",
  [SEARCH_FILES_DEFINITION.name]: "Searching...",
  [GET_FILE_INFO_DEFINITION.name]: "Inspecting...",
  [RUN_COMMAND_DEFINITION.name]: "Running...",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asObject(serialized: string): Record<string, unknown> {
  const value: unknown = JSON.parse(serialized);
  if (!isRecord(value)) throw new Error("Expected a JSON object of arguments.");
  return value;
}

/**
 * The argument readers below are generic over the key so the result keeps
 * the literal property name, letting the parsers be spread into the tool
 * argument types without casts.
 */
function field<K extends string, V>(key: K, value: V): Record<K, V> {
  return { [key]: value } as Record<K, V>;
}

function requireText<K extends string>(
  value: Record<string, unknown>,
  key: K,
): Record<K, string> {
  const text = value[key];
  if (typeof text !== "string" || text.trim() === "")
    throw new Error(`Expected a non-empty ${key} string.`);
  return field(key, text);
}

/** `{}` when absent, `{ key: value }` when a valid positive integer. */
function optionalCount<K extends string>(
  value: Record<string, unknown>,
  key: K,
): Partial<Record<K, number>> {
  const count = value[key];
  if (count === undefined) return {};
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1)
    throw new Error(`Expected ${key} to be a positive integer.`);
  return field(key, count);
}

function optionalFlag<K extends string>(
  value: Record<string, unknown>,
  key: K,
): Partial<Record<K, boolean>> {
  const flag = value[key];
  if (flag === undefined) return {};
  if (typeof flag !== "boolean")
    throw new Error(`Expected ${key} to be a boolean.`);
  return field(key, flag);
}

function optionalText<K extends string>(
  value: Record<string, unknown>,
  key: K,
): Partial<Record<K, string>> {
  const text = value[key];
  if (text === undefined) return {};
  if (typeof text !== "string" || text.trim() === "")
    throw new Error(`Expected ${key} to be a non-empty string.`);
  return field(key, text);
}

function parseReadFileArgs(serialized: string): ReadFileArgs {
  const value = asObject(serialized);
  return {
    ...requireText(value, "filePath"),
    ...optionalCount(value, "startLine"),
    ...optionalCount(value, "endLine"),
  };
}

function parseWriteFileArgs(serialized: string): WriteFileArgs {
  const value = asObject(serialized);
  if (typeof value.content !== "string")
    throw new Error("Expected a content string.");
  return { ...requireText(value, "filePath"), content: value.content };
}

function parseListDirectoryArgs(serialized: string): ListDirectoryArgs {
  const value = asObject(serialized);
  return {
    ...optionalText(value, "path"),
    ...optionalCount(value, "depth"),
    ...optionalCount(value, "limit"),
    ...optionalFlag(value, "includeHidden"),
  };
}

function parseSearchFilesArgs(serialized: string): SearchFilesArgs {
  const value = asObject(serialized);
  return {
    ...requireText(value, "query"),
    ...optionalText(value, "path"),
    ...optionalText(value, "include"),
    ...optionalText(value, "exclude"),
    ...optionalFlag(value, "regex"),
    ...optionalFlag(value, "caseSensitive"),
    ...optionalCount(value, "maxFiles"),
    ...optionalCount(value, "maxMatches"),
    ...optionalCount(value, "perFileMatches"),
  };
}

function parseGetFileInfoArgs(serialized: string): GetFileInfoArgs {
  return requireText(asObject(serialized), "path");
}

function parseRunCommandArgs(serialized: string): RunCommandArgs {
  const value = asObject(serialized);
  return {
    ...requireText(value, "command"),
    ...optionalText(value, "cwd"),
    ...optionalCount(value, "timeoutMs"),
  };
}

function failure(message: string): ToolObservation {
  return { ok: false, content: `Tool error: ${message}` };
}

export class ToolRegistry implements ToolExecutor {
  public readonly definitions: readonly ToolDefinition[] = [
    READ_FILE_DEFINITION,
    WRITE_FILE_DEFINITION,
    LIST_DIRECTORY_DEFINITION,
    SEARCH_FILES_DEFINITION,
    GET_FILE_INFO_DEFINITION,
    RUN_COMMAND_DEFINITION,
  ];

  public constructor(private readonly options: ToolRegistryOptions) {}

  public statusLabel(name: string): string | undefined {
    return STATUS_LABELS[name];
  }

  public async execute(
    name: string,
    serializedArguments: string,
    signal?: AbortSignal,
  ): Promise<ToolObservation> {
    try {
      switch (name) {
        case READ_FILE_DEFINITION.name:
          return {
            ok: true,
            content: await readFileTool(
              parseReadFileArgs(serializedArguments),
              this.byteOptions(),
            ),
          };
        case WRITE_FILE_DEFINITION.name:
          return await this.write(parseWriteFileArgs(serializedArguments));
        case LIST_DIRECTORY_DEFINITION.name:
          return {
            ok: true,
            content: await listDirectoryTool(
              parseListDirectoryArgs(serializedArguments),
              {
                workspaceRoot: this.options.workspaceRoot,
                ...this.options.listDirectory,
                ...(signal === undefined ? {} : { signal }),
              },
            ),
          };
        case SEARCH_FILES_DEFINITION.name:
          return {
            ok: true,
            content: await searchFilesTool(
              parseSearchFilesArgs(serializedArguments),
              {
                workspaceRoot: this.options.workspaceRoot,
                ...(this.options.maxFileBytes === undefined
                  ? {}
                  : { maxFileBytes: this.options.maxFileBytes }),
                ...this.options.searchFiles,
                ...(signal === undefined ? {} : { signal }),
              },
            ),
          };
        case GET_FILE_INFO_DEFINITION.name:
          return {
            ok: true,
            content: await getFileInfoTool(
              parseGetFileInfoArgs(serializedArguments),
              { workspaceRoot: this.options.workspaceRoot },
            ),
          };
        case RUN_COMMAND_DEFINITION.name:
          return await this.runCommand(
            parseRunCommandArgs(serializedArguments),
            signal,
          );
        default:
          return failure(`Unknown tool '${name}'.`);
      }
    } catch (error: unknown) {
      return failure(
        error instanceof Error ? error.message : "Unknown tool failure.",
      );
    }
  }

  /** Shared `maxBytes` shape for the single-file tools. */
  private byteOptions(): { workspaceRoot: string; maxBytes?: number } {
    return {
      workspaceRoot: this.options.workspaceRoot,
      ...(this.options.maxFileBytes === undefined
        ? {}
        : { maxBytes: this.options.maxFileBytes }),
    };
  }

  /** runCommand needs an approval policy, like writes do. */
  private async runCommand(
    args: RunCommandArgs,
    signal: AbortSignal | undefined,
  ): Promise<ToolObservation> {
    const policy = this.options.commandPolicy;
    if (policy === undefined)
      return failure("Command denied; no approval policy is configured.");
    return runCommandTool(args, {
      workspaceRoot: this.options.workspaceRoot,
      policy,
      ...(signal === undefined ? {} : { signal }),
    });
  }

  /** Writes go through the approval policy and report the diff summary. */
  private async write(args: WriteFileArgs): Promise<ToolObservation> {
    const policy = this.options.writePolicy;
    if (policy === undefined)
      return failure("Write denied; no approval policy is configured.");
    const toolOptions = this.byteOptions();
    const previous = await readPreviousContent(toolOptions, args.filePath);
    const approved = await policy.confirm({
      filePath: args.filePath,
      before: previous.before,
      after: args.content,
      ...(previous.skipped === undefined ? {} : { skipped: previous.skipped }),
    });
    if (!approved) return failure("Write denied by user.");
    return {
      ok: true,
      content: await writeFileTool(args, {
        ...toolOptions,
        previousContent: previous.before,
      }),
    };
  }
}
