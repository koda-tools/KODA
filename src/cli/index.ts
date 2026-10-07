#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { CodeAgent } from "../core/agent.js";
import { resolveProviderIdentity } from "../providers/defaults.js";
import { ProviderFactory } from "../providers/factory.js";
import {
  ToolRegistry,
  type WritePolicy,
} from "../tools/registry.js";
import { computeFileDiff } from "../utils/diff.js";
import { ProviderError } from "../utils/errors.js";
import type {
  InteractiveIO,
  InteractiveRuntime,
} from "./tui/application.js";
import { runInteractive } from "./tui/application.js";
import {
  createLazyHighlighter,
  type CodeHighlighter,
} from "./tui/highlight.js";
import { toDiffViewLines } from "./tui/diff-view.js";
import { createLineWriter, renderDiff } from "./tui/output.js";

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

const WAITING_STATUS = "Waiting for decision...";
const SELECT_HINT = "↑/↓ escolher · Enter confirmar · Esc rejeitar";
// Index 0 approves; `decide` relies on that order.
const DECISION_OPTIONS = ["Autorizar", "Rejeitar"] as const;

async function confirm(io: InteractiveIO, question: string): Promise<boolean> {
  const answer = await io.question(question);
  return answer?.trim().toLowerCase() === "y";
}

async function decide(
  io: InteractiveIO,
  title: string,
  fallbackPrompt: string,
): Promise<boolean> {
  io.setStatus?.(WAITING_STATUS);
  try {
    if (io.select === undefined) return await confirm(io, fallbackPrompt);
    const choice = await io.select({
      title,
      options: [...DECISION_OPTIONS],
      hint: SELECT_HINT,
    });
    return choice === 0;
  } finally {
    io.setStatus?.(undefined);
  }
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

function createAgent(
  runtime: CliEnvironment,
  writePolicy: WritePolicy | undefined,
): CodeAgent {
  return new CodeAgent(
    ProviderFactory.fromEnvironment(runtime.env),
    new ToolRegistry({
      workspaceRoot: runtime.cwd,
      ...(writePolicy === undefined ? {} : { writePolicy }),
    }),
    resolveProviderIdentity(runtime.env),
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
    const termUI = interactive
      ? new (await import("./tui/termui.js")).TermUIRuntime()
      : undefined;
    const highlighter = createLazyHighlighter();
    const agent = createAgent(
      runtime,
      createWritePolicy(termUI?.io, highlighter),
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
