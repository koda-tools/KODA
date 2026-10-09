import type {
  AgentDefinition,
  AgentRuntime,
  SubagentRunner,
} from "../../../agents/index.js";
import type { RouteResult } from "../../commands/router.js";
import { userMessage } from "../blocks/text-block.js";
import { MarkdownStream } from "../markdown/markdown-stream.js";
import { writeStatus } from "../output/line-writer.js";
import type { ManagedSession } from "../session/types.js";
import type { InteractiveIO, LineWriter } from "../shared/types.js";
import { runAgentTurn } from "../turn/turn.js";
import type { Dependencies } from "./types.js";

type PromptRoute = Extract<RouteResult, { type: "prompt" }>;

const BUILT_IN = "built-in";
const DEFAULT_SUBAGENT = "general";
const AGENT_PICKER_TITLE = "Switch agent";
const AGENT_PICKER_HINT = "↑/↓ choose · Enter confirm · Esc cancel";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected failure.";
}

/** The delegated task, shown at the top of the child session. */
function writeTask(writer: LineWriter, task: string): void {
  for (const line of userMessage(task))
    writer.writeSegment({ kind: "line", ...line });
  writer.write("\n");
}

/** Render a complete Markdown reply as blocks (no streaming). */
async function writeMarkdown(
  deps: Dependencies,
  io: InteractiveIO,
  writer: LineWriter,
  text: string,
): Promise<void> {
  const markdown = new MarkdownStream(deps.options.highlighter, io.onCodeBlock);
  const segments = [
    ...(await markdown.push(text)),
    ...(await markdown.flush()),
  ];
  for (const segment of segments) writer.writeSegment(segment);
}

/**
 * Runs a subagent in a new child session of `parent` (not activated, so its
 * output fills its own buffer) and adds what it spent to the parent.
 */
function childRunner(
  deps: Dependencies,
  parent: ManagedSession,
): SubagentRunner {
  return async (prepared, task, signal) => {
    const name = prepared.definition.name;
    const child = deps.sessions.createChild(`↳ ${name}`, parent);
    child.session.selectAgent(name);
    const { io, writer } = deps.sessions.bindingFor(child);
    writeTask(writer, task);
    deps.sessions.pushSummaries();
    try {
      const result = await runAgentTurn({
        agent: prepared.agent,
        prompt: task,
        model: undefined,
        signal,
        io,
        writer,
        spinner: deps.spinner,
        highlighter: deps.options.highlighter,
      });
      child.session.appendTurn(result.messages);
      child.session.completeRequest(result.usage);
      parent.session.addUsage(result.usage);
      return result;
    } catch (error) {
      writer.ensureNewLine();
      writer.write(
        signal.aborted ? "Cancelled.\n" : `Error: ${messageOf(error)}\n`,
      );
      throw error;
    } finally {
      deps.sessions.pushSummaries();
    }
  };
}

/** `@name task` or a `subagent: true` command: delegate straight away. */
async function delegate(
  deps: Dependencies,
  runtime: AgentRuntime,
  entry: ManagedSession,
  agent: string,
  route: PromptRoute,
  task: string,
): Promise<void> {
  const { session } = entry;
  const { io, writer } = deps.sessions.bindingFor(entry);
  const signal = session.startRequest();
  writeStatus(writer, `↳ ${agent}  (Alt+S opens its session)`);
  const observation = await runtime.runSubagent(agent, task, {
    model: route.model,
    fallbackModel: session.modelOverride(undefined),
    signal,
    run: childRunner(deps, entry),
  });
  deps.spinner.stop();
  writer.ensureNewLine();
  if (observation.ok) {
    writer.write("\n");
    await writeMarkdown(deps, io, writer, observation.content);
    session.appendTurn([
      { role: "user", content: route.prompt },
      { role: "assistant", content: observation.content },
    ]);
  } else {
    writeStatus(
      writer,
      `✗ ${observation.content.replace(/^Tool error: /, "")}`,
    );
  }
  session.completeRequest({});
  deps.sessions.pushSummaries();
}

/**
 * Run a prompt with the session's primary agent (or the agent a command
 * declares). Subagent commands and `@name` mentions delegate instead.
 */
