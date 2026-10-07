import type { CodeAgent } from "../../../core/index.js";
import type { ChatMessage } from "../../../providers/index.js";
import type { CodeHighlighter } from "../highlight/types.js";
import type { InteractiveIO, LineWriter } from "../shared/types.js";

export interface Spinner {
  readonly start: (label: string) => void;
  readonly stop: () => void;
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
