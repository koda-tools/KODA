import type { DiffLine, FileDiff } from "../../utils/diff.js";
import type { BundledLanguage } from "shiki";
import type { CodeHighlighter } from "./highlight.js";
import type { Segment } from "./markdown-stream.js";
import { sanitize } from "./sanitize.js";

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const ADD_BG = "\x1b[48;2;20;60;30m";
const REMOVE_BG = "\x1b[48;2;70;25;30m";
const GUTTER_WIDTH = 4;

const PREFIX: Readonly<Record<DiffLine["kind"], string>> = {
  add: "+",
  remove: "-",
  context: " ",
};
const BACKGROUND: Readonly<Record<DiffLine["kind"], string>> = {
  add: ADD_BG,
  remove: REMOVE_BG,
  context: "",
};

function cell(value: number | undefined): string {
  return (value === undefined ? "" : String(value)).padStart(GUTTER_WIDTH);
}

function gutter(line: DiffLine): string {
  return `${cell(line.oldLine)} ${cell(line.newLine)} `;
}

function header(diff: FileDiff): Segment {
  const text = `${diff.filePath}  +${diff.added} -${diff.removed}`;
  return { kind: "code", plain: `${text}\n`, ansi: `${DIM}${text}${RESET}\n` };
}

function body(
  code: string,
  language: BundledLanguage | undefined,
  highlighter: CodeHighlighter | undefined,
): string {
  if (highlighter === undefined || language === undefined) return code;
  try {
    return highlighter.highlightLine(code, language, undefined).ansi;
  } catch {
    return code;
  }
}

function lineSegment(
  line: DiffLine,
  language: BundledLanguage | undefined,
  highlighter: CodeHighlighter | undefined,
): Segment {
  const code = sanitize(line.text);
  const prefix = PREFIX[line.kind];
  const margin = gutter(line);
  const background = BACKGROUND[line.kind];
  return {
    kind: "code",
    plain: `${prefix}${margin}${code}\n`,
    ansi: `${background}${DIM}${prefix}${margin}${RESET}${background}${body(code, language, highlighter)}${RESET}\n`,
  };
}

export function diffSegments(
  diff: FileDiff,
  language: BundledLanguage | undefined,
  highlighter: CodeHighlighter | undefined,
): Segment[] {
  const segments: Segment[] = [header(diff)];
  diff.hunks.forEach((hunk, index) => {
    if (index > 0)
      segments.push({ kind: "code", plain: "\n", ansi: `${DIM}~${RESET}\n` });
    for (const line of hunk.lines)
      segments.push(lineSegment(line, language, highlighter));
  });
  return segments;
}

/**
 * Convert the KODA-native `FileDiff` model into the plain line shape
 * expected by the official `@termuijs/widgets` `DiffView` component
 * (`src/cli/tui/io.ts`'s `DiffViewLine`), so the TermUI runtime can render
 * the diff with the real widget instead of hand-drawn ANSI text.
 */
export interface PlainDiffLine {
  readonly kind: DiffLine["kind"];
  readonly content: string;
  readonly lineNo?: number;
}

export function toDiffViewLines(diff: FileDiff): readonly PlainDiffLine[] {
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
