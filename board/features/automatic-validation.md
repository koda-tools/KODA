# Automatic Validation

## Objective
Let KODA verify changes and use failures to improve its implementation.

## Scope
- Detect project type and available validation scripts.
- Run tests, type checks, lint, build, and formatting commands.
- Return structured diagnostics to the agent.
- Support bounded retry and repair loops.
- Show command, output, duration, and result in the TUI.

## Safety
Validation uses the command-execution policy, timeout, cancellation, and output limits. Auto-detection must never silently execute arbitrary project scripts.

## Definition of done
- A changed TypeScript project can run its configured checks.
- Failures are fed back into the agent with enough context to act.
- Retry count and command execution remain bounded and visible to the user.
