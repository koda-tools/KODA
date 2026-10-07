import assert from "node:assert/strict";
import { test } from "node:test";
import { isLikelyBinary } from "../src/utils/binary.js";

test("treats UTF-8 text as text", () => {
  assert.equal(isLikelyBinary(Buffer.from("const a = 1;\n")), false);
  assert.equal(isLikelyBinary(Buffer.from("acentuação e emoji ✓\n")), false);
  assert.equal(isLikelyBinary(Buffer.from("tab\tand\r\nnewlines\n")), false);
});

test("an empty buffer is not binary", () => {
  assert.equal(isLikelyBinary(Buffer.alloc(0)), false);
});

test("a NUL byte in the sample marks the file binary", () => {
  assert.equal(isLikelyBinary(Buffer.from([0x61, 0x00, 0x62])), true);
});

test("PNG and control-byte heavy buffers are binary", () => {
  // Signature plus the start of the IHDR chunk, which carries NUL bytes.
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
  ]);
  assert.equal(isLikelyBinary(png), true);
  assert.equal(isLikelyBinary(Buffer.from([0x01, 0x02, 0x03, 0x04, 0x61])), true);
});

test("only the first 8 KB are sampled", () => {
  const buffer = Buffer.concat([
    Buffer.alloc(8 * 1024, 0x61),
    Buffer.from([0x00]),
  ]);
  assert.equal(isLikelyBinary(buffer), false);
});
