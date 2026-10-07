import type { BundledLanguage, GrammarState } from "shiki";

export interface HighlightedLine {
  readonly ansi: string;
  readonly state?: GrammarState;
}

export interface CodeHighlighter {
  readonly resolveLanguage: (
    name: string,
  ) => Promise<BundledLanguage | undefined>;
  /** `state` carries multi-line grammar context (e.g. open comments). */
  readonly highlightLine: (
    line: string,
    language: BundledLanguage,
    state?: GrammarState,
  ) => HighlightedLine;
}
