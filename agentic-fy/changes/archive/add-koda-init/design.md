# Design — add-koda-init

## Context
- `.koda/` is read by `src/agents/discovery.ts`, `src/cli/commands/discovery.ts`
  and `src/mcp/config.ts`, always relative to the workspace root (`runtime.cwd`).
- `koda connect` is the precedent for a subcommand: `runCli` handles
  `runtime.argv[0] === "connect"` before building the provider, so it works
  without a key. `init` follows the same path.
- Slash built-ins are routed in `src/cli/commands/router.ts` and executed in
  `src/cli/tui/application/application.ts` (like `/mcp`).
- `test` enforces TUI structure rules (only the barrel directly under
  `src/cli/tui`), so the logic lives outside the TUI.

## Architecture
- New `src/cli/init/workspace.ts` exporting
  `initWorkspace(root): Promise<InitResult>` and `formatInitResult(result)`.
  - Creates `<root>/.koda/commands`, `.koda/skills`, `.koda/agents` with
    `mkdir({ recursive: true })`.
  - Before creating, checks each directory with `stat` to report `created` vs
    `existing`. Nothing is overwritten and no files are written.
  - Fails with a clear error if `.koda` exists but is not a directory.
- CLI: in `runCli`, `argv[0] === "init"` calls `initWorkspace(runtime.cwd)`,
  writes the formatted result to stdout and returns 0. Placed next to the
  `connect` branch, before the provider is built.
- Slash: router returns `{ type: "init" }` for `/init`; `application.ts` runs
  `initWorkspace(workspaceRoot)` and writes the formatted result. `/help` text
  and `suggestions.ts` list it.

## Alternatives considered
- Option A: also write sample `commands/`, `skills/` and `agents/` files.
  Rejected: invents content the user did not ask for and complicates
  idempotency.
- Option B: add `.gitkeep` files so empty folders are tracked by git. Rejected
  for now: not needed to make KODA work, and it dirties the repo.
- Option C: only a slash command. Rejected: the point is bootstrapping a
  project from the shell, before opening a session or configuring a key.

## Risks
- A user prompt literally `init` (`koda init`) used to be sent to the model;
  now it runs the subcommand. Mitigation: same trade-off already accepted for
  `connect`; documented in the README and CHANGELOG.
- `.koda` present as a file: mitigated by the explicit error above.
