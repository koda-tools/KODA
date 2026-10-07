import {
  CLEAR_TO_LINE_END,
  DIM,
  FOOTER_ROWS,
  HEADER_RESERVED_ROWS,
  HIDE_CURSOR,
  MIN_VIEWPORT_ROWS,
  PROMPT_RESERVED_COLUMNS,
  RADIO_OFF,
  RADIO_ON,
  RESET,
  REVERSE,
  SCROLLBAR_THUMB,
  SCROLLBAR_TRACK,
  SCROLL_HINT,
  SEPARATOR_CHAR,
  SHOW_CURSOR,
  moveTo,
} from "./constants.js";
import type { LineEditor } from "./line-editor.js";
import { fit } from "./text-buffer.js";

export interface SelectionView {
  readonly options: readonly string[];
  readonly index: number;
  readonly hint?: string;
}

export interface FrameInput {
  readonly columns: number;
  readonly rows: number;
  readonly headerLines: readonly string[];
  readonly wrapped: readonly string[];
  readonly following: boolean;
  readonly scrollTop: number;
  readonly status: string | undefined;
  readonly prompt: string;
  readonly editor: LineEditor;
  readonly inputActive: boolean;
  readonly selection?: SelectionView;
}

function footerRows(input: FrameInput): number {
  if (input.selection === undefined) return FOOTER_ROWS;
  const hintRows = input.selection.hint === undefined ? 0 : 1;
  return 1 + input.selection.options.length + hintRows;
}

export interface Frame {
  readonly output: string;
  readonly top: number;
  readonly maxTop: number;
  readonly viewport: number;
}

interface Geometry {
  readonly header: readonly string[];
  readonly viewport: number;
  readonly top: number;
  readonly maxTop: number;
}

function computeGeometry(input: FrameInput): Geometry {
  const header = input.headerLines.slice(
    0,
    Math.max(0, input.rows - HEADER_RESERVED_ROWS),
  );
  const viewport = Math.max(
    MIN_VIEWPORT_ROWS,
    input.rows - header.length - footerRows(input),
  );
  const maxTop = Math.max(0, input.wrapped.length - viewport);
  const top = input.following ? maxTop : Math.min(input.scrollTop, maxTop);
  return { header, viewport, top, maxTop };
}

function renderHeaderRows(header: readonly string[], columns: number): string {
  return header
    .map(
      (line, index) =>
        `${moveTo(index + 1, 1)}${fit(line, columns)}${CLEAR_TO_LINE_END}`,
    )
    .join("");
}

function renderViewportRows(input: FrameInput, geometry: Geometry): string {
  const { wrapped, columns } = input;
  const { header, viewport, top } = geometry;
  const overflow = wrapped.length > viewport;
  const thumb = overflow
    ? Math.max(1, Math.floor((viewport * viewport) / wrapped.length))
    : 0;
  const thumbTop =
    overflow && geometry.maxTop > 0
      ? Math.round((top / geometry.maxTop) * (viewport - thumb))
      : 0;
  let out = "";
  for (let i = 0; i < viewport; i += 1) {
    const row = header.length + i + 1;
    out += `${moveTo(row, 1)}${wrapped[top + i] ?? ""}${CLEAR_TO_LINE_END}`;
    if (!overflow) continue;
    const inThumb = i >= thumbTop && i < thumbTop + thumb;
    out += `${moveTo(row, columns)}${DIM}${inThumb ? SCROLLBAR_THUMB : SCROLLBAR_TRACK}${RESET}`;
  }
  return out;
}

function separatorLabel(input: FrameInput): string {
  if (input.status !== undefined) return ` ${input.status} `;
  return input.following ? "" : SCROLL_HINT;
}

function renderSeparator(input: FrameInput, row: number): string {
  const line = fit(
    `${SEPARATOR_CHAR}${SEPARATOR_CHAR}${separatorLabel(input)}${SEPARATOR_CHAR.repeat(input.columns)}`,
    input.columns,
  );
  return `${moveTo(row, 1)}${DIM}${line}${RESET}`;
}

function renderInputRow(input: FrameInput, row: number): string {
  const prompt = fit(
    input.prompt,
    Math.max(0, input.columns - PROMPT_RESERVED_COLUMNS),
  );
  const promptLength = Array.from(prompt).length;
  const window = input.editor.visibleWindow(input.columns - promptLength - 1);
  return (
    `${moveTo(row, 1)}${prompt}${window.text}${CLEAR_TO_LINE_END}` +
    moveTo(row, promptLength + window.cursorOffset + 1) +
    (input.inputActive ? SHOW_CURSOR : "")
  );
}

function renderSelection(
  selection: SelectionView,
  columns: number,
  firstRow: number,
): string {
  let out = "";
  selection.options.forEach((option, index) => {
    const active = index === selection.index;
    const radio = active ? RADIO_ON : RADIO_OFF;
    const style = active ? REVERSE : DIM;
    const label = fit(`  ${radio} ${option}`, columns);
    out += `${moveTo(firstRow + index, 1)}${style}${label}${RESET}${CLEAR_TO_LINE_END}`;
  });
  if (selection.hint !== undefined) {
    const hintRow = firstRow + selection.options.length;
    out += `${moveTo(hintRow, 1)}${DIM}${fit(`  ${selection.hint}`, columns)}${RESET}${CLEAR_TO_LINE_END}`;
  }
  return out;
}

function renderFooter(input: FrameInput, separatorRow: number): string {
  if (input.selection === undefined)
    return renderInputRow(input, separatorRow + 1);
  return renderSelection(input.selection, input.columns, separatorRow + 1);
}

export function composeFrame(input: FrameInput): Frame {
  const geometry = computeGeometry(input);
  const separatorRow = geometry.header.length + geometry.viewport + 1;
  const output =
    HIDE_CURSOR +
    renderHeaderRows(geometry.header, input.columns) +
    renderViewportRows(input, geometry) +
    renderSeparator(input, separatorRow) +
    renderFooter(input, separatorRow);
  return {
    output,
    top: geometry.top,
    maxTop: geometry.maxTop,
    viewport: geometry.viewport,
  };
}
