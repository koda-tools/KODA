import type { FileDiff } from "../../../utils/diff.js";
import { sanitize } from "../shared/sanitize.js";
import type { DiffViewLine } from "../shared/types.js";

/** Flatten a `FileDiff` into the line shape the DiffView widget renders. */
export function toDiffViewLines(diff: FileDiff): readonly DiffViewLine[] {
  return diff.hunks.flatMap((hunk) =>
    hunk.lines.map((line) => {
      const lineNo = line.kind === "remove" ? line.oldLine : line.newLine;
      return {
        kind: line.kind,
        content: sanitize(line.text),
        ...(lineNo === undefined ? {} : { lineNo }),
      };
    }),
  );
}
