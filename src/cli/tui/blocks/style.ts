import { BOLD, RESET, bgRgb, rgb } from "../shared/ansi.js";
import type { BlockLine, BlockVariant } from "./types.js";

/**
 * Left border of every block. Terminals draw in cells, so "5px" maps to the
 * closest glyph: a left half block is about half a cell wide (~4-5px at
 * common font sizes), thicker than box-drawing lines like `┃`.
 */
export const BLOCK_BORDER = "▌";
/** Space between the border and the content. */
const PADDING = " ";

/** Border colors (GitHub-dark palette, matching the Shiki theme). */
const BORDER_COLOR: Readonly<Record<BlockVariant, string>> = {
  user: rgb(51, 227, 250), // cyan
  assistant: rgb(63, 185, 80), // green
  code: rgb(88, 166, 255), // blue
};

/**
 * Dark gray fill behind each block, set per variant so text and code can
 * diverge later. The transcript extends it to the full row width.
 */
const BACKGROUND: Readonly<Record<BlockVariant, string>> = {
  user: bgRgb(40, 44, 52),
  assistant: bgRgb(40, 44, 52),
  code: bgRgb(40, 44, 52),
};

/** Keep the block background on after every reset inside the content. */
function onBackground(ansi: string, background: string): string {
  return `${background}${ansi.replaceAll(RESET, `${RESET}${background}`)}`;
}

/** A block line: colored border, padding, then the content, on the fill. */
export function blockLine(
  variant: BlockVariant,
  plain: string,
  ansi: string = plain,
): BlockLine {
  const background = BACKGROUND[variant];
  const border = onBackground(
    `${BORDER_COLOR[variant]}${BLOCK_BORDER}${RESET}`,
    background,
  );
  if (plain === "") return { plain: BLOCK_BORDER, ansi: `${border}${RESET}` };
  return {
    plain: `${BLOCK_BORDER}${PADDING}${plain}`,
    ansi: `${border}${PADDING}${onBackground(ansi, background)}${RESET}`,
  };
}

/** The `TEXT · KODA` / `CODE · file.ts` label at the top of a block. */
export function headerLine(variant: BlockVariant, label: string): BlockLine {
  return blockLine(variant, label, `${BOLD}${BORDER_COLOR[variant]}${label}`);
}

/** Line separating two blocks (no fill, so blocks stay visually apart). */
export const BLOCK_SEPARATOR: BlockLine = { plain: "", ansi: "" };

const HANGING = new RegExp(
  `^${BLOCK_BORDER}${PADDING}( *(?:[•]|\\d{1,9}[.)]) )?`,
);

/**
 * Columns that wrapped continuation rows should repeat or skip, so a long
 * line keeps its border (and list items stay aligned under their text).
 * Works on the visible text of a transcript line; 0 for non-block lines.
 */
export function blockIndent(visible: string): number {
  return HANGING.exec(visible)?.[0].length ?? 0;
}

/** Whether a transcript line belongs to a block (its fill spans the row). */
export function isBlockLine(visible: string): boolean {
  return visible.startsWith(BLOCK_BORDER);
}
