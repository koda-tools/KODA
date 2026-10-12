# clean-code-refactor

## Purpose
Keep the Koda codebase maintainable by applying consistent Clean Code practices without changing user-visible behavior.

## Requirements

### Requirement: Behavior preservation {#behavior-preservation}
The system SHALL keep all existing CLI, SDK, tool, and security behavior unchanged after the refactor, with the full existing automated test suite passing and no reduction in test count.
> verify: `npm test`

#### Scenario:
- WHEN the refactor is complete
- THEN the type check, build, and every previously passing test succeed

#### Scenario:
- WHEN an SDK caller invokes CodeAgent.run or ProviderFactory
- THEN signatures and results are backward compatible

### Requirement: Consistent formatting {#consistent-formatting}
The system SHALL keep all source and test files formatted according to the project Prettier configuration.
> verify: `npm run format:check`

#### Scenario:
- WHEN format:check runs after the refactor
- THEN it reports no unformatted files

### Requirement: Single source of provider defaults {#single-source-provider-defaults}
The system SHALL define provider identifiers and default model names in one module used by both the CLI and the provider factory.
> verify: `npm test -- test/factory.test.ts`

#### Scenario:
- WHEN KODA_PROVIDER selects a provider without an explicit model variable
- THEN the CLI header and the created provider report the same default model

#### Scenario:
- WHEN a default model changes in the shared module
- THEN no other file needs to change

### Requirement: Shared provider error description {#shared-provider-error-description}
The system SHALL describe provider failures through a shared helper that includes the HTTP status and a short hint while never including API keys, headers, or request bodies.
> verify: `npm test -- test/provider-adapters.test.ts`

#### Scenario:
- WHEN a provider API call fails with a known HTTP status
- THEN the error message includes the status and a hint

#### Scenario:
- WHEN a provider failure contains credentials in its cause
- THEN the user-facing message does not expose them

### Requirement: Small focused units {#small-focused-units}
The system SHALL separate agent execution, interactive session orchestration, model selection, spinner and output helpers, and screen buffer, key parsing, editing, and rendering into modules with a single responsibility each, and no function in the refactored modules SHALL exceed 60 lines.
> verify: `npm test`

#### Scenario:
- WHEN runInteractive is read
- THEN it only orchestrates the input loop and delegates turns and commands

#### Scenario:
- WHEN a Screen key sequence is parsed
- THEN the parser module produces key events without touching rendering state

### Requirement: Architecture boundaries preserved {#architecture-boundaries-preserved}
The system SHALL keep vendor SDK imports confined to provider adapters and keep provider names out of the core agent after the refactor.
> verify: `npm test -- test/provider-boundary.test.ts`

#### Scenario:
- WHEN the boundary test scans source files
- THEN no SDK import exists outside src/providers/adapters and no provider name exists in src/core

### Requirement: Safe CLI entry point {#safe-entry-point}
The system SHALL start the CLI from its entry points without a top-level await so cancellation does not produce an unsettled top-level await warning.
> verify: `npm run build`

#### Scenario:
- WHEN the user cancels with Ctrl+C
- THEN the process exits without an unsettled top-level await warning
