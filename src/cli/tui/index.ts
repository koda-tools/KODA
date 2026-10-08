/**
 * Public entry point of the TUI. Code outside `src/cli/tui` imports from
 * here only. The TermUI runtime is not re-exported statically so batch mode
 * never loads TermUI; use `loadTermUIRuntime()`.
 */
import type { InteractiveRuntime } from "./application/types.js";
import type { CommandSuggestions } from "./runtime/command-suggestions.js";
import type { Prompt } from "./runtime/prompt.js";

export { runInteractive } from "./application/application.js";
export type {
  InteractiveOptions,
  InteractiveRuntime,
} from "./application/types.js";
export { decide } from "./commands/decision.js";
export { runModelCommand } from "./commands/model-command.js";
export {
  BUILT_IN_SUGGESTIONS,
  commandSuggestions,
  completion,
  matchSuggestions,
  slashQuery,
} from "./commands/suggestions.js";
export type { CommandSuggestions } from "./runtime/command-suggestions.js";
export type { ModelCommandInput, ModelCommandResult } from "./commands/types.js";
export { toDiffViewLines } from "./diff/diff-lines.js";
export { diffSegments } from "./diff/diff-segments.js";
export { createLazyHighlighter } from "./highlight/highlighter.js";
export type { CodeHighlighter, HighlightedLine } from "./highlight/types.js";
export {
  frameBottom,
  frameTop,
  MarkdownStream,
} from "./markdown/markdown-stream.js";
export { createLineWriter } from "./output/line-writer.js";
export { renderDiff, renderFile } from "./output/render.js";
export type { RenderOptions, WriteArguments } from "./output/types.js";
export {
  parseWriteArguments,
  parseWriteSummary,
} from "./output/write-arguments.js";
export { parseAnsiLine } from "./runtime/ansi-parser.js";
export { PROMPT_TITLE } from "./runtime/constants.js";
export type { Prompt } from "./runtime/prompt.js";
export { renderHeader } from "./session/header.js";
export { estimateCost } from "../../providers/index.js";
export { Session } from "./session/session.js";
export type { SessionIdentity, SessionStatus } from "./session/types.js";
export { sanitize, sanitizeStyled } from "./shared/sanitize.js";
export type {
  CommandSuggestion,
  DiffViewLine,
  DiffViewRequest,
  InteractiveIO,
  LineWriter,
  ModelPickerItem,
  ModelPickerRequest,
  Segment,
  SelectRequest,
  ToolCallHandle,
  ToolCallStatus,
  ToolCallView,
} from "./shared/types.js";

/** Load the TermUI front end on demand (interactive mode only). */
export async function loadTermUIRuntime(): Promise<InteractiveRuntime> {
  const { TermUIRuntime } = await import("./runtime/termui-runtime.js");
  return new TermUIRuntime();
}

/** Create the slash-command dropdown on demand (loads TermUI). */
export async function createCommandSuggestions(): Promise<CommandSuggestions> {
  const module = await import("./runtime/command-suggestions.js");
  return new module.CommandSuggestions();
}

/** Create the prompt widget on demand (loads TermUI). */
export async function createPrompt(): Promise<Prompt> {
  const module = await import("./runtime/prompt.js");
  return new module.Prompt();
}
