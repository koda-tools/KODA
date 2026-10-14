# prepare-sdk-for-extension

## Purpose
Let a host other than the terminal (such as a VS Code extension) assemble KODA through the SDK, in a workspace layout ready for an extension package, while the CLI keeps working unchanged.

## Requirements

### Requirement: The SDK can assemble KODA without a terminal {#bootstrap-without-terminal}
The system SHALL provide a bootstrap API that builds the provider, agent catalog, MCP manager and agent runtime from a working directory and connection settings, without reading from or writing to the process terminal.
> verify: `cd packages/core && node --conditions=development --import tsx --test test/bootstrap.test.ts`

#### Scenario:
- WHEN a host calls the bootstrap with a cwd, a connection and its own approval policies
- THEN it receives a ready agent runtime and nothing is written to stdout or stderr

### Requirement: A missing provider key fails before anything else loads {#bootstrap-fails-on-missing-key-first}
The system SHALL fail the bootstrap with the provider error before the policy factory, catalog or MCP are loaded when the selected provider has no key.
> verify: `cd packages/core && node --conditions=development --import tsx --test test/bootstrap.test.ts`

#### Scenario:
- WHEN no credentials are configured and the bootstrap runs with a lazy policy factory
- THEN the provider error is raised and the factory is never called

### Requirement: The CLI behaves exactly as before {#cli-behavior-unchanged}
The system SHALL keep the behavior, output and exit codes of `koda`, `koda init`, `koda connect` and every slash command unchanged after the bootstrap is extracted and after the layout move.
> verify: `cd packages/koda && node --conditions=development --import tsx --test test/tui.test.ts test/init.test.ts && cd ../core && node --conditions=development --import tsx --test test/commands.test.ts`

#### Scenario:
- WHEN the existing CLI tests run against the refactored entry point
- THEN they pass without modification to their expectations

### Requirement: The main entry point has no terminal UI {#main-entry-has-no-terminal-code}
The system SHALL NOT reach the terminal UI (`src/cli/tui`) or `@termuijs/*` from the package main entry point `src/index.ts`, directly or transitively.
> verify: `cd packages/koda && node --conditions=development --import tsx --test test/core-reexport.test.ts`

#### Scenario:
- WHEN the static imports of src/index.ts are followed transitively
- THEN none resolves into src/cli/tui or a @termuijs package

### Requirement: The terminal UI stays available through a subpath {#tui-subpath-export}
The system SHALL expose the terminal UI (`runInteractive`, `renderHeader` and related types) through the `@koda-tools/koda/tui` export.
> verify: `cd packages/koda && node --conditions=development --import tsx --test test/core-reexport.test.ts`

#### Scenario:
- WHEN package.json exports is read
- THEN the "./tui" export points at the built terminal UI entry and the "." export does not include runInteractive

### Requirement: The repository is an npm workspace with the CLI in packages/koda {#workspace-layout}
The system SHALL keep the CLI and SDK as the single package `@koda-tools/koda` under `packages/koda`, with the same `bin`, `exports` and published files, in a private root workspace whose `packages/*` can host further packages.
> verify: `cd packages/koda && node --conditions=development --import tsx --test test/workspace-layout.test.ts`

#### Scenario:
- WHEN the root `npm run build` and `npm test` run
- THEN they build and test the workspace package like they did the flat package

#### Scenario:
- WHEN the workspace package is packed
- THEN the tarball contains bin/koda.js, dist/src, README.md and LICENSE (copied from the root by a prepack script) and has the same name and version as before

### Requirement: The bin entry keeps LF line endings after the move {#bin-stays-lf}
The system SHALL keep `packages/koda/bin/koda.js` with LF line endings and a Git attribute that forces LF, so the shebang works on Linux.
> verify: `cd packages/koda && node --conditions=development --import tsx --test test/workspace-layout.test.ts`

#### Scenario:
- WHEN the file is checked out on Windows with core.autocrlf=true
- THEN it still ends its lines with LF

### Requirement: The release workflow publishes the workspace package {#release-targets-the-package}
The system SHALL check the release tag against `packages/koda/package.json` and publish the `@koda-tools/koda` workspace in the release workflow.
> verify: `grep -q "packages/koda/package.json" .github/workflows/release.yml && grep -q -e "-w @koda-tools/koda" .github/workflows/release.yml`

#### Scenario:
- WHEN a GitHub Release is published
- THEN the version check reads packages/koda/package.json and npm publish targets the workspace

### Requirement: Spec verify commands still point at real files {#verify-commands-follow-the-move}
The system SHALL run `verify:` commands in `agentic-fy/` that call `node --test` directly from `packages/koda`, because the tests resolve paths from the working directory, and SHALL keep `npm test`, `npm run check` and `npm run build` working from the repository root.
> verify: `cd packages/koda && node --conditions=development --import tsx --test test/workspace-layout.test.ts`

#### Scenario:
- WHEN a verify command that calls node --test runs from the repository root
- THEN it first changes into packages/koda and finds the test file

#### Scenario:
- WHEN a verify command runs `npm test -- test/x.test.ts` from the repository root
- THEN the root script forwards the argument to the workspace
