import type { CliEnvironment } from "./index.js";
import { readFile } from "node:fs/promises";

async function packageVersion(): Promise<string> {
  for (const relative of ["../../package.json", "../../../package.json"]) {
    try {
      const manifest = JSON.parse(
        await readFile(new URL(relative, import.meta.url), "utf8"),
      ) as {
        name?: string;
        version?: string;
      };
      if (manifest.name === "@koda-tools/koda" && manifest.version)
        return manifest.version;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("KODA package manifest was not found.");
}

const HELP = `Usage: koda [command] [prompt]\n\nCommands:\n  init [--provider NAME]    Initialize this workspace\n  connect [NAME]            Save provider credentials interactively\n  connect NAME --token-stdin Save credentials from stdin\n  acp                       Start the ACP server\n\nOptions:\n  --help                    Show this help\n  --version                 Show KODA version\n`;

/** Dispatch before loading the terminal implementation. */
export async function runKoda(runtime: CliEnvironment): Promise<number> {
  if (
    runtime.argv.length === 1 &&
    ["--version", "-v"].includes(runtime.argv[0] ?? "")
  ) {
    runtime.stdout.write(`${await packageVersion()}\n`);
    return 0;
  }
  if (
    runtime.argv.length === 1 &&
    ["--help", "-h"].includes(runtime.argv[0] ?? "")
  ) {
    runtime.stdout.write(HELP);
    return 0;
  }
  if (runtime.argv[0] === "acp") {
    if (runtime.argv.length !== 1) {
      runtime.stderr.write("Usage: koda acp\n");
      return 2;
    }
    const { runAcpServer } = await import("@koda-tools/acp");
    return runAcpServer({
      env: runtime.env,
      cwd: runtime.cwd,
      stdin: runtime.stdin ?? process.stdin,
      stdout: runtime.stdout as NodeJS.WritableStream,
      stderr: runtime.stderr,
      ...(runtime.configRoot === undefined
        ? {}
        : { configRoot: runtime.configRoot }),
      ...(runtime.fetch === undefined ? {} : { fetch: runtime.fetch }),
    });
  }
  if (runtime.argv[0] === "init" || runtime.argv[0] === "connect") {
    const { runStructuredCommand } = await import("./commands.js");
    return runStructuredCommand(runtime, await packageVersion());
  }
  const { runCli } = await import("./index.js");
  return runCli(runtime);
}
