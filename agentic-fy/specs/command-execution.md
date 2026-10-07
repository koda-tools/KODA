# command-execution

## Purpose
Let the agent run project commands under explicit user control, with risk classification, bounded output, timeout and reliable process-tree cleanup.

## Requirements

### Requirement: runCommand executes inside the workspace {#run-command-tool}
A runCommand tool SHALL run a shell command with the workspace as the default working directory, returning exit code, duration, stdout and stderr, and SHALL report a non-zero exit as a failed observation that still carries the full captured output.
> verify: `npm test -- test/run-command.test.ts`

#### Scenario:
- WHEN a command exits with zero
- THEN the observation succeeds and contains the command line and the output

#### Scenario:
- WHEN a command exits non-zero
- THEN the observation fails and still contains stdout and stderr

#### Scenario:
- WHEN a cwd inside the workspace is given
- THEN the command runs in that directory

#### Scenario:
- WHEN a cwd outside the workspace or an absolute path is given
- THEN the tool reports a sandbox error and runs nothing

### Requirement: Commands are classified before running {#command-risk-classification}
Commands SHALL be classified as deny, confirm or allow per segment split on shell operators; deny SHALL refuse without asking and SHALL take precedence over the allowlist; everything not denied or allowlisted SHALL require user confirmation.
> verify: `npm test -- test/command-risk.test.ts`

#### Scenario:
- WHEN the command escalates privileges or deletes outside the workspace
- THEN it is denied with a reason and never executed

#### Scenario:
- WHEN a denied segment follows an allowlisted one
- THEN the whole command is denied

#### Scenario:
- WHEN the command matches an allowlist entry
- THEN it runs without asking the user

#### Scenario:
- WHEN the command matches nothing
- THEN the user is asked and a refusal prevents execution

#### Scenario:
- WHEN no command policy is configured
- THEN the tool refuses instead of running unattended

### Requirement: Output is bounded, keeping both ends {#command-output-limits}
Captured output SHALL be truncated to a byte budget per stream, preserving the beginning and the end with an explicit note of the omitted amount, and SHALL NOT fail the command because it produced too much output.
> verify: `npm test -- test/command-output.test.ts`

#### Scenario:
- WHEN output fits the budget
- THEN it is returned whole with no truncation notice

#### Scenario:
- WHEN output exceeds the budget
- THEN the first and last portions are kept and the omitted size is stated

#### Scenario:
- WHEN a command floods output
- THEN it still completes and reports its exit code

#### Scenario:
- WHEN a stream is empty
- THEN its section is omitted

### Requirement: Timeout and cancellation kill the process tree {#command-timeout-and-cancellation}
runCommand SHALL enforce a configurable timeout and honor an AbortSignal, terminating the whole process tree in two stages (graceful then forced), and SHALL report whether it timed out or was cancelled.
> verify: `npm test -- test/run-command.test.ts`

#### Scenario:
- WHEN a command exceeds its timeout
- THEN the tool reports the timeout and the process is gone

#### Scenario:
- WHEN the request is cancelled mid-run
- THEN the tool reports the cancellation and the process is gone

#### Scenario:
- WHEN the command spawned children
- THEN the children are terminated too

### Requirement: Environment is an allowlist without secrets {#command-environment-allowlist}
The child environment SHALL be built from an allowlist of safe variables plus operator-provided extras, and SHALL exclude any variable whose name looks like a credential, even when explicitly provided.
> verify: `npm test -- test/command-environment.test.ts`

#### Scenario:
- WHEN the parent environment holds an API key or token
- THEN it is absent from the child environment

#### Scenario:
- WHEN a credential-looking variable is passed as an extra
- THEN it is dropped

#### Scenario:
- WHEN PATH and locale variables are present
- THEN they reach the child
