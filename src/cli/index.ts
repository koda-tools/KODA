#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import {
  AgentRuntime,
  loadCatalog,
  runQuietly,
  type AgentCatalog,
} from "../agents/index.js";
import { CodeAgent } from "../core/index.js";
import {
  ProviderFactory,
  resolveProviderIdentity,
  type ILLMProvider,
} from "../providers/index.js";
import { ToolRegistry, type WritePolicy } from "../tools/registry.js";
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
  writeStatus,
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
    writeStatus(writer, `new file ${request.filePath}`);
    return;
  }
  if (request.skipped !== undefined) {
    writeStatus(writer, SKIP_NOTICE[request.skipped] ?? "Diff unavailable.");
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
      writeStatus(createLineWriter(io), `$ ${request.command}`);
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
  provider: ILLMProvider,
  writePolicy: WritePolicy | undefined,
  commandPolicy: CommandPolicy | undefined,
): CodeAgent {
  return new CodeAgent(
    provider,
    new ToolRegistry({
      workspaceRoot: runtime.cwd,
      ...(writePolicy === undefined ? {} : { writePolicy }),
      ...(commandPolicy === undefined ? {} : { commandPolicy }),
    }),
    { identity: resolveProviderIdentity(runtime.env) },
  );
}

const globalRoots = () => ({
  globalKodaRoot: path.join(os.homedir(), ".config", "koda"),
  globalOpenCodeRoot: path.join(os.homedir(), ".config", "opencode"),
});

/**
 * Agents run with the same write/command approvals as before; `ask` on
 * other tools (read, skill, task…) uses the same Autorizar/Rejeitar list.
 */
function createAgentRuntime(
  runtime: CliEnvironment,
  catalog: AgentCatalog,
  provider: ILLMProvider,
  io: InteractiveIO | undefined,
  writePolicy: WritePolicy | undefined,
  commandPolicy: CommandPolicy | undefined,
): AgentRuntime {
  return new AgentRuntime({
    catalog,
    workspaceRoot: runtime.cwd,
    env: runtime.env,
    identity: resolveProviderIdentity(runtime.env),
    defaultProvider: provider,
    writePolicy,
    commandPolicy,
    approve:
      io === undefined
        ? undefined
        : (title, fallbackPrompt) => decide(io, title, fallbackPrompt),
  });
}

async function runInteractiveSession(
  runtime: CliEnvironment,
  termUI: InteractiveRuntime,
  agent: CodeAgent,
  agents: AgentRuntime,
  highlighter: CodeHighlighter,
): Promise<void> {
  await runInteractive({
    agent,
    agents,
    ...resolveProviderIdentity(runtime.env),
    workspaceRoot: runtime.cwd,
    ...globalRoots(),
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

/** Batch mode: the default agent, subagents run without output. */
async function runBatch(
  runtime: CliEnvironment,
  agents: AgentRuntime,
  prompt: string,
): Promise<void> {
  for (const issue of agents.catalog.diagnostics)
    runtime.stderr.write(`Warning: ${issue}\n`);
  const prepared = agents.prepare(agents.defaultAgent().name, {
    runSubagent: runQuietly,
  });
  runtime.stdout.write("[Think] Analyzing request...\n");
  runtime.stdout.write(`${await prepared.agent.run(prompt)}\n`);
}

export async function runCli(runtime: CliEnvironment): Promise<number> {
  const prompt = runtime.argv.join(" ").trim();
  const interactive = isInteractive(runtime, prompt);
  if (prompt === "" && !interactive) {
    runtime.stderr.write("Usage: koda <prompt>\n");
    return USAGE_EXIT_CODE;
  }
  try {
    // The provider first: a missing key fails before anything is loaded.
    const provider = ProviderFactory.fromEnvironment(runtime.env);
    const termUI = interactive ? await loadTermUIRuntime() : undefined;
    const highlighter = createLazyHighlighter();
    const writePolicy = createWritePolicy(termUI?.io, highlighter);
    const commandPolicy = createCommandPolicy(termUI?.io);
    const catalog = await loadCatalog({
      workspaceRoot: runtime.cwd,
      ...globalRoots(),
    });
    const agents = createAgentRuntime(
      runtime,
      catalog,
      provider,
      termUI?.io,
      writePolicy,
      commandPolicy,
    );
    if (termUI === undefined) await runBatch(runtime, agents, prompt);
    else
      await runInteractiveSession(
        runtime,
        termUI,
        createAgent(runtime, provider, writePolicy, commandPolicy),
        agents,
        highlighter,
      );
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
