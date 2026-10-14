# Proposal — split-core-and-cli-packages

## Why
Today `@koda-tools/koda` is one package holding both the SDK (agents, providers,
tools, MCP, bootstrap, custom commands) and the terminal app (CLI and TUI). The
boundary between them is enforced only by a test (`entry-points.test.ts`: the
main entry must not reach `src/cli/tui` or `@termuijs/*`). Consequences:
- Anyone who installs the package as a library also installs the TUI
  dependencies (`@termuijs/*`, `shiki`).
- A future VS Code extension would depend on a package whose manifest still
  lists terminal dependencies; only the bundler keeps them out.
- The two halves cannot be versioned independently.

The split is not urgent: the test boundary works and the extension does not
exist yet. This proposal records the plan so it can be done when a trigger
appears (see below), and so the cheap preparation is not forgotten.

## What
Turn the workspace into two packages:
- `packages/core` — `@koda-tools/core`: the SDK. Contains `core`, `agents`,
  `providers`, `tools`, `mcp`, `utils`, `bootstrap` and the custom-command
  engine (today `src/cli/commands/`). No terminal dependencies.
- `packages/koda` — `@koda-tools/koda`: the CLI and TUI. Keeps the `koda` binary,
  `koda init`, `koda connect`, the TUI and the `./tui` export, and depends on
  `@koda-tools/core`.

`@koda-tools/koda` keeps re-exporting the SDK from its main entry, so existing
SDK consumers do not break; SDK-only users switch to `@koda-tools/core` to get
the lighter install.

## Triggers (do this when one of them is true)
- SDK consumers complain about install size or terminal dependencies.
- The CLI and the extension need independent versions or release cadence.
- A test boundary is no longer enough and the dependency graph should forbid
  the import.

## Scope
- In scope:
  - New `packages/core`, moving the SDK sources and their tests there.
  - Moving `src/cli/commands/` into core (it imports nothing outside its own
    folder, so it moves as is) and updating the TUI and the CLI to import it
    from core.
  - Splitting dependencies between the two manifests.
  - `@koda-tools/koda` main entry re-exporting `@koda-tools/core`.
  - Release workflow publishing both packages in order with matching versions.
  - Updating `verify:` commands for tests that change package.
  - README, CHANGELOG and docs.
- Out of scope:
  - The VS Code extension itself.
  - Any behavior change in the CLI, the TUI or the SDK.
  - Splitting the TUI into a third package.
  - Changing package names already published (`@koda-tools/koda` stays).
