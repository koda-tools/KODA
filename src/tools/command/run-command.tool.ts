import { realpath } from "node:fs/promises";
import { ToolError } from "../../utils/errors.js";
import { resolveSafeExistingPath } from "../../utils/security.js";
import { buildEnv } from "./environment.js";
import { formatResult } from "./output.js";
import { spawnCommand } from "./process.js";
import { classify } from "./risk.js";
import type { RunCommandArgs, RunCommandOptions } from "./types.js";

const DEFAULT_TIMEOUT_MS = 120_000;

async function resolveCwd(
  workspaceRoot: string,
  requested: string | undefined,
): Promise<string> {
  if (requested === undefined || requested === "")
    return realpath(workspaceRoot);
  return resolveSafeExistingPath(workspaceRoot, requested);
}

/**
 * Runs a shell command after risk classification and user approval. Never
 * returns the full output through an exception: the caller (ToolRegistry)
 * turns the thrown ToolError into a failed observation, but a non-zero exit
 * is a resolved result so its output reaches the model.
 */
export async function runCommandTool(
  args: RunCommandArgs,
  options: RunCommandOptions,
): Promise<{ readonly ok: boolean; readonly content: string }> {
  const command = args.command.trim();
  if (command === "") throw new ToolError("The command is required.");

  const { policy } = options;
  const decision = classify(command, policy.allowlist ?? []);
  if (decision.level === "deny")
    throw new ToolError(`Command denied: ${decision.reason}.`);

  const cwd = await resolveCwd(options.workspaceRoot, args.cwd);
  const relativeCwd = args.cwd ?? ".";
  if (decision.level === "confirm") {
    const approved = await policy.confirm({ command, cwd: relativeCwd });
    if (!approved) throw new ToolError("Command denied by user.");
  }

  const result = await spawnCommand({
    command,
    cwd,
    env: buildEnv(process.env, policy.environment ?? {}),
    timeoutMs: args.timeoutMs ?? policy.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  const content = formatResult(command, result, policy.maxOutputBytes);
  const ok =
    !result.timedOut && !result.cancelled && result.exitCode === 0;
  return { ok, content };
}
