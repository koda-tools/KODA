import { spawn } from "node:child_process";
import type { CommandResult } from "./types.js";

const GRACE_MS = 2_000;
const HARD_LIMIT_BYTES = 1_048_576;
const isWindows = process.platform === "win32";

export interface SpawnCommandInput {
  readonly command: string;
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

function shellInvocation(command: string): { file: string; args: string[] } {
  if (isWindows)
    return {
      file: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", command],
    };
  return { file: process.env.SHELL ?? "/bin/sh", args: ["-c", command] };
}

/** A stdout/stderr sink that stops storing once the hard limit is hit. */
class Capture {
  private chunks: Buffer[] = [];
  private size = 0;

  public push(chunk: Buffer): void {
    if (this.size >= HARD_LIMIT_BYTES) return;
    const room = HARD_LIMIT_BYTES - this.size;
    this.chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
    this.size += chunk.length;
  }

  public text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

/**
 * Kills the whole process tree. On POSIX the child leads its own process
 * group (`detached`), so the negative PID signals the group; on Windows
 * `taskkill /T` walks the tree.
 */
function killTree(pid: number, force: boolean): void {
  try {
    if (isWindows) {
      spawn("taskkill", [
        "/pid",
        String(pid),
        "/t",
        ...(force ? ["/f"] : []),
      ]);
    } else {
      process.kill(-pid, force ? "SIGKILL" : "SIGTERM");
    }
  } catch {
    // The process may already be gone; nothing to clean up.
  }
}

/** Runs a command, always resolving; the caller decides what counts as failure. */
export function spawnCommand(input: SpawnCommandInput): Promise<CommandResult> {
  const { file, args } = shellInvocation(input.command);
  const started = Date.now();
  const stdout = new Capture();
  const stderr = new Capture();
  let timedOut = false;
  let cancelled = false;

  return new Promise<CommandResult>((resolve) => {
    const child = spawn(file, args, {
      cwd: input.cwd,
      env: input.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: !isWindows,
    });

    const pid = child.pid;
    const stop = (force: boolean): void => {
      if (pid !== undefined) killTree(pid, force);
    };

    const escalate = (): void => {
      stop(false);
      setTimeout(() => stop(true), GRACE_MS).unref();
    };

    const timer = setTimeout(() => {
      timedOut = true;
      escalate();
    }, input.timeoutMs);
    timer.unref();

    const onAbort = (): void => {
      cancelled = true;
      escalate();
    };
    input.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

    const finish = (exitCode: number | null): void => {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
      resolve({
        stdout: stdout.text(),
        stderr: stderr.text(),
        exitCode,
        durationMs: Date.now() - started,
        timedOut,
        cancelled,
      });
    };

    child.on("error", (error: Error) => {
      stderr.push(Buffer.from(error.message));
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}
