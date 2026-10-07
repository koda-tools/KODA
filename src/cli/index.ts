#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { CodeAgent } from "../core/index.js";
import {
  ProviderFactory,
  resolveProviderIdentity,
} from "../providers/index.js";
import {
  ToolRegistry,
  type WritePolicy,
} from "../tools/registry.js";
import type { CommandPolicy } from "../tools/command/types.js";
import { computeFileDiff } from "../utils/diff.js";
import { ProviderError } from "../utils/errors.js";
import {
  createLazyHighlighter,
  createLineWriter,
  decide,
  loadTermUIRuntime,
  renderDiff,
  runInteractive,
  toDiffViewLines,
  type CodeHighlighter,
  type InteractiveIO,
  type InteractiveRuntime,
} from "./tui/index.js";

export interface CliEnvironment {
  readonly argv: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: string;
  readonly stdin?: NodeJS.ReadableStream & { readonly isTTY?: boolean };
  readonly stdout: Pick<NodeJS.WriteStream, "write"> & {
    readonly isTTY?: boolean;
  };
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

const USAGE_EXIT_CODE = 2;
const FAILURE_EXIT_CODE = 1;

function isInteractive(runtime: CliEnvironment, prompt: string): boolean {
  return (
    prompt === "" &&
    runtime.stdin?.isTTY === true &&
    runtime.stdout.isTTY === true
  );
}

const SKIP_NOTICE: Readonly<Record<string, string>> = {
  binary: "Diff unavailable (binary file).",
  "too-large": "Diff unavailable (file too large).",
  unreadable: "Diff unavailable (file unreadable).",
};

async function previewWrite(
  io: InteractiveIO,
  highlighter: CodeHighlighter,
  request: {
    filePath: string;
    before: string | undefined;
    after: string;
    skipped?: string;
  },
): Promise<void> {
  const writer = createLineWriter(io);
  writer.ensureNewLine();
  if (request.before === undefined) {
    writer.write(`new file ${request.filePath}\n`);
    return;
  }
  if (request.skipped !== undefined) {
    writer.write(`${SKIP_NOTICE[request.skipped] ?? "Diff unavailable."}\n`);
    return;
  }
  const diff = computeFileDiff({
    filePath: request.filePath,
    before: request.before,
    after: request.after,
  });
  const shownByWidget =
    io.showDiff?.({
      title: `${diff.filePath}  +${diff.added} -${diff.removed}`,
      lines: toDiffViewLines(diff),
    }) ?? false;
  if (shownByWidget) return;
  await renderDiff(writer, diff, { highlighter, animate: false });
}

function createWritePolicy(
  io: InteractiveIO | undefined,
  highlighter: CodeHighlighter,
): WritePolicy | undefined {
  if (io === undefined) return undefined;
  return {
    confirm: async (request) => {
      await previewWrite(io, highlighter, request);
      return decide(
        io,
        `Write  ${request.filePath}`,
        `Write file '${request.filePath}'? [y/N] `,
      );
    },
  };
}

/** Approves commands through the same Autorizar/Rejeitar list as writes. */
function createCommandPolicy(
  io: InteractiveIO | undefined,
): CommandPolicy | undefined {
  if (io === undefined) return undefined;
  return {
    confirm: async (request) => {
      // Echo before asking, so a hung process still shows what ran.
      io.write(`$ ${request.command}\n`);
      return decide(
        io,
        `Run  ${request.command}`,
        `Run command '${request.command}'? [y/N] `,
      );
    },
  };
}

function createAgent(
  runtime: CliEnvironment,
  writePolicy: WritePolicy | undefined,
  commandPolicy: CommandPolicy | undefined,
): CodeAgent {
  return new CodeAgent(
    ProviderFactory.fromEnvironment(runtime.env),
    new ToolRegistry({
      workspaceRoot: runtime.cwd,
      ...(writePolicy === undefined ? {} : { writePolicy }),
      ...(commandPolicy === undefined ? {} : { commandPolicy }),
    }),
    { identity: resolveProviderIdentity(runtime.env) },
  );
}

async function runInteractiveSession(
  runtime: CliEnvironment,
  termUI: InteractiveRuntime,
  agent: CodeAgent,
  highlighter: CodeHighlighter,
): Promise<void> {
  await runInteractive({
    agent,
    ...resolveProviderIdentity(runtime.env),
    workspaceRoot: runtime.cwd,
    globalKodaRoot: path.join(os.homedir(), ".config", "koda"),
    globalOpenCodeRoot: path.join(os.homedir(), ".config", "opencode"),
    io: termUI.io,
    runtime: termUI,
    highlighter,
    shellPolicy: {
      approve: (command, source) => {
        termUI.io.write(`${command}\n`);
        return decide(
          termUI.io,
          `Run shell  ${source.path}`,
          `Run shell command from ${source.path}?\n${command}\n[y/N] `,
        );
      },
    },
  });
}

async function runBatch(
  runtime: CliEnvironment,
  agent: CodeAgent,
  prompt: string,
): Promise<void> {
  runtime.stdout.write("[Think] Analyzing request...\n");
  runtime.stdout.write(`${await agent.run(prompt)}\n`);
}

export async function runCli(runtime: CliEnvironment): Promise<number> {
  const prompt = runtime.argv.join(" ").trim();
  const interactive = isInteractive(runtime, prompt);
  if (prompt === "" && !interactive) {
    runtime.stderr.write("Usage: koda <prompt>\n");
    return USAGE_EXIT_CODE;
  }
  try {
    const termUI = interactive ? await loadTermUIRuntime() : undefined;
    const highlighter = createLazyHighlighter();
    const agent = createAgent(
      runtime,
      createWritePolicy(termUI?.io, highlighter),
      createCommandPolicy(termUI?.io),
    );
    if (termUI === undefined) await runBatch(runtime, agent, prompt);
    else await runInteractiveSession(runtime, termUI, agent, highlighter);
    return 0;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unexpected failure.";
    runtime.stderr.write(`Koda failed: ${message}\n`);
    return error instanceof ProviderError ? USAGE_EXIT_CODE : FAILURE_EXIT_CODE;
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url ===
    new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href;
if (isEntryPoint)
  runCli({
    argv: process.argv.slice(2),
    env: process.env,
    cwd: process.cwd(),
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  })
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = FAILURE_EXIT_CODE;
    });
