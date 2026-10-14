export type RiskLevel = "deny" | "confirm" | "allow";

export interface CommandDecision {
  readonly level: RiskLevel;
  /** Shown to the user when the level is deny. */
  readonly reason?: string;
}

export interface RunCommandArgs {
  readonly command: string;
  /** Relative directory inside the workspace; defaults to the root. */
  readonly cwd?: string;
  readonly timeoutMs?: number;
}

export interface CommandConfirmation {
  readonly command: string;
  /** Workspace-relative directory the command will run in. */
  readonly cwd: string;
}

export interface CommandPolicy {
  readonly confirm: (request: CommandConfirmation) => Promise<boolean>;
  readonly allowlist?: readonly string[];
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly environment?: Readonly<Record<string, string>>;
}

export interface RunCommandOptions {
  readonly workspaceRoot: string;
  readonly policy: CommandPolicy;
  readonly signal?: AbortSignal;
}

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
}
