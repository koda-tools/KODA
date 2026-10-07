import type { AgentRunResult, CodeAgent } from "../../core/agent.js";
import type { ChatMessage, ToolCall } from "../../providers/base.provider.js";
import type { CodeHighlighter } from "./highlight.js";
import type { InteractiveIO, ToolCallKind } from "./io.js";
import { MarkdownStream, type Segment } from "./markdown-stream.js";
import {
  parseWriteArguments,
  parseWriteSummary,
  renderFile,
  type LineWriter,
} from "./output.js";
import type { Spinner } from "./spinner.js";

const TOOL_KIND: Readonly<Record<string, ToolCallKind>> = {
  readFile: "readFile",
  writeFile: "writeFile",
};

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

type ToolCallHandle = NonNullable<
  ReturnType<NonNullable<InteractiveIO["showToolCall"]>>
>;

const RESULT_PREVIEW_CHARS = 80;

/** First line of a tool result, shortened for the ToolCall widget. */
function summarizeResult(content: string): string {
  const first = content.split("\n", 1)[0] ?? "";
  return first.length > RESULT_PREVIEW_CHARS
    ? `${first.slice(0, RESULT_PREVIEW_CHARS - 1)}…`
    : first;
}

/** Short label for the transcript, e.g. the file path. */
function describeArgs(call: ToolCall): string {
  const filePath = toolArgs(call).filePath;
  return typeof filePath === "string" ? filePath : "";
}

export interface TurnRequest {
  readonly agent: CodeAgent;
  readonly prompt: string;
  readonly model: string | undefined;
  readonly signal: AbortSignal;
  readonly io: InteractiveIO;
  readonly writer: LineWriter;
  readonly spinner: Spinner;
  readonly highlighter?: CodeHighlighter | undefined;
  readonly history?: readonly ChatMessage[] | undefined;
}

export async function runAgentTurn(
  request: TurnRequest,
): Promise<AgentRunResult> {
  const { agent, writer, spinner, io } = request;
  const markdown = new MarkdownStream(request.highlighter);
  let rendering: Promise<void> = Promise.resolve();
  let textStarted = false;
  // https://www.termui.io/components/tool-call — one widget per tool
  // invocation, moved pending → running → done/error.
  const toolWidgets = new Map<string, ToolCallHandle>();

  const enqueue = (produce: () => Promise<readonly Segment[]>): void => {
    rendering = rendering
      .then(async () => {
        for (const segment of await produce()) writer.writeSegment(segment);
      })
      .catch(() => undefined);
  };

  try {
    return await agent.runDetailed(request.prompt, {
      ...(request.model === undefined ? {} : { model: request.model }),
      ...(request.history === undefined ? {} : { history: request.history }),
      signal: request.signal,
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
        enqueue(() => markdown.flush());
        await rendering;
        const handle = io.showToolCall?.({
          id: call.id,
          kind: TOOL_KIND[call.name] ?? "other",
          name: call.name,
          args: toolArgs(call),
        });
        if (handle === undefined) return;
        handle.setStatus("running");
        toolWidgets.set(call.id, handle);
      },
      onToolResult: async (call, observation) => {
        enqueue(() => markdown.flush());
        await rendering;
        const handle = toolWidgets.get(call.id);
        if (handle !== undefined) {
          handle.setStatus(
            observation.ok ? "done" : "error",
            summarizeResult(observation.content),
          );
          writer.ensureNewLine();
          writer.write(
            `${observation.ok ? "✓" : "✗"} ${call.name} ${describeArgs(call)}\n`,
          );
        }
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
      },
    });
  } finally {
    enqueue(() => markdown.flush());
    await rendering;
    for (const handle of toolWidgets.values()) handle.dispose();
  }
}
