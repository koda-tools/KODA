import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentContext } from "@agentclientprotocol/sdk";
import {
  PermissionBridge,
  safeDescription,
} from "../src/adapters/permissions.js";

test("approval descriptions redact common inline credentials", () => {
  const safe = safeDescription(
    "Run curl token=private123 --api-key=hidden456 Bearer abcdefghijklmnopqrstuvwxyz",
  );
  assert.doesNotMatch(safe, /private123|hidden456|abcdefghijklmnopqrstuvwxyz/);
  assert.match(safe, /\[redacted\]/);
});

test("permission bridge fails closed without a client and on rejection", async () => {
  const bridge = new PermissionBridge(
    "session-1",
    new AbortController().signal,
  );
  assert.equal(await bridge.ask("edit", "Write example.txt"), false);

  let title = "";
  const client = {
    request: async (
      _method: unknown,
      params: { toolCall: { title: string } },
    ) => {
      title = params.toolCall.title;
      return { outcome: { outcome: "selected", optionId: "reject" } };
    },
  } as unknown as AgentContext;
  bridge.begin(client, new AbortController().signal);
  assert.equal(await bridge.ask("edit", "Write token=private123"), false);
  assert.doesNotMatch(title, /private123/);
  bridge.end();
});

test("permission bridge accepts allow once and cancels a pending request", async () => {
  const bridge = new PermissionBridge(
    "session-1",
    new AbortController().signal,
  );
  const turn = new AbortController();
  const allowedClient = {
    request: async () => ({
      outcome: { outcome: "selected", optionId: "allow" },
    }),
  } as unknown as AgentContext;
  bridge.begin(allowedClient, turn.signal);
  assert.equal(await bridge.ask("execute", "Run test"), true);

  let requested!: () => void;
  const seen = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const pendingClient = {
    request: async () => {
      requested();
      return new Promise<never>(() => undefined);
    },
  } as unknown as AgentContext;
  bridge.begin(pendingClient, turn.signal);
  const pending = bridge.ask("edit", "Write example.txt");
  await seen;
  turn.abort();
  assert.equal(await pending, false);
  bridge.end();
});
