const CSI_SEQUENCE = /\x1b\[[0-9;?<>=]*[ -/]*[@-~]/g;
const SGR_SEQUENCE = /^\x1b\[[0-9;]*m$/;
const STRAY_ESCAPE = /\x1b(?!\[[0-9;]*m)/g;
const CONTROL_CHARS = /[\x00-\x09\x0b-\x1f\x7f]/g;
const CONTROL_CHARS_KEEPING_ESCAPE = /[\x00-\x09\x0b-\x1a\x1c-\x1f\x7f]/g;
const TAB_WIDTH = 2;

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
