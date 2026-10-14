# Tasks — split-core-and-cli-packages

Deferred until one of the triggers in the proposal is true. When it is, work in
this order and run the full suite at the end of each part (the only failures
allowed are the 5 known ones in `prompt-layout.test.ts`).

## Part A: prepare inside one package
- [x] 1. Record the baseline: typecheck, full suite, `npm pack --dry-run`
- [x] 2. Classify each test file as core or koda (CLI/TUI); split the ones that mix both
- [x] 3. Move `src/cli/commands/` to `src/commands/` inside `packages/koda`, update imports, keep the suite green

## Part B: create packages/core
- [x] 4. Create `packages/core` (manifest, tsconfig extending the base, `exports` with the `development` condition) and `git mv` the SDK directories and their tests
- [x] 5. Split dependencies: terminal ones (`@termuijs/*`, `shiki`) stay in koda; the rest go to core
- [x] 6. Make `@koda-tools/koda` depend on `@koda-tools/core` (same exact version); change CLI/TUI imports to `@koda-tools/core`; re-export core from the koda main entry and keep `./tui`
- [x] 7. Test scripts run with `--conditions=development`; root `build` builds core before koda
- [x] 8. Add `packages/core/test/split-packages.test.ts` (core has no terminal dependency and never imports koda; koda re-exports core; both tarballs have the expected files)

## Part C: release and docs
- [x] 9. Move the `prepack` README/LICENSE copy into each published package
- [x] 10. Update `release.yml`: check the tag against both versions, publish core first, then koda
- [x] 11. Update `verify:` commands for moved tests with a script that reads each test's new location; review the diff
- [x] 12. Update README, CHANGELOG (including that deep imports are unsupported) and docs
- [x] 13. Run typecheck, the full suite and a root build; `npm pack --dry-run` both packages; start the `koda` binary once
