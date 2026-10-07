# Controlled Command Execution

## Objective
Allow the agent to run project commands for inspection, building, testing, and formatting under explicit user control.

## Scope
Add a `runCommand` tool with:
- workspace-root working directory;
- timeout and `AbortSignal` cancellation;
- stdout and stderr size limits;
- exit code, duration, and truncated output;
- `deny`, `confirm`, and allowlist policies;
- interactive confirmation in the TUI.

## Safety
Commands execute only inside the workspace by default. Dangerous operations, privilege changes, dependency installation, and access outside the workspace require confirmation or denial. Secrets must not be logged or included in error messages.

## Definition of done
- Commands can be approved, rejected, cancelled, and timed out.
- The agent receives actionable non-zero exit feedback.
- Shell injection, working-directory escape, output flooding, and process-tree cleanup are tested.
