import { sanitize, sanitizeStyled } from "../shared/sanitize.js";
import type { InteractiveIO } from "../shared/types.js";

/** Access to one session's transcript buffer and whether it is on screen. */
interface BufferAccess {
  readonly isActive: () => boolean;
  readonly read: () => readonly string[];
  readonly store: (lines: string[]) => void;
}

/** Append `text`, continuing the last partial line (as the screen does). */
function append(lines: readonly string[], text: string): string[] {
  const [first = "", ...rest] = text.replace(/\r/g, "").split("\n");
  const next = lines.length === 0 ? [""] : [...lines];
  const last = next.length - 1;
  next[last] = `${next[last] ?? ""}${first}`;
  return [...next, ...rest];
}

/**
 * An `InteractiveIO` for one session. Output reaches the screen only while
 * the session is active; otherwise it lands in the session's own buffer,
 * sanitized the same way the screen would. Approvals, widgets and input are
 * shared, so a background subagent still asks the user before writing.
 */
export function createSessionIO(
  io: InteractiveIO,
  buffer: BufferAccess,
): InteractiveIO {
  const toBuffer = (text: string): void =>
    buffer.store(append(buffer.read(), text));
  const { writeStyled, setLiveLine, setHeader, clearTranscript } = io;
  return {
    ...io,
    write: (text) => {
      if (buffer.isActive()) io.write(text);
      else toBuffer(sanitize(text));
    },
    ...(writeStyled === undefined
      ? {}
      : {
          writeStyled: (text: string) => {
            if (buffer.isActive()) writeStyled(text);
            else toBuffer(sanitizeStyled(text));
          },
        }),
    ...(setLiveLine === undefined
      ? {}
      : {
          setLiveLine: (text: string) => {
            if (buffer.isActive()) return setLiveLine(text);
            const lines = [...buffer.read()];
            lines[Math.max(0, lines.length - 1)] = sanitizeStyled(text).replace(
              /\n/g,
              "",
            );
            buffer.store(lines);
          },
        }),
    ...(setHeader === undefined
      ? {}
      : {
          setHeader: (text: string) => {
            if (buffer.isActive()) setHeader(text);
          },
        }),
    ...(clearTranscript === undefined
      ? {}
      : {
          clearTranscript: () => {
            if (buffer.isActive()) clearTranscript();
            else buffer.store([""]);
          },
        }),
  };
}
