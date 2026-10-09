import { CommandRegistry, discoverCommands } from "../../commands/discovery.js";
import { routeInput, type RouteResult } from "../../commands/router.js";
import { runConnectCommand } from "../commands/connect-command.js";
import { decide } from "../commands/decision.js";
import { runModelCommand } from "../commands/model-command.js";
import { commandSuggestions } from "../commands/suggestions.js";
import { Session } from "../session/session.js";
import { SessionController } from "../session/session-controller.js";
import type {
  InteractiveIO,
  LineWriter,
  SessionIntent,
} from "../shared/types.js";
import { createSpinner } from "../turn/spinner.js";
import { runAgentTurn } from "../turn/turn.js";
import {
  cycleAgent,
  formatAgents,
  formatSkills,
  reportCatalogIssues,
  runAgentCommand,
  runAgentPrompt,
} from "./agents.js";
import type { Dependencies, InteractiveOptions } from "./types.js";

const NO_AGENTS = "Agents are not available in this session.";

/** The session currently receiving input. */
function active(deps: Dependencies): Session {
  return deps.sessions.active();
}

const CLEAR_TITLE = "Clear the conversation context?";

type Outcome = "continue" | "exit";
type Route<T extends RouteResult["type"]> = Extract<RouteResult, { type: T }>;

async function runPrompt(
  deps: Dependencies,
  route: Route<"prompt">,
): Promise<void> {
  const agents = deps.options.agents;
  if (agents !== undefined) return runAgentPrompt(deps, agents, route);
  const { options, spinner } = deps;
  const entry = deps.sessions.activeEntry();
  const { io, writer } = deps.sessions.bindingFor(entry);
  const session = entry.session;
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
  deps.sessions.pushSummaries();
}

/** `/model` with no argument: pick from the List widget when available. */
async function pickModelFromList(deps: Dependencies): Promise<boolean> {
  const { io, options } = deps;
  const session = active(deps);
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
  deps.sessions.pushSummaries();
  deps.writer.write(`Model set to ${selected}.\n`);
  return true;
}

async function runModel(
  deps: Dependencies,
  route: Route<"model">,
): Promise<void> {
  if (route.name === undefined && (await pickModelFromList(deps))) return;
  const { options, writer } = deps;
  const session = active(deps);
  const result = await runModelCommand({
    name: route.name,
    current: session.model,
    provider: options.provider,
    listModels: () => options.agent.listModels(),
  });
  if (result.selected !== undefined) {
    session.selectModel(result.selected);
    deps.sessions.pushSummaries();
  }
  writer.write(result.text);
}

/**
 * `/clear` throws away the conversation, so it asks first. On approval it
 * also wipes the visible output: clearing only the history looks like
 * nothing happened, since the old turns stay on screen.
 */
async function runClear(deps: Dependencies): Promise<void> {
  const { io, writer } = deps;
  const approved = await decide(
    io,
    CLEAR_TITLE,
    "Clear the conversation context? [y/N] ",
  );
  if (!approved) {
    writer.write("Conversation context kept.\n");
    return;
  }
  io.clearTranscript?.();
  active(deps).clearConversation();
  deps.sessions.pushSummaries();
  writer.write("Conversation context cleared.\n");
}

function reportFailure(deps: Dependencies, error: unknown): void {
  const cancelled = active(deps).finishRequest();
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
      await runClear(deps);
      break;
    case "model":
      await runModel(deps, route);
      break;
    case "connect":
      await runConnectCommand(
        deps.io,
        (text) => deps.writer.write(text),
        deps.options.connection,
        route.name,
      );
      break;
    case "prompt":
      await runPrompt(deps, route);
      break;
    case "agents":
    case "skills":
    case "agent":
      await runAgentRoute(deps, route);
      break;
  }
  return "continue";
}

/** `/agents`, `/skills` and `/agent [name]`. */
async function runAgentRoute(
  deps: Dependencies,
  route: Route<"agents" | "skills" | "agent">,
): Promise<void> {
  const agents = deps.options.agents;
  if (agents === undefined) {
    deps.writer.write(`${NO_AGENTS}\n`);
    return;
  }
  if (route.type === "agent") {
    await runAgentCommand(deps, agents, route.name);
    return;
  }
  const text =
    route.type === "agents"
      ? formatAgents(agents, active(deps).agent)
      : formatSkills(agents);
  deps.writer.write(`${text}\n`);
}

/** Keybind intents: sessions (Ctrl+N, Alt+S) and agents (Tab/Shift+Tab). */
function handleIntent(deps: Dependencies, intent: SessionIntent): void {
  const agents = deps.options.agents;
  switch (intent) {
    case "new":
      deps.sessions.newSession();
      return;
    case "picker":
      void handleSessionPicker(deps);
      return;
    case "agent-next":
    case "agent-prev":
      if (agents !== undefined)
        cycleAgent(deps, agents, intent === "agent-next" ? 1 : -1);
      return;
  }
}

/** Writes to whichever session is active (messages, errors). */
function activeWriter(sessions: SessionController): LineWriter {
  const current = (): LineWriter =>
    sessions.bindingFor(sessions.activeEntry()).writer;
  return {
    ensureNewLine: () => current().ensureNewLine(),
    write: (text) => current().write(text),
    writeSegment: (segment) => current().writeSegment(segment),
  };
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

/** Open the switcher modal and act on the result (switch or create). */
async function handleSessionPicker(deps: Dependencies): Promise<void> {
  if (deps.io.showSessionPicker === undefined) {
    deps.sessions.newSession();
    return;
  }
  const result = await deps.io.showSessionPicker({
    items: deps.sessions.pickerItems(),
  });
  if (result === undefined) return;
  if (result.kind === "new") deps.sessions.newSession();
  else deps.sessions.switchTo(result.index);
}

async function runSession(
  options: InteractiveOptions,
  io: InteractiveIO,
): Promise<void> {
  const agents = options.agents;
  const sessions = new SessionController(io, (_id, sessionIO, writer) => {
    const session = new Session(options, sessionIO, writer);
    if (agents !== undefined) session.selectAgent(agents.defaultAgent().name);
    return session;
  });
  const deps: Dependencies = {
    options,
    io,
    writer: activeWriter(sessions),
    sessions,
    spinner: createSpinner(io),
    registry: new CommandRegistry(await discoverCommands(options)),
  };
  io.setCommandSuggestions?.(commandSuggestions(deps.registry));
  if (agents !== undefined) reportCatalogIssues(deps, agents);
  let exitRequested = false;
  // First cancel aborts the active request; a second one (idle) exits.
  const unsubscribe = io.onCancel?.(() => {
    if (sessions.abortRunning()) return;
    exitRequested = true;
    io.close();
  });
  // Navigation raised from the UI (Ctrl+N, Alt+S, Tab / Shift+Tab).
  const unsubIntent = io.onSessionIntent?.((intent) =>
    handleIntent(deps, intent),
  );
  active(deps).showHeader();
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
    unsubIntent?.();
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
