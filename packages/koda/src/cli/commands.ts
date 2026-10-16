import { Args, Command, Options } from "@effect/cli";
import { NodeContext } from "@effect/platform-node";
import {
  CONNECTABLE_PROVIDERS,
  initWorkspace,
  isProviderName,
  loadConnection,
  saveApiKey,
  saveProjectProvider,
} from "@koda-tools/core";
import { Effect, Option } from "effect";
import type { CliEnvironment } from "./index.js";
import { formatInitResult } from "./init/format.js";

const MAX_TOKEN_BYTES = 8192;

async function readToken(runtime: CliEnvironment): Promise<string> {
  const input = runtime.stdin;
  if (input === undefined || input.isTTY === true)
    throw new Error("--token-stdin requires piped input.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += bytes.length;
    if (size > MAX_TOKEN_BYTES) throw new Error("Token input is too large.");
    chunks.push(bytes);
  }
  const token = Buffer.concat(chunks).toString("utf8").trim();
  if (token === "") throw new Error("Token input is empty.");
  return token;
}

async function connectFromStdin(
  runtime: CliEnvironment,
  requested: string | undefined,
): Promise<number> {
  if (requested === undefined)
    throw new Error("Specify a provider with --token-stdin.");
  const provider = requested.toLowerCase();
  if (!isProviderName(provider) || !CONNECTABLE_PROVIDERS.includes(provider))
    throw new Error(
      `Unsupported provider. Choose: ${CONNECTABLE_PROVIDERS.join(", ")}.`,
    );
  const token = await readToken(runtime);
  const connection = await loadConnection({
    env: runtime.env,
    configRoot: runtime.configRoot,
  });
  await saveApiKey(connection.authFile, provider, token);
  runtime.stdout.write(`Saved ${provider} credentials.\n`);
  return 0;
}

/** Effect parses command structure and options; the existing CLI remains the host. */
export async function runStructuredCommand(
  runtime: CliEnvironment,
  version: string,
): Promise<number> {
  let result = 0;
  const init = Command.make(
    "init",
    { provider: Options.optional(Options.text("provider")) },
    ({ provider }) =>
      Effect.promise(async () => {
        const selected = Option.getOrUndefined(provider);
        if (selected !== undefined && !isProviderName(selected))
          throw new Error(`Unsupported provider '${selected}'.`);
        const initialized = await initWorkspace(runtime.cwd);
        runtime.stdout.write(`${formatInitResult(initialized)}\n`);
        if (selected !== undefined) {
          const file = await saveProjectProvider(runtime.cwd, selected);
          runtime.stdout.write(`Provider ${selected} selected in ${file}.\n`);
        }
      }),
  );
  const connect = Command.make(
    "connect",
    {
      provider: Args.optional(Args.text({ name: "provider" })),
      tokenStdin: Options.boolean("token-stdin"),
    },
    ({ provider, tokenStdin }) =>
      Effect.promise(async () => {
        const requested = Option.getOrUndefined(provider);
        if (tokenStdin) {
          result = await connectFromStdin(runtime, requested);
        } else {
          const { runCli } = await import("./index.js");
          result = await runCli({
            ...runtime,
            argv:
              requested === undefined ? ["connect"] : ["connect", requested],
          });
        }
      }),
  );
  const root = Command.make("koda").pipe(
    Command.withSubcommands([init, connect]),
  );
  const run = Command.run(root, { name: "KODA", version });
  try {
    await Effect.runPromise(
      run([process.execPath, "koda", ...runtime.argv]).pipe(
        Effect.provide(NodeContext.layer),
      ),
    );
    return result;
  } catch (error: unknown) {
    // Never echo a token or the raw stdin contents in errors.
    const message = error instanceof Error ? error.message : "Invalid command.";
    runtime.stderr.write(`Koda: ${message}\n`);
    return 2;
  }
}
