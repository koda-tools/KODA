# Design — prepare-sdk-for-extension

## Context
- `core`, `agents`, `providers`, `tools`, `mcp` and `utils` never import from
  `cli/` and never touch `process.stdout/stdin/exit/cwd`, `readline` or
  `console`. The coupling to fix is in `src/cli/index.ts` and in the exports of
  `src/index.ts`.
- `runCli` does, in order: merge stored credentials, provider from the
  environment (fails first if the key is missing), load the terminal runtime,
  build write/command policies from its `io`, load the agent catalog, build the
  `McpManager`, build the `AgentRuntime`, then run batch or interactive. The
  policies depend on the terminal `io`, loaded after the provider.
- `estimateCost` is re-exported by `cli/tui` but lives in
  `providers/catalog/pricing.ts`.
- Existing tests drive `runCli` end to end (`test/tui.test.ts`): the safety net.
- Things that hold repository paths and break when files move: `.gitattributes`
  (`/bin/koda.js` LF rule, protects the `node\r` shebang bug), `release.yml`
  (reads `./package.json` version, runs `npm publish`), `ci.yml` (root `npm`
  scripts), `package.json` `files`/`bin`/`exports`, the `format` globs, and 117
  `verify:` commands in `agentic-fy/`. Most of those are `npm test`,
  `npm run check`, `npm run build` or `npm run format:check`, which keep working
  from the root through the delegating scripts; about 56 run
  `node --test ... test/<file>` directly. The tests resolve paths from the
  current directory (for example `path.resolve("src/core")`), so those must run
  with the package as the working directory.
- `pages.yml` only deploys `docs/`, which stays at the root. `dist/` is already
  ignored at any depth.

## Architecture
### Bootstrap (no terminal, no `process.*`)
- `loadConnection({ configRoot, env })` returns `{ authFile, env }`: resolves
  the global config root, reads `auth.json`, merges stored credentials.
- `bootstrapKoda(options)` returns `{ provider, catalog, mcp, agents,
  createAgent(), globalRoots, close() }`:
  - options: `cwd`, `connection`, `fetch?`, `configRoot?`, and `policies`
    (`writePolicy`, `commandPolicy`, `approve`), which may be an async factory
    so the CLI can load the terminal runtime after the provider is built.
  - order is preserved: provider first, then catalog, then MCP (`mcp.start()`
    stays with the caller), then `AgentRuntime`; background catalog refresh
    (`initCatalog`) as today.
- `globalRoots` moves here from `cli/index.ts`.
- `src/cli/index.ts` keeps argument handling, `koda init`, `koda connect`, the
  terminal runtime, TUI policies and batch/interactive modes.

### Exports
- `src/index.ts` drops `renderHeader`, `runInteractive`, `InteractiveIO`,
  `InteractiveOptions`, `InteractiveRuntime`, `SessionStatus`; exports
  `estimateCost` from providers and the bootstrap API.
- `packages/koda/package.json` `exports`: `"."` -> `./dist/src/index.js`,
  `"./tui"` -> `./dist/src/cli/tui/index.js`.
- Structure test: walk static imports from `src/index.ts` and assert none
  resolves into `src/cli/tui` or `@termuijs/*`.

### Workspaces
```
package.json            private, "workspaces": ["packages/*"], delegating scripts
tsconfig.base.json      the strict compiler options, shared
packages/koda/          @koda-tools/koda: src/, test/, bin/koda.js,
                        package.json, tsconfig.json (extends the base)
packages/               (a future vscode-extension goes here)
docs/ agentic-fy/ board/ .github/ README.md CHANGELOG.md   stay at the root
```
- The package name, `bin` (`bin/koda.js`), `files` (`bin`, `dist/src`) and
  version stay the same, so `npm pack` of the workspace produces the same
  tarball layout as before.
- `README.md` and `LICENSE` stay at the root, but npm only packs the ones in
  the package folder. A `prepack` script in `packages/koda` copies them in
  (git-ignored copies), so the published tarball keeps both, as before.
- Root scripts: `build`, `test`, `check`, `lint`, `format`, `format:check`,
  `koda`, `start` call `npm run <name> -w @koda-tools/koda`. CI keeps `npm ci`,
  `npm run build`, `npm test` unchanged.
- `release.yml`: the version check reads `packages/koda/package.json`, and
  publish runs `npm publish -w @koda-tools/koda --access public --provenance`.
- `.gitattributes`: `/packages/koda/bin/koda.js text eol=lf`.
- `verify:` commands: only `verify:` lines that run `node ... --test` directly
  get the prefix `cd packages/koda && `; the `test/...` path stays as is.
  `npm test`, `npm run check`, `npm run build` and `npm run format:check` are
  not touched. The root `test` script forwards extra arguments, so
  `npm test -- test/x.test.ts` keeps working.
- Files are moved with `git mv`, then `npm install` regenerates the single
  root `package-lock.json`.

### Order of work
Bootstrap and exports first, with the suite green, and only then the layout
move, so a failure can be attributed to one of the two.

## Alternatives considered
- Option A: keep TUI exports on the main entry, marked deprecated. Rejected by
  the owner: the main entry must be safe to bundle; the cost is a breaking
  change mitigated by `./tui` and a CHANGELOG note.
- Option B: a single `createSession()` that also loads the terminal runtime.
  Rejected: it keeps the SDK coupled to the TUI.
- Option C: leave the layout flat and add workspaces later. Rejected by the
  owner: Phase 1 includes the layout so the next phase only adds a package.
- Option D: put `src` in `packages/core` and the CLI in `packages/cli`.
  Rejected for now: splitting the code into two published packages is a bigger
  change than the goal needs, and `@koda-tools/koda` must stay one package.

## Risks
- Behavior drift in the CLI: mitigated by preserving the order of operations
  and running the full suite after the bootstrap work and after the move.
- Breaking change for SDK users importing the TUI from `.`: mitigated by
  `./tui`, a CHANGELOG entry and a minor/major bump at release time.
- Publishing the wrong thing after the move: mitigated by a `npm pack
  --dry-run` check of the tarball contents and the release version-check using
  the new path. The release itself cannot be exercised locally.
- The `node\r` bug returning: the LF rule must move with `bin/koda.js`, and a
  check asserts the file has no `\r` after the move.
- `verify:` rewrite touching the wrong text: restricted to `verify:` lines that
  run `node ... --test` and reviewed with a diff before moving on.
- Lockfile and `npm install` need the registry; if offline, the lockfile
  cannot be regenerated and the task stays open.
- OneDrive/Windows path handling during `git mv`: do it in one step and check
  `git status` shows renames.
- Pre-existing failures in `test/prompt-layout.test.ts` (5) are unrelated and
  must not be hidden.
