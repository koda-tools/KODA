import { randomUUID } from "node:crypto";
import { agent, methods } from "@agentclientprotocol/sdk";
import { promptText } from "../adapters/context.js";
import {
  defaultRuntimeFactory,
  type AcpEnvironment,
  type RuntimeFactory,
} from "../adapters/core.js";
import { AcpEventSink } from "../adapters/events.js";
import { PermissionBridge } from "../adapters/permissions.js";
import { AcpSessionRegistry } from "../session/session-manager.js";
import { resolveWorkspace } from "../session/session.js";
import { isKodaMode, MODES } from "../session/modes.js";
import { logDiagnostic } from "../utils/logger.js";
import { initializeResult } from "./capabilities.js";
import { assertSessionFeatures } from "./errors.js";

/** Map official ACP v1 methods onto isolated Core runtimes. */
export function createAcpAgent(
  environment: AcpEnvironment,
  runtimeFactory: RuntimeFactory = defaultRuntimeFactory,
) {
  const sessions = new AcpSessionRegistry();
  const shutdownController = new AbortController();
  const app = agent({ name: "koda" });
  const bridges = new Map<string, PermissionBridge>();
  let shutdownPromise: Promise<void> | undefined;

  const shutdown = () => {
    shutdownPromise ??= (async () => {
      shutdownController.abort();
      for (const bridge of bridges.values()) bridge.end();
      bridges.clear();
      await sessions.closeAll();
    })();
    return shutdownPromise;
  };

  app.onRequest(methods.agent.initialize, () => initializeResult());

  app.onRequest(methods.agent.session.new, async ({ params }) => {
    if (shutdownController.signal.aborted)
      throw new Error("ACP server is shutting down.");
    assertSessionFeatures(params);
    const cwd = await resolveWorkspace(params.cwd);
    const id = randomUUID();
    const bridge = new PermissionBridge(id, shutdownController.signal);
    const runtime = await runtimeFactory(cwd, bridge.policies(), environment);
    if (shutdownController.signal.aborted) {
      await runtime.close();
      throw new Error("ACP server is shutting down.");
    }
    const session = sessions.create(cwd, runtime, id);
    bridges.set(id, bridge);
    return {
      sessionId: session.id,
      modes: { currentModeId: session.mode, availableModes: MODES },
    };
  });

  app.onRequest(methods.agent.session.setMode, async ({ params, client }) => {
    const session = sessions.get(params.sessionId);
    if (session === undefined) throw new Error("Unknown ACP session.");
    if (session.active !== undefined)
      throw new Error("Cannot change mode during an active prompt.");
    if (!isKodaMode(params.modeId)) throw new Error("Unsupported KODA mode.");
    session.mode = params.modeId;
    await client.notify(methods.client.session.update, {
      sessionId: session.id,
      update: {
        sessionUpdate: "current_mode_update",
        currentModeId: session.mode,
      },
    });
    return {};
  });

  app.onRequest(
    methods.agent.session.prompt,
    async ({ params, client, signal }) => {
      const session = sessions.get(params.sessionId);
      if (session === undefined) throw new Error("Unknown ACP session.");
      if (session.active !== undefined)
        throw new Error("A prompt is already active in this ACP session.");
      const prompt = await promptText(params.prompt, session.workspaceRoot);
      const controller = new AbortController();
      const onRequestCancel = () => controller.abort();
      signal.addEventListener("abort", onRequestCancel, { once: true });
      shutdownController.signal.addEventListener("abort", onRequestCancel, {
        once: true,
      });
      session.active = controller;
      const bridge = bridges.get(session.id);
      bridge?.begin(client, controller.signal);
      const sink = new AcpEventSink(
        client,
        session.id,
        session.workspaceRoot,
        controller.signal,
      );
      try {
        const prepared = session.runtime.agents.prepare(session.mode);
        const result = await prepared.agent.runDetailed(prompt, {
          signal: controller.signal,
          history: session.history,
          observer: sink.observer(),
        });
        if (controller.signal.aborted) return { stopReason: "cancelled" };
        if (!sink.sentText) await sink.text(result.content);
        session.history.push(...result.messages);
        return { stopReason: "end_turn" };
      } catch (error) {
        if (controller.signal.aborted) return { stopReason: "cancelled" };
        logDiagnostic(environment.stderr, "prompt", error);
        await sink.error();
        return { stopReason: "refusal" };
      } finally {
        bridge?.end();
        session.active = undefined;
        signal.removeEventListener("abort", onRequestCancel);
        shutdownController.signal.removeEventListener("abort", onRequestCancel);
      }
    },
  );

  app.onNotification(methods.agent.session.cancel, ({ params }) => {
    sessions.get(params.sessionId)?.active?.abort();
  });

  app.onRequest(methods.agent.session.close, async ({ params }) => {
    bridges.get(params.sessionId)?.end();
    bridges.delete(params.sessionId);
    await sessions.close(params.sessionId);
    return {};
  });

  return { app, sessions, shutdown };
}
