import {
  CommandRegistry,
  discoverCommands,
} from "../../commands/discovery.js";
import { routeInput, type RouteResult } from "../../commands/router.js";
import { runModelCommand } from "../commands/model-command.js";
import { commandSuggestions } from "../commands/suggestions.js";
import { createLineWriter } from "../output/line-writer.js";
import { Session } from "../session/session.js";
import type { InteractiveIO, LineWriter } from "../shared/types.js";
import { createSpinner } from "../turn/spinner.js";
import { runAgentTurn } from "../turn/turn.js";
import type { Spinner } from "../turn/types.js";
import type { InteractiveOptions } from "./types.js";

interface Dependencies {
  readonly options: InteractiveOptions;
  readonly io: InteractiveIO;
  readonly registry: CommandRegistry;
  readonly session: Session;
  readonly writer: LineWriter;
  readonly spinner: Spinner;
}

type Outcome = "continue" | "exit";
type Route<T extends RouteResult["type"]> = Extract<RouteResult, { type: T }>;

async function runPrompt(deps: Dependencies, route: Route<"prompt">): Promise<void> {
  const { options, io, session, writer, spinner } = deps;
  const result = await runAgentTurn({
    agent: options.agent,
    prompt: route.prompt,
    model: session.modelOverride(route.model),
    signal: session.startRequest(),
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

/** `/model` with no argument: pick from the List widget when available. */
async function pickModelFromList(deps: Dependencies): Promise<boolean> {
  const { io, session, options } = deps;
  if (io.showModelPicker === undefined) return false;
  const available = await options.agent.listModels().catch(() => undefined);
  if (available === undefined || available.length === 0) return false;
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

async function runModel(deps: Dependencies, route: Route<"model">): Promise<void> {
  if (route.name === undefined && (await pickModelFromList(deps))) return;
  const { options, session, writer } = deps;
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
  const cancelled = deps.session.finishRequest();
  deps.spinner.stop();
  deps.writer.ensureNewLine();
  const message =
    error instanceof Error ? error.message : "Unexpected failure.";
  deps.writer.write(cancelled ? "Cancelled.\n" : `Error: ${message}\n`);
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
    spinner: createSpinner(io),
    session: new Session(options, io, writer),
    registry: new CommandRegistry(await discoverCommands(options)),
  };
  io.setCommandSuggestions?.(commandSuggestions(deps.registry));
  let exitRequested = false;
  // First cancel aborts the running request; a second one (idle) exits.
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

/**
 * Run the interactive loop. With an explicit `io` and no `runtime`, it runs
 * on that IO directly (tests, SDK); otherwise inside the TermUI runtime,
 * which is imported lazily so batch mode never loads TermUI.
 */
export async function runInteractive(
  options: InteractiveOptions,
): Promise<void> {
  if (options.runtime === undefined && options.io !== undefined) {
    await runSession(options, options.io);
    return;
  }
  const runtime =
    options.runtime ??
    new (await import("../runtime/termui-runtime.js")).TermUIRuntime();
  const io = options.io ?? runtime.io;
  await runtime.run(() => runSession(options, io));
}
