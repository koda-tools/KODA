import type { CodeAgent } from "../../core/agent.js";
import {
  discoverCommands,
  CommandRegistry,
  type DiscoveryOptions,
} from "../commands/discovery.js";
import { routeInput, type RouteResult } from "../commands/router.js";
import type { ShellPolicy } from "../commands/types.js";
import type { CodeHighlighter } from "./highlight.js";
import type { InteractiveIO } from "./io.js";
import { runModelCommand } from "./model-command.js";
import { createLineWriter, type LineWriter } from "./output.js";
import { Session } from "./session.js";
import { createSpinner, type Spinner } from "./spinner.js";
import { runAgentTurn } from "./turn.js";

export type { InteractiveIO } from "./io.js";

export interface InteractiveRuntime {
  readonly io: InteractiveIO;
  readonly run: (task: () => Promise<void>) => Promise<void>;
}

export interface InteractiveOptions extends DiscoveryOptions {
  readonly agent: CodeAgent;
  readonly provider: string;
  readonly model: string;
  readonly io?: InteractiveIO;
  readonly runtime?: InteractiveRuntime;
  readonly shellPolicy?: ShellPolicy;
  readonly highlighter?: CodeHighlighter;
}

interface Dependencies {
  readonly options: InteractiveOptions;
  readonly io: InteractiveIO;
  readonly registry: CommandRegistry;
  readonly session: Session;
  readonly writer: LineWriter;
  readonly spinner: Spinner;
}

type Outcome = "continue" | "exit";

async function runPrompt(
  deps: Dependencies,
  route: Extract<RouteResult, { type: "prompt" }>,
): Promise<void> {
  const { options, io, session, writer, spinner } = deps;
  const signal = session.startRequest();
  const result = await runAgentTurn({
    agent: options.agent,
    prompt: route.prompt,
    model: session.modelOverride(route.model),
    signal,
    io,
    writer,
    spinner,
    highlighter: options.highlighter,
    history: session.conversation(),
  });
  session.appendTurn(result.messages);
  session.completeRequest(
    result.usage,
    route.model === undefined ? undefined : result.model,
  );
}

async function runModelPicker(
  deps: Dependencies,
  available: readonly string[],
): Promise<boolean> {
  const { io, session } = deps;
  if (io.showModelPicker === undefined) return false;
  const selected = await io.showModelPicker({
    items: available.map((name) => ({
      label: name,
      value: name,
      current: name === session.model,
    })),
  });
  if (selected === undefined) return false;
  session.selectModel(selected);
  deps.writer.write(`Model set to ${selected}.\n`);
  return true;
}

async function runModel(
  deps: Dependencies,
  route: Extract<RouteResult, { type: "model" }>,
): Promise<void> {
  const { options, session, writer } = deps;
  // https://www.termui.io/components/list — when the runtime supports it
  // and the request is a bare `/model` (no name/number given), let the
  // user pick from a real selectable list instead of numbered text.
  if (route.name === undefined) {
    const available = await options.agent.listModels().catch(() => undefined);
    if (
      available !== undefined &&
      available.length > 0 &&
      (await runModelPicker(deps, available))
    )
      return;
  }
  const result = await runModelCommand({
    name: route.name,
    current: session.model,
    provider: options.provider,
    listModels: () => options.agent.listModels(),
  });
  if (result.selected !== undefined) session.selectModel(result.selected);
  writer.write(result.text);
}

function reportFailure(deps: Dependencies, error: unknown): void {
  const { session, spinner, writer } = deps;
  const cancelled = session.finishRequest();
  spinner.stop();
  writer.ensureNewLine();
  writer.write(
    cancelled
      ? "Cancelled.\n"
      : `Error: ${error instanceof Error ? error.message : "Unexpected failure."}\n`,
  );
}

async function handleRoute(
  deps: Dependencies,
  route: RouteResult,
): Promise<Outcome> {
  switch (route.type) {
    case "exit":
      return "exit";
    case "message":
      deps.writer.write(`${route.content}\n`);
      break;
    case "clear":
      deps.session.clearConversation();
      deps.writer.write("Conversation context cleared.\n");
      break;
    case "model":
      await runModel(deps, route);
      break;
    case "prompt":
      await runPrompt(deps, route);
      break;
  }
  return "continue";
}

async function processInput(
  deps: Dependencies,
  input: string,
): Promise<Outcome> {
  try {
    const route = await routeInput(
      input,
      deps.registry,
      deps.options.workspaceRoot,
      deps.options.shellPolicy,
    );
    return await handleRoute(deps, route);
  } catch (error: unknown) {
    reportFailure(deps, error);
    return "continue";
  }
}

async function runSession(
  options: InteractiveOptions,
  io: InteractiveIO,
): Promise<void> {
  const writer = createLineWriter(io);
  const deps: Dependencies = {
    options,
    io,
    writer,
    spinner: createSpinner(writer, io),
    session: new Session(options, io, writer),
    registry: new CommandRegistry(await discoverCommands(options)),
  };
  let exitRequested = false;
  const unsubscribe = io.onCancel?.(() => {
    if (deps.session.abortRequest()) return;
    exitRequested = true;
    io.close();
  });
  deps.session.showHeader();
  try {
    while (!exitRequested) {
      const input = await io.question("❯ ");
      if (input === undefined) break;
      if (input.trim() === "") continue;
      if ((await processInput(deps, input)) === "exit") break;
    }
  } finally {
    deps.spinner.stop();
    unsubscribe?.();
    io.close();
  }
}

export async function runInteractive(
  options: InteractiveOptions,
): Promise<void> {
  if (options.runtime === undefined && options.io !== undefined) {
    await runSession(options, options.io);
    return;
  }
  const runtime =
    options.runtime ??
    new (await import("./termui.js")).TermUIRuntime();
  const io = options.io ?? runtime.io;
  await runtime.run(() => runSession(options, io));
}
