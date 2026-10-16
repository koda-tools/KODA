import type {
  AgentObserver,
  AgentRunResult,
  BootstrapPolicies,
  ChatMessage,
  KodaRuntime,
} from "@koda-tools/core";
import type { RuntimeFactory } from "../../src/adapters/core.js";

export const fakeRuntimeFactory: RuntimeFactory = async (
  cwd: string,
  policies: BootstrapPolicies,
): Promise<KodaRuntime> => {
  const runtime = {
    close: async () => undefined,
    agents: {
      prepare: (mode: string) => ({
        agent: {
          runDetailed: async (
            prompt: string,
            options: {
              signal?: AbortSignal;
              history?: readonly ChatMessage[];
              observer?: AgentObserver;
            },
          ): Promise<AgentRunResult> => {
            const { signal, observer } = options;
            signal?.throwIfAborted();
            if (prompt === "cancel") {
              await observer?.onTextDelta?.("started");
              await new Promise<void>((resolve) => {
                if (signal?.aborted) resolve();
                else
                  signal?.addEventListener("abort", () => resolve(), {
                    once: true,
                  });
              });
              signal?.throwIfAborted();
            }
            if (prompt === "tool") {
              const call = { id: "tool-1", name: "readFile", arguments: "{}" };
              await observer?.onToolStart?.(call);
              await observer?.onToolResult?.(call, {
                ok: true,
                content: "private tool output",
              });
            }
            let content = `${mode}:${cwd}:${options.history?.length ?? 0}:${prompt}`;
            if (prompt.startsWith("approve")) {
              const allowed = await policies.writePolicy?.confirm({
                filePath: "example.txt",
                before: undefined,
                after: "safe",
              });
              content = allowed ? "approved" : "rejected";
            }
            await observer?.onTextDelta?.(content.slice(0, 6));
            await observer?.onTextDelta?.(content.slice(6));
            return {
              content,
              usage: {},
              provider: "fake",
              model: "fake",
              messages: [
                { role: "user", content: prompt },
                { role: "assistant", content },
              ],
            };
          },
        },
      }),
    },
  };
  return runtime as unknown as KodaRuntime;
};
