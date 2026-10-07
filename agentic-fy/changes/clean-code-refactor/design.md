# Design — clean-code-refactor

## Context
- TypeScript strict mode with `exactOptionalPropertyTypes`, Node ESM (`NodeNext`), Node built-in test runner, Prettier.
- The project currently has 43 passing tests (1 skipped on Windows). They are the safety net for a behavior-preserving refactor.
- Constraints already established and that MUST be preserved:
  - Vendor SDK imports stay confined to `src/providers/adapters` (enforced by `test/provider-boundary.test.ts`).
  - Provider names stay out of `src/core` (also enforced by that test).
  - `writeFile` always asks for confirmation and keeps all path validation.
  - Errors never contain API keys.
  - `InteractiveIO` remains usable with in-memory test I/O and non-TTY environments.
- `package.json` scripts used for verification: `check`, `build`, `test`, `format:check`.

## Architecture
The refactor is organised in independent, individually mergeable steps. Each step ends with green `check`, `format:check`, `build`, and `test`.

### 1. Safety net and formatting
- Run Prettier on `src` and `test` so later diffs contain only real changes.
- Add characterization tests only where a step would otherwise touch unpinned behavior (for example `Screen` wrapping of long lines, `/model` edge cases such as a `provider/model` prefix, and agent status ordering).

### 2. Single source of provider defaults
- Introduce `src/providers/defaults.ts` exporting provider ids, default model names, and a `resolveProviderIdentity(env)` helper.
- `ProviderFactory.fromEnvironment` and `providerIdentity` in `src/cli/index.ts` both use it, removing the duplicated default model table.
- Provider names remain outside `src/core`.

### 3. Shared provider error description
- Move `describeFailure` out of the OpenAI adapter into `src/providers/adapters/error-description.ts`, parameterised by an "is API error" type guard from each SDK so vendor imports stay inside the adapters folder.
- Anthropic and Gemini wrap failures using the same message shape (HTTP status plus hint) without including request bodies, headers, or keys.

### 4. `CodeAgent` decomposition
- Keep `run` and `runDetailed` signatures.
- Extract private methods: `requestResponse` (complete vs stream), `streamResponse`, `runToolCalls`, `statusFor(call)`.
- Replace the status-label ternary with a small lookup map.
- Use a typed `UsageTotals` accumulator instead of two loose counters.

### 5. Interactive session decomposition
- `src/cli/tui/application.ts` keeps `runInteractive` and `InteractiveIO` as the public entry.
- Extract:
  - `session.ts`: session state (usage, current model, active abort controller) and header updates.
  - `model-command.ts`: `/model` listing, numeric selection, validation, and model-prefix rules as a pure function returning a result the caller prints.
  - `turn.ts`: runs one agent turn, wiring spinner, text streaming, and tool-result rendering.
  - `spinner.ts` and `output.ts` (line writer and typewriter helper).
- Replace the inline `as { content: unknown }` casts with a small type guard `parseWriteContent(arguments)`.

### 6. `Screen` decomposition
- Split into `screen/text-buffer.ts` (sanitize, append, wrap, scrollbar math), `screen/key-parser.ts` (byte stream to key events with module-level key tables), `screen/line-editor.ts` (buffer and cursor operations), and `screen/renderer.ts` (frame composition).
- `Screen` stays as the facade with the same public methods (`start`, `stop`, `append`, `question`, `onCancel`, `asIO`, `setHeader`, `setStatus`).
- Named constants for escape sequences, key codes, and layout numbers.

### 7. Entry point and housekeeping
- Replace the top-level `await` in `src/cli/index.ts` with a `.then`/`.catch` chain matching `bin/koda.js`.
- Remove unused exports and dead imports found during the pass.
- Final Prettier, `check`, `build`, `test` run.

## Alternatives considered
- Option A: One large refactor commit. Rejected: hard to review and to bisect if a regression appears.
- Option B: Introduce ESLint with complexity and max-lines rules. Deferred: adds a dependency and config surface; the change keeps to the existing toolchain and can propose linting separately.
- Option C: Only run Prettier and rename variables. Rejected: does not address the long functions, duplicated defaults, or mixed responsibilities that motivate the change.
- Option D: Rewrite the TUI on a framework such as Ink. Rejected: changes behavior and dependencies, outside a clean-code pass.

## Risks
- Behavior drift while moving code. Mitigation: characterization tests first, one step at a time, full test run after each step.
- Breaking the vendor-import boundary when sharing error helpers. Mitigation: `test/provider-boundary.test.ts` must stay green; the shared helper receives SDK type guards instead of importing SDKs.
- Terminal rendering regressions that unit tests cannot see. Mitigation: keep the renderer output byte-compatible for the existing `Screen` tests and perform a manual smoke test of scrolling, spinner, `writeFile` confirmation, and Ctrl+C.
- Over-abstraction. Mitigation: extract only where a function is long, duplicated, or mixes responsibilities; keep modules small and named by what they do.
