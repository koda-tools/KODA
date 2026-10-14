# split-core-and-cli-packages

## Purpose
Ship the SDK as its own package without terminal dependencies, and keep the CLI package and its binary working as before.

## Requirements

### Requirement: The core package has no terminal dependencies {#core-has-no-terminal-dependencies}
The system SHALL provide `@koda-tools/core` without `@termuijs/*` or `shiki` in its dependencies, and its sources SHALL NOT import from `@koda-tools/koda`.
> verify: `cd packages/core && node --conditions=development --import tsx --test test/split-packages.test.ts`

#### Scenario:
- WHEN the core manifest and sources are inspected
- THEN no terminal dependency is declared and no file imports the CLI package

### Requirement: The CLI package keeps exporting the SDK {#koda-reexports-the-sdk}
The system SHALL keep the main entry of `@koda-tools/koda` exporting everything `@koda-tools/core` exports, and keep the `./tui` export, so existing SDK consumers do not break.
> verify: `cd packages/koda && node --conditions=development --import tsx --test test/core-reexport.test.ts`

#### Scenario:
- WHEN the main entry of the CLI package is imported
- THEN it exposes every export of the core package

### Requirement: The CLI behaves exactly as before the split {#cli-behavior-unchanged}
The system SHALL keep the behavior, output and exit codes of `koda`, `koda init`, `koda connect` and every slash command unchanged after the split.
> verify: `cd packages/koda && node --conditions=development --import tsx --test test/cli.test.ts test/tui.test.ts test/init.test.ts && cd ../core && node --conditions=development --import tsx --test test/commands.test.ts`

#### Scenario:
- WHEN the existing CLI and TUI tests run against the split packages
- THEN they pass without changes to their expectations

### Requirement: Both packages pack with the expected files {#packages-are-packable}
The system SHALL produce tarballs for `@koda-tools/core` and `@koda-tools/koda` that contain their built output, README.md and LICENSE, and the `koda` tarball SHALL contain `bin/koda.js` and depend on the core package at the same exact version.
> verify: `cd packages/core && node --conditions=development --import tsx --test test/split-packages.test.ts && cd ../koda && node --conditions=development --import tsx --test test/core-reexport.test.ts test/workspace-layout.test.ts`

#### Scenario:
- WHEN each workspace is packed in dry-run mode
- THEN the file lists include the built entry, README.md and LICENSE, and the koda manifest pins the core version

### Requirement: The release publishes core before the CLI and checks both versions {#release-publishes-core-first}
The system SHALL check the release tag against the versions of both packages and publish `@koda-tools/core` before `@koda-tools/koda` in the release workflow.
> verify: `grep -q "@koda-tools/core" .github/workflows/release.yml && grep -q "packages/core/package.json" .github/workflows/release.yml`

#### Scenario:
- WHEN a GitHub Release is published
- THEN the workflow fails if either version differs from the tag, and publishes core first

### Requirement: Spec verify commands still point at real files {#verify-commands-follow-moved-tests}
The system SHALL run each `verify:` command that calls `node --test` from the package that holds the named test file.
> verify: `cd packages/koda && node --conditions=development --import tsx --test test/workspace-layout.test.ts`

#### Scenario:
- WHEN a verify command for a moved test runs from the repository root
- THEN it changes into the package that now holds the test
