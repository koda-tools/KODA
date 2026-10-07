export const ENTER_SCREEN = "\x1b[?1049h\x1b[?1000h\x1b[?1006h";
export const LEAVE_SCREEN = "\x1b[?1006l\x1b[?1000l\x1b[?25h\x1b[?1049l";
export const HIDE_CURSOR = "\x1b[?25l";
export const SHOW_CURSOR = "\x1b[?25h";
export const CLEAR_TO_LINE_END = "\x1b[K";
export const DIM = "\x1b[2m";
export const RESET = "\x1b[0m";

export const SCROLLBAR_THUMB = "█";
export const SCROLLBAR_TRACK = "│";
export const SEPARATOR_CHAR = "─";
export const SCROLL_HINT = " scroll: PgUp/PgDn ";
export const RADIO_ON = "◉";
export const RADIO_OFF = "○";
export const REVERSE = "\x1b[7m";

export const MAX_LINES = 5_000;
export const FOOTER_ROWS = 2;
export const WHEEL_LINES = 3;
export const RENDER_DELAY_MS = 16;
export const DEFAULT_COLUMNS = 80;
export const DEFAULT_ROWS = 24;
export const MIN_COLUMNS = 10;
export const MIN_ROWS = 6;
export const MIN_VIEWPORT_ROWS = 1;
export const HEADER_RESERVED_ROWS = 5;
export const PROMPT_RESERVED_COLUMNS = 6;
export const TAB_WIDTH = 4;

export function moveTo(row: number, column: number): string {
  return `\x1b[${row};${column}H`;
}
