# Tasks — add-koda-init

Incremental implementation plan.

- [x] 1. Add `src/cli/init/workspace.ts` with `initWorkspace` and `formatInitResult`
- [x] 2. Add `test/init.test.ts` covering fresh, repeated, partial and `.koda`-is-a-file cases
- [x] 3. Handle `koda init` in `runCli` (`src/cli/index.ts`) before the provider is built
- [x] 4. Add the `init` route to `router.ts`, `/init` to the help text and to `suggestions.ts`
- [x] 5. Run `initWorkspace` for `/init` in `application.ts`; extend `test/commands.test.ts` for the route
- [x] 6. Document `koda init` and `/init` in the README and the CHANGELOG
- [x] 7. Run typecheck and the test suite
