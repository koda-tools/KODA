import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import {
  client,
  methods,
  ndJsonStream,
  PROTOCOL_VERSION,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import { test } from "node:test";

const fixture = fileURLToPath(
  new URL("./fixtures/stdio-agent.ts", import.meta.url),
);

test(
  "stdio ACP negotiates, isolates sessions, streams tools, asks permission and cancels",
  { timeout: 30_000 },
  async () => {
    const other = await mkdtemp(join(tmpdir(), "koda-acp-test-"));
    const child = spawn(
      process.execPath,
      ["--conditions=development", "--import", "tsx", fixture],
      {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let rawStdout = "";
    let rawStderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      rawStderr += chunk;
    });
    const tap = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        rawStdout += chunk.toString("utf8");
        callback(null, chunk);
      },
    });
    child.stdout.pipe(tap);
    const stream = ndJsonStream(
      Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      Readable.toWeb(tap) as ReadableStream<Uint8Array>,
    );
    const updates: SessionNotification[] = [];
    let allow = false;
    let holdPermission = false;
    let permissionSeen: (() => void) | undefined;
    const permissions: string[] = [];
    const acpClient = client({ name: "koda-test" })
      .onRequest(
        methods.client.session.requestPermission,
        async ({ params, signal }) => {
          permissions.push(params.toolCall.title ?? "");
          if (holdPermission) {
            permissionSeen?.();
            await new Promise<void>((resolve) => {
              if (signal.aborted) resolve();
              else
                signal.addEventListener("abort", () => resolve(), {
                  once: true,
                });
            });
            return { outcome: { outcome: "cancelled" } };
          }
          return {
            outcome: {
              outcome: "selected",
              optionId: allow ? "allow" : "reject",
            },
          };
        },
      )
      .onNotification(methods.client.session.update, ({ params }) => {
        updates.push(params);
      });

    try {
      await acpClient.connectWith(stream, async (ctx) => {
        const init = await ctx.request(methods.agent.initialize, {
          protocolVersion: PROTOCOL_VERSION,
        });
        assert.equal(init.protocolVersion, 1);
        assert.equal(init.agentCapabilities?.loadSession, undefined);
        assert.deepEqual(
          init.agentCapabilities?.sessionCapabilities?.close,
          {},
        );

        const first = await ctx.request(methods.agent.session.new, {
          cwd: process.cwd(),
          mcpServers: [],
        });
        const second = await ctx.request(methods.agent.session.new, {
          cwd: other,
          mcpServers: [],
        });
        assert.notEqual(first.sessionId, second.sessionId);
        assert.equal(first.modes?.currentModeId, "build");

        const firstResult = await ctx.request(methods.agent.session.prompt, {
          sessionId: first.sessionId,
          prompt: [{ type: "text", text: "hello" }],
        });
        assert.equal(firstResult.stopReason, "end_turn");
        const firstText = updates
          .filter(
            (item) =>
              item.sessionId === first.sessionId &&
              item.update.sessionUpdate === "agent_message_chunk",
          )
          .map((item) => item.update)
          .map((item) =>
            item.sessionUpdate === "agent_message_chunk" &&
            item.content.type === "text"
              ? item.content.text
              : "",
          )
          .join("");
        assert.match(firstText, /build:.*:0:hello/);

        const later = ctx.request(methods.agent.session.prompt, {
          sessionId: first.sessionId,
          prompt: [{ type: "text", text: "again" }],
        });
        const secondResult = ctx.request(methods.agent.session.prompt, {
          sessionId: second.sessionId,
          prompt: [{ type: "text", text: "hello" }],
        });
        const concurrent = await Promise.all([later, secondResult]);
        assert.deepEqual(
          concurrent.map((item) => item.stopReason),
          ["end_turn", "end_turn"],
        );
        const secondText = updates
          .filter(
            (item) =>
              item.sessionId === second.sessionId &&
              item.update.sessionUpdate === "agent_message_chunk",
          )
          .map((item) => item.update)
          .map((item) =>
            item.sessionUpdate === "agent_message_chunk" &&
            item.content.type === "text"
              ? item.content.text
              : "",
          )
          .join("");
        assert.match(secondText, /:0:hello/);
        assert.doesNotMatch(secondText, /:2:hello/);

        const crossPlatformLink = await ctx.request(
          methods.agent.session.prompt,
          {
            sessionId: second.sessionId,
            prompt: [
              { type: "text", text: "inspect" },
              {
                type: "resource_link",
                uri: "file:///tmp/example.txt",
                name: "example.txt",
              },
            ],
          },
        );
        assert.equal(crossPlatformLink.stopReason, "end_turn");

        await ctx.request(methods.agent.session.setMode, {
          sessionId: first.sessionId,
          modeId: "plan",
        });
        const plan = await ctx.request(methods.agent.session.prompt, {
          sessionId: first.sessionId,
          prompt: [{ type: "text", text: "inspect" }],
        });
        assert.equal(plan.stopReason, "end_turn");
        assert.ok(
          updates.some(
            (item) => item.update.sessionUpdate === "current_mode_update",
          ),
        );

        await ctx.request(methods.agent.session.prompt, {
          sessionId: first.sessionId,
          prompt: [{ type: "text", text: "tool" }],
        });
        assert.deepEqual(
          updates
            .filter(
              (item) =>
                item.update.sessionUpdate === "tool_call" ||
                item.update.sessionUpdate === "tool_call_update",
            )
            .map((item) => item.update.sessionUpdate),
          ["tool_call", "tool_call_update"],
        );
        assert.ok(!rawStdout.includes("private tool output"));

        const rejected = await ctx.request(methods.agent.session.prompt, {
          sessionId: first.sessionId,
          prompt: [{ type: "text", text: "approve" }],
        });
        assert.equal(rejected.stopReason, "end_turn");
        assert.ok(
          updates.some(
            (item) =>
              item.sessionId === first.sessionId &&
              item.update.sessionUpdate === "agent_message_chunk" &&
              item.update.content.type === "text" &&
              item.update.content.text === "reject",
          ),
        );
        allow = true;
        const approved = await ctx.request(methods.agent.session.prompt, {
          sessionId: first.sessionId,
          prompt: [{ type: "text", text: "approve" }],
        });
        assert.equal(approved.stopReason, "end_turn");
        assert.equal(permissions.length, 2);
        assert.match(permissions[0] ?? "", /Write example\.txt/);

        let startedResolve!: () => void;
        const started = new Promise<void>((resolve) => {
          startedResolve = resolve;
        });
        permissionSeen = undefined;
        const originalLength = updates.length;
        const cancelPrompt = ctx.request(methods.agent.session.prompt, {
          sessionId: first.sessionId,
          prompt: [{ type: "text", text: "cancel" }],
        });
        const poll = setInterval(() => {
          if (
            updates
              .slice(originalLength)
              .some(
                (item) => item.update.sessionUpdate === "agent_message_chunk",
              )
          ) {
            clearInterval(poll);
            startedResolve();
          }
        }, 5);
        await started;
        await ctx.notify(methods.agent.session.cancel, {
          sessionId: first.sessionId,
        });
        assert.equal((await cancelPrompt).stopReason, "cancelled");

        holdPermission = true;
        const pendingApproval = new Promise<void>((resolve) => {
          permissionSeen = resolve;
        });
        const approvalPrompt = ctx.request(methods.agent.session.prompt, {
          sessionId: first.sessionId,
          prompt: [{ type: "text", text: "approve-wait" }],
        });
        await pendingApproval;
        await ctx.notify(methods.agent.session.cancel, {
          sessionId: first.sessionId,
        });
        assert.equal((await approvalPrompt).stopReason, "cancelled");
        holdPermission = false;

        await ctx.request(methods.agent.session.close, {
          sessionId: first.sessionId,
        });
        await ctx.request(methods.agent.session.close, {
          sessionId: second.sessionId,
        });
      });

      const lines = rawStdout.trim().split("\n");
      assert.ok(lines.length > 5);
      for (const line of lines)
        assert.equal((JSON.parse(line) as unknown) instanceof Object, true);
      assert.ok(
        lines.every(
          (line) =>
            (JSON.parse(line) as { jsonrpc?: string }).jsonrpc === "2.0",
        ),
      );
      assert.doesNotMatch(rawStderr, /KODA ACP prompt failed/);
    } finally {
      child.kill();
      await rm(other, { recursive: true, force: true });
    }
  },
);

