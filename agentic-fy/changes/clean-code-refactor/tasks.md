# Tasks — clean-code-refactor

Incremental implementation plan. Run `npm run check`, `npm run format:check`, `npm run build`, and `npm test` after each numbered group.

- [x] 1. Run Prettier over `src` and `test` and confirm `npm run format:check` passes
- [x] 2. Add characterization tests for `Screen` wrapping, scroll clamping, and key parsing of CSI, SS3, and mouse-wheel sequences
- [x] 3. Add characterization tests for `/model` edge cases (provider-prefixed name, numeric index out of range, listing failure) and for agent status ordering (`Thinking...`, `Reading...`, `Writing...`)
- [x] 4. Create `src/providers/defaults.ts` with provider ids, default models, and `resolveProviderIdentity(env)`
- [x] 5. Use `resolveProviderIdentity` in `ProviderFactory.fromEnvironment` and `src/cli/index.ts`, deleting the duplicated model table
- [x] 6. Extract the shared provider failure description helper and use it in the OpenAI, Anthropic, and Gemini adapters without exposing secrets
- [x] 7. Decompose `CodeAgent.runDetailed` into `requestResponse`, `streamResponse`, `runToolCalls`, and a status-label lookup while keeping `run` and `runDetailed` signatures
- [x] 8. Extract `spinner.ts` and `output.ts` (line writer and typewriter) from `src/cli/tui/application.ts`
- [x] 9. Extract `/model` handling into a pure `model-command.ts` module and cover it with unit tests
- [x] 10. Extract session state and a single-turn runner (`session.ts`, `turn.ts`) and replace the inline `as` casts with a `parseWriteContent` type guard
- [x] 11. Reduce `runInteractive` to orchestration only, keeping the `InteractiveIO` contract unchanged
- [x] 12. Split `Screen` into text buffer, key parser, line editor, and renderer modules behind the unchanged `Screen` facade
- [x] 13. Replace magic numbers and escape-sequence strings with named constants and move key tables to module scope
- [x] 14. Replace the top-level `await` entry point in `src/cli/index.ts` with a promise chain
- [x] 15. Remove dead code, unused exports, and unused imports found during the pass
- [x] 16. Confirm `test/provider-boundary.test.ts` still passes (SDK imports confined to adapters, no provider names in core)
- [x] 17. Run `npm run check`, `npm run format:check`, `npm run build`, and `npm test` and compare the test count with the 43-test baseline
- [ ] 18. Manually smoke-test the interactive CLI: scrolling, spinner, `/model`, `writeFile` confirmation, and Ctrl+C (needs a real terminal; non-interactive smoke checks passed)
- [x] 19. Update `docs` where module paths changed
