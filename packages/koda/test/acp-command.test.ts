import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const binary = fileURLToPath(new URL("../bin/koda.js", import.meta.url));

test(
  "koda acp starts the ACP v1 server without CLI text on stdout",
  { timeout: 15_000 },
  async () => {
    const child = spawn(process.execPath, [binary, "acp"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = createInterface({ input: child.stdout });
    const firstLine = new Promise<string>((resolve) =>
      lines.once("line", resolve),
    );
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (part: string) => {
      stderr += part;
    });
    try {
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: 1 },
        }) + "\n",
      );
      const response = JSON.parse(await firstLine) as {
        jsonrpc?: string;
        result?: { protocolVersion?: number; agentInfo?: { name?: string } };
      };
      assert.equal(response.jsonrpc, "2.0");
      assert.equal(response.result?.protocolVersion, 1);
      assert.equal(response.result?.agentInfo?.name, "koda");
      assert.doesNotMatch(stderr, /Koda failed|\[Think\]/);
    } finally {
      child.stdin.end();
      child.kill();
      lines.close();
    }
  },
);
