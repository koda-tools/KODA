import assert from "node:assert/strict";
import { test } from "node:test";
import { runCommandTool } from "../src/index.js";
import type { CommandPolicy } from "../src/index.js";
import { withWorkspace } from "./helpers/workspace.js";

// `node` from PATH, not an absolute path: cmd.exe mishandles a quoted
// executable that contains spaces (e.g. "C:\Program Files\nodejs\node.exe").
const node = "node";

function policy(over: Partial<CommandPolicy> = {}): CommandPolicy {
  return { confirm: async () => true, ...over };
}

test("runs a command and reports success with output", async () => {
  await withWorkspace({}, async (root) => {
    const result = await runCommandTool(
      { command: `${node} -e console.log(1)` },
      { workspaceRoot: root, policy: policy() },
    );
    assert.equal(result.ok, true);
    assert.match(result.content, /^\$ /m);
    assert.match(result.content, /^1$/m);
    assert.match(result.content, /exit 0/);
  });
});

test("a non-zero exit fails but keeps the output", async () => {
  await withWorkspace({}, async (root) => {
    const result = await runCommandTool(
      { command: `${node} -e process.exit(3)` },
      { workspaceRoot: root, policy: policy() },
    );
    assert.equal(result.ok, false);
    assert.match(result.content, /exit 3/);
  });
});

test("deny refuses before running", async () => {
  await withWorkspace({}, async (root) => {
    await assert.rejects(
      runCommandTool(
        { command: "sudo rm -rf /" },
        { workspaceRoot: root, policy: policy() },
      ),
      /Command denied: privilege escalation/,
    );
  });
});

test("a refused confirmation prevents execution", async () => {
  await withWorkspace({}, async (root) => {
    let confirmed = false;
    await assert.rejects(
      runCommandTool(
        { command: `${node} -e process.exit(0)` },
        {
          workspaceRoot: root,
          policy: policy({
            confirm: async () => {
              confirmed = true;
              return false;
            },
          }),
        },
      ),
      /Command denied by user/,
    );
    assert.equal(confirmed, true);
  });
});

test("the allowlist skips confirmation", async () => {
  await withWorkspace({}, async (root) => {
    let asked = false;
    const result = await runCommandTool(
      { command: `${node} -e console.log(1)` },
      {
        workspaceRoot: root,
        policy: policy({
          allowlist: [`${node} -e`],
          confirm: async () => {
            asked = true;
            return true;
          },
        }),
      },
    );
    assert.equal(asked, false);
    assert.equal(result.ok, true);
  });
});

test("a cwd outside the workspace is rejected", async () => {
  await withWorkspace({ "a.txt": "x" }, async (root) => {
    await assert.rejects(
      runCommandTool(
        { command: `${node} -e 0`, cwd: "../.." },
        { workspaceRoot: root, policy: policy() },
      ),
      /outside the project root|relative project paths/,
    );
  });
});

// Avoids shell quoting of `=>` / braces by living in a file.
const sleepScript = "setInterval(() => {}, 1000);";

test("a timeout stops the command and reports it", async () => {
  await withWorkspace({ "sleep.js": sleepScript }, async (root) => {
    const result = await runCommandTool(
      { command: `${node} sleep.js`, timeoutMs: 300 },
      { workspaceRoot: root, policy: policy() },
    );
    assert.equal(result.ok, false);
    assert.match(result.content, /timed out/);
  });
});

test("an aborted signal cancels the command", async () => {
  await withWorkspace({ "sleep.js": sleepScript }, async (root) => {
    const controller = new AbortController();
    const pending = runCommandTool(
      { command: `${node} sleep.js` },
      { workspaceRoot: root, policy: policy(), signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 200);
    const result = await pending;
    assert.equal(result.ok, false);
    assert.match(result.content, /cancelled/);
  });
});

// The parent spawns a long-lived detached child, prints its pid, then
// lingers past the timeout; the tree kill must still reap the child. Kept
// in a file to avoid shell quoting of an inline script.
const spawnerScript = [
  "const { spawn } = require('node:child_process');",
  "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });",
  "console.log('child', child.pid);",
  "child.unref();",
  "setTimeout(() => {}, 10000);",
].join("\n");

test("terminates a child that outlives its parent shell", async () => {
  await withWorkspace({ "spawner.js": spawnerScript }, async (root) => {
    const result = await runCommandTool(
      { command: `${node} spawner.js`, timeoutMs: 600 },
      { workspaceRoot: root, policy: policy() },
    );
    assert.match(result.content, /timed out/);
    const pid = Number(/child (\d+)/.exec(result.content)?.[1]);
    assert.ok(Number.isInteger(pid), "expected the child pid in the output");
    await new Promise((resolve) => setTimeout(resolve, 2500));
    assert.throws(
      () => process.kill(pid, 0),
      /ESRCH/,
      "the detached child should have been terminated",
    );
  });
});
