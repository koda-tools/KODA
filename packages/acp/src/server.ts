import { Readable, Writable } from "node:stream";
import { ndJsonStream } from "@agentclientprotocol/sdk";
import { defaultRuntimeFactory } from "./adapters/core.js";
import { createAcpAgent } from "./protocol/handlers.js";
import { logDiagnostic } from "./utils/logger.js";
import type { AcpEnvironment, RuntimeFactory } from "./adapters/core.js";

export { createAcpAgent } from "./protocol/handlers.js";
export type { AcpEnvironment, RuntimeFactory } from "./adapters/core.js";

/** Own only the ACP stdio transport and process-level shutdown. */
export async function runAcpServer(
  environment: AcpEnvironment,
  runtimeFactory: RuntimeFactory = defaultRuntimeFactory,
): Promise<number> {
  const { app, shutdown } = createAcpAgent(environment, runtimeFactory);
  const input = Readable.toWeb(
    environment.stdin as Readable,
  ) as ReadableStream<Uint8Array>;
  const output = Writable.toWeb(
    environment.stdout as Writable,
  ) as WritableStream<Uint8Array>;
  const connection = app.connect(ndJsonStream(output, input));
  const stop = () => connection.close();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  connection.signal.addEventListener("abort", () => void shutdown(), {
    once: true,
  });
  try {
    await connection.closed;
    return 0;
  } catch (error) {
    logDiagnostic(environment.stderr, "transport", error);
    return 1;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await shutdown();
  }
}
