const CSI_SEQUENCE = /\x1b\[[0-9;?<>=]*[ -/]*[@-~]/g;
const SGR_SEQUENCE = /^\x1b\[[0-9;]*m$/;
const STRAY_ESCAPE = /\x1b(?!\[[0-9;]*m)/g;
const CONTROL_CHARS = /[\x00-\x09\x0b-\x1f\x7f]/g;
const CONTROL_CHARS_KEEPING_ESCAPE = /[\x00-\x09\x0b-\x1a\x1c-\x1f\x7f]/g;
const TAB = "  ";

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\t/g, TAB);
}

/** Untrusted text: remove every escape and control character. */
export function sanitize(text: string): string {
  return normalizeWhitespace(text.replace(CSI_SEQUENCE, "")).replace(
    CONTROL_CHARS,
    "",
  );
}

/** Trusted styled text: keep SGR color codes, drop everything else. */
export function sanitizeStyled(text: string): string {
  const sgrOnly = text
    .replace(CSI_SEQUENCE, (sequence) =>
      SGR_SEQUENCE.test(sequence) ? sequence : "",
    )
    .replace(STRAY_ESCAPE, "");
  return normalizeWhitespace(sgrOnly).replace(CONTROL_CHARS_KEEPING_ESCAPE, "");
}
