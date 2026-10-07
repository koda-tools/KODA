import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKeys } from "../src/cli/tui/screen/key-parser.js";

test("parses printable text, control keys, and unicode symbols", () => {
  assert.deepEqual(parseKeys("a❯\r\x7f\x03\x04"), [
    { text: "a" },
    { text: "❯" },
    { name: "enter" },
    { name: "backspace" },
    { name: "cancel" },
    { name: "eof" },
  ]);
});

test("parses CSI, SS3, tilde, and mouse-wheel escapes", () => {
  assert.deepEqual(parseKeys("\x1b[A\x1bOH\x1b[3~\x1b[5~\x1b[6~"), [
    { name: "up" },
    { name: "home" },
    { name: "delete" },
    { name: "pageup" },
    { name: "pagedown" },
  ]);
  assert.deepEqual(parseKeys("\x1b[<64;3;4M\x1b[<65;3;4M\x1b[<0;3;4m"), [
    { name: "wheelup" },
    { name: "wheeldown" },
  ]);
});

test("ignores unknown escapes without swallowing later input", () => {
  assert.deepEqual(parseKeys("\x1b[99Zx\x1bq"), [{ text: "x" }, { text: "q" }]);
});

test("maps ctrl+l to the clear key", () => {
  assert.deepEqual(parseKeys("\x0c"), [{ name: "clear" }]);
});
