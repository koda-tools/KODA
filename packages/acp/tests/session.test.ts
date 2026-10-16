import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { AcpSessionRegistry } from "../src/session/session-manager.js";
import {
  canonicalWorkspaceUri,
  isWithinWorkspace,
} from "../src/session/session.js";

function runtime() {
  return { close: async () => undefined } as never;
}

test("ACP sessions use canonical workspace identity and remain isolated", async () => {
  const registry = new AcpSessionRegistry();
  const first = registry.create("C:/work/project", runtime());
  const second = registry.create("C:/work/other", runtime());

  assert.notEqual(first.id, second.id);
  assert.notEqual(first.workspaceUri, second.workspaceUri);
  assert.equal(first.workspaceUri, canonicalWorkspaceUri("C:/work/project"));
  first.history.push({ role: "user", content: "private" });
  assert.deepEqual(second.history, []);

  await registry.closeAll();
  assert.equal(registry.get(first.id), undefined);
  assert.equal(registry.get(second.id), undefined);
});

test("closing a session aborts its active prompt before closing the runtime", async () => {
  let closed = false;
  const registry = new AcpSessionRegistry();
  const session = registry.create("C:/work/project", {
    close: async () => {
      closed = true;
    },
  } as never);
  const controller = new AbortController();
  session.active = controller;

  await registry.close(session.id);
  assert.equal(controller.signal.aborted, true);
  assert.equal(closed, true);
});

test("workspace boundaries do not accept a sibling or parent", () => {
  const root = resolve("workspace", "project");
  assert.equal(isWithinWorkspace(root, join(root, "src", "file.ts")), true);
  assert.equal(
    isWithinWorkspace(root, resolve(root, "..", "project-two", "secret")),
    false,
  );
  assert.equal(isWithinWorkspace(root, resolve(root, "..")), false);
});
