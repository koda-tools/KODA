# core-structure-refactor

## Purpose
Keep the agent core small, organized by purpose, decoupled from concrete tools, and exposed through a single entry point.

## Requirements

### Requirement: Core is organized in purpose folders {#core-folders-by-purpose}
Every TypeScript file under src/core SHALL live inside a purpose folder (agent, model, usage), except the barrel src/core/index.ts, and exported interfaces and type aliases SHALL be declared only in types.ts files.
> verify: `npm test -- test/core-structure.test.ts`

#### Scenario:
- WHEN the core source tree is listed
- THEN the only file directly under src/core is index.ts

#### Scenario:
- WHEN a core module exports an interface or type alias
- THEN it is declared in that folder's types.ts

### Requirement: Single core entry point {#core-public-barrel}
Code outside src/core SHALL import the core only through src/core/index.ts.
> verify: `npm test -- test/core-structure.test.ts`

#### Scenario:
- WHEN cli, tui, tools, src/index.ts or tests import the agent
- THEN they use the core/index.js barrel

### Requirement: Core does not know concrete tools {#core-decoupled-from-tools}
CodeAgent SHALL depend on a ToolExecutor interface, tool status labels SHALL be declared by each tool in src/tools, and src/core SHALL NOT reference concrete tool names.
> verify: `npm test -- test/core-structure.test.ts`

#### Scenario:
- WHEN the core sources are inspected
- THEN they contain no readFile or writeFile references and no ToolRegistry import

#### Scenario:
- WHEN a tool declares no status label
- THEN the agent reports the default "Using tool..." status

### Requirement: Pure model reference and usage helpers {#core-model-and-usage}
Model references SHALL be parsed by a pure parseModelRef/resolveModel pair and token usage SHALL be summed by a single sumUsage function shared by the agent and the TUI session.
> verify: `npm test -- test/core-model.test.ts`

#### Scenario:
- WHEN the model is 'openai/gpt-4o#variant' and the identity provider is openai
- THEN the resolved model is 'gpt-4o'

#### Scenario:
- WHEN the model prefix names a different provider
- THEN resolveModel throws AgentError

#### Scenario:
- WHEN usages with missing fields are summed
- THEN missing counts are treated as zero

### Requirement: Agent identity is required {#core-required-identity}
CodeAgent SHALL require a ProviderIdentity, and AgentRunResult SHALL always report the real provider and resolved model.
> verify: `npm test -- test/agent.test.ts`

#### Scenario:
- WHEN a run completes without a model override
- THEN the result model equals the identity model

#### Scenario:
- WHEN a run completes with a model override
- THEN the result model equals the override without provider prefix

### Requirement: Refactor keeps agent behavior {#core-refactor-behavior-parity}
The restructured core SHALL keep the loop behavior, status sequence, streaming callbacks, tool execution order and error messages, with strict type safety.
> verify: `npm test`

#### Scenario:
- WHEN the full test suite runs after the refactor
- THEN all tests pass

#### Scenario:
- WHEN the project is type checked
- THEN npm run check succeeds with no new suppressions
