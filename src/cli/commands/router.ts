import { expandArguments, parseSlashInput } from "./arguments.js";
import type { CommandRegistry } from "./discovery.js";
import { expandShellBlocks } from "./shell.js";
import type { ShellPolicy } from "./types.js";

export type RouteResult =
  | {
      readonly type: "prompt";
      readonly prompt: string;
      readonly model?: string;
      /** Agent a command declared (`agent:`) to run the prompt. */
      readonly agent?: string;
      /** `subagent: true`: delegate to the agent in a child session. */
      readonly subagent?: boolean;
    }
  | {
      readonly type: "agents";
    }
  | {
      readonly type: "skills";
    }
  | {
      readonly type: "agent";
      readonly name?: string;
    }
  | {
      readonly type: "message";
      readonly content: string;
    }
  | {
      readonly type: "model";
      readonly name?: string;
    }
  | {
      readonly type: "connect";
      readonly name?: string;
    }
  | {
      readonly type: "clear";
    }
  | {
      readonly type: "exit";
    };

const BUILT_IN_HELP =
  "Built-ins: /help, /commands, /model [name|number], /agents, /agent [name], /skills, /connect [provider], /clear, /exit\nUse @agent <task> to delegate to a subagent.";

export async function routeInput(
  input: string,
  registry: CommandRegistry,
  workspaceRoot: string,
  shellPolicy: ShellPolicy = {},
): Promise<RouteResult> {
  const slash = parseSlashInput(input);

  if (slash === undefined) {
    return promptResult(input);
  }

  const builtInResult = routeBuiltInCommand(
    slash.name,
    slash.arguments,
    registry,
  );

  if (builtInResult !== undefined) {
    return builtInResult;
  }

  const command = registry.get(slash.name);

  if (command === undefined) {
    throw unknownCommandError(slash.name, registry);
  }

  const template = expandArguments(command.template, slash.arguments);

  const prompt = await expandShellBlocks(
    template,
    workspaceRoot,
    command.source,
    shellPolicy,
  );

  return {
    ...promptResult(prompt, command.model),
    ...(command.agent === undefined ? {} : { agent: command.agent }),
    ...(command.subagent ? { subagent: true } : {}),
  };
}

function routeBuiltInCommand(
  name: string,
  args: string,
  registry: CommandRegistry,
): RouteResult | undefined {
  switch (name) {
    case "exit":
      return { type: "exit" };

    case "help":
      return {
        type: "message",
        content: BUILT_IN_HELP,
      };

    case "model": {
      const model = args.trim();

      return model.length === 0
        ? { type: "model" }
        : { type: "model", name: model };
    }

    case "commands":
      return {
        type: "message",
        content: formatCommandList(registry),
      };

    case "agents":
      return { type: "agents" };

    case "skills":
      return { type: "skills" };

    case "agent": {
      const agent = args.trim();

      return agent.length === 0
        ? { type: "agent" }
        : { type: "agent", name: agent };
    }

    case "connect": {
      const provider = args.trim();

      return provider.length === 0
        ? { type: "connect" }
        : { type: "connect", name: provider };
    }

    case "clear":
    case "reset":
      return { type: "clear" };

    default:
      return undefined;
  }
}

function formatCommandList(registry: CommandRegistry): string {
  const commands = registry.list();

  if (commands.length === 0) {
    return "No custom commands found.";
  }

  return commands
    .map((command) => {
      const description = command.description
        ? ` — ${command.description}`
        : "";

      return `/${command.name}${description} (${command.source.path})`;
    })
    .join("\n");
}

function unknownCommandError(name: string, registry: CommandRegistry): Error {
  const suggestions = registry.suggest(name);

  const hint =
    suggestions.length > 0
      ? ` Did you mean ${suggestions
          .map((suggestion) => `/${suggestion}`)
          .join(", ")}?`
      : "";

  return new Error(`Unknown command '/${name}'.${hint}`);
}

function promptResult(prompt: string, model?: string): RouteResult {
  return model === undefined
    ? { type: "prompt", prompt }
    : { type: "prompt", prompt, model };
}
