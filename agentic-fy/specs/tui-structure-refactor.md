# tui-structure-refactor

## Purpose
Keep the interactive TUI organized by purpose, with types separated from implementation, shared code isolated, and no dead code.

## Requirements

### Requirement: TUI is organized in purpose folders {#tui-folders-by-purpose}
Every TypeScript file under src/cli/tui SHALL live inside a purpose folder, except the public barrel src/cli/tui/index.ts.
> verify: `cd packages/koda && npm test -- test/tui-structure.test.ts`

#### Scenario:
- WHEN the TUI source tree is listed
- THEN the only file directly under src/cli/tui is index.ts

#### Scenario:
- WHEN a purpose folder declares exported types used by other modules
- THEN those types are defined in that folder's types.ts

### Requirement: Shared code is isolated {#tui-shared-boundary}
Code used by two or more TUI purpose folders SHALL live in src/cli/tui/shared, and shared SHALL NOT import from any other TUI folder.
> verify: `cd packages/koda && npm test -- test/tui-structure.test.ts`

#### Scenario:
- WHEN a module in shared is inspected
- THEN it imports nothing from sibling TUI folders

#### Scenario:
- WHEN a helper is used by a single folder only
- THEN it lives in that folder, not in shared

### Requirement: Single public entry point {#tui-public-barrel}
Code outside src/cli/tui SHALL import TUI modules only through src/cli/tui/index.ts, and src/index.ts SHALL keep exporting the same public symbols.
> verify: `npm run check`

#### Scenario:
- WHEN src/cli/index.ts or src/index.ts import TUI code
- THEN they use the tui/index.js barrel

#### Scenario:
- WHEN an SDK consumer imports runInteractive, InteractiveIO, InteractiveOptions, InteractiveRuntime, renderHeader, SessionStatus or estimateCost
- THEN the import still resolves with the same types

### Requirement: No unused TUI code {#tui-no-dead-code}
The TUI SHALL NOT contain the legacy Screen renderer, a duplicated approval flow, or exported symbols, interface members, or store fields that nothing reads.
> verify: `cd packages/koda && npm test -- test/tui-structure.test.ts`

#### Scenario:
- WHEN the TUI tree is searched
- THEN screen.ts, screen/, showApproval, holdStatus and releaseStatus are absent

#### Scenario:
- WHEN approval prompts are needed
- THEN one decide implementation is used by both write and shell approvals

### Requirement: Refactor keeps behavior {#tui-refactor-behavior-parity}
The restructured TUI SHALL keep the current interactive behavior, approvals, cancellation, syntax highlighting, and strict type safety.
> verify: `npm test`

#### Scenario:
- WHEN the full test suite runs after the refactor
- THEN all tests pass, including the migrated TUI tests

#### Scenario:
- WHEN the project is type checked
- THEN npm run check succeeds with no new suppressions
