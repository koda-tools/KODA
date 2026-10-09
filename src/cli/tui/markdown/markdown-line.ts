import type { InlineStyle, InlineToken, MarkdownLine } from "./types.js";

const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,9}[.)])\s+(.*)$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;

/**
 * Inline syntax, in priority order: `code`, **bold**, __bold__,
 * [text](url), *italic*, _italic_. Underscores only count at word
 * boundaries, so `snake_case_names` stay literal.
 */
const INLINE =
  /(`+)(.+?)\1|\*\*(.+?)\*\*|__(.+?)__|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])\*(?![\s*])(.+?)(?<![\s*])\*(?!\*)|(?<![\w_])_(?![\s_])(.+?)(?<![\s_])_(?![\w_])/g;

/** Classify one line of Markdown by its block-level syntax. */
export function parseMarkdownLine(line: string): MarkdownLine {
  if (line.trim() === "") return { kind: "blank" };
  if (RULE.test(line)) return { kind: "rule" };
  const heading = HEADING.exec(line);
  if (heading !== null)
    return {
      kind: "heading",
      level: heading[1]?.length ?? 1,
      text: heading[2] ?? "",
    };
  const bullet = BULLET.exec(line);
  if (bullet !== null)
    return {
      kind: "list",
      indent: bullet[1]?.length ?? 0,
      marker: "•",
      text: bullet[2] ?? "",
    };
  const ordered = ORDERED.exec(line);
  if (ordered !== null)
    return {
      kind: "list",
      indent: ordered[1]?.length ?? 0,
      marker: ordered[2] ?? "",
      text: ordered[3] ?? "",
    };
  const quote = QUOTE.exec(line);
  if (quote !== null) return { kind: "quote", text: quote[1] ?? "" };
  return { kind: "paragraph", text: line };
}

function styled(text: string, style: InlineStyle): InlineToken {
  return { ...style, text };
}

/**
 * Split inline Markdown into styled runs. Unclosed markers stay literal,
 * which keeps half-streamed text readable until the closing marker lands.
 */
export function parseInline(
  text: string,
  base: InlineStyle = {},
): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push(styled(text.slice(last, index), base));
    const [, , code, bold1, bold2, label, url, italic1, italic2] = match;
    if (code !== undefined) tokens.push(styled(code, { ...base, code: true }));
    else if (bold1 !== undefined || bold2 !== undefined)
      tokens.push(
        ...parseInline(bold1 ?? bold2 ?? "", { ...base, bold: true }),
      );
    else if (label !== undefined)
      tokens.push(styled(label, { ...base, link: url ?? "" }));
    else
      tokens.push(
        ...parseInline(italic1 ?? italic2 ?? "", { ...base, italic: true }),
      );
    last = index + match[0].length;
  }
  if (last < text.length) tokens.push(styled(text.slice(last), base));
  return tokens;
}
