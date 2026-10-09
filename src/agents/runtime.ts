import {
  CodeAgent,
  parseModelRef,
  type ToolObservation,
} from "../core/index.js";
import {
  ProviderFactory,
  configFromEnvironment,
  isProviderName,
  type ILLMProvider,
} from "../providers/index.js";
import { ToolRegistry } from "../tools/registry.js";
import { AGENT_NAME } from "./agent-file.js";
import { BUILTIN_AGENTS } from "./builtins.js";
import { buildSystemPrompt } from "./prompt.js";
import { createSkillTool } from "./skill-tool.js";
import { createTaskTool } from "./task-tool.js";
import {
  AgentToolset,
  gatedCommandPolicy,
  gatedWritePolicy,
} from "./toolset.js";
import type {
  AgentCatalog,
  AgentDefinition,
  AgentTool,
  Delegate,
  GateState,
  Mention,
  Permissions,
  PreparedAgent,
  RunContext,
  RuntimeOptions,
  SubagentRunOptions,
  SubagentRunner,
  TimeoutScope,
} from "./types.js";

export const SUBAGENT_TIMEOUT_MS = 5 * 60_000;
const MENTION = /^@(\S+)(?:\s+([\s\S]*))?$/;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Batch mode: run the subagent without streaming it anywhere. */
export const runQuietly: SubagentRunner = (prepared, task, signal) =>
  prepared.agent.runDetailed(task, { signal });

/** A signal that follows `parent` and also aborts after `ms`. */
export function withTimeout(
  parent: AbortSignal | undefined,
  ms: number,
): TimeoutScope {
  const controller = new AbortController();
  let expired = false;
  const abort = (): void => controller.abort();
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, ms);
  timer.unref?.();
  if (parent?.aborted === true) controller.abort();
  else parent?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => expired,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    },
  };
}

function sessionRef(identity: PreparedAgent["identity"]): string {
  return `${identity.provider}/${identity.model}`;
}

/**
 * The agents of a workspace and how to run them: one `CodeAgent` per run,
 * with that agent's prompt, tools, permissions, steps and provider.
 */
export class AgentRuntime {
  private readonly providers = new Map<string, ILLMProvider>();

  public constructor(private readonly options: RuntimeOptions) {
    this.providers.set(options.identity.provider, options.defaultProvider);
  }

  public get catalog(): AgentCatalog {
    return this.options.catalog;
  }

  public find(name: string): AgentDefinition | undefined {
    return this.options.catalog.agents.find((agent) => agent.name === name);
  }

  /** Agents Tab cycles through (`primary` or `all`, not hidden). */
  public primaryAgents(): readonly AgentDefinition[] {
    return this.options.catalog.agents.filter(
      (agent) => agent.mode !== "subagent" && !agent.hidden,
    );
  }

  /** Agents reachable by `@name` (and, with hidden ones, the task tool). */
  public subagents(includeHidden = false): readonly AgentDefinition[] {
    return this.options.catalog.agents.filter(
      (agent) => agent.mode !== "primary" && (includeHidden || !agent.hidden),
    );
  }

  public defaultAgent(): AgentDefinition {
    const primaries = this.primaryAgents();
    const fallback = BUILTIN_AGENTS[0];
    const agent =
      primaries.find((candidate) => candidate.name === "build") ??
      primaries[0] ??
      this.options.catalog.agents.find(
        (candidate) => candidate.mode !== "subagent",
      ) ??
      fallback;
    if (agent === undefined) throw new Error("No agent is available.");
    return agent;
  }

  /** The primary agent after (`1`) or before (`-1`) `current`. */
  public cycle(current: string, step: 1 | -1): AgentDefinition {
    const primaries = this.primaryAgents();
    const index = primaries.findIndex((agent) => agent.name === current);
    const next =
      index === -1 ? 0 : (index + step + primaries.length) % primaries.length;
    return primaries[next] ?? this.defaultAgent();
  }

  /** `@explore find the parser` → the subagent and its task. */
  public parseMention(input: string): Mention | undefined {
    const match = MENTION.exec(input.trim());
    const name = match?.[1];
    const task = match?.[2]?.trim() ?? "";
    if (name === undefined || task === "" || !AGENT_NAME.test(name))
      return undefined;
    const agent = this.subagents().find((candidate) => candidate.name === name);
    return agent === undefined ? undefined : { agent: agent.name, task };
  }

  /** A run of `name`; with `runSubagent` it also gets the task tool. */
  public prepare(name: string, context: RunContext = {}): PreparedAgent {
    return this.build(this.require(name), "primary", context);
  }

  /** A subagent run: no task tool (depth 1), bounded by the parent layers. */
  public prepareSubagent(
    name: string,
    context: Omit<RunContext, "runSubagent"> = {},
  ): PreparedAgent {
    const definition = this.require(name);
    if (definition.mode === "primary")
      throw new Error(`Agent '${name}' is not a subagent.`);
    return this.build(definition, "subagent", context);
  }

