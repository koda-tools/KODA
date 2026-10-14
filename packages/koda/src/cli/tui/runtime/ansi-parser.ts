import type { Color } from "@termuijs/core";
import type { SpanStyle, StyledSpan } from "./types.js";

const SGR = /\x1b\[([0-9;]*)m/g;
const TRUECOLOR = 2;
const PALETTE_256 = 5;

/** Read an extended color (`38;2;r;g;b` or `38;5;n`); returns params consumed. */
function readColor(
  params: readonly number[],
  index: number,
): { color: Color; consumed: number } | undefined {
  const mode = params[index + 1];
  if (mode === TRUECOLOR) {
    const [r = 0, g = 0, b = 0] = params.slice(index + 2, index + 5);
    return { color: { type: "rgb", r, g, b }, consumed: 4 };
  }
  if (mode === PALETTE_256)
    return {
      color: { type: "ansi256", code: params[index + 2] ?? 0 },
      consumed: 2,
    };
  return undefined;
}

function applySgr(style: SpanStyle, params: readonly number[]): SpanStyle {
  let next: SpanStyle = { ...style };
  for (let index = 0; index < params.length; index += 1) {
    const code = params[index] ?? 0;
    if (code === 0) next = {};
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 3) next.italic = true;
    else if (code === 4) next.underline = true;
    else if (code === 22) {
      delete next.bold;
      delete next.dim;
    } else if (code === 23) delete next.italic;
    else if (code === 24) delete next.underline;
    else if (code === 39) delete next.fg;
    else if (code === 49) delete next.bg;
    else if (code === 38 || code === 48) {
      const extended = readColor(params, index);
      if (extended === undefined) continue;
      if (code === 38) next.fg = extended.color;
      else next.bg = extended.color;
      index += extended.consumed;
    }
  }
  return next;
}

/**
 * Split a line with SGR codes (Shiki, diff renderer) into styled spans.
 * Non-SGR escapes were already removed by `sanitizeStyled`. Pure: no
 * TermUI runtime import, so it can be exported from the TUI barrel.
 */
export function parseAnsiLine(line: string): StyledSpan[] {
  const spans: StyledSpan[] = [];
  let style: SpanStyle = {};
  let last = 0;
  for (const match of line.matchAll(SGR)) {
    const index = match.index ?? 0;
    if (index > last) spans.push({ text: line.slice(last, index), style });
    const params = (match[1] ?? "")
      .split(";")
      .filter((part) => part !== "")
      .map((part) => Number.parseInt(part, 10));
    style = applySgr(style, params.length === 0 ? [0] : params);
    last = index + match[0].length;
  }
  if (last < line.length) spans.push({ text: line.slice(last), style });
  return spans;
}
