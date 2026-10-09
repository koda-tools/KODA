import type { StyledCell, StyledSpan } from "./types.js";

/** Merge neighbouring cells that share a style back into spans. */
export function cellsToSpans(cells: readonly StyledCell[]): StyledSpan[] {
  const spans: StyledSpan[] = [];
  for (const cell of cells) {
    const last = spans.at(-1);
    if (last !== undefined && last.style === cell.style)
      spans[spans.length - 1] = {
        text: last.text + cell.text,
        style: cell.style,
      };
    else spans.push({ text: cell.text, style: cell.style });
  }
  return spans;
}

/** Number of leading cells that cover `columns` terminal columns. */
function cellsForColumns(
  cells: readonly StyledCell[],
  columns: number,
): number {
  let used = 0;
  let count = 0;
  while (count < cells.length && used + (cells[count]?.width ?? 0) <= columns) {
    used += cells[count]?.width ?? 0;
    count += 1;
  }
  return count;
}

/** End of the row starting at `start`: the last space that fits, or a hard cut. */
function rowEnd(
  cells: readonly StyledCell[],
  start: number,
  available: number,
  minBreak: number,
): number {
  const end = start + cellsForColumns(cells.slice(start), available);
  if (end >= cells.length) return cells.length;
  for (let index = end; index > minBreak; index -= 1)
    if (cells[index]?.text === " ") return index;
  return Math.max(end, start + 1);
}

/**
 * Word-wrap one line to `width` columns. Continuation rows repeat the first
 * `indent` columns (a block border, or a list marker turned into spaces by
 * the caller), so wrapped text stays inside its block. Pure: callers measure
 * grapheme widths, which keeps this free of any terminal library.
 */
export function wrapCells(
  cells: readonly StyledCell[],
  width: number,
  indent = 0,
): StyledCell[][] {
  const total = cells.reduce((sum, cell) => sum + cell.width, 0);
  if (width <= 0 || total <= width) return [[...cells]];
  const hangCount =
    indent > 0 && indent < width ? cellsForColumns(cells, indent) : 0;
  const prefix = hangColumns(cells.slice(0, hangCount));
  const hang = prefix.reduce((sum, cell) => sum + cell.width, 0);
  const rows: StyledCell[][] = [];
  let start = 0;
  while (start < cells.length) {
    const first = rows.length === 0;
    if (!first) while (cells[start]?.text === " ") start += 1;
    if (start >= cells.length) break;
    const end = rowEnd(
      cells,
      start,
      first ? width : width - hang,
      first ? hangCount : start,
    );
    const row = cells.slice(start, end);
    rows.push(first ? row : [...prefix, ...row]);
    start = end;
  }
  return rows;
}

/**
 * The hanging prefix for continuation rows: the block border is repeated,
 * anything after it (padding, list marker) becomes spaces that keep their
 * original style, so a block background continues on wrapped rows.
 */
function hangColumns(prefix: readonly StyledCell[]): StyledCell[] {
  return prefix.map((cell, index) =>
    index === 0
      ? cell
      : { text: " ".repeat(cell.width), width: cell.width, style: cell.style },
  );
}