  /**
   * Run a subagent and turn the outcome into a tool observation. Failures,
   * cancellation and the time limit never throw.
   */
  public async runSubagent(
    name: string,
    task: string,
    options: SubagentRunOptions = {},
  ): Promise<ToolObservation> {
    let prepared: PreparedAgent;
    try {
      prepared = this.prepareSubagent(name, {
        parentLayers: options.parentLayers,
        model: options.model,
        fallbackModel: options.fallbackModel,
      });
    } catch (error) {
      return { ok: false, content: `Tool error: ${messageOf(error)}` };
    }
    const scope = withTimeout(
      options.signal,
      this.options.subagentTimeoutMs ?? SUBAGENT_TIMEOUT_MS,
    );
    try {
      const run = options.run ?? runQuietly;
      const result = await run(prepared, task, scope.signal);
      const content = result.content.trim();
      return {
        ok: true,
        content:
          content === "" ? `Subagent '${name}' returned no text.` : content,
      };
    } catch (error) {
      if (scope.timedOut())
        return {
          ok: false,
          content: `Tool error: Subagent '${name}' timed out after ${Math.round(
            (this.options.subagentTimeoutMs ?? SUBAGENT_TIMEOUT_MS) / 1000,
          )}s.`,
        };
      if (options.signal?.aborted === true)
        return {
          ok: false,
          content: `Tool error: Subagent '${name}' was cancelled.`,
        };
      return {
        ok: false,
        content: `Tool error: Subagent '${name}' failed: ${messageOf(error)}`,
      };
    } finally {
      scope.dispose();
    }
  }

  private require(name: string): AgentDefinition {
    const definition = this.find(name);
    if (definition === undefined) throw new Error(`Unknown agent '${name}'.`);
    return definition;
  }

  private build(
    definition: AgentDefinition,
    role: "primary" | "subagent",
    context: RunContext,
  ): PreparedAgent {
    const layers: readonly Permissions[] = [
      ...(context.parentLayers ?? []),
      definition.permission,
    ];
    const { provider, identity } = this.resolveModel(
      context.model ?? definition.model ?? context.fallbackModel,
    );
    const gate: GateState = { preapproved: false };
    const writePolicy = gatedWritePolicy(this.options.writePolicy, gate);
    const commandPolicy = gatedCommandPolicy(this.options.commandPolicy, gate);
    const registry = new ToolRegistry({
      workspaceRoot: this.options.workspaceRoot,
      ...(writePolicy === undefined ? {} : { writePolicy }),
      ...(commandPolicy === undefined ? {} : { commandPolicy }),
    });
    const runSubagent = context.runSubagent;
    const delegate: Delegate | undefined =
      runSubagent === undefined
        ? undefined
        : (agent, task, signal) =>
            this.runSubagent(agent, task, {
              parentLayers: layers,
              fallbackModel: sessionRef(identity),
              signal,
              run: runSubagent,
            });
    const extraTools = [
      createSkillTool(this.options.catalog.skills, layers),
      delegate === undefined
        ? undefined
        : createTaskTool(this.subagents(true), layers, delegate),
    ].filter((tool): tool is AgentTool => tool !== undefined);
    const toolset = new AgentToolset(registry, {
      layers,
      extraTools,
      gate,
      approve: this.options.approve,
      agentName: definition.name,
    });
    const agent = new CodeAgent(provider, toolset, {
      identity,
      systemPrompt: buildSystemPrompt(definition, role),
      onStepLimit: "summarize",
      ...(definition.steps === undefined
        ? {}
        : { maxIterations: definition.steps }),
      ...(definition.temperature === undefined
        ? {}
        : { temperature: definition.temperature }),
    });
    return { definition, agent, layers, identity };
  }

  /** `provider/model`, a bare model (session provider) or the session default. */
  private resolveModel(raw: string | undefined): {
    provider: ILLMProvider;
    identity: PreparedAgent["identity"];
  } {
    const session = this.options.identity;
    if (raw === undefined)
      return { provider: this.options.defaultProvider, identity: session };
    const ref = parseModelRef(raw);
    const providerName = ref.provider ?? session.provider;
    if (ref.model.trim() === "")
      throw new Error(`Model '${raw}' has no model name.`);
    return {
      provider: this.providerFor(providerName),
      identity: { provider: providerName, model: ref.model },
    };
  }

  private providerFor(name: string): ILLMProvider {
    const cached = this.providers.get(name);
    if (cached !== undefined) return cached;
    if (!isProviderName(name)) throw new Error(`Unknown provider '${name}'.`);
    const provider =
      this.options.createProvider?.(name) ??
      ProviderFactory.create(configFromEnvironment(this.options.env, name));
    this.providers.set(name, provider);
    return provider;
  }
}
