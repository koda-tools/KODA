# Design — replace-tui-with-termui

## Context

The current entry point is `runInteractive()` in `src/cli/tui/application.ts`. It composes `Session`, command routing, agent turns, spinner, line output, and `InteractiveIO`. `src/cli/index.ts` creates a `Screen` and passes `screen.asIO()` into that application. The custom `Screen` owns raw mode, key parsing, line editing, scrolling, selection, resize handling, and ANSI screen lifecycle.

TermUI's official site describes a TypeScript-first framework with component packages such as `@termuijs/quick`, `@termuijs/widgets`, and `@termuijs/ui`. The implementation must pin the selected package version and confirm the API against the installed package rather than coupling KODA to an undocumented example.

## Architecture

1. **Keep domain orchestration unchanged.** `CodeAgent`, `Session`, command discovery/router, `runAgentTurn`, write policy, shell policy, and provider code continue to operate independently of TermUI.
2. **Introduce a TermUI composition root.** Add a focused module, for example `src/cli/tui/termui/application.ts`, that creates the TermUI app, layout, output region, status/header regions, prompt input, and approval/select overlays.
3. **Use an adapter boundary.** Implement a TermUI-backed adapter for the existing `InteractiveIO` behavior, or replace `InteractiveIO` with a framework-neutral port whose implementation is TermUI-specific. The adapter translates TermUI events into `question`, `onCancel`, `select`, `setStatus`, `setHeader`, `write`, and `writeStyled` operations.
4. **Preserve async agent turns.** Agent streaming callbacks append/update the output component incrementally. The UI must not block the event loop while waiting for provider streams or tool approval decisions.
5. **Preserve lifecycle guarantees.** Start and stop must be idempotent. Cleanup must restore terminal state when the session exits normally, is cancelled, throws, or receives process termination signals supported by the current CLI.
6. **Retain rendering responsibilities where they are domain-specific.** Existing diff computation, markdown streaming, syntax highlighting, pricing, and command routing remain reusable. Their output is adapted into TermUI text/markdown/log components instead of rewriting behavior unnecessarily.
7. **Keep a narrow batch path.** Non-interactive prompts continue to use `runBatch()` and must not initialize TermUI.

## Migration sequence

- Add the pinned TermUI dependency and verify its Node/TypeScript compatibility.
- Build a minimal TermUI shell with header, transcript, prompt, and exit handling.
- Port status/spinner, streaming transcript, scrolling, resize, and cancellation.
- Port model selection, write diff approval, shell approval, and custom command feedback.
- Switch `src/cli/index.ts` to the TermUI implementation.
- Run parity tests, then remove obsolete custom screen/key-parser/editor/renderer code and update exports/imports.

## Alternatives considered

- **Keep the custom TUI:** avoids a dependency and migration risk, but retains all terminal lifecycle and component maintenance in KODA.
- **Use TermUI only for new screens:** lowers initial risk, but leaves two rendering systems and does not achieve the requested replacement.
- **Use a lower-level terminal library:** offers control but would preserve much of the current maintenance burden and provide fewer ready-made components.

## Risks

- TermUI API or package behavior may differ from the website examples. Mitigation: pin the dependency, create a small spike first, and keep the adapter boundary narrow.
- Existing tests rely on the custom `Screen` interfaces. Mitigation: preserve behavior-oriented tests around `InteractiveIO` and add TermUI adapter tests rather than coupling all tests to framework internals.
- Raw terminal cleanup regressions could leave the terminal in an unusable state. Mitigation: test normal exit, Ctrl-C/cancellation, provider failure, approval rejection, resize, and non-TTY execution.
- Streaming updates may be less efficient if the entire transcript rerenders. Mitigation: use TermUI's log/text primitives and measure update behavior with representative long responses.
- The dependency may increase startup time or package size. Mitigation: keep TermUI lazy to the interactive path if supported and add a cold-start measurement to validation.
