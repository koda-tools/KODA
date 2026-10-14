# Design — split-core-and-cli-packages

## Context
- Phase 1 (`prepare-sdk-for-extension`) already made the repository an npm
  workspace with `packages/koda`, a bootstrap API, a main entry without the TUI
  and a `./tui` subpath. The split builds on that.
- `src/cli/commands/` (router, discovery, markdown/jsonc parsers, shell
  expansion, argument handling) imports nothing from outside its own folder. It
  is exported by the SDK today and used by the TUI (`tui/commands/suggestions`),
  so it belongs in core.
- What stays terminal-only: `src/cli/index.ts`, `src/cli/connect`,
  `src/cli/init`, `src/cli/tui`.
- Dependencies today live in one manifest. Terminal-only ones: `@termuijs/*`
  and `shiki` (used by the TUI highlighter). The rest (AI SDK packages, MCP
  SDK, `diff`, `jsonc-parser`, `yaml`, `zod`) are SDK dependencies.
- Tests resolve paths from the working directory, and the 60 test files mix SDK
  and terminal concerns, so each file must land in the right package.

## Architecture
```
packages/core/   @koda-tools/core
  src/{core,agents,providers,tools,mcp,utils,bootstrap,commands}/ + index.ts
  test/          tests of the above
packages/koda/   @koda-tools/koda (CLI + TUI, binary `koda`)
  src/cli/{index.ts,connect,init,tui}/, src/index.ts (re-exports core)
  test/          CLI and TUI tests
```
- `@koda-tools/core` `exports`: `"."` -> its built entry. No dependency on
  `@koda-tools/koda`, and none on `@termuijs/*` or `shiki`.
- `@koda-tools/koda` depends on `@koda-tools/core` with the exact same version
  (the project pins exact versions) and on `@termuijs/*` and `shiki`. Its main
  entry is `export * from "@koda-tools/core"`; `./tui` stays.
- Imports inside the moved SDK keep their relative paths; the CLI and TUI change
  their `../../core/...`-style imports to `@koda-tools/core`. Where the SDK
  needs an internal path today, core's `index.ts` must export it first.

### Running tests against source
Tests in `packages/koda` import `@koda-tools/core`. Resolving it to `dist/`
would force a build before every test run. Instead core's `exports` gets a
`development` condition pointing at `src/index.ts`, and the test scripts run
`node --conditions=development --import tsx`. The published package keeps
resolving to `dist/`. The same condition is what a future extension's dev setup
can use.

### Build and release
- Root `build` runs core first, then koda (TypeScript project references or an
  ordered `npm run build -w` pair). The root scripts still delegate.
- `release.yml`: the tag must match the version of both packages, and the
  workflow publishes `@koda-tools/core` first, then `@koda-tools/koda`, so the
  dependency exists when the CLI is installed.
- `README.md` and `LICENSE`: the `prepack` copy script moves into each
  published package.
- `.gitattributes` and `files` stay as they are for `packages/koda/bin`.

### Moving files
`git mv` per directory to keep history. The tests move with the code they
exercise; the `verify:` lines in `agentic-fy/` that name a moved test get the
new `cd packages/<pkg> &&` prefix, using a script that reads each test's new
location rather than a blind replace.

## Alternatives considered
- Option A: stay as is (one package, test-enforced boundary). Valid until a
  trigger appears; this change is the plan for when it does.
- Option B: three packages (core, TUI, CLI). Rejected: the CLI is a thin entry
  over the TUI, so a third package adds release overhead for no consumer.
- Option C: keep `@koda-tools/koda` as the SDK and publish the CLI as a new
  package. Rejected: it would change the name people install the CLI from.
- Option D: make `@koda-tools/koda` stop re-exporting the SDK. Rejected for the
  first release: it breaks existing SDK users for no gain; it can be a later,
  announced removal.

## Risks
- Publishing order or version mismatch leaves the CLI uninstallable: mitigated
  by the release check on both versions and by publishing core first. The real
  release cannot be exercised locally; a dry run of both `npm pack` outputs
  can.
- Tests mixing concerns: some files import both SDK and TUI code and need
  splitting or placing by their dominant subject.
- The `development` condition hides a missing build: mitigated by a CI step
  that builds both packages and runs the CLI binary once.
- Anyone importing a deep path of the old single package (for example
  `dist/src/...`) breaks. The package exposes only `.` and `./tui`, so this is
  unsupported already; call it out in the CHANGELOG.
- Doing this before there is a consumer for the lighter package: the reason it
  is written as a deferred plan with explicit triggers.
