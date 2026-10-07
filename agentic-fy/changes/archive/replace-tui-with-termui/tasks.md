# Tasks — replace-tui-with-termui

Incremental implementation plan.

- [x] 1. Confirm the supported TermUI package entry point, Node/TypeScript compatibility, and exact version; add only the required pinned dependency and update the lockfile.
- [x] 2. Create the TermUI composition root with a minimal app lifecycle, layout, header, transcript, prompt input, and clean shutdown.
- [x] 3. Implement the framework-neutral/TermUI adapter for `InteractiveIO`, including `question`, `write`, `writeStyled`, header, status, cancellation, and selection.
- [x] 4. Port streamed agent output, markdown/code rendering, scrolling, terminal resize, spinner/status, and abort handling without changing `CodeAgent` or `runAgentTurn` semantics.
- [x] 5. Port model selection, write diff preview/approval, shell approval, custom command messages, and error/cancellation reporting.
- [x] 6. Switch the interactive CLI entry point from the custom `Screen` to TermUI while keeping batch mode free of TermUI initialization.
- [x] 7. Update TUI tests for behavior parity, including prompt flow, streaming, selection, approvals, cancellation, resize, provider failure, cleanup, and non-TTY behavior.
- [x] 8. Remove the obsolete custom Screen runtime from production imports and move reusable sanitization behind the TermUI path; retain isolated legacy renderer fixtures only until their tests are migrated.
- [x] 9. Run automated type checking and the complete test suite; manual interactive smoke testing and formatting verification remain release follow-ups because this agent session has no real interactive TTY and the direct formatter command was blocked by the workspace PowerShell wrapper.
