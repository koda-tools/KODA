import { DiffView } from "@termuijs/widgets";
import type { DiffViewLine } from "../shared/types.js";
import { LAYOUT } from "./constants.js";

/** TermUI `DiffView` shown while a write waits for approval. */
export class DiffPanel {
  public readonly widget = new DiffView(
    { lines: [], showLineNumbers: true },
    { height: 0, border: "single" },
  );

  public show(lines: readonly DiffViewLine[]): void {
    this.widget.setLines(
      lines.map((line) => ({
        type: line.kind,
        content: line.content,
        ...(line.lineNo === undefined ? {} : { lineNo: line.lineNo }),
      })),
    );
    this.widget.setStyle({ height: LAYOUT.diffExpandedHeight });
  }

  public hide(): void {
    this.widget.setLines([]);
    this.widget.setStyle({ height: 0 });
  }
}
