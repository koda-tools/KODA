# Tasks — prepare-sdk-for-extension

Incremental implementation plan. Part A (tasks 1-8) changes code and keeps the
layout; part B (tasks 9-15) moves the layout. Run the full suite at the end of
each part: the only failures allowed are the 5 known ones in
`test/prompt-layout.test.ts`. Do not start part B with part A red.

## Part A: bootstrap and exports
- [x] 1. Record the baseline: run typecheck and the suite, note the known failures
- [x] 2. Add `src/bootstrap/` with `loadConnection`, `bootstrapKoda` and `globalRoots` (no `process.*`, no terminal imports)
- [x] 3. Make `src/cli/index.ts` use `src/bootstrap/` with identical behavior; suite stays green
- [x] 4. Add `test/bootstrap.test.ts` (provider fails before the policy factory runs, stored credentials merge, agents/MCP built, no terminal needed)
- [x] 5. Remove the TUI exports from `src/index.ts`, export `estimateCost` from providers and the bootstrap API; add the `./tui` subpath to `package.json` `exports`
- [x] 6. Add `test/entry-points.test.ts`: the main entry never reaches `src/cli/tui` or `@termuijs/*`, and `exports` has `./tui`
- [x] 7. Update README (SDK usage and the `./tui` subpath) and CHANGELOG (breaking removal from the main entry)
- [x] 8. Run typecheck and the full suite; checkpoint before the layout move

## Part B: workspaces
- [x] 9. `git mv` `src`, `test`, `bin` into `packages/koda/`; split `package.json` into a private root (`workspaces`, delegating scripts) and `packages/koda/package.json`; add `tsconfig.base.json` and `packages/koda/tsconfig.json`
- [x] 10. Update `.gitattributes` to `/packages/koda/bin/koda.js text eol=lf` and confirm the file has no `\r`
- [x] 11. Update `release.yml` (version check reads `packages/koda/package.json`, publish with `-w @koda-tools/koda`); confirm `ci.yml` still works with the root scripts
- [x] 12. Prefix `cd packages/koda && ` on `verify:` lines that run `node ... --test` in `agentic-fy/` specs and changes (leave `npm ...` lines alone); review the diff
- [x] 13. Regenerate the root `package-lock.json` with `npm install`; confirm `npm ci` works
- [x] 14. Update README, `board/` docs and CHANGELOG for the new layout (development commands, paths)
- [x] 15. Run typecheck, the full suite and a build from the root; check `npm pack -w @koda-tools/koda --dry-run` lists `bin/koda.js` and `dist/src`, and `npm run koda`/`koda` still start
