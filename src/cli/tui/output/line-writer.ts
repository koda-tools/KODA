import type { InteractiveIO, LineWriter } from "../shared/types.js";

/** Writes segments to `io`, tracking whether the cursor is at a line start. */
export function createLineWriter(io: InteractiveIO): LineWriter {
  let atLineStart = true;
  const write = (text: string): void => {
    io.write(text);
    atLineStart = text.endsWith("\n");
  };
  return {
    ensureNewLine: () => {
      if (!atLineStart) write("\n");
    },
    write,
    writeSegment: (segment) => {
      if (segment.kind === "text") return write(segment.text);
      if (io.writeStyled === undefined) return write(segment.plain);
      io.writeStyled(segment.ansi);
      atLineStart = true;
    },
  };
}
