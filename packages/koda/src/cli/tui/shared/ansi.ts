export const DIM = "\x1b[2m";
export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const ITALIC = "\x1b[3m";
export const UNDERLINE = "\x1b[4m";

/** Truecolor foreground SGR (the transcript parser maps it to a cell color). */
export function rgb(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

/** Truecolor background SGR. */
export function bgRgb(r: number, g: number, b: number): string {
  return `\x1b[48;2;${r};${g};${b}m`;
}
