import type { CommandRegistry } from "../../commands/discovery.js";
import type { CommandSuggestion } from "../shared/types.js";

const SLASH = "/";

/** Built-ins handled by the router (see cli/commands/router.ts). */
export const BUILT_IN_SUGGESTIONS: readonly CommandSuggestion[] = [
  { name: "help", description: "Show built-in commands" },
  { name: "commands", description: "List custom commands" },
  { name: "model", description: "Switch model" },
  { name: "clear", description: "Clear conversation context" },
  { name: "exit", description: "Leave KODA" },
];

/** Built-ins first, then custom commands; a name appears only once. */
export function commandSuggestions(
  registry: Pick<CommandRegistry, "list">,
): CommandSuggestion[] {
  const seen = new Set(BUILT_IN_SUGGESTIONS.map((item) => item.name));
  const custom = registry
    .list()
    .filter((command) => !seen.has(command.name))
    .map((command): CommandSuggestion =>
      command.description === undefined || command.description === ""
        ? { name: command.name }
        : { name: command.name, description: command.description },
    );
  return [...BUILT_IN_SUGGESTIONS, ...custom];
}

/**
 * The command name being typed, or undefined when the prompt is not a
 * single-line `/name` still without arguments.
 */
export function slashQuery(text: string): string | undefined {
  if (!text.startsWith(SLASH) || /\s/.test(text)) return undefined;
  return text.slice(SLASH.length);
}

/** Case-insensitive prefix match on the command name. */
export function matchSuggestions(
  items: readonly CommandSuggestion[],
  query: string,
): CommandSuggestion[] {
  const prefix = query.toLowerCase();
  return items.filter((item) => item.name.toLowerCase().startsWith(prefix));
}

/** Prompt text after completing a suggestion, ready for arguments. */
export function completion(item: CommandSuggestion): string {
  return `${SLASH}${item.name} `;
}

/** One dropdown row: `/name  description`. */
export function suggestionLabel(item: CommandSuggestion): string {
  return item.description === undefined
    ? `${SLASH}${item.name}`
    : `${SLASH}${item.name}  ${item.description}`;
}
