import assert from "node:assert/strict";
import { test } from "node:test";
import { describeFailure } from "../src/providers/index.js";

// Request and response mapping is covered end to end, over HTTP, by
// test/provider-wire.test.ts.

test("describes provider failures with status hints and no secrets", () => {
  assert.equal(
    describeFailure({ status: 401 }),
    " (HTTP 401: invalid or revoked API key)",
  );
  assert.equal(
    describeFailure({ status: 429 }),
    " (HTTP 429: rate limit or insufficient quota)",
  );
  assert.equal(
    describeFailure({ status: 500 }),
    " (HTTP 500: request rejected)",
  );
  assert.match(describeFailure({ connection: true }), /connection error/);
  assert.equal(describeFailure({}), "");
});
