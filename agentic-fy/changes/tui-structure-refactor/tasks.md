# Tasks — tui-structure-refactor

Incremental implementation plan. Run `npm run check` and the full `npm test` after each step.

- [x] 1. Archive `replace-tui-with-termui` and point its `terminal-lifecycle-safety` verify at `test/tui.test.ts` instead of `test/screen.test.ts`.
- [x] 2. Add `test/tui-structure.test.ts` covering the folder convention, the `shared/` import boundary, the public barrel, and the absence of removed symbols. It fails until the steps below land.
- [x] 3. Create `shared/` (`types.ts`, `sanitize.ts`, `ansi.ts`) and move `InteractiveIO`, the request types, `Segment` and `LineWriter` into `shared/types.ts`.
- [x] 4. Move `highlight`, `markdown`, `diff`, `output`, `session`, `commands` and `turn` into their folders, each with its own `types.ts`. Only update imports in this step, with no logic changes.
- [x] 5. Add the `src/cli/tui/index.ts` barrel. Switch `src/cli/index.ts`, `src/index.ts` and `test/` to it, keeping lazy TermUI loading for batch mode (`loadTermUIRuntime()`).
- [x] 6. Unify the approval flow: keep one `decide`/`confirm` in `commands/decision.ts` and remove the copy in `src/cli/index.ts`.
- [x] 7. Remove dead code:
  - `screen.ts` and `screen/`, together with their tests;
  - `holdStatus` / `releaseStatus`;
  - `showApproval`, `ToolApprovalRequest` and `ToolApproval`;
  - `ToolCallView.kind`, `ToolCallKind` and `TOOL_KIND`;
  - the unused store fields;
  - the `_writer` parameter;
  - the duplicated `sanitize`.

  The `sanitize`/`sanitizeStyled` tests now cover `shared/`.
- [x] 8. Split `termui.ts` into `runtime/` with no behavior change. It became `types.ts`, `constants.ts`, `termui-runtime.ts`, `layout.ts`, `keyboard.ts`, `transcript.ts`, `choice-list.ts`, `tool-slot.ts`, `diff-panel.ts`, `prompt.ts`, `ansi-log-view.ts`, `ansi-parser.ts` and `conversation-store.ts`.
- [x] 9. Clean up verbose code without changing behavior:
  - compact `highlight/highlighter.ts`;
  - turn single-method class fields into locals;
  - group layout constants;
  - drop comments that only restate the code.
- [x] 10. Ran `npm run check` (no diagnostics) and the full `npm test` (100 tests: 99 pass, 0 fail, 1 pre-existing skip). The interactive smoke test (`npm run koda`) still has to be run by the user in a real terminal: there is no TTY in the agent session.
