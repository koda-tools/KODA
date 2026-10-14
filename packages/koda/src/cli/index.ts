#!/usr/bin/env node
import { runQuietly } from "@koda-tools/core";
import {
  bootstrapKoda,
  loadConnection,
  type BootstrapPolicies,
  type KodaRuntime,
} from "@koda-tools/core";
import type { WritePolicy } from "@koda-tools/core";
import type { CommandPolicy } from "@koda-tools/core";
import { computeFileDiff } from "@koda-tools/core";
import { ProviderError } from "@koda-tools/core";
import { runConnect } from "./connect/flow.js";
import { formatInitResult, initWorkspace } from "./init/workspace.js";
import { createReadlineUI } from "./connect/readline-ui.js";
import type { ConnectionSettings } from "./connect/types.js";
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
  /** Where global KODA files live; defaults to ~/.config/koda. */
  readonly configRoot?: string;
  /** Used for the background model-catalog refresh; tests inject one. */
  readonly fetch?: typeof globalThis.fetch;
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

/** Approves commands through the same Accept/Reject list as writes. */
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

/**
 * Agents run with the same write/command approvals as before; `ask` on
 * other tools (read, skill, task…) uses the same Accept/Reject list.
 */
function createPolicies(
  io: InteractiveIO | undefined,
  highlighter: CodeHighlighter,
): BootstrapPolicies {
  return {
    writePolicy: createWritePolicy(io, highlighter),
    commandPolicy: createCommandPolicy(io),
    approve:
      io === undefined
        ? undefined
        : (title, fallbackPrompt) => decide(io, title, fallbackPrompt),
  };
}

async function runInteractiveSession(
  runtime: CliEnvironment,
  connection: ConnectionSettings,
  termUI: InteractiveRuntime,
  koda: KodaRuntime,
  highlighter: CodeHighlighter,
): Promise<void> {
  await runInteractive({
    agent: koda.createAgent(),
    agents: koda.agents,
    mcp: koda.mcp,
    ...koda.identity,
    workspaceRoot: runtime.cwd,
    ...koda.roots,
    connection,
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
  { agents, mcp }: KodaRuntime,
  prompt: string,
): Promise<void> {
  for (const issue of [...agents.catalog.diagnostics, ...mcp.diagnostics])
    runtime.stderr.write(`Warning: ${issue}\n`);
  await mcp.start();
  const prepared = agents.prepare(agents.defaultAgent().name, {
    runSubagent: runQuietly,
  });
  runtime.stdout.write("[Think] Analyzing request...\n");
  runtime.stdout.write(`${await prepared.agent.run(prompt)}\n`);
}

/** `koda connect [provider]`: saves an API key without starting a session. */
async function runConnectCommand(
  runtime: CliEnvironment,
  settings: ConnectionSettings,
): Promise<number> {
  if (runtime.stdin?.isTTY !== true || runtime.stdout.isTTY !== true) {
    runtime.stderr.write("koda connect needs an interactive terminal.\n");
    return USAGE_EXIT_CODE;
  }
  const { ui, close } = createReadlineUI(runtime.stdin, runtime.stdout);
  try {
    await runConnect(ui, settings, runtime.argv[1]);
    return 0;
  } finally {
    close();
  }
}

export async function runCli(runtime: CliEnvironment): Promise<number> {
  const prompt = runtime.argv.join(" ").trim();
  const interactive = isInteractive(runtime, prompt);
  if (prompt === "" && !interactive) {
    runtime.stderr.write("Usage: koda <prompt>\n");
    return USAGE_EXIT_CODE;
  }
  let koda: KodaRuntime | undefined;
  try {
    if (runtime.argv[0] === "init" && runtime.argv.length === 1) {
      runtime.stdout.write(
        `${formatInitResult(await initWorkspace(runtime.cwd))}\n`,
      );
      return 0;
    }
    const connection = await loadConnection({
      env: runtime.env,
      configRoot: runtime.configRoot,
    });
    if (runtime.argv[0] === "connect")
      return await runConnectCommand(runtime, connection);
    const highlighter = createLazyHighlighter();
    const terminal: { ui?: InteractiveRuntime } = {};
    // The terminal loads after the provider is built: a missing key fails first.
    koda = await bootstrapKoda({
      cwd: runtime.cwd,
      connection,
      env: runtime.env,
      configRoot: runtime.configRoot,
      fetch: runtime.fetch ?? globalThis.fetch,
      policies: async () => {
        if (interactive) terminal.ui = await loadTermUIRuntime();
        return createPolicies(terminal.ui?.io, highlighter);
      },
    });
    void koda.mcp.start();
    if (terminal.ui === undefined) await runBatch(runtime, koda, prompt);
    else
      await runInteractiveSession(
        runtime,
        connection,
        terminal.ui,
        koda,
        highlighter,
      );
    return 0;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unexpected failure.";
    runtime.stderr.write(`Koda failed: ${message}\n`);
    return error instanceof ProviderError ? USAGE_EXIT_CODE : FAILURE_EXIT_CODE;
  } finally {
    await koda?.close();
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
