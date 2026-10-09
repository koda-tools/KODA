import { parseInline, parseMarkdownLine } from "../markdown/markdown-line.js";
import type { InlineToken, MarkdownLine } from "../markdown/types.js";
import { BOLD, DIM, ITALIC, RESET, UNDERLINE, rgb } from "../shared/ansi.js";
import { sanitize } from "../shared/sanitize.js";
import { blockLine, headerLine } from "./style.js";
import type { BlockLine } from "./types.js";

const INLINE_CODE = rgb(255, 166, 87);
const LINK = rgb(88, 166, 255);
const RULE_WIDTH = 24;

/** SGR for one inline run; `base` adds heading/quote emphasis. */
function tokenStyle(token: InlineToken, base: string): string {
  return [
    base,
    token.bold === true ? BOLD : "",
    token.italic === true ? ITALIC : "",
    token.code === true ? INLINE_CODE : "",
    token.link === undefined ? "" : `${UNDERLINE}${LINK}`,
  ].join("");
}

/** Link target shown after the label, unless the label is the URL. */
function linkSuffix(token: InlineToken): string {
  const url = token.link;
  return url === undefined || url === "" || url === token.text
    ? ""
    : ` (${url})`;
}

function renderInline(text: string, base = ""): BlockLine {
  const tokens = parseInline(text);
  const plain = tokens.map((t) => `${t.text}${linkSuffix(t)}`).join("");
  const ansi = tokens
    .map((t) => {
      const suffix = linkSuffix(t);
      const tail = suffix === "" ? "" : `${DIM}${suffix}${RESET}`;
      return `${tokenStyle(t, base)}${t.text}${RESET}${tail}`;
    })
    .join("");
  return { plain, ansi };
}

function prefixed(prefix: string, body: BlockLine): BlockLine {
  return { plain: `${prefix}${body.plain}`, ansi: `${prefix}${body.ansi}` };
}

/** Content (no border) for one classified Markdown line. */
function renderLine(line: MarkdownLine): BlockLine {
  switch (line.kind) {
    case "blank":
      return { plain: "", ansi: "" };
    case "rule": {
      const rule = "─".repeat(RULE_WIDTH);
      return { plain: rule, ansi: `${DIM}${rule}${RESET}` };
    }
    case "heading":
      return renderInline(
        line.text,
        line.level <= 2 ? `${BOLD}${UNDERLINE}` : BOLD,
      );
    case "list":
      return prefixed(
        `${" ".repeat(line.indent)}${line.marker} `,
        renderInline(line.text),
      );
    case "quote":
      return prefixed("┊ ", renderInline(line.text, `${DIM}${ITALIC}`));
    case "paragraph":
      return renderInline(line.text);
  }
}

/**
 * Text and Markdown message block. Content is untrusted: every escape is
 * stripped before any styling is added.
 */
export class TextBlock {
  public constructor(private readonly variant: "user" | "assistant") {}

  public header(): BlockLine {
    const who = this.variant === "user" ? "USER" : "KODA";
    return headerLine(this.variant, `TEXT · ${who}`);
  }

  /** A line of Markdown: headings, lists, quotes, rules, inline styles. */
  public markdown(raw: string): BlockLine {
    const body = renderLine(parseMarkdownLine(sanitize(raw)));
    return blockLine(this.variant, body.plain, body.ansi);
  }

  /** A line shown exactly as typed (user input is not Markdown-rendered). */
  public literal(raw: string): BlockLine {
    return blockLine(this.variant, sanitize(raw));
  }

  /** A border-only line (paragraph break inside the block). */
  public blank(): BlockLine {
    return blockLine(this.variant, "");
  }
}

/**
 * A tool/approval status line (`✓ writeFile a.ts`, `→ Autorizar`) inside a
 * KODA-colored block, shown verbatim and without a header.
 */
export function statusLine(text: string): BlockLine {
  return new TextBlock("assistant").literal(text);
}

/** A complete user message block: header plus each typed line. */
export function userMessage(text: string): BlockLine[] {
  const block = new TextBlock("user");
  const lines = sanitize(text).replace(/\s+$/, "").split("\n");
  return [block.header(), ...lines.map((line) => block.literal(line))];
}
