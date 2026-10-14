# Proposal — prepare-sdk-for-extension

## Why
A VS Code extension is planned, but:
- The code that wires KODA together (credentials, provider, catalog, MCP,
  agent runtime, tool registry, policies) lives inside `src/cli/index.ts`, so
  an extension would have to copy it.
- The SDK entry point (`src/index.ts`) re-exports the terminal UI
  (`runInteractive`, `renderHeader`, ...), so importing the package from an
  extension pulls the TUI into its bundle.
- The repository is a single package. An extension needs its own
  `package.json` (`engines.vscode`, `contributes`), tsconfig and bundle, which
  does not fit next to the CLI in the root.

This is Phase 1 of a larger effort: make the path ready, without building the
extension and without changing the terminal experience.

## What
1. Extract the terminal-independent bootstrap from `src/cli/index.ts` into a
   new SDK module (`src/bootstrap/`) that both the CLI and a future extension
   call. Approval policies and I/O stay injected by the caller.
2. Make `src/cli/index.ts` use that module, with no change in behavior.
3. Remove the TUI exports from the main entry point and expose them through a
   new `@koda-tools/koda/tui` subpath.
4. Convert the repository to npm workspaces: move the CLI/SDK into
   `packages/koda` (same package name, same `bin`, same published contents)
   and leave `packages/*` ready for a future `packages/vscode-extension`.

## Scope
- In scope:
  - New `src/bootstrap/` module and its tests.
  - Refactor of `runCli` to use it (same flags, output, exit codes).
  - `exports` map: `.` without the TUI, plus `./tui`.
  - A structure test proving the main entry does not reach `cli/tui` or
    `@termuijs/*`.
  - Root workspace `package.json` (private), `tsconfig.base.json`, and
    `packages/koda` holding `src`, `test`, `bin`, its `package.json` and
    `tsconfig.json`; `git mv` so history is kept.
  - Root scripts (`build`, `test`, `check`, `format`) that delegate to the
    workspace, so CI and local commands keep working from the root.
  - Updating the places that hold paths: `.gitattributes`, the release
    workflow (version check and publish target), and the `verify:` commands in
    `agentic-fy/` specs and changes that run `node --test` directly (they get a
    `cd packages/koda &&` prefix).
  - CHANGELOG (including the breaking removal from the main entry) and README.
- Out of scope (later phases):
  - Any VS Code extension code, `packages/vscode-extension`, CJS bundling,
    `vsce`, Marketplace publishing.
  - Moving `cli/commands/*` out of `cli/`.
  - Version bump (done at release time).
  - Changing any CLI/TUI behavior.
