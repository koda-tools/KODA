import type { ToolExecutor, ToolObservation } from "../core/index.js";
import type { ToolDefinition } from "../providers/index.js";
import type { CommandPolicy } from "../tools/command/types.js";
import type { WritePolicy } from "../tools/registry.js";
import { checkToolCall, isToolHidden } from "./permissions.js";
import type {
  AgentTool,
  GateState,
  PermissionCheck,
  ToolsetOptions,
} from "./types.js";

/** Keys whose `ask` is answered by the write/command policies themselves. */
const POLICY_KEYS = new Set(["edit", "bash"]);

function failure(message: string): ToolObservation {
  return { ok: false, content: `Tool error: ${message}` };
}

function parseArgs(serialized: string): Readonly<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(serialized);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function describe(check: PermissionCheck): string {
  return check.subject === "" ? check.key : `${check.key} '${check.subject}'`;
}

/** A write policy that skips the prompt while an `allow` call runs. */
export function gatedWritePolicy(
  policy: WritePolicy | undefined,
  gate: GateState,
): WritePolicy | undefined {
  if (policy === undefined) return undefined;
  return {
    confirm: (request) =>
      gate.preapproved ? Promise.resolve(true) : policy.confirm(request),
  };
}

/** Same for commands; the risk classifier's `deny` still applies first. */
export function gatedCommandPolicy(
  policy: CommandPolicy | undefined,
  gate: GateState,
): CommandPolicy | undefined {
  if (policy === undefined) return undefined;
  return {
    ...policy,
    confirm: (request) =>
      gate.preapproved ? Promise.resolve(true) : policy.confirm(request),
  };
}

/**
 * The tools one agent run sees. Fully denied tools are hidden; every call is
 * checked again at execution, so a hidden or pattern-denied tool is refused
 * even when the model calls it by name.
 */
export class AgentToolset implements ToolExecutor {
  public readonly definitions: readonly ToolDefinition[];
  private readonly extras: ReadonlyMap<string, AgentTool>;

  public constructor(
    private readonly base: ToolExecutor,
    private readonly options: ToolsetOptions,
  ) {
    this.extras = new Map(
      options.extraTools.map((tool) => [tool.definition.name, tool]),
    );
    this.definitions = [
      ...base.definitions,
      ...options.extraTools.map((tool) => tool.definition),
    ].filter((definition) => !isToolHidden(options.layers, definition.name));
  }

  public statusLabel(name: string): string | undefined {
    return this.extras.get(name)?.statusLabel ?? this.base.statusLabel(name);
  }

  public async execute(
    name: string,
    serializedArguments: string,
    signal?: AbortSignal,
  ): Promise<ToolObservation> {
    const extra = this.extras.get(name);
    const known =
      extra !== undefined ||
      this.base.definitions.some((definition) => definition.name === name);
    if (!known) return failure(`Unknown tool '${name}'.`);
    if (isToolHidden(this.options.layers, name))
      return failure(
        `Permission denied: ${name} is not available to agent '${this.options.agentName}'.`,
      );
    const args = parseArgs(serializedArguments);
    const check = checkToolCall(this.options.layers, name, args);
    if (check?.action === "deny")
      return failure(
        `Permission denied: ${describe(check)} for agent '${this.options.agentName}'.`,
      );
    if (
      check?.action === "ask" &&
      !POLICY_KEYS.has(check.key) &&
      !(await this.askUser(name, check))
    )
      return failure(`Permission denied by user: ${describe(check)}.`);
    const preapproved = check?.action === "allow" && POLICY_KEYS.has(check.key);
    this.options.gate.preapproved = preapproved;
    try {
      return extra === undefined
        ? await this.base.execute(name, serializedArguments, signal)
        : await extra.execute(args, signal);
    } finally {
      this.options.gate.preapproved = false;
    }
  }

  private async askUser(
    tool: string,
    check: PermissionCheck,
  ): Promise<boolean> {
    const approve = this.options.approve;
    if (approve === undefined) return false;
    const target = check.subject === "" ? tool : `${tool}  ${check.subject}`;
    return approve(
      `${this.options.agentName}: ${target}`,
      `Allow agent '${this.options.agentName}' to use ${tool} (${describe(check)})? [y/N] `,
    );
  }
}
