# Proposal — clean-code-refactor

## Why
Koda grew quickly through several incremental features: provider abstraction, interactive TUI, custom commands, `writeFile`, streaming, spinner, full-screen viewport, and `/model`. Each step was correct in isolation, but the accumulated code now shows maintainability problems:

- `runInteractive` in `src/cli/tui/application.ts` is a single function of roughly 160 lines that mixes input routing, `/model` handling, agent execution, spinner control, typewriter output, and error handling, with deeply nested callbacks and inline `as` casts.
- `src/cli/index.ts` mixes environment parsing, provider identity, write-approval policy, screen wiring, batch mode, and the entry-point check. `providerIdentity` duplicates the default model names that already live in `ProviderFactory`, so the two can drift.
- `CodeAgent.runDetailed` interleaves completion, streaming, usage accumulation, status labels, and tool execution in one long method.
- `src/cli/tui/screen.ts` (about 385 lines) combines buffer management, wrapping, rendering, key parsing, and the input editor in one class; key tables are rebuilt on every call and magic numbers and escape sequences are inline.
- Error-description logic (`describeFailure`) exists only in the OpenAI adapter while Anthropic and Gemini still hide the HTTP cause.
- `src/cli/index.ts` still uses a top-level `await` for the entry point, the same pattern that caused the unsettled-top-level-await warning in `bin/koda.js`.
- Formatting drift: several files were hand-edited without running Prettier.

Left alone, each new feature makes these hot spots harder to change and test.

## What
A behavior-preserving Clean Code pass over the existing code. No user-visible feature changes. The work applies a small set of rules consistently:

1. Single responsibility: split long functions and classes into small, named units.
2. One source of truth: remove duplicated provider defaults and shared error-description logic.
3. Remove unsafe or noisy constructs: inline `as` casts, magic numbers, per-call table allocation.
4. Consistent formatting and naming enforced by the existing tooling.
5. Characterization tests first: pin current behavior before moving code, then refactor under green tests.

## Scope
- In scope:
  - Split `runInteractive` into focused modules (session state, `/model` command handler, agent turn runner, output helpers).
  - Extract provider identity and default models into a single shared definition used by the CLI and `ProviderFactory`.
  - Break `CodeAgent.runDetailed` into private steps (request a response, stream a response, execute tool calls).
  - Split `Screen` into a text buffer/wrapper, a key parser, an input editor, and a renderer, keeping the public `Screen` API and `InteractiveIO` contract unchanged.
  - Move shared provider error descriptions to `src/utils` and use them in all adapters without exposing secrets.
  - Replace the entry-point top-level `await` in `src/cli/index.ts` with a promise chain.
  - Replace magic numbers and escape strings with named constants.
  - Run Prettier over `src` and `test`; keep `npm run check`, `format:check`, `build`, and `test` green.
  - Add characterization tests for any behavior the refactor touches that is not yet covered.
- Out of scope:
  - New features, new providers, new commands, or changed CLI output.
  - Changing security rules for `readFile` or `writeFile`.
  - Adding new runtime dependencies or a linter/ESLint setup.
  - Public SDK API changes (`CodeAgent.run`, `ProviderFactory`, tool registry exports stay compatible).
  - Rewriting the TUI rendering approach or adding widechar-aware layout.
