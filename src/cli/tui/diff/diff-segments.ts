import type { BundledLanguage } from "shiki";
import type { DiffLine, FileDiff } from "../../../utils/diff.js";
import type { CodeHighlighter } from "../highlight/types.js";
import { DIM, RESET } from "../shared/ansi.js";
import { sanitize } from "../shared/sanitize.js";
import type { Segment } from "../shared/types.js";

const GUTTER_WIDTH = 4;
const PREFIX: Readonly<Record<DiffLine["kind"], string>> = {
  add: "+",
  remove: "-",
  context: " ",
};
const BACKGROUND: Readonly<Record<DiffLine["kind"], string>> = {
  add: "\x1b[48;2;20;60;30m",
  remove: "\x1b[48;2;70;25;30m",
  context: "",
};
const HUNK_SEPARATOR: Segment = {
  kind: "code",
  plain: "\n",
  ansi: `${DIM}~${RESET}\n`,
};

function cell(value: number | undefined): string {
  return (value === undefined ? "" : String(value)).padStart(GUTTER_WIDTH);
}

function header(diff: FileDiff): Segment {
  const text = `${diff.filePath}  +${diff.added} -${diff.removed}`;
  return { kind: "code", plain: `${text}\n`, ansi: `${DIM}${text}${RESET}\n` };
}

function highlight(
  code: string,
  language: BundledLanguage | undefined,
  highlighter: CodeHighlighter | undefined,
): string {
  if (highlighter === undefined || language === undefined) return code;
  try {
    return highlighter.highlightLine(code, language).ansi;
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
  const margin = `${PREFIX[line.kind]}${cell(line.oldLine)} ${cell(line.newLine)} `;
  const background = BACKGROUND[line.kind];
  const body = highlight(code, language, highlighter);
  return {
    kind: "code",
    plain: `${margin}${code}\n`,
    ansi: `${background}${DIM}${margin}${RESET}${background}${body}${RESET}\n`,
  };
}

/** Text rendering of a diff, for terminals without the DiffView widget. */
export function diffSegments(
  diff: FileDiff,
  language: BundledLanguage | undefined,
  highlighter: CodeHighlighter | undefined,
): Segment[] {
  return [
    header(diff),
    ...diff.hunks.flatMap((hunk, index) => [
      ...(index > 0 ? [HUNK_SEPARATOR] : []),
      ...hunk.lines.map((line) => lineSegment(line, language, highlighter)),
    ]),
  ];
}
