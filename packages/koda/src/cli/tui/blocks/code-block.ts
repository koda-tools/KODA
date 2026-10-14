import { sanitize } from "../shared/sanitize.js";
import { blockLine, headerLine } from "./style.js";
import type { BlockLine, CodeBlockInfo } from "./types.js";

/**
 * Code block: blue border, `CODE · file · language` header, and code lines
 * kept verbatim (indentation preserved). Highlighting is done by the caller
 * so this component stays free of any grammar state.
 */
export class CodeBlock {
  private readonly label: string;

  public constructor(info: CodeBlockInfo) {
    const parts = ["CODE", info.filename, info.language]
      .map((part) => sanitize(part ?? "").trim())
      .filter((part) => part !== "");
    this.label = parts.join(" · ");
  }

  public header(): BlockLine {
    return headerLine("code", this.label);
  }

  /** Border-only line between the header and the code. */
  public spacer(): BlockLine {
    return blockLine("code", "");
  }

  /**
   * One code line. `code` must already be sanitized; `highlighted` is its
   * SGR-colored form (or `code` itself when there is no highlighter).
   */
  public line(code: string, highlighted: string = code): BlockLine {
    // An empty code line still shows the border, with no trailing padding.
    return blockLine("code", code, highlighted);
  }
}
