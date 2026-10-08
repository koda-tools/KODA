import type { CodeHighlighter } from "../highlight/types.js";

export interface WriteArguments {
  readonly filePath: string;
  readonly content: string;
}

export interface RenderOptions {
  readonly highlighter?: CodeHighlighter | undefined;
  /** Pause between segments for a typing effect (interactive TTY only). */
  readonly animate: boolean;
  /** Remember the rendered code block so the user can copy it (Ctrl+Y). */
  readonly onCodeBlock?: ((code: string) => void) | undefined;
}
