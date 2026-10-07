# replace-tui-with-termui

## Purpose
Replace KODA's custom interactive terminal renderer with TermUI while preserving existing agent-session behavior and safety controls.

## Requirements

### Requirement: Interactive sessions use TermUI {#interactive-ui-uses-termui}
The interactive KODA CLI SHALL initialize the pinned TermUI implementation instead of the custom Screen renderer.
> verify: `npm run check`

#### Scenario:
- WHEN a user starts KODA without a prompt in an interactive TTY
- THEN the TermUI application starts and displays the KODA session interface

#### Scenario:
- WHEN a user runs KODA with a batch prompt or a non-TTY environment
- THEN the batch path runs without initializing the interactive TermUI application

### Requirement: Preserve interactive behavior {#interactive-behavior-parity}
The TermUI implementation SHALL preserve prompt input, streamed output, status updates, scrolling, model selection, custom command routing, and conversation clearing.
> verify: `npm test -- test/tui.test.ts`

#### Scenario:
- WHEN the provider emits streamed text
- THEN the transcript updates incrementally without blocking the event loop

#### Scenario:
- WHEN the user changes the model or clears the conversation
- THEN the session state and displayed header update as they do today

### Requirement: Preserve approval and cancellation controls {#approval-and-cancellation-parity}
The TermUI implementation SHALL preserve explicit approval for writes and shell commands and SHALL propagate cancellation to the active request.
> verify: `npm test -- test/tui.test.ts test/shell.test.ts`

#### Scenario:
- WHEN a write or shell approval is requested
- THEN the user can approve or reject it through a TermUI interaction

#### Scenario:
- WHEN the user cancels an active request
- THEN the AbortSignal is triggered and the terminal session remains usable

### Requirement: Restore terminal state safely {#terminal-lifecycle-safety}
The TermUI implementation SHALL restore terminal state and release listeners on normal exit, cancellation, provider failure, approval rejection, and startup failure.
> verify: `npm test -- test/tui.test.ts`

#### Scenario:
- WHEN an interactive session exits or fails
- THEN raw input state, listeners, timers, and TermUI resources are released

#### Scenario:
- WHEN terminal dimensions change during a session
- THEN the layout remains usable and no stale renderer is left active

### Requirement: Maintain package and type safety {#tui-migration-maintains-type-safety}
The TermUI migration SHALL use exact-pinned dependencies, pass strict TypeScript checks, and avoid exposing TermUI types through provider or core agent APIs.
> verify: `npm run check`

#### Scenario:
- WHEN the project is built or type checked
- THEN compilation succeeds under the repository's strict TypeScript configuration

#### Scenario:
- WHEN core agent code is consumed without the CLI
- THEN it remains independent of TermUI runtime initialization
