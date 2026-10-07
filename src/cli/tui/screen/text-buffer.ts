import { MAX_LINES, RESET, TAB_WIDTH } from "./constants.js";

const CSI_SEQUENCE = /\x1b\[[0-9;?<>=]*[ -/]*[@-~]/g;
const SGR_SEQUENCE = /^\x1b\[[0-9;]*m$/;
const STRAY_ESCAPE = /\x1b(?!\[[0-9;]*m)/g;
const CONTROL_CHARS = /[\x00-\x09\x0b-\x1f\x7f]/g;
const CONTROL_CHARS_KEEPING_ESCAPE = /[\x00-\x09\x0b-\x1a\x1c-\x1f\x7f]/g;
const STYLED_TOKEN = /\x1b\[[0-9;]*m|[\s\S]/gu;
const RESET_SEQUENCES = new Set(["\x1b[0m", "\x1b[m"]);

export function sanitize(text: string): string {
  return text
    .replace(CSI_SEQUENCE, "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ".repeat(TAB_WIDTH))
    .replace(CONTROL_CHARS, "");
}

export function sanitizeStyled(text: string): string {
  return text
    .replace(CSI_SEQUENCE, (sequence) =>
      SGR_SEQUENCE.test(sequence) ? sequence : "",
    )
    .replace(STRAY_ESCAPE, "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ".repeat(TAB_WIDTH))
    .replace(CONTROL_CHARS_KEEPING_ESCAPE, "");
}

export function fit(text: string, width: number): string {
  return Array.from(text).slice(0, Math.max(0, width)).join("");
}

function wrapPlain(line: string, size: number): string[] {
  const chars = Array.from(line);
  if (chars.length === 0) return [""];
  const rows: string[] = [];
  for (let start = 0; start < chars.length; start += size)
    rows.push(chars.slice(start, start + size).join(""));
  return rows;
}

function wrapStyled(line: string, size: number): string[] {
  const rows: string[] = [];
  let current = "";
  let visible = 0;
  let active = "";
  for (const [token = ""] of line.matchAll(STYLED_TOKEN)) {
    if (token.startsWith("\x1b")) {
      current += token;
      active = RESET_SEQUENCES.has(token) ? "" : active + token;
      continue;
    }
    if (visible === size) {
      rows.push(`${current}${RESET}`);
      current = active;
      visible = 0;
    }
    current += token;
    visible += 1;
  }
  rows.push(current);
  return rows;
}

export class TextBuffer {
  private lines: string[] = [""];

  public get endsWithPartialLine(): boolean {
    return (this.lines[this.lines.length - 1] ?? "") !== "";
  }

  public clear(): void {
    this.lines = [""];
  }

  public append(text: string, styled = false): void {
    const clean = styled ? sanitizeStyled(text) : sanitize(text);
    const [first = "", ...rest] = clean.split("\n");
    this.lines[this.lines.length - 1] += first;
    this.lines.push(...rest);
    if (this.lines.length > MAX_LINES)
      this.lines.splice(0, this.lines.length - MAX_LINES);
  }

  public wrap(width: number): string[] {
    const size = Math.max(1, width);
    return this.lines.flatMap((line) =>
      line.includes("\x1b") ? wrapStyled(line, size) : wrapPlain(line, size),
    );
  }
}
