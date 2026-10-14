import { structuredPatch, type StructuredPatchHunk } from "diff";

export type DiffLineKind = "add" | "remove" | "context";

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly oldLine: number | undefined;
  readonly newLine: number | undefined;
  readonly text: string;
}

export interface DiffHunk {
  readonly lines: readonly DiffLine[];
}

export interface FileDiff {
  readonly filePath: string;
  readonly added: number;
  readonly removed: number;
  readonly hunks: readonly DiffHunk[];
  readonly truncated: boolean;
}

export interface DiffInput {
  readonly filePath: string;
  readonly before: string;
  readonly after: string;
}

const MAX_DIFF_LINES = 200;

function classify(line: string): DiffLineKind {
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "remove";
  return "context";
}

function mapHunk(hunk: StructuredPatchHunk): DiffLine[] {
  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;
  const lines: DiffLine[] = [];
  for (const raw of hunk.lines) {
    if (raw.startsWith("\\")) continue;
    const kind = classify(raw);
    const text = raw.slice(1);
    lines.push({
      kind,
      oldLine: kind === "add" ? undefined : oldLine,
      newLine: kind === "remove" ? undefined : newLine,
      text,
    });
    if (kind !== "add") oldLine += 1;
    if (kind !== "remove") newLine += 1;
  }
  return lines;
}

function truncate(hunks: DiffHunk[]): {
  hunks: DiffHunk[];
  truncated: boolean;
} {
  const total = hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
  if (total <= MAX_DIFF_LINES) return { hunks, truncated: false };
  const kept: DiffHunk[] = [];
  let budget = MAX_DIFF_LINES;
  for (const hunk of hunks) {
    if (budget <= 0) break;
    if (hunk.lines.length <= budget) {
      kept.push(hunk);
      budget -= hunk.lines.length;
      continue;
    }
    kept.push({ lines: hunk.lines.slice(0, budget) });
    budget = 0;
  }
  const shown = kept.reduce((sum, hunk) => sum + hunk.lines.length, 0);
  const last = kept[kept.length - 1];
  if (last !== undefined)
    kept[kept.length - 1] = {
      lines: [...last.lines, omittedLine(total - shown)],
    };
  return { hunks: kept, truncated: true };
}

function omittedLine(count: number): DiffLine {
  return {
    kind: "context",
    oldLine: undefined,
    newLine: undefined,
    text: `... ${count} linhas omitidas`,
  };
}

function countKind(hunks: readonly DiffHunk[], kind: DiffLineKind): number {
  return hunks.reduce(
    (total, hunk) =>
      total + hunk.lines.filter((line) => line.kind === kind).length,
    0,
  );
}

export function computeFileDiff(input: DiffInput): FileDiff {
  const patch = structuredPatch(
    input.filePath,
    input.filePath,
    input.before,
    input.after,
    undefined,
    undefined,
  );
  const mapped: DiffHunk[] = patch.hunks.map((hunk) => ({
    lines: mapHunk(hunk),
  }));
  const { hunks, truncated } = truncate(mapped);
  return {
    filePath: input.filePath,
    added: countKind(mapped, "add"),
    removed: countKind(mapped, "remove"),
    hunks,
    truncated,
  };
}
