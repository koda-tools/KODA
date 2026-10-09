/** What a fence's info string says: ```lang title="file.ts"`. */
export interface FenceInfo {
  /** Raw language name as written (may be empty or an alias like `ts`). */
  readonly language: string;
  readonly filename: string | undefined;
}

/** One Markdown line, classified by its block-level syntax. */
export type MarkdownLine =
  | { readonly kind: "blank" }
  | { readonly kind: "rule" }
  | { readonly kind: "heading"; readonly level: number; readonly text: string }
  | {
      readonly kind: "list";
      readonly indent: number;
      /** `•` for bullets, `1.` style for ordered items. */
      readonly marker: string;
      readonly text: string;
    }
  | { readonly kind: "quote"; readonly text: string }
  | { readonly kind: "paragraph"; readonly text: string };

/** Inline formatting flags carried by a run of text. */
export interface InlineStyle {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly code?: boolean;
  /** Target URL when the run is a `[text](url)` link. */
  readonly link?: string;
}

export interface InlineToken extends InlineStyle {
  readonly text: string;
}
