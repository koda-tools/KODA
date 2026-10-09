import { statusLine } from "../blocks/text-block.js";
import type { InteractiveIO, LineWriter } from "../shared/types.js";

/** Write tool/approval status text as bordered block lines, one per line. */
export function writeStatus(writer: LineWriter, text: string): void {
  writer.ensureNewLine();
  for (const line of text.replace(/\n+$/, "").split("\n"))
    writer.writeSegment({ kind: "line", ...statusLine(line) });
}

/**
 * Writes segments to `io`, tracking whether the cursor is at a line start
 * and whether the last line is a live (streaming) preview that the next
 * finished line must replace instead of append to.
 */
export function createLineWriter(io: InteractiveIO): LineWriter {
  let atLineStart = true;
  let livePreview = false;

  const write = (text: string): void => {
    io.write(text);
    atLineStart = text.endsWith("\n");
    livePreview = false;
  };

  const writeStyled = (plain: string, ansi: string): void => {
    if (io.writeStyled === undefined) return write(plain);
    io.writeStyled(ansi);
    atLineStart = ansi.endsWith("\n");
    livePreview = false;
  };

  const showLive = (ansi: string): void => {
    const setLiveLine = io.setLiveLine;
    if (setLiveLine === undefined) return;
    if (!livePreview && !atLineStart) write("\n");
    setLiveLine(ansi);
    livePreview = true;
    atLineStart = false;
  };

  const finishLine = (plain: string, ansi: string): void => {
    if (livePreview && io.setLiveLine !== undefined) {
      io.setLiveLine(ansi);
      write("\n");
      return;
    }
    writeStyled(`${plain}\n`, `${ansi}\n`);
  };

  return {
    ensureNewLine: () => {
      if (!atLineStart) write("\n");
    },
    write,
    writeSegment: (segment) => {
      switch (segment.kind) {
        case "text":
          return write(segment.text);
        case "code":
          return writeStyled(segment.plain, segment.ansi);
        case "live":
          return showLive(segment.ansi);
        case "line":
          return finishLine(segment.plain, segment.ansi);
      }
    },
  };
}