export async function runAgentPrompt(
  deps: Dependencies,
  runtime: AgentRuntime,
  route: PromptRoute,
): Promise<void> {
  const entry = deps.sessions.activeEntry();
  const { session } = entry;
  const declared =
    route.agent === undefined ? undefined : runtime.find(route.agent);
  if (route.agent !== undefined && declared === undefined)
    throw new Error(
      `Unknown agent '${route.agent}'. Use /agents to list them.`,
    );
  const mention =
    route.agent === undefined && route.subagent !== true
      ? runtime.parseMention(route.prompt)
      : undefined;
  if (mention !== undefined)
    return delegate(deps, runtime, entry, mention.agent, route, mention.task);
  if (route.subagent === true || declared?.mode === "subagent")
    return delegate(
      deps,
      runtime,
      entry,
      declared?.name ?? DEFAULT_SUBAGENT,
      route,
      route.prompt,
    );

  const prepared = runtime.prepare(
    declared?.name ?? session.agent ?? runtime.defaultAgent().name,
    {
      runSubagent: childRunner(deps, entry),
      model: route.model,
      fallbackModel: session.modelOverride(undefined),
    },
  );
  const { io, writer } = deps.sessions.bindingFor(entry);
  const result = await runAgentTurn({
    agent: prepared.agent,
    prompt: route.prompt,
    model: undefined,
    signal: session.startRequest(),
    io,
    writer,
    spinner: deps.spinner,
    highlighter: deps.options.highlighter,
    history: session.conversation(),
  });
  session.appendTurn(result.messages);
  session.completeRequest(
    result.usage,
    result.model === session.model ? undefined : result.model,
  );
  deps.sessions.pushSummaries();
}

function selectAgent(deps: Dependencies, name: string): void {
  deps.sessions.active().selectAgent(name);
  deps.sessions.pushSummaries();
}

/** Tab / Shift+Tab: the next or previous primary agent. */
export function cycleAgent(
  deps: Dependencies,
  runtime: AgentRuntime,
  step: 1 | -1,
): void {
  const current = deps.sessions.active().agent ?? runtime.defaultAgent().name;
  selectAgent(deps, runtime.cycle(current, step).name);
}

function describeAgent(agent: AgentDefinition, current: string | undefined) {
  const marker = agent.name === current ? "●" : "○";
  const model = agent.model === undefined ? "" : ` [${agent.model}]`;
  const source = agent.source === BUILT_IN ? "" : ` (${agent.source})`;
  return `  ${marker} ${agent.name}${model} — ${agent.description}${source}`;
}

export function formatAgents(
  runtime: AgentRuntime,
  current: string | undefined,
): string {
  const subagents = runtime.subagents();
  return [
    "Primary agents (Tab / Shift+Tab, /agent <name>):",
    ...runtime.primaryAgents().map((agent) => describeAgent(agent, current)),
    "",
    "Subagents (@name <task>, or the task tool):",
    ...(subagents.length === 0
      ? ["  (none)"]
      : subagents.map((agent) => describeAgent(agent, current))),
  ].join("\n");
}

export function formatSkills(runtime: AgentRuntime): string {
  const { skills } = runtime.catalog;
  if (skills.length === 0)
    return "No skills found. Add .koda/skills/<name>/SKILL.md (or .opencode/skills).";
  return [
    "Skills (loaded on demand by the skill tool):",
    ...skills.map(
      (skill) => `  ${skill.name} — ${skill.description} (${skill.source})`,
    ),
  ].join("\n");
}

/** `/agent [name]`: switch the session's primary agent. */
export async function runAgentCommand(
  deps: Dependencies,
  runtime: AgentRuntime,
  name: string | undefined,
): Promise<void> {
  const current = deps.sessions.active().agent;
  let chosen = name;
  if (chosen === undefined) {
    const primaries = runtime.primaryAgents();
    if (deps.io.select === undefined) {
      deps.writer.write(`${formatAgents(runtime, current)}\n`);
      return;
    }
    const index = await deps.io.select({
      title: AGENT_PICKER_TITLE,
      options: primaries.map(
        (agent) => `${agent.name === current ? "●" : " "} ${agent.name}`,
      ),
      hint: AGENT_PICKER_HINT,
    });
    chosen = index === undefined ? undefined : primaries[index]?.name;
    if (chosen === undefined) return;
  }
  const agent = runtime.find(chosen);
  if (agent === undefined || agent.mode === "subagent")
    throw new Error(
      `Unknown primary agent '${chosen}'. Use /agents to list them.`,
    );
  selectAgent(deps, agent.name);
  deps.writer.write(`Agent set to ${agent.name}.\n`);
}

/** Files the catalog skipped, shown once at startup. */
export function reportCatalogIssues(
  deps: Dependencies,
  runtime: AgentRuntime,
): void {
  const { diagnostics } = runtime.catalog;
  if (diagnostics.length === 0) return;
  deps.writer.write(
    `Agent/skill configuration issues:\n${diagnostics
      .map((issue) => `  - ${issue}`)
      .join("\n")}\n`,
  );
}