test(
  "malformed stdio input never contaminates ACP stdout",
  { timeout: 15_000 },
  async () => {
    const child = spawn(
      process.execPath,
      ["--conditions=development", "--import", "tsx", fixture],
      {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (part: string) => {
      stdout += part;
    });
    child.stderr.setEncoding("utf8").on("data", (part: string) => {
      stderr += part;
    });
    const exit = new Promise<number | null>((resolve) =>
      child.once("exit", (code) => resolve(code)),
    );
    try {
      child.stdin.end("not-json\n");
      const code = await exit;
      assert.ok(code === 0 || code === 1);
      for (const line of stdout.trim().split("\n").filter(Boolean))
        assert.equal((JSON.parse(line) as { jsonrpc?: string }).jsonrpc, "2.0");
      assert.doesNotMatch(stderr, /not-json/);
    } finally {
      child.kill();
    }
  },
);

test(
  "stdio disconnect closes the ACP process cleanly",
  { timeout: 15_000 },
  async () => {
    const child = spawn(
      process.execPath,
      ["--conditions=development", "--import", "tsx", fixture],
      {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    child.stdout.setEncoding("utf8").on("data", (part: string) => {
      stdout += part;
    });
    const exit = new Promise<number | null>((resolve) =>
      child.once("exit", (code) => resolve(code)),
    );
    try {
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: PROTOCOL_VERSION },
        }) + "\n",
      );
      await new Promise<void>((resolve) =>
        child.stdout.once("data", () => resolve()),
      );
      child.stdin.end();
      assert.equal(await exit, 0);
      assert.equal(
        (JSON.parse(stdout.trim()) as { result?: { protocolVersion?: number } })
          .result?.protocolVersion,
        1,
      );
    } finally {
      child.kill();
    }
  },
);
