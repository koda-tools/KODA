import type { ToolExecutor, ToolObservation } from "../core/index.js";
import type { ToolDefinition } from "../providers/index.js";
import {
  readFileTool,
  type ReadFileArgs,
} from "./file-system/read-file.tool.js";
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

export interface ToolRegistryOptions {
  readonly workspaceRoot: string;
  readonly maxFileBytes?: number;
  readonly writePolicy?: WritePolicy;
}

export const READ_FILE_DEFINITION: ToolDefinition = {
  name: "readFile",
  description:
    "Read the UTF-8 contents of a non-sensitive file inside the project workspace.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      filePath: {
        type: "string",
        minLength: 1,
        description: "Relative path inside the workspace",
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
      filePath: {
        type: "string",
        minLength: 1,
        description: "Relative path inside the workspace",
      },
      content: {
        type: "string",
        description: "UTF-8 content to write",
      },
    },
    required: ["filePath", "content"],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseReadFileArgs(serialized: string): ReadFileArgs {
  const value: unknown = JSON.parse(serialized);
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    typeof value.filePath !== "string" ||
    value.filePath.trim() === ""
  ) {
    throw new Error(
      "Expected an object containing only a non-empty filePath string.",
    );
  }
  return { filePath: value.filePath };
}

function parseWriteFileArgs(serialized: string): WriteFileArgs {
  const value: unknown = JSON.parse(serialized);
  if (
    !isRecord(value) ||
    typeof value.filePath !== "string" ||
    value.filePath.trim() === "" ||
    typeof value.content !== "string"
  ) {
    throw new Error(
      "Expected an object with non-empty filePath and content strings.",
    );
  }
  return { filePath: value.filePath, content: value.content };
}

/** Progress label each tool shows while it runs. */
const STATUS_LABELS: Readonly<Record<string, string>> = {
  [READ_FILE_DEFINITION.name]: "Reading...",
  [WRITE_FILE_DEFINITION.name]: "Writing...",
};

export class ToolRegistry implements ToolExecutor {
  public readonly definitions: readonly ToolDefinition[] = [
    READ_FILE_DEFINITION,
    WRITE_FILE_DEFINITION,
  ];

  public constructor(private readonly options: ToolRegistryOptions) {}

  public statusLabel(name: string): string | undefined {
    return STATUS_LABELS[name];
  }

  public async execute(
    name: string,
    serializedArguments: string,
  ): Promise<ToolObservation> {
    try {
      if (name === READ_FILE_DEFINITION.name) {
        const args = parseReadFileArgs(serializedArguments);
        const content = await readFileTool(args, {
          workspaceRoot: this.options.workspaceRoot,
          ...(this.options.maxFileBytes === undefined
            ? {}
            : { maxBytes: this.options.maxFileBytes }),
        });
        return { ok: true, content };
      }
      if (name === WRITE_FILE_DEFINITION.name) {
        const args = parseWriteFileArgs(serializedArguments);
        if (this.options.writePolicy === undefined) {
          return {
            ok: false,
            content:
              "Tool error: Write denied; no approval policy is configured.",
          };
        }
        const toolOptions = {
          workspaceRoot: this.options.workspaceRoot,
          ...(this.options.maxFileBytes === undefined
            ? {}
            : { maxBytes: this.options.maxFileBytes }),
        };
        const previous = await readPreviousContent(toolOptions, args.filePath);
        const approved = await this.options.writePolicy.confirm({
          filePath: args.filePath,
          before: previous.before,
          after: args.content,
          ...(previous.skipped === undefined
            ? {}
            : { skipped: previous.skipped }),
        });
        if (!approved) {
          return { ok: false, content: "Tool error: Write denied by user." };
        }
        const result = await writeFileTool(args, {
          ...toolOptions,
          previousContent: previous.before,
        });
        return { ok: true, content: result };
      }
      return { ok: false, content: `Tool error: Unknown tool '${name}'.` };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown tool failure.";
      return { ok: false, content: `Tool error: ${message}` };
    }
  }
}
