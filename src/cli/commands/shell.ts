import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CommandSource, ShellPolicy } from "./types.js";

const execute = promisify(execFile);
const BLOCK = /!`([^`]+)`/g;

export async function expandShellBlocks(
  template: string,
  workspaceRoot: string,
  source: CommandSource,
  policy: ShellPolicy = {},
): Promise<string> {
  let result = template;
  for (const match of [...template.matchAll(BLOCK)]) {
    const command = match[1]?.trim() ?? "";
    if (command === "") throw new Error("Shell block command is empty.");
    const approved =
      policy.approve === undefined
        ? policy.allowNonInteractive === true
        : await policy.approve(command, source);
    if (!approved) throw new Error("Shell command execution was denied.");
    const shell =
      process.platform === "win32"
        ? (process.env.ComSpec ?? "cmd.exe")
        : (process.env.SHELL ?? "/bin/sh");
    const args =
      process.platform === "win32"
        ? ["/d", "/s", "/c", command]
        : ["-c", command];
    try {
      const { stdout } = await execute(shell, args, {
        cwd: workspaceRoot,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          USERPROFILE: process.env.USERPROFILE,
          ...policy.environment,
        },
        timeout: policy.timeoutMs ?? 30_000,
        maxBuffer: policy.maxOutputBytes ?? 1_048_576,
        windowsHide: true,
      });
      result = result.replace(match[0], stdout.trimEnd());
    } catch (error: unknown) {
      throw new Error(
        `Shell command failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  return result;
}
