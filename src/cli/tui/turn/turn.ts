import type { AgentRunResult, ToolObservation } from "../../../core/index.js";
import type { ToolCall } from "../../../providers/index.js";
import { MarkdownStream } from "../markdown/markdown-stream.js";
import { renderFile } from "../output/render.js";
import {
  parseWriteArguments,
  parseWriteSummary,
} from "../output/write-arguments.js";
import type { Segment, ToolCallHandle } from "../shared/types.js";
import type { TurnRequest } from "./types.js";

const RESULT_PREVIEW_CHARS = 80;

function toolArgs(call: ToolCall): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(call.arguments);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** First line of a tool result, shortened for the ToolCall widget. */
function summarizeResult(content: string): string {
  const first = content.split("\n", 1)[0] ?? "";
  return first.length > RESULT_PREVIEW_CHARS
    ? `${first.slice(0, RESULT_PREVIEW_CHARS - 1)}…`
    : first;
}

function describeCall(call: ToolCall, ok: boolean): string {
  const filePath = toolArgs(call).filePath;
  const target = typeof filePath === "string" ? filePath : "";
  return `${ok ? "✓" : "✗"} ${call.name} ${target}\n`;
}

/**
 * Run one agent turn, streaming markdown into the transcript and showing
 * each tool call in the ToolCall widget (pending → running → done/error).
 */
export async function runAgentTurn(
  request: TurnRequest,
): Promise<AgentRunResult> {
  const { agent, writer, spinner, io } = request;
  const markdown = new MarkdownStream(request.highlighter);
  const toolWidgets = new Map<string, ToolCallHandle>();
  let rendering: Promise<void> = Promise.resolve();
  let textStarted = false;

  /** Segments render in order, even though markdown parsing is async. */
  const enqueue = (produce: () => Promise<readonly Segment[]>): void => {
    rendering = rendering
      .then(async () => {
        for (const segment of await produce()) writer.writeSegment(segment);
      })
      .catch(() => undefined);
  };
  const flushMarkdown = async (): Promise<void> => {
    enqueue(() => markdown.flush());
    await rendering;
  };

  const showWrittenFile = async (
    call: ToolCall,
    observation: ToolObservation,
  ): Promise<void> => {
    if (call.name !== "writeFile" || !observation.ok) return;
    const file = parseWriteArguments(call.arguments);
    if (file === undefined) return;
    spinner.stop();
    writer.ensureNewLine();
    const summary = parseWriteSummary(observation.content);
    if (summary !== undefined) {
      writer.write(`Updated ${file.filePath} ${summary}\n`);
      return;
    }
    await renderFile(writer, file, {
      highlighter: request.highlighter,
      animate: io.isTTY ?? false,
    });
  };

  try {
    return await agent.runDetailed(request.prompt, {
      ...(request.model === undefined ? {} : { model: request.model }),
      ...(request.history === undefined ? {} : { history: request.history }),
      signal: request.signal,
      observer: {
        onStatus: (label) => {
          if (label === undefined) return spinner.stop();
          textStarted = false;
          spinner.start(label);
        },
        onTextDelta: (text) => {
          if (!textStarted) {
            spinner.stop();
            writer.ensureNewLine();
            textStarted = true;
          }
          enqueue(() => markdown.push(text));
        },
        onToolStart: async (call) => {
          await flushMarkdown();
          const handle = io.showToolCall?.({
            id: call.id,
            name: call.name,
            args: toolArgs(call),
          });
          if (handle === undefined) return;
          handle.setStatus("running");
          toolWidgets.set(call.id, handle);
        },
        onToolResult: async (call, observation) => {
          await flushMarkdown();
          const handle = toolWidgets.get(call.id);
          if (handle !== undefined) {
            handle.setStatus(
              observation.ok ? "done" : "error",
              summarizeResult(observation.content),
            );
            writer.ensureNewLine();
            writer.write(describeCall(call, observation.ok));
          }
          await showWrittenFile(call, observation);
        },
      },
    });
  } finally {
    await flushMarkdown();
    for (const handle of toolWidgets.values()) handle.dispose();
  }
}
