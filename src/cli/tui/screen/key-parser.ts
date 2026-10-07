export type KeyName =
  | "up"
  | "down"
  | "left"
  | "right"
  | "home"
  | "end"
  | "delete"
  | "backspace"
  | "pageup"
  | "pagedown"
  | "wheelup"
  | "wheeldown"
  | "enter"
  | "clear-line"
  | "kill-line"
  | "cancel"
  | "eof"
  | "clear";

export type Key = { readonly name: KeyName } | { readonly text: string };

const ESCAPE = "\x1b";
const CSI_PATTERN = /^\x1b\[([0-9;<]*)([A-Za-z~])/;
const SS3_INTRODUCER = "O";
const SS3_LENGTH = 3;
const MOUSE_PREFIX = "<";
const WHEEL_UP_BUTTON = 64;
const WHEEL_DOWN_BUTTON = 65;
const FIRST_PRINTABLE_CODE = 32;

const CURSOR_KEYS: Readonly<Record<string, KeyName>> = {
  A: "up",
  B: "down",
  C: "right",
  D: "left",
  H: "home",
  F: "end",
};

const TILDE_KEYS: Readonly<Record<string, KeyName>> = {
  "1": "home",
  "7": "home",
  "4": "end",
  "8": "end",
  "3": "delete",
  "5": "pageup",
  "6": "pagedown",
};

const CONTROL_KEYS: Readonly<Record<number, KeyName>> = {
  1: "home",
  3: "cancel",
  4: "eof",
  5: "end",
  8: "backspace",
  10: "enter",
  11: "kill-line",
  12: "clear",
  13: "enter",
  21: "clear-line",
  127: "backspace",
};

function mouseKey(params: string, final: string): Key | undefined {
  if (final !== "M") return undefined;
  const button = Number(params.slice(1).split(";")[0]);
  if (button === WHEEL_UP_BUTTON) return { name: "wheelup" };
  if (button === WHEEL_DOWN_BUTTON) return { name: "wheeldown" };
  return undefined;
}

function csiKey(params: string, final: string): Key | undefined {
  if ((final === "M" || final === "m") && params.startsWith(MOUSE_PREFIX))
    return mouseKey(params, final);
  const name = final === "~" ? TILDE_KEYS[params] : CURSOR_KEYS[final];
  return name === undefined ? undefined : { name };
}

function readEscape(chunk: string, start: number, keys: Key[]): number {
  const csi = CSI_PATTERN.exec(chunk.slice(start));
  if (csi !== null) {
    const key = csiKey(csi[1] ?? "", csi[2] ?? "");
    if (key !== undefined) keys.push(key);
    return csi[0].length;
  }
  if (chunk.charAt(start + 1) === SS3_INTRODUCER) {
    const name = CURSOR_KEYS[chunk.charAt(start + 2)];
    if (name !== undefined) keys.push({ name });
    return SS3_LENGTH;
  }
  return 1;
}

export function parseKeys(chunk: string): Key[] {
  const keys: Key[] = [];
  let index = 0;
  while (index < chunk.length) {
    if (chunk.charAt(index) === ESCAPE) {
      index += readEscape(chunk, index, keys);
      continue;
    }
    const code = chunk.codePointAt(index) ?? 0;
    const symbol = String.fromCodePoint(code);
    index += symbol.length;
    const name = CONTROL_KEYS[code];
    if (name !== undefined) keys.push({ name });
    else if (code >= FIRST_PRINTABLE_CODE) keys.push({ text: symbol });
  }
  return keys;
}
