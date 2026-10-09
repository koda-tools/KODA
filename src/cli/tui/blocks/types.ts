/** Who/what a block shows; picks its border color and header label. */
export type BlockVariant = "user" | "assistant" | "code";

/** One rendered transcript line, in plain and SGR-styled forms. */
export interface BlockLine {
  readonly plain: string;
  readonly ansi: string;
}

export interface CodeBlockInfo {
  /** Display name of the language (resolved name, or as written). */
  readonly language: string;
  readonly filename?: string | undefined;
}
